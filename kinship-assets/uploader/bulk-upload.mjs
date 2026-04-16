#!/usr/bin/env node

/**
 * Kinship Assets — Bulk Upload Script
 * 
 * Reads forest_asset_catalog.json and uploads all assets with metadata
 * to the kinship-assets backend API.
 * 
 * Prerequisites:
 *   npm install form-data
 * 
 * Usage:
 *   node bulk-upload.mjs --api http://localhost:3001/api/v1 --dir ./PNG --catalog ./forest_asset_catalog.json
 * 
 * Options:
 *   --api       Backend API base URL (default: http://localhost:3001/api/v1)
 *   --dir       Directory containing PNG files (default: ./PNG)
 *   --catalog   Path to catalog JSON (default: ./forest_asset_catalog.json)
 *   --creator   Creator ID (default: studio_creator)
 *   --dry-run   Print what would be uploaded without calling API
 *   --delay     Delay between uploads in ms (default: 300)
 *   --skip      Number of assets to skip (for resuming after partial upload)
 *   --verbose   Show full error details
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// CLI Args
// ============================================
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  return args[idx + 1] || defaultVal;
}
const hasFlag = (name) => args.includes(`--${name}`);

const API_BASE = getArg('api', 'http://localhost:3001/api/v1');
const PNG_DIR = getArg('dir', path.join(__dirname, 'PNG'));
const CATALOG_PATH = getArg('catalog', path.join(__dirname, 'forest_asset_catalog.json'));
const CREATOR = getArg('creator', 'studio_creator');
const DRY_RUN = hasFlag('dry-run');
const DELAY = parseInt(getArg('delay', '300'));
const SKIP = parseInt(getArg('skip', '0'));
const VERBOSE = hasFlag('verbose');

// ============================================
// Terminal Colors
// ============================================
const c = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m',
};
const ok = (msg) => console.log(`${c.green}✓${c.reset} ${msg}`);
const fail = (msg) => console.log(`${c.red}✗${c.reset} ${msg}`);
const info = (msg) => console.log(`${c.cyan}ℹ${c.reset} ${msg}`);
const warn = (msg) => console.log(`${c.yellow}⚠${c.reset} ${msg}`);

// ============================================
// Multipart Form Builder (no dependencies)
// ============================================
function buildMultipartForm(fields, filePath, fileFieldName = 'file') {
  const boundary = '----KinshipUpload' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const CRLF = '\r\n';
  const parts = [];

  // Text fields
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    parts.push(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}` +
      `${value}${CRLF}`
    );
  }

  // File field
  const fileName = path.basename(filePath);
  const fileContent = fs.readFileSync(filePath);
  const fileHeader =
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="${fileFieldName}"; filename="${fileName}"${CRLF}` +
    `Content-Type: image/png${CRLF}${CRLF}`;
  const fileFooter = `${CRLF}--${boundary}--${CRLF}`;

  // Combine into buffer
  const headerBuf = Buffer.from(parts.join('') + fileHeader, 'utf-8');
  const footerBuf = Buffer.from(fileFooter, 'utf-8');
  const body = Buffer.concat([headerBuf, fileContent, footerBuf]);

  return {
    body,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    },
  };
}

// ============================================
// HTTP Request Helper
// ============================================
function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const req = transport.request(parsedUrl, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

// ============================================
// API Functions
// ============================================

async function uploadAsset(filePath, assetData) {
  const fields = {
    name: assetData.name,
    display_name: assetData.display_name,
    type: assetData.type,
    created_by: CREATOR,
  };

  if (assetData.meta_description) {
    fields.meta_description = assetData.meta_description;
  }
  if (assetData.tags && assetData.tags.length > 0) {
    fields.tags = JSON.stringify(assetData.tags);
  }

  const form = buildMultipartForm(fields, filePath, 'file');

  const res = await httpRequest(`${API_BASE}/assets`, {
    method: 'POST',
    headers: form.headers,
  }, form.body);

  if (res.status !== 201) {
    const details = VERBOSE && res.body?.details
      ? ` → ${JSON.stringify(res.body.details)}`
      : '';
    throw new Error(`${res.status}: ${res.body?.message || res.body?.error || 'Unknown error'}${details}`);
  }

  return res.body;
}

async function createMetadata(assetId, metadata) {
  const payload = {};

  if (metadata.hearts_mapping) {
    payload.hearts_mapping = {
      primary_facet: metadata.hearts_mapping.primary_facet || null,
      secondary_facet: metadata.hearts_mapping.secondary_facet || null,
      base_delta: metadata.hearts_mapping.base_delta || 0,
      description: metadata.hearts_mapping.description || '',
    };
  }

  if (metadata.aoe && metadata.aoe.shape !== 'none') {
    payload.aoe = { shape: metadata.aoe.shape, unit: metadata.aoe.unit || 'tiles' };
    if (metadata.aoe.radius) payload.aoe.radius = metadata.aoe.radius;
    if (metadata.aoe.width) payload.aoe.width = metadata.aoe.width;
    if (metadata.aoe.height) payload.aoe.height = metadata.aoe.height;
  }

  if (metadata.hitbox) {
    payload.hitbox = {
      width: metadata.hitbox.width || 1,
      height: metadata.hitbox.height || 1,
      offset_x: metadata.hitbox.offset_x || 0,
      offset_y: metadata.hitbox.offset_y || 0,
    };
  }

  if (metadata.interaction) {
    payload.interaction = {
      type: metadata.interaction.type || 'none',
      range: metadata.interaction.range || 0,
      cooldown_ms: metadata.interaction.cooldown_ms || 0,
      requires_facing: metadata.interaction.requires_facing || false,
    };
  }

  if (metadata.spawn) {
    payload.spawn = {
      default_position: metadata.spawn.default_position || { x: 0, y: 0 },
      layer: metadata.spawn.layer || 'objects',
      z_index: metadata.spawn.z_index || 1,
      facing: metadata.spawn.facing || 'south',
    };
  }

  if (metadata.rules) {
    payload.rules = {
      requires_item: metadata.rules.requires_item || null,
      max_users: metadata.rules.max_users || 1,
      description: metadata.rules.description || '',
      is_movable: metadata.rules.is_movable || false,
      is_destructible: metadata.rules.is_destructible || false,
      level_required: metadata.rules.level_required || 0,
    };
  }

  if (metadata.dimensions) {
    payload.custom_properties = { original_dimensions: metadata.dimensions };
  }

  const body = JSON.stringify(payload);

  const res = await httpRequest(`${API_BASE}/assets/${assetId}/metadata`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);

  if (res.status !== 201) {
    throw new Error(`Metadata ${res.status}: ${res.body?.message || res.body?.error}`);
  }

  return res.body;
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('');
  console.log(`${c.bold}🌲 Kinship Assets — Bulk Upload${c.reset}`);
  console.log('─'.repeat(55));
  info(`API:     ${API_BASE}`);
  info(`PNGs:    ${PNG_DIR}`);
  info(`Catalog: ${CATALOG_PATH}`);
  info(`Creator: ${CREATOR}`);
  if (DRY_RUN) warn('DRY RUN — no actual uploads');
  if (SKIP > 0) warn(`Skipping first ${SKIP} assets`);
  if (VERBOSE) info('Verbose mode — full error details');
  console.log('');

  // Load catalog
  if (!fs.existsSync(CATALOG_PATH)) {
    fail(`Catalog not found: ${CATALOG_PATH}`);
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
  info(`Loaded: ${catalog.pack_name} v${catalog.pack_version} (${catalog.assets.length} assets)`);
  console.log('');

  // Verify PNG directory
  if (!fs.existsSync(PNG_DIR)) {
    fail(`PNG directory not found: ${PNG_DIR}`);
    process.exit(1);
  }

  // Check API health
  if (!DRY_RUN) {
    try {
      const health = await httpRequest(`${API_BASE}/health`, { method: 'GET' });
      if (health.body?.status === 'ok') {
        ok(`API healthy — DB: ${health.body.db}, GCS: ${health.body.gcs}`);
      } else {
        warn(`API health: ${JSON.stringify(health.body)}`);
      }
    } catch (e) {
      fail(`Cannot reach API: ${e.message}`);
      process.exit(1);
    }
    console.log('');
  }

  // Process assets
  const results = { success: 0, failed: 0, skipped: 0 };
  const errors = [];
  const created = [];

  for (let i = 0; i < catalog.assets.length; i++) {
    const entry = catalog.assets[i];
    const filePath = path.join(PNG_DIR, entry.file);
    const num = String(i + 1).padStart(2);
    const progress = `[${num}/${catalog.assets.length}]`;

    // Skip
    if (i < SKIP) {
      console.log(`${c.dim}${progress} SKIP ${entry.name}${c.reset}`);
      results.skipped++;
      continue;
    }

    // Check file exists
    if (!fs.existsSync(filePath)) {
      warn(`${progress} ${entry.name} — file missing: ${entry.file}`);
      results.skipped++;
      continue;
    }

    if (DRY_RUN) {
      ok(`${progress} ${c.dim}(dry)${c.reset} ${entry.display_name} ${c.dim}(${entry.type}) ${entry.file}${c.reset}`);
      results.success++;
      continue;
    }

    try {
      // Step 1: Upload asset
      const asset = await uploadAsset(filePath, entry);

      // Step 2: Create metadata
      if (entry.metadata) {
        const metaPayload = { ...entry.metadata, dimensions: entry.dimensions };
        await createMetadata(asset.id, metaPayload);
      }

      ok(`${progress} ${entry.display_name} ${c.dim}(${entry.type}) → ${asset.id}${c.reset}`);
      results.success++;
      created.push({ name: entry.name, id: asset.id });

      // Delay
      if (DELAY > 0) await new Promise((r) => setTimeout(r, DELAY));

    } catch (err) {
      fail(`${progress} ${entry.display_name} — ${err.message}`);
      errors.push({ index: i + 1, name: entry.name, error: err.message });
      results.failed++;
    }
  }

  // Summary
  console.log('');
  console.log('─'.repeat(55));
  console.log(`${c.bold}Upload Complete${c.reset}`);
  ok(`Success: ${results.success}`);
  if (results.failed > 0) fail(`Failed:  ${results.failed}`);
  if (results.skipped > 0) warn(`Skipped: ${results.skipped}`);
  console.log('');

  if (errors.length > 0) {
    console.log(`${c.red}Failed assets:${c.reset}`);
    errors.forEach((e) => console.log(`  #${e.index} ${e.name}: ${e.error}`));
    console.log('');
    console.log(`${c.yellow}Tip: Fix the issue, then re-run with --skip ${SKIP || 0}${c.reset}`);
    console.log(`${c.yellow}Or run with --verbose for full error details${c.reset}`);
    console.log('');
  }

  // Save results
  const logFile = path.join(__dirname, 'upload-results.json');
  fs.writeFileSync(logFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    api: API_BASE,
    results,
    created,
    errors,
  }, null, 2));
  info(`Results saved to ${logFile}`);
}

main().catch((err) => {
  fail(`Fatal: ${err.message}`);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
