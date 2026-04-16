"""HTTP client for kinship-assets service — Phase 0 Update.

PHASE 0 CHANGES:
- Added platform_id parameter to search_assets
- Added platform_id parameter to fetch_all_assets
- Now can filter assets by platform for AI generation

Replace your existing assets_client.py with this file.
"""

import logging
from typing import Any, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=settings.assets_service_url,
            timeout=60.0,
        )
    return _client


async def close_client():
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


async def get_asset_catalog(platform_id: Optional[str] = None) -> list[dict]:
    """Fetch all available assets from kinship-assets.

    PHASE 0: Added platform_id filter.
    """
    params = {"limit": "200", "is_active": "true"}
    if platform_id:
        params["platform_id"] = platform_id

    url = f"{settings.assets_service_url}/assets"
    client = get_client()
    resp = await client.get(url, params=params)
    resp.raise_for_status()
    data = resp.json()
    # Handle paginated response
    if isinstance(data, dict) and "items" in data:
        return data["items"]
    if isinstance(data, dict) and "data" in data:
        return data["data"]
    if isinstance(data, list):
        return data
    return []


# ── File Uploads (GCS via kinship-assets) ──


async def upload_file(
    file_data: bytes,
    filename: str,
    content_type: str = "application/pdf",
    folder: str = "knowledge",
) -> dict:
    """
    Upload a file to GCS bucket via kinship-assets service.

    Returns:
        dict with file_url, file_name, file_key
    """
    client = get_client()

    files = {
        "file": (filename, file_data, content_type),
    }
    data = {
        "folder": folder,
    }

    try:
        resp = await client.post("/upload", files=files, data=data)
        resp.raise_for_status()
        result = resp.json()

        # Normalize response
        return {
            "file_url": result.get("url") or result.get("file_url"),
            "file_name": result.get("filename") or result.get("file_name") or filename,
            "file_key": result.get("key") or result.get("file_key") or "",
        }
    except httpx.HTTPStatusError as e:
        logger.error(f"Upload failed: {e.response.status_code} - {e.response.text}")
        raise Exception(f"Upload failed: {e.response.text}")
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise Exception(f"Upload failed: {str(e)}")


async def delete_file(file_key: str) -> bool:
    """Delete a file from GCS bucket via kinship-assets service."""
    client = get_client()
    try:
        resp = await client.delete(f"/upload/{file_key}")
        return resp.status_code in (200, 204, 404)
    except Exception as e:
        logger.error(f"Delete failed: {e}")
        return False


# ── Scenes ──


async def get_scene(scene_id: str) -> dict | None:
    """Fetch a scene from kinship-assets by ID."""
    client = get_client()
    try:
        resp = await client.get(f"/scenes/{scene_id}")
        if resp.status_code == 200:
            return resp.json()
        return None
    except Exception as e:
        logger.error(f"Failed to fetch scene {scene_id}: {e}")
        return None


async def get_scene_manifest(scene_id: str) -> dict | None:
    """Fetch scene manifest with positioned assets."""
    client = get_client()
    try:
        # Call the /manifest endpoint which returns positioned assets
        resp = await client.get(f"/scenes/{scene_id}/manifest")

        if resp.status_code != 200:
            logger.error(f"Manifest not found for scene {scene_id}: {resp.status_code}")
            return None

        data = resp.json()

        logger.info(
            f"✅ Fetched manifest for scene {scene_id}: {len(data.get('assets', []))} assets"
        )

        # The manifest endpoint returns {scene, assets}
        return {
            "scene": data.get("scene", {}),
            "placed_assets": data.get("assets", []),
        }

    except Exception as e:
        logger.error(f"Failed to fetch scene manifest {scene_id}: {e}")
        return None


async def create_scene(data: dict) -> dict | None:
    """Create a scene in kinship-assets."""
    client = get_client()
    logger.info(
        f"Creating scene at {settings.assets_service_url}/scenes with data: {data}"
    )
    try:
        resp = await client.post("/scenes", json=data)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        error_detail = ""
        try:
            error_detail = e.response.json()
        except:
            error_detail = e.response.text[:500]
        logger.error(f"Create scene failed: {e.response.status_code} - {error_detail}")
        raise Exception(f"HTTP {e.response.status_code}: {error_detail}")


