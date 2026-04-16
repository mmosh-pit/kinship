import { Storage } from "@google-cloud/storage";
import dotenv from "dotenv";

dotenv.config();

const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

const bucketName = process.env.GCS_BUCKET_NAME || "kinship-assets-poc";
const bucket = storage.bucket(bucketName);
const baseUrl =
  process.env.GCS_BASE_URL || `https://storage.googleapis.com/${bucketName}`;

// Folder prefixes in GCS
const FOLDERS = {
  tiles: "tiles",
  sprites: "sprites",
  objects: "sprites/objects",
  npcs: "sprites/npcs",
  avatars: "sprites/avatars",
  animations: "animations",
  audio: "audio",
  tilemaps: "tilemaps",
  ui: "ui",
  thumbnails: "thumbnails",
  temp: "temp",
  knowledge: "knowledge", // PDF documents for knowledge base
  documents: "documents", // General documents
} as const;

function getFolderForType(assetType: string): string {
  return FOLDERS[assetType as keyof typeof FOLDERS] || "misc";
}

export { storage, bucket, bucketName, baseUrl, FOLDERS, getFolderForType };
