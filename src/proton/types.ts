/**
 * Proton Drive - Shared Types
 *
 * Common types and interfaces used across the application.
 */

// ============================================================================
// Node Types
// ============================================================================

export interface RevisionData {
  uid: string;
  state: string;
  creationTime: Date;
  contentAuthor?: unknown;
  storageSize: number;
  claimedSize: number;
  claimedModificationTime?: Date;
  claimedDigests?: Record<string, string>;
  claimedAdditionalMetadata?: unknown;
}

export interface NodeData {
  uid: string;
  parentUid?: string;
  name: string;
  type: string;
  mediaType?: string;
  isShared?: boolean;
  isSharedPublicly?: boolean;
  creationTime?: Date;
  trashTime?: Date;
  totalStorageSize?: number;
  treeEventScopeId?: string;
  activeRevision?: RevisionData;
  // For backwards compatibility
  size?: number;
  updatedAt?: Date;
}

export interface NodeResult {
  ok: boolean;
  value?: NodeData;
  error?: unknown;
}

export interface RootFolderResult {
  ok: boolean;
  value?: { uid: string };
  error?: unknown;
}

export interface CreateFolderResult {
  ok: boolean;
  value?: { uid: string };
  error?: unknown;
}

export interface DeleteResult {
  ok: boolean;
  error?: unknown;
}

// ============================================================================
// Upload Types
// ============================================================================

export interface UploadController {
  pause(): void;
  resume(): void;
  completion(): Promise<{ nodeUid: string; nodeRevisionUid: string }>;
}

export interface FileUploader {
  getAvailableName(): Promise<string>;
  uploadFromStream(
    stream: ReadableStream,
    thumbnails: [],
    onProgress?: (uploadedBytes: number) => void
  ): Promise<UploadController>;
}

export interface FileRevisionUploader {
  uploadFromStream(
    stream: ReadableStream,
    thumbnails: [],
    onProgress?: (uploadedBytes: number) => void
  ): Promise<UploadController>;
}

export interface UploadMetadata {
  mediaType: string;
  expectedSize: number;
  modificationTime?: Date;
  overrideExistingDraftByOtherClient?: boolean;
}

// ============================================================================
// Download Types
// ============================================================================

export interface DownloadController {
  pause(): void;
  resume(): void;
  completion(): Promise<void>;
}

export interface FileDownloader {
  getClaimedSizeInBytes(): number | undefined;
  downloadToStream(
    stream: WritableStream,
    onProgress?: (downloadedBytes: number) => void
  ): DownloadController;
}

// ============================================================================
// Client Interfaces
// ============================================================================

/**
 * Base Proton Drive client interface with common operations
 */
export interface BaseProtonDriveClient {
  clearEntitiesCache?(): void;
  iterateFolderChildren(folderUid: string): AsyncIterable<NodeResult>;
  getMyFilesRootFolder(): Promise<RootFolderResult>;
}

/**
 * Proton Drive client interface for create operations
 */
export interface CreateProtonDriveClient extends BaseProtonDriveClient {
  createFolder(
    parentNodeUid: string,
    name: string,
    modificationTime?: Date
  ): Promise<CreateFolderResult>;
  getFileUploader(
    parentFolderUid: string,
    name: string,
    metadata: UploadMetadata,
    signal?: AbortSignal
  ): Promise<FileUploader>;
  getFileRevisionUploader(
    nodeUid: string,
    metadata: UploadMetadata,
    signal?: AbortSignal
  ): Promise<FileRevisionUploader>;
}

/**
 * Proton Drive client interface for delete operations
 */
export interface DeleteProtonDriveClient extends BaseProtonDriveClient {
  trashNodes(nodeUids: string[]): AsyncIterable<DeleteResult>;
  deleteNodes(nodeUids: string[]): AsyncIterable<DeleteResult>;
}

/**
 * Proton Drive client interface for relocate (rename/move) operations
 */
export interface RelocateProtonDriveClient extends BaseProtonDriveClient {
  renameNode(nodeUid: string, newName: string): Promise<NodeResult>;
  moveNodes(
    nodeUids: string[],
    newParentNodeUid: string,
    signal?: AbortSignal
  ): AsyncIterable<NodeResult>;
}

/**
 * Proton Drive client interface for download operations
 */
export interface DownloadProtonDriveClient extends BaseProtonDriveClient {
  getFileDownloader(nodeUid: string, signal?: AbortSignal): Promise<FileDownloader>;
  getFileRevisionDownloader(nodeRevisionUid: string, signal?: AbortSignal): Promise<FileDownloader>;
}

/**
 * Full Proton Drive client interface with all operations
 */
export interface ProtonDriveClient
  extends
    CreateProtonDriveClient,
    DeleteProtonDriveClient,
    RelocateProtonDriveClient,
    DownloadProtonDriveClient {}

// ============================================================================
// Operation Results
// ============================================================================

export interface CreateResult {
  success: boolean;
  nodeUid?: string;
  parentNodeUid?: string;
  error?: string;
  isDirectory: boolean;
  contentSha1: string | null;
}

export interface DeleteOperationResult {
  success: boolean;
  existed: boolean;
  trashed: boolean; // true if moved to trash, false if permanently deleted
  nodeUid?: string;
  nodeType?: string;
  error?: string;
}

export interface DownloadResult {
  success: boolean;
  localPath: string;
  remotePath: string;
  nodeUid: string;
  bytesDownloaded: number;
  tempPath?: string;
  error?: string;
}

// ============================================================================
// Path Types
// ============================================================================

export interface ParsedPath {
  parentParts: string[];
  name: string;
}

// ============================================================================
// Error Types
// ============================================================================

export interface ApiError extends Error {
  requires2FA?: boolean;
  requiresMailboxPassword?: boolean;
  code?: number;
}
