import logger from "../utils/logger";

const KNOWLEDGE_SERVICE_URL =
  process.env.KNOWLEDGE_SERVICE_URL || "http://localhost:8000";
const WEBHOOK_ENABLED = process.env.WEBHOOK_ENABLED !== "false";

async function fireWebhook(
  event: string,
  assetId: string,
  asset?: any,
): Promise<void> {
  if (!WEBHOOK_ENABLED) return;
  const url = `${KNOWLEDGE_SERVICE_URL}/api/webhooks/asset-changed`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, asset_id: assetId, asset }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      logger.info(`Webhook fired: ${event} for asset ${assetId}`);
    } else {
      logger.warn(
        `Webhook returned ${response.status} for ${event}/${assetId}`,
      );
    }
  } catch (error) {
    logger.warn(
      `Webhook failed for ${event}/${assetId}: ${(error as Error).message}`,
    );
  }
}

export function notifyAssetCreated(asset: any): void {
  fireWebhook("asset.created", asset.id, asset);
}
export function notifyAssetUpdated(asset: any): void {
  fireWebhook("asset.updated", asset.id, asset);
}
export function notifyAssetDeleted(assetId: string): void {
  fireWebhook("asset.deleted", assetId);
}
export function notifyMetadataUpdated(assetId: string, metadata?: any): void {
  fireWebhook("metadata.updated", assetId, metadata);
}
