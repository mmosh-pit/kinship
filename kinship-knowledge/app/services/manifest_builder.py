"""Manifest builder — creates Flutter/Flame-compatible scene manifests."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import NPC, Challenge, Quest, ScenePresence
from app.schemas.manifest import (
    ManifestAssetPlacement, ManifestAmbient, ManifestNPCPlacement,
    ManifestPosition, ManifestSpawnPoint, SceneManifest,
)


async def build_manifest(raw: dict, scene_id: str, db: AsyncSession) -> SceneManifest:
    """
    Build a Flutter/Flame manifest from kinship-assets scene data + backend entities.

    Args:
        raw: {"scene": {...}, "placed_assets": [...]} from kinship-assets
        scene_id: Scene UUID
        db: Database session for NPC/challenge data

    Returns:
        SceneManifest ready for Flutter consumption
    """
    scene = raw["scene"]
    placed_assets = raw.get("placed_assets", [])

    # Build asset placements
    assets = []
    for pa in placed_assets:
        asset = pa.get("asset", pa)
        placement = pa.get("placement", {})
        assets.append(ManifestAssetPlacement(
            asset_id=str(asset.get("id", "")),
            asset_name=asset.get("display_name", asset.get("name", "")),
            file_url=asset.get("file_url", ""),
            position=ManifestPosition(
                x=placement.get("position_x", float(placement.get("x", 0))),
                y=placement.get("position_y", float(placement.get("y", 0))),
            ),
            z_index=placement.get("z_index", 1),
            layer=placement.get("layer", "objects"),
            scale=placement.get("scale", 1.0),
        ))

    # Get NPCs assigned to this scene
    result = await db.execute(
        select(NPC).where(NPC.scene_id == scene_id, NPC.status != "archived")
    )
    npcs_db = result.scalars().all()

    npcs = [
        ManifestNPCPlacement(
            npc_id=str(npc.id),
            npc_name=npc.name,
            sprite_url=None,  # Resolved via sprite_asset_id → kinship-assets file_url
            position=ManifestPosition(x=5 + i * 3, y=5),  # Default positions; scene gen overrides
            facet=npc.facet,
        )
        for i, npc in enumerate(npcs_db)
    ]

    # Get active players in scene for multi-player
    presence_result = await db.execute(
        select(ScenePresence).where(ScenePresence.scene_id == scene_id)
    )
    active_players = [
        {
            "player_id": str(p.player_id),
            "x": p.position_x,
            "y": p.position_y,
            "facing": p.facing,
            "status": p.status,
        }
        for p in presence_result.scalars().all()
    ]

    # Build manifest
    dimensions = scene.get("dimensions", {"width": 20, "height": 15})
    if isinstance(dimensions, str):
        # Handle "20x15" string format
        parts = dimensions.lower().split("x")
        dimensions = {"width": int(parts[0]), "height": int(parts[1]) if len(parts) > 1 else int(parts[0])}

    return SceneManifest(
        scene_id=scene_id,
        scene_name=scene.get("display_name", scene.get("name", "Untitled")),
        scene_type=scene.get("scene_type", "standard"),
        dimensions=dimensions,
        tile_map_url=scene.get("tile_map_url"),
        assets=assets,
        npcs=npcs,
        spawn_points=[ManifestSpawnPoint(
            position=ManifestPosition(
                x=dimensions.get("width", 20) / 2,
                y=dimensions.get("height", 15) / 2,
            )
        )],
        ambient=ManifestAmbient(
            lighting=scene.get("lighting", "day"),
            weather=scene.get("weather", "clear"),
        ),
        boundaries={
            "min_x": 0, "min_y": 0,
            "max_x": dimensions.get("width", 20),
            "max_y": dimensions.get("height", 15),
        },
        active_players=active_players,
    )