async def update_scene(scene_id: str, data: dict) -> dict | None:
    """Update a scene in kinship-assets (PATCH)."""
    client = get_client()
    resp = await client.patch(f"/scenes/{scene_id}", json=data)
    resp.raise_for_status()
    return resp.json()


async def place_scene_asset(
    scene_id: str, asset_id: str, position: dict, z_index: int = 1
) -> dict | None:
    """Place an asset in a scene. Kinship-assets expects assetId in URL."""
    client = get_client()
    resp = await client.post(
        f"/scenes/{scene_id}/assets/{asset_id}",
        json={"position": position, "z_index": z_index},
    )
    resp.raise_for_status()
    return resp.json()


# ── Assets ──


async def search_assets(
    tags: list[str] | None = None,
    asset_type: str | None = None,
    platform_id: str | None = None,  # PHASE 0: Added platform_id
    page: int = 1,
    limit: int = 20,
) -> list[dict]:
    """Search assets with pagination.

    PHASE 0: Added platform_id parameter for filtering.

    API returns: { "data": [...], "pagination": { "page": 1, "limit": 20, "total": 65, "total_pages": 4 } }
    """
    client = get_client()
    params: dict[str, Any] = {"page": page, "limit": limit, "sort_order": "desc"}
    if tags:
        params["tags"] = ",".join(tags)
    if asset_type:
        params["type"] = asset_type
    if platform_id:
        params["platform_id"] = platform_id  # PHASE 0

    resp = await client.get("/assets", params=params)
    if resp.status_code == 200:
        data = resp.json()
        if isinstance(data, dict):
            return data.get("data", data.get("items", []))
        return data
    return []


async def fetch_all_assets(
    tags: list[str] | None = None,
    asset_type: str | None = None,
    platform_id: str | None = None,  # PHASE 0: Added platform_id
) -> list[dict]:
    """Fetch ALL assets across all pages.

    PHASE 0: Added platform_id parameter for filtering.
    When platform_id is provided, only returns assets from that platform.
    """
    all_assets = []
    page = 1

    while True:
        assets_page = await search_assets(
            tags=tags,
            asset_type=asset_type,
            platform_id=platform_id,  # PHASE 0
            page=page,
            limit=50,  # Increased for efficiency
        )
        all_assets.extend(assets_page)
        if len(assets_page) < 50:
            break
        page += 1
        # Safety limit
        if page > 100:
            logger.warning(f"Reached page limit (100) when fetching assets")
            break

    logger.info(
        f"Fetched {len(all_assets)} total assets across {page} pages"
        f" (platform_id={platform_id})"
    )
    return all_assets


async def get_asset(asset_id: str) -> dict | None:
    """Get a single asset by ID."""
    client = get_client()
    resp = await client.get(f"/assets/{asset_id}")
    return resp.json() if resp.status_code == 200 else None


# ── Validation ──


async def validate_scene_exists(scene_id: str) -> bool:
    """Check if a scene_id exists in kinship-assets."""
    scene = await get_scene(scene_id)
    return scene is not None


async def validate_asset_exists(asset_id: str) -> bool:
    """Check if an asset_id exists in kinship-assets."""
    asset = await get_asset(asset_id)
    return asset is not None


# ── PHASE 0: Platform Capabilities ──


async def get_platform_info(platform_id: str) -> dict | None:
    """Get platform details from kinship-assets.

    PHASE 0: New function.
    """
    client = get_client()
    try:
        resp = await client.get(f"/platforms/{platform_id}")
        if resp.status_code == 200:
            return resp.json()
        return None
    except Exception as e:
        logger.error(f"Failed to fetch platform {platform_id}: {e}")
        return None


async def get_platform_asset_counts(platform_id: str) -> dict:
    """Get counts of assets by type for a platform.

    PHASE 0: New function.
    Returns: {"tile": 45, "sprite": 12, "object": 23, ...}
    """
    assets = await fetch_all_assets(platform_id=platform_id)

    counts: dict[str, int] = {}
    for asset in assets:
        atype = asset.get("type", "object")
        counts[atype] = counts.get(atype, 0) + 1

    return counts


async def list_scenes(game_id: str) -> list[dict]:
    """List all scenes for a game."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(f"/scenes", params={"game_id": game_id})
        if response.status_code == 200:
            return response.json()
        return []


async def delete_scene(scene_id: str) -> bool:
    """Delete a scene."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.delete(f"/scenes/{scene_id}")
        return response.status_code in (200, 204)
