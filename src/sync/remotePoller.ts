/**
 * Proton Drive Sync - Remote Poller
 *
 * Periodically polls Proton Drive for changes and enqueues download jobs.
 */

import { getConfig } from '../config.js';
import { logger } from '../logger.js';
import { db } from '../db/index.js';
import { SyncEventType } from '../db/schema.js';
import { getFileStatesBulk } from './fileState.js';
import { enqueueJobsBatch, type EnqueueJobParams, hasActiveJobsBulk } from './queue.js';
import { traverseRemotePath } from '../proton/utils.js';
import {
  scanRemoteTree,
  detectRemoteChanges,
  bulkUpdateRemoteState,
  remotePathToLocalPath,
} from './remoteState.js';
import type { ProtonDriveClient } from '../proton/types.js';

const REMOTE_POLL_INTERVAL_MS = 60_000;

export interface RemotePollerHandle {
  stop: () => void;
}

/**
 * Polls for remote changes once across all sync directories.
 */
export async function pollOnce(client: ProtonDriveClient, dryRun: boolean): Promise<number> {
  const config = getConfig();
  let totalChangesFound = 0;

  const rootFolderRes = await client.getMyFilesRootFolder();
  if (!rootFolderRes.ok || !rootFolderRes.value) {
    logger.error('Failed to get remote root folder');
    return 0;
  }
  const globalRootFolderUid = rootFolderRes.value.uid;

  for (const syncDir of config.sync_dirs) {
    try {
      let rootFolderUid = globalRootFolderUid;

      // Traverse to remote_root if not '/'
      if (syncDir.remote_root !== '/') {
        const pathParts = syncDir.remote_root.split('/').filter(Boolean);
        const folderUid = await traverseRemotePath(client, rootFolderUid, pathParts);
        if (!folderUid) {
          logger.warn(`Remote root not found for sync dir: ${syncDir.remote_root}`);
          continue;
        }
        rootFolderUid = folderUid;
      }

      // 1. Scan the remote tree
      const scannedNodes = await scanRemoteTree(client, rootFolderUid, syncDir.remote_root);

      // 2. Detect changes
      const changes = detectRemoteChanges(scannedNodes);

      // 3. Process changes and enqueue jobs
      const downloadJobs: EnqueueJobParams[] = [];
      const localPaths = changes
        .filter((c) => !c.node.isDirectory)
        .map((c) =>
          remotePathToLocalPath(c.node.remotePath, syncDir.remote_root, syncDir.source_path)
        );
      const fileStates = getFileStatesBulk(localPaths);
      const activeLocalJobs = hasActiveJobsBulk(localPaths);

      for (const change of changes) {
        const node = change.node;

        // We only enqueue downloads for files, not directories, for now
        // Could create directories too if we wanted, but often they are created implicitly
        if (node.isDirectory) {
          continue;
        }

        const localPath = remotePathToLocalPath(
          node.remotePath,
          syncDir.remote_root,
          syncDir.source_path
        );

        // Check if this file state matches our last change token (meaning we uploaded it)
        if (fileStates.has(localPath) && change.type === 'NEW') {
          // We already have local state for this file and it's marked as a NEW change remotely.
          // This means we just uploaded it and this is the first remote poll seeing it.
          continue;
        }

        // Check if the engine is actively processing this file locally (CREATE/UPDATE/etc)
        if (activeLocalJobs.has(localPath)) {
          // Local intent is actively pending execution. Defer to local file tree.
          continue;
        }

        downloadJobs.push({
          eventType: SyncEventType.DOWNLOAD_FILE,
          localPath,
          remotePath: node.remotePath,
          changeToken: null,
          nodeUid: node.nodeUid,
        });
      }

      let enqueuedChanges = 0;
      if (downloadJobs.length > 0) {
        db.transaction((tx) => {
          enqueuedChanges = enqueueJobsBatch(downloadJobs, dryRun, tx);
        });
      }

      totalChangesFound += enqueuedChanges;

      if (enqueuedChanges > 0) {
        logger.info(
          `Found ${enqueuedChanges} remote changes to download for ${syncDir.source_path}`
        );
      }

      // 4. Update the remote state cache
      bulkUpdateRemoteState(scannedNodes);
    } catch (error) {
      logger.error(
        `Error polling remote changes for ${syncDir.source_path}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return totalChangesFound;
}

/**
 * Starts the remote poller background task.
 */
export function startRemotePoller(client: ProtonDriveClient, dryRun: boolean): RemotePollerHandle {
  let running = true;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function pollLoop() {
    if (!running) return;

    try {
      await pollOnce(client, dryRun);
    } catch (error) {
      logger.error(
        `Critical error in remote poller loop: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      // Clear SDK cache to free memory from large tree scans
      if (client.clearEntitiesCache) {
        client.clearEntitiesCache();
      }

      // Schedule the next poll
      if (running) {
        timer = setTimeout(pollLoop, REMOTE_POLL_INTERVAL_MS);
      }
    }
  }

  // Initial delay of 5 seconds to let the upload queue settle
  timer = setTimeout(pollLoop, 5000);

  return {
    stop: () => {
      running = false;
      if (timer) clearTimeout(timer);
    },
  };
}
