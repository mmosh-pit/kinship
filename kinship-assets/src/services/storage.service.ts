import { bucket, baseUrl, getFolderForType } from "../config/storage";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import logger from "../utils/logger";

export interface UploadOptions {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  assetType: string;
  sceneName?: string;
}

export interface UploadResponse {
  fileUrl: string;
  gcsPath: string;
  fileSize: number;
  mimeType: string;
}

class StorageService {
  /**
   * Upload file to GCS
   */
  async uploadFile(options: UploadOptions): Promise<UploadResponse> {
    const { buffer, originalName, mimeType, assetType, sceneName } = options;

    const ext = path.extname(originalName);
    const uniqueName = `${uuidv4()}${ext}`;
    const folder = getFolderForType(assetType);
    const gcsPath = sceneName
      ? `${folder}/${sceneName}/${uniqueName}`
      : `${folder}/${uniqueName}`;

    const file = bucket.file(gcsPath);

    try {
      await file.save(buffer, {
        metadata: {
          contentType: mimeType,
          metadata: {
            originalName,
            assetType,
            uploadedAt: new Date().toISOString(),
          },
        },
        resumable: buffer.length > 5 * 1024 * 1024, // Resume for files > 5MB
      });

      const fileUrl = `${baseUrl}/${gcsPath}`;

      logger.info(`File uploaded: ${gcsPath} (${buffer.length} bytes)`);

      return {
        fileUrl,
        gcsPath,
        fileSize: buffer.length,
        mimeType,
      };
    } catch (error) {
      logger.error(`Upload failed for ${originalName}:`, error);
      throw new Error(`Failed to upload file: ${(error as Error).message}`);
    }
  }

  /**
   * Upload thumbnail to GCS
   */
  async uploadThumbnail(
    buffer: Buffer,
    originalGcsPath: string,
  ): Promise<string> {
    const ext = path.extname(originalGcsPath);
    const baseName = path.basename(originalGcsPath, ext);
    const gcsPath = `thumbnails/${baseName}_thumb${ext}`;

    const file = bucket.file(gcsPath);

    await file.save(buffer, {
      metadata: { contentType: "image/png" },
    });

    return `${baseUrl}/${gcsPath}`;
  }

  /**
   * Delete file from GCS
   */
  async deleteFile(gcsPath: string): Promise<void> {
    try {
      const file = bucket.file(gcsPath);
      const [exists] = await file.exists();

      if (exists) {
        await file.delete();
        logger.info(`File deleted: ${gcsPath}`);
      }
    } catch (error) {
      logger.error(`Delete failed for ${gcsPath}:`, error);
      throw new Error(`Failed to delete file: ${(error as Error).message}`);
    }
  }

  /**
   * Generate signed URL for private access
   */
  async getSignedUrl(
    gcsPath: string,
    expiresInMinutes: number = 60,
  ): Promise<string> {
    const file = bucket.file(gcsPath);

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + expiresInMinutes * 60 * 1000,
    });

    return url;
  }

  /**
   * Check if file exists in GCS
   */
  async fileExists(gcsPath: string): Promise<boolean> {
    const file = bucket.file(gcsPath);
    const [exists] = await file.exists();
    return exists;
  }

  /**
   * Get file metadata from GCS
   */
  async getFileMetadata(gcsPath: string) {
    const file = bucket.file(gcsPath);
    const [metadata] = await file.getMetadata();
    return metadata;
  }

  /**
   * Copy file within GCS (for versioning)
   */
  async copyFile(sourcePath: string, destPath: string): Promise<string> {
    const sourceFile = bucket.file(sourcePath);
    const destFile = bucket.file(destPath);

    await sourceFile.copy(destFile);

    return `${baseUrl}/${destPath}`;
  }

  /**
   * List files in a GCS prefix
   */
  async listFiles(prefix: string): Promise<string[]> {
    const [files] = await bucket.getFiles({ prefix });
    return files.map((f) => f.name);
  }

  /**
   * Extract GCS path from full URL
   */
  extractGcsPath(fileUrl: string): string {
    return fileUrl.replace(`${baseUrl}/`, "");
  }
}

export const storageService = new StorageService();
export default StorageService;
