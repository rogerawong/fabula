/**
 * fs-access.d.ts — WICG File System Access API surface that TypeScript's
 * lib.dom doesn't ship yet (directory iteration, permissions, picker).
 * Chromium-only at runtime; every call site feature-detects first.
 */

interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemHandle>;
  queryPermission(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(descriptor?: {
    mode?: "read" | "readwrite";
  }): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker(options?: {
    mode?: "read" | "readwrite";
    id?: string;
  }): Promise<FileSystemDirectoryHandle>;
}
