/**
 * Proton Drive Sync - Remote State Tracking
 *
 * Tracks remote Proton Drive file states to detect changes for downloading.
 */

import { join } from 'path';
import { eq } from 'drizzle-orm';
import { db, schema, type Tx } from '../db/index.js';
import type { BaseProtonDriveClient } from '../proton/types.js';

export interface RemoteNode {
  nodeUid: string;
  parentNodeUid: string;
  remotePath: string;
  name: string;
  isDirectory: boolean;
  revisionUid: string | null;
  size: number | null;
  modificationTime: Date | null;
}

export interface RemoteChange {
  type: 'NEW' | 'MODIFIED';
  node: RemoteNode;
}

/**
 * Convert a remote path to a local fs path based on sync configuration.
 */
export function remotePathToLocalPath(
  remotePath: string,
  remoteRoot: string,
  syncSourcePath: string
): string {
  let relativePath = remotePath;
  if (remoteRoot !== '/' && remotePath.startsWith(remoteRoot)) {
    relativePath = remotePath.slice(remoteRoot.length);
  }
  if (relativePath.startsWith('/')) {
    relativePath = relativePath.slice(1);
  }
  return join(syncSourcePath, relativePath);
}

/**
 * Scan a remote folder recursively and return all nodes.
 */
export async function scanRemoteTree(
  client: BaseProtonDriveClient,
  folderUid: string,
  remotePath: string
): Promise<RemoteNode[]> {
  const nodes: RemoteNode[] = [];

  async function traverse(currentUid: string, currentPath: string): Promise<void> {
    for await (const result of client.iterateFolderChildren(currentUid)) {
      if (!result.ok || !result.value) continue;

      const val = result.value;

      // Skip trashed items (recently deleted files still show up in iterateFolderChildren)
      const isTrashed = !!val.trashTime || val.activeRevision?.state === 'Trashed';
      if (isTrashed) continue;

      const isDir = val.type === 'folder';

      const childPath = currentPath === '/' ? `/${val.name}` : `${currentPath}/${val.name}`;
      const activeRev = val.activeRevision;

      const nodeInfo: RemoteNode = {
        nodeUid: val.uid,
        parentNodeUid: currentUid,
        remotePath: childPath,
        name: val.name,
        isDirectory: isDir,
        revisionUid: activeRev?.uid ?? null,
        size: activeRev?.claimedSize ?? val.totalStorageSize ?? null,
        modificationTime: activeRev?.claimedModificationTime ?? val.creationTime ?? null,
      };

      nodes.push(nodeInfo);

      if (isDir) {
        await traverse(val.uid, childPath);
      }
    }
  }

  await traverse(folderUid, remotePath === '' ? '/' : remotePath);
  return nodes;
}

/**
 * Get stored state by node UID
 */
export function getRemoteState(nodeUid: string, tx?: Tx) {
  const runner = tx || db;
  const result = runner
    .select()
    .from(schema.remoteState)
    .where(eq(schema.remoteState.nodeUid, nodeUid))
    .all();
  return result[0] || null;
}

/**
 * Store/update a node in the remote_state table
 */
export function upsertRemoteState(node: RemoteNode, tx: Tx) {
  tx.insert(schema.remoteState)
    .values({
      nodeUid: node.nodeUid,
      parentNodeUid: node.parentNodeUid,
      remotePath: node.remotePath,
      name: node.name,
      isDirectory: node.isDirectory,
      revisionUid: node.revisionUid,
      size: node.size,
      modificationTime: node.modificationTime,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.remoteState.nodeUid,
      set: {
        parentNodeUid: node.parentNodeUid,
        remotePath: node.remotePath,
        name: node.name,
        isDirectory: node.isDirectory,
        revisionUid: node.revisionUid,
        size: node.size,
        modificationTime: node.modificationTime,
        lastSeenAt: new Date(),
      },
    })
    .run();
}

export function bulkUpdateRemoteState(nodes: RemoteNode[]) {
  if (nodes.length === 0) return;

  const CHUNK_SIZE = 500;
  for (let i = 0; i < nodes.length; i += CHUNK_SIZE) {
    const chunk = nodes.slice(i, i + CHUNK_SIZE);
    db.transaction((tx) => {
      for (const node of chunk) {
        upsertRemoteState(node, tx);
      }
    });
  }
}

/**
 * Compare scanned nodes vs stored state, return new/modified files
 */
export function detectRemoteChanges(scannedNodes: RemoteNode[]): RemoteChange[] {
  const changes: RemoteChange[] = [];

  // Load ALL remote state into a Map in one query
  const allState = db.select().from(schema.remoteState).all();
  const stateMap = new Map<string, (typeof allState)[0]>();
  for (const row of allState) {
    stateMap.set(row.nodeUid, row);
  }

  for (const node of scannedNodes) {
    if (node.isDirectory) continue;
    const stored = stateMap.get(node.nodeUid);

    if (!stored) {
      changes.push({ type: 'NEW', node });
    } else {
      let modified = false;

      if (node.revisionUid && stored.revisionUid && node.revisionUid !== stored.revisionUid) {
        modified = true;
      } else if (stored.size !== null && node.size !== null && node.size !== stored.size) {
        modified = true;
      } else if (node.modificationTime && stored.modificationTime) {
        // Compare at second-precision because SQLite timestamp mode drops milliseconds natively
        if (
          Math.floor(node.modificationTime.getTime() / 1000) !==
          Math.floor(stored.modificationTime.getTime() / 1000)
        ) {
          modified = true;
        }
      }

      if (modified) {
        changes.push({ type: 'MODIFIED', node });
      }
    }
  }

  return changes;
}
