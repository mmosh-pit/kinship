"""
scenes_client.py - Client for fetching game manifests from the database.

This module provides functions to fetch game manifests from the kinship-scenes
database API.
"""

import logging
import os
from typing import Optional, Dict, Any

import httpx

logger = logging.getLogger(__name__)


# API base URL from environment
SCENES_API_URL = os.getenv("SCENES_API_URL", "http://localhost:3001")


async def fetch_game_manifest(game_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch a game manifest from the database API.

    Args:
        game_id: The game ID to fetch

    Returns:
        The manifest dict if found, None otherwise
    """
    try:
        # Try to fetch from the scenes API
        url = f"{SCENES_API_URL}/api/games/{game_id}/manifest"

        logger.info(f"Fetching manifest from: {url}")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)

            if response.status_code == 200:
                data = response.json()

                # Handle different response formats
                if "manifest" in data:
                    logger.info(
                        f"Loaded manifest with {len(data['manifest'].get('scenes', []))} scenes"
                    )
                    return data["manifest"]
                elif "scenes" in data:
                    # Data is the manifest itself
                    logger.info(
                        f"Loaded manifest with {len(data.get('scenes', []))} scenes"
                    )
                    return data
                else:
                    logger.warning(f"Unexpected response format: {list(data.keys())}")
                    return data

            elif response.status_code == 404:
                logger.info(f"Game not found in database: {game_id}")
                return None
            else:
                logger.warning(
                    f"Failed to fetch manifest: status={response.status_code}, "
                    f"body={response.text[:200]}"
                )
                return None

    except httpx.TimeoutException:
        logger.error(f"Timeout fetching manifest for game: {game_id}")
        return None
    except httpx.ConnectError as e:
        logger.warning(f"Could not connect to scenes API at {SCENES_API_URL}: {e}")
        return None
    except Exception as e:
        logger.error(f"Error fetching manifest: {e}")
        return None


async def save_game_manifest(game_id: str, manifest: Dict[str, Any]) -> bool:
    """
    Save a game manifest to the database API.

    Args:
        game_id: The game ID
        manifest: The manifest to save

    Returns:
        True if saved successfully, False otherwise
    """
    try:
        url = f"{SCENES_API_URL}/api/games/{game_id}/manifest"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.put(url, json={"manifest": manifest})

            if response.status_code in [200, 201]:
                logger.info(f"Saved manifest for game: {game_id}")
                return True
            else:
                logger.warning(
                    f"Failed to save manifest: status={response.status_code}"
                )
                return False

    except Exception as e:
        logger.error(f"Error saving manifest: {e}")
        return False
