/**
 * Proton Drive API - Download Commands
 *
 * Handles downloading files from Proton Drive to the local filesystem.
 */

import { rmSync, mkdirSync } from 'fs';
import { extname, dirname } from 'path';
import type { DownloadProtonDriveClient, DownloadResult } from './types.js';

/**
 * Downloads a file from Proton Drive to the local filesystem.
 *
 * @param client The Proton Drive client
 * @param nodeUid The UID of the node to download
 * @param localPath The final path where the file should be saved
 * @param remotePath The remote path (used for the result)
 * @param signal Optional abort signal
 */
export async function downloadNode(
  client: DownloadProtonDriveClient,
  nodeUid: string,
  localPath: string,
  remotePath: string,
  signal?: AbortSignal
): Promise<DownloadResult> {
  const tempPath = `${localPath}.downloading`;
  let bytesDownloaded = 0;

  try {
    mkdirSync(dirname(localPath), { recursive: true });
    const downloader = await client.getFileDownloader(nodeUid, signal);
    const file = Bun.file(tempPath);
    const writableStream = file.writer();

    const controller = downloader.downloadToStream(
      new WritableStream({
        write(chunk) {
          writableStream.write(chunk);
        },
        close() {
          writableStream.end();
        },
        abort() {
          writableStream.end();
        },
      }),
      (downloaded) => {
        bytesDownloaded = downloaded;
      }
    );
    await controller.completion();

    // We do NOT rename the file here. We return the tempPath so the processor
    // can rename it AFTER committing the final download hash into the DB so the
    // watcher doesn't see the rename and think it's a new upload.
    return {
      success: true,
      localPath,
      remotePath,
      nodeUid,
      bytesDownloaded,
      tempPath,
    };
  } catch (error) {
    // Clean up temp file if it exists
    rmSync(tempPath, { force: true });

    return {
      success: false,
      localPath,
      remotePath,
      nodeUid,
      bytesDownloaded,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Generates a Dropbox-style conflict filename.
 * E.g. "report.pdf" -> "report (conflicted copy 2026-04-12 13-30-00).pdf"
 *
 * @param filepath The original filepath
 */
export function getConflictFilename(filepath: string): string {
  const ext = extname(filepath);
  const base = filepath.slice(0, filepath.length - ext.length);
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace('T', ' ')
    .replace(/:/g, '-')
    .replace(/\.\d+Z$/, '');
  return `${base} (conflicted copy ${timestamp})${ext}`;
}
