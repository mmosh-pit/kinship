"""Asset & Design Knowledge Embedding Service.

Embeds two types of content into Pinecone for semantic retrieval:

1. ASSET CATALOG (namespace: kinship-assets)
   Each asset's name, type, description, metadata → so AI knows WHAT exists.
   NOW WITH PLATFORM_ID SUPPORT — filters assets by platform during retrieval.

2. DESIGN KNOWLEDGE (namespace: kinship-design)
   Scene templates, composition patterns, NPC archetypes, challenge patterns,
   HEARTS-environment mappings, layout principles → so AI knows HOW to design.

During conversation, both are retrieved semantically:
  "forest clearing with campfire" →
    Assets: grass_block, pine_tree, campfire, log_seat, mushroom...
    Design: Forest Sanctuary template, Campfire Circle composition, Harmony environment guide...

Trigger: POST /api/assets/embed-catalog (re-embed all)

PHASE 0 CHANGES:
- Added platform_id to metadata
- Added platform_id filter to all retrieval functions
- Retrieval now scoped to specific platform
"""

import logging
from typing import Optional

from app.services import assets_client
from app.services.embedding_client import embed_texts, embed_query
from app.services.pinecone_client import upsert_vectors, query_vectors

logger = logging.getLogger(__name__)

ASSET_NAMESPACE = "kinship-assets"
DESIGN_NAMESPACE = "kinship-design"


# ═══════════════════════════════════════════════════════════
# INCREMENTAL ASSET EMBEDDING (webhook-triggered)
# ═══════════════════════════════════════════════════════════


async def embed_single_asset(asset: dict) -> dict:
    """Embed or re-embed a single asset into Pinecone.

    Called when an asset is created or updated via webhook.
    Much faster than re-embedding the entire catalog.
    """
    asset_id = asset.get("id", "")
    if not asset_id:
        return {"status": "error", "message": "No asset_id"}

    text = build_asset_text(asset)
    embeddings = await embed_texts([text])

    vector = {
        "id": f"asset_{asset_id}",
        "values": embeddings[0],
        "metadata": build_asset_metadata(asset),
    }

    result = await upsert_vectors([vector], namespace=ASSET_NAMESPACE)
    logger.info(f"Embedded single asset: {asset.get('name', '?')} ({asset_id})")
    return {"status": "ok", "asset_id": asset_id, "upserted": 1}


async def delete_asset_embedding(asset_id: str) -> dict:
    """Remove an asset's embedding from Pinecone.

    Called when an asset is deleted via webhook.
    """
    from app.services.pinecone_client import get_pinecone_index

    index = get_pinecone_index()
    index.delete(ids=[f"asset_{asset_id}"], namespace=ASSET_NAMESPACE)
    logger.info(f"Deleted embedding for asset: {asset_id}")
    return {"status": "ok", "asset_id": asset_id, "deleted": True}


async def refresh_asset_embedding(asset_id: str) -> dict:
    """Re-fetch an asset from kinship-assets and re-embed it.

    Used when metadata changes — we need the full asset with fresh metadata.
    """
    asset = await assets_client.get_asset(asset_id)
    if not asset:
        logger.warning(f"Asset {asset_id} not found for refresh")
        return {"status": "not_found", "asset_id": asset_id}

    return await embed_single_asset(asset)


def build_asset_text(asset: dict) -> str:
    """Build a rich text description of an asset for embedding.

    Combines name, type, description, tags, and metadata into a single
    searchable text that captures what the asset IS and HOW it's used.
    """
    name = asset.get("name", "unknown")
    display = asset.get("display_name", name)
    atype = asset.get("type", "object")
    desc = asset.get("meta_description", "")
    tags = asset.get("tags", [])
    meta = asset.get("metadata") or {}

    parts = [f"{display} ({name})"]
    parts.append(f"Type: {atype}")

    if desc:
        parts.append(f"Description: {desc}")

    if tags:
        parts.append(f"Tags: {', '.join(tags)}")

    # Spawn/layer info
    spawn = meta.get("spawn", {})
    if spawn:
        layer = spawn.get("layer", "objects")
        z = spawn.get("z_index", 1)
        parts.append(f"Layer: {layer}, z-index: {z}")

    # Hitbox/size
    hitbox = meta.get("hitbox", {})
    if hitbox:
        w = hitbox.get("width", 1)
        h = hitbox.get("height", 1)
        parts.append(f"Size: {w}x{h} tiles")

    # Interaction
    interaction = meta.get("interaction", {})
    if interaction:
        itype = interaction.get("type", "none")
        if itype != "none":
            parts.append(f"Interaction: {itype}")

    # HEARTS mapping
    hearts = meta.get("hearts_mapping", {})
    primary = hearts.get("primary_facet")
    if primary:
        facet_names = {
            "H": "Harmony",
            "E": "Empowerment",
            "A": "Awareness",
            "R": "Resilience",
            "T": "Tenacity",
            "Si": "Self-insight",
            "So": "Social",
        }
        parts.append(f"HEARTS facet: {facet_names.get(primary, primary)}")
        secondary = hearts.get("secondary_facet")
        if secondary:
            parts.append(f"Secondary facet: {facet_names.get(secondary, secondary)}")
        hdesc = hearts.get("description", "")
        if hdesc:
            parts.append(f"Emotional purpose: {hdesc}")

    # Rules
    rules = meta.get("rules", {})
    if rules:
        rdesc = rules.get("description", "")
        if rdesc:
            parts.append(f"Rules: {rdesc}")

    # States
    states = meta.get("states", [])
    if states and states != ["idle"]:
        parts.append(f"States: {', '.join(states)}")

    # Contextual hints based on type
    type_context = {
        "tile": "Ground tile for floor/terrain coverage. Used as base layer.",
        "sprite": "Tall visual element for depth and boundaries. Trees, structures.",
        "object": "Interactive or decorative item placed in the scene.",
        "npc": "Character sprite for non-player characters.",
        "avatar": "Player character visual.",
    }
    ctx = type_context.get(atype)
    if ctx:
        parts.append(ctx)

    # Knowledge layer (from Claude Vision analysis)
    knowledge = asset.get("knowledge") or {}
    print("===================== KNOWLEDGE =======================", knowledge)
    if knowledge:
        vd = knowledge.get("visual_description", "")
        if vd:
            parts.append(f"Visual: {vd}")
        sr = knowledge.get("scene_role", "")
        if sr:
            parts.append(f"Scene role: {sr}")
        ph = knowledge.get("placement_hint", "")
        if ph:
            parts.append(f"Placement: {ph}")
        moods = knowledge.get("visual_mood", [])
        if moods:
            parts.append(f"Mood: {', '.join(moods)}")
        colors = knowledge.get("color_palette", [])
        if colors:
            parts.append(f"Colors: {', '.join(colors)}")
        scenes = knowledge.get("suitable_scenes", [])
        if scenes:
            parts.append(f"Suitable scenes: {', '.join(scenes)}")
        facets = knowledge.get("suitable_facets", [])
        if facets:
            parts.append(f"Suitable facets: {', '.join(facets)}")
        pairs = knowledge.get("pair_with", [])
        if pairs:
            parts.append(f"Pairs with: {', '.join(pairs)}")
        comp = knowledge.get("composition_notes", "")
        if comp:
            parts.append(f"Composition: {comp}")
        narr = knowledge.get("narrative_hook", "")
        if narr:
            parts.append(f"Narrative: {narr}")
        affordances = knowledge.get("affordances", [])
        print("===================== affordances =======================", affordances)
        if affordances:
            parts.append(f"Player can: {', '.join(affordances)}")

        capabilities = knowledge.get("capabilities", [])
        print(
            "===================== capabilities =======================", capabilities
        )
        if capabilities:
            parts.append(f"Object can: {', '.join(capabilities)}")

        # Placement rules
        placement_type = knowledge.get("placement_type", "")
        print(
            "===================== placement_type =======================",
            placement_type,
        )
        if placement_type and placement_type != "standalone":
            parts.append(f"Placement type: {placement_type}")

        requires = knowledge.get("requires_nearby", [])
        print("===================== requires =======================", requires)
        if requires:
            parts.append(f"Requires nearby: {', '.join(requires)}")

        avoids = knowledge.get("avoids_nearby", [])
        print("===================== avoids =======================", avoids)
        if avoids:
            parts.append(f"Avoids: {', '.join(avoids)}")

        context_fn = knowledge.get("context_functions", {})
        print("===================== context_fn =======================", context_fn)
        if context_fn:
            context_parts = [f"{k} becomes {v}" for k, v in context_fn.items()]
            parts.append(f"Context: {'; '.join(context_parts)}")

    return ". ".join(parts)


def build_asset_metadata(asset: dict) -> dict:
    """Build Pinecone metadata for an asset vector.

    Stores enough info to reconstruct the full catalog entry without
    fetching from the database again — includes knowledge + rendering hints.

    IMPORTANT: Pinecone rejects null values. Every field must be str/number/bool/list[str].

    PHASE 0: Added platform_id to metadata for filtering.
    """
    meta = asset.get("metadata") or {}
    spawn = meta.get("spawn") or {}
    hitbox = meta.get("hitbox") or {}
    interaction = meta.get("interaction") or {}
    hearts = meta.get("hearts_mapping") or {}
    knowledge = asset.get("knowledge") or {}

    result = {
        # Core
        "asset_id": asset.get("id") or "",
        "platform_id": asset.get("platform_id") or "",  # ← PHASE 0: Added platform_id
        "name": asset.get("name") or "",
        "display_name": asset.get("display_name") or "",
        "type": asset.get("type") or "object",
        "meta_description": (asset.get("meta_description") or "")[:200],
        "tags": ",".join(asset.get("tags") or []),
        "file_url": asset.get("file_url") or "",
        # Spawn/layer
        "layer": spawn.get("layer") or "objects",
        "z_index": spawn.get("z_index") or 1,
        # Size
        "hitbox_w": hitbox.get("width") or 1,
        "hitbox_h": hitbox.get("height") or 1,
        # Interaction
        "interaction_type": interaction.get("type") or "none",
        # HEARTS
        "primary_facet": hearts.get("primary_facet") or "",
        "secondary_facet": hearts.get("secondary_facet") or "",
        # Flame rendering (from asset_metadata table)
        "pixel_width": meta.get("pixel_width") or 0,
        "pixel_height": meta.get("pixel_height") or 0,
        "anchor_x": meta.get("anchor_x") if meta.get("anchor_x") is not None else 0.5,
        "anchor_y": meta.get("anchor_y") if meta.get("anchor_y") is not None else 1.0,
        "render_scale": meta.get("render_scale") or 1.0,
    }

    # Knowledge fields (from Claude Vision analysis)
    if knowledge:
        result["scene_role"] = knowledge.get("scene_role") or "prop"
        result["placement_hint"] = knowledge.get("placement_hint") or "single"
        result["visual_description"] = (knowledge.get("visual_description") or "")[:500]
        result["visual_mood"] = ",".join(knowledge.get("visual_mood") or [])
        result["color_palette"] = ",".join(knowledge.get("color_palette") or [])
        result["composition_notes"] = (knowledge.get("composition_notes") or "")[:500]
        result["suitable_facets"] = ",".join(knowledge.get("suitable_facets") or [])
        result["suitable_scenes"] = ",".join(knowledge.get("suitable_scenes") or [])
        result["pair_with"] = ",".join(knowledge.get("pair_with") or [])
        result["narrative_hook"] = knowledge.get("narrative_hook") or ""
        result["affordances"] = ",".join(knowledge.get("affordances") or [])
        result["capabilities"] = ",".join(knowledge.get("capabilities") or [])
        result["placement_type"] = knowledge.get("placement_type") or "standalone"

    # ── Type-specific metadata (stored as JSON strings for game engine) ──
    import json as _json

    sprite_sheet = meta.get("sprite_sheet") or {}
    if isinstance(sprite_sheet, dict) and sprite_sheet.get("frame_width"):
        result["sprite_sheet_json"] = _json.dumps(sprite_sheet)

    tile_config = meta.get("tile_config") or {}
    if isinstance(tile_config, dict) and any(v for v in tile_config.values() if v):
        result["tile_config_json"] = _json.dumps(tile_config)

    audio_config = meta.get("audio_config") or {}
    if isinstance(audio_config, dict) and any(v for v in audio_config.values() if v):
        result["audio_config_json"] = _json.dumps(audio_config)

    tilemap_config = meta.get("tilemap_config") or {}
    if isinstance(tilemap_config, dict) and any(
        v for v in tilemap_config.values() if v
    ):
        result["tilemap_config_json"] = _json.dumps(tilemap_config)

    movement = meta.get("movement") or {}
    if (
        isinstance(movement, dict)
        and movement.get("type")
        and movement["type"] != "static"
    ):
        result["movement_json"] = _json.dumps(movement)

    # Final safety: Pinecone rejects ANY null value
    for key, val in list(result.items()):
        if val is None:
            result[key] = ""

    return result


async def embed_all_assets(platform_id: Optional[str] = None) -> dict:
    """Fetch all assets from kinship-assets and embed them into Pinecone.

    Args:
        platform_id: Optional — if provided, only embed assets from this platform.
                     If None, embeds ALL assets (for full re-indexing).

    Returns stats about the embedding operation.
    """
    logger.info(f"Starting asset catalog embedding... (platform_id={platform_id})")

    # Fetch all assets with metadata
    assets = await assets_client.fetch_all_assets(platform_id=platform_id)
    if not assets:
        logger.warning("No assets found to embed")
        return {"status": "empty", "total": 0}

    logger.info(f"Fetched {len(assets)} assets, building embeddings...")

    # Build text descriptions
    texts = []
    vectors = []
    for asset in assets:
        asset_id = asset.get("id", "")
        if not asset_id:
            continue
        text = build_asset_text(asset)
        texts.append(text)
        vectors.append(
            {
                "id": f"asset_{asset_id}",
                "metadata": build_asset_metadata(asset),
            }
        )

    # Embed in batches (Voyage AI limit: 128 texts per call)
    batch_size = 64
    all_embeddings = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        embeddings = await embed_texts(batch)
        all_embeddings.extend(embeddings)
        logger.info(
            f"Embedded batch {i // batch_size + 1}/{(len(texts) + batch_size - 1) // batch_size}"
        )

    # Attach embeddings to vectors
    for vec, emb in zip(vectors, all_embeddings):
        vec["values"] = emb

    # Upsert to Pinecone
    result = await upsert_vectors(vectors, namespace=ASSET_NAMESPACE)

    logger.info(
        f"✅ Embedded {len(vectors)} assets into Pinecone namespace '{ASSET_NAMESPACE}'"
    )
    return {
        "status": "ok",
        "total": len(vectors),
        "upserted": result.get("upserted", 0),
        "platform_id": platform_id,
    }


def _parse_type_configs(meta: dict) -> dict:
    """Parse type-specific config JSON strings from Pinecone metadata.

    Pinecone stores these as JSON strings because it only supports flat scalars.
    We reconstruct them back to dicts for the game engine.
    """
    import json as _json

    result = {}

    for key in (
        "sprite_sheet",
        "tile_config",
        "audio_config",
        "tilemap_config",
        "movement",
    ):
        json_key = f"{key}_json"
        raw = meta.get(json_key, "")
        if raw and isinstance(raw, str):
            try:
                parsed = _json.loads(raw)
                if isinstance(parsed, dict) and parsed:
                    result[key] = parsed
            except (_json.JSONDecodeError, TypeError):
                pass

    return result


async def retrieve_relevant_assets(
    context: str,
    top_k: int = 40,
    asset_type: Optional[str] = None,
    platform_id: Optional[str] = None,  # ← PHASE 0: Added platform filter
) -> list[dict]:
    """Retrieve the most relevant assets for a scene context.

    Args:
        context: Description of what we're looking for (e.g., "forest clearing
                 with campfire, peaceful, harmony and awareness")
        top_k: Max assets to return
        asset_type: Optional filter (e.g., "tile", "object", "sprite")
        platform_id: Optional filter — only return assets from this platform

    Returns:
        List of asset dicts with full metadata, ready for the AI prompt.
    """
    # Build query embedding
    query_embedding = await embed_query(context)

    # Build Pinecone filter
    pc_filter = {}
    if asset_type:
        pc_filter["type"] = {"$eq": asset_type}
    if platform_id:
        pc_filter["platform_id"] = {"$eq": platform_id}  # ← PHASE 0: Filter by platform

    # Query Pinecone
    results = await query_vectors(
        embedding=query_embedding,
        top_k=top_k,
        namespace=ASSET_NAMESPACE,
        filter=pc_filter if pc_filter else None,
    )

    # Convert Pinecone results back to asset-like dicts
    assets = []
    for r in results:
        meta = r.get("metadata", {})
        # Reconstruct the tags list from comma-separated string
        tags_str = meta.get("tags", "")
        tags = [t.strip() for t in tags_str.split(",") if t.strip()] if tags_str else []

        # Reconstruct knowledge from Pinecone metadata
        knowledge = {}
        if meta.get("scene_role"):
            knowledge["scene_role"] = meta.get("scene_role", "prop")
        if meta.get("placement_hint"):
            knowledge["placement_hint"] = meta.get("placement_hint", "single")
        if meta.get("visual_description"):
            knowledge["visual_description"] = meta.get("visual_description", "")
        if meta.get("visual_mood"):
            mood_str = meta.get("visual_mood", "")
            knowledge["visual_mood"] = (
                [m.strip() for m in mood_str.split(",") if m.strip()]
                if mood_str
                else []
            )
        if meta.get("color_palette"):
            pal_str = meta.get("color_palette", "")
            knowledge["color_palette"] = (
                [c.strip() for c in pal_str.split(",") if c.strip()] if pal_str else []
            )
        if meta.get("composition_notes"):
            knowledge["composition_notes"] = meta.get("composition_notes", "")
        if meta.get("suitable_facets"):
            fac_str = meta.get("suitable_facets", "")
            knowledge["suitable_facets"] = (
                [f.strip() for f in fac_str.split(",") if f.strip()] if fac_str else []
            )
        if meta.get("suitable_scenes"):
            sc_str = meta.get("suitable_scenes", "")
            knowledge["suitable_scenes"] = (
                [s.strip() for s in sc_str.split(",") if s.strip()] if sc_str else []
            )
        if meta.get("pair_with"):
            pw_str = meta.get("pair_with", "")
            knowledge["pair_with"] = (
                [p.strip() for p in pw_str.split(",") if p.strip()] if pw_str else []
            )
        if meta.get("narrative_hook"):
            knowledge["narrative_hook"] = meta.get("narrative_hook", "")

        assets.append(
            {
                "id": meta.get("asset_id", ""),
                "platform_id": meta.get(
                    "platform_id", ""
                ),  # ← PHASE 0: Include in result
                "name": meta.get("name", ""),
                "display_name": meta.get("display_name", ""),
                "type": meta.get("type", "object"),
                "meta_description": meta.get("meta_description", ""),
                "tags": tags,
                "file_url": meta.get("file_url", ""),
                "score": r.get("score", 0),
                "knowledge": knowledge if knowledge else None,
                "metadata": {
                    "spawn": {
                        "layer": meta.get("layer", "objects"),
                        "z_index": meta.get("z_index", 1),
                    },
                    "hitbox": {
                        "width": meta.get("hitbox_w", 1),
                        "height": meta.get("hitbox_h", 1),
                    },
                    "interaction": {
                        "type": meta.get("interaction_type", "none"),
                    },
                    "hearts_mapping": {
                        "primary_facet": meta.get("primary_facet", ""),
                        "secondary_facet": meta.get("secondary_facet", ""),
                    },
                    "pixel_width": meta.get("pixel_width", 0),
                    "pixel_height": meta.get("pixel_height", 0),
                    "anchor_x": meta.get("anchor_x", 0.5),
                    "anchor_y": meta.get("anchor_y", 1.0),
                    "render_scale": meta.get("render_scale", 1.0),
                    # ── Type-specific configs (from JSON strings) ──
                    **_parse_type_configs(meta),
                },
            }
        )

    logger.info(
        f"Retrieved {len(assets)} relevant assets for context: "
        f"'{context[:60]}...' (platform_id={platform_id}, top score: {assets[0]['score']:.3f})"
        if assets
        else f"No assets found (platform_id={platform_id})"
    )
    return assets


async def build_context_query(
    messages: list[dict],
    current_scene: dict,
) -> str:
    """Build a semantic search query from conversation context.

    Extracts the key concepts from:
    - Recent user messages (what they want)
    - Scene config (type, description, facets)
    - Current phase (what's missing)
    """
    parts = []

    # Scene context
    scene = current_scene.get("scene") or {}
    if scene.get("scene_type"):
        parts.append(scene["scene_type"])
    if scene.get("description"):
        parts.append(scene["description"][:100])
    if scene.get("lighting"):
        parts.append(f"{scene['lighting']} lighting")
    if scene.get("weather") and scene["weather"] != "clear":
        parts.append(f"{scene['weather']} weather")

    facets = scene.get("target_facets", [])
    facet_names = {
        "H": "harmony peace",
        "E": "empowerment strength",
        "A": "awareness mindfulness",
        "R": "resilience recovery",
        "T": "tenacity determination",
        "Si": "self-insight reflection",
        "So": "social connection",
    }
    for f in facets:
        parts.append(facet_names.get(f, f))

    # Recent user messages (last 3)
    user_msgs = [m["content"] for m in messages if m.get("role") == "user"][-3:]
    for msg in user_msgs:
        parts.append(msg[:100])

    # If nothing yet, use a generic query
    if not parts:
        parts.append("isometric game scene forest garden campfire nature")

    query = " ".join(parts)
    return query


async def retrieve_assets_for_conversation(
    messages: list[dict],
    current_scene: dict,
    top_k: int = 40,
    platform_id: Optional[str] = None,  # ← PHASE 0: Added platform filter
) -> list[dict]:
    """High-level: build context from conversation and retrieve relevant assets.

    This is the main entry point used by scene_conversation.py.
    """
    query = await build_context_query(messages, current_scene)

    # Always include ground tiles — retrieve some separately
    ground_assets = await retrieve_relevant_assets(
        query, top_k=5, asset_type="tile", platform_id=platform_id
    )
    other_assets = await retrieve_relevant_assets(
        query, top_k=top_k - 5, platform_id=platform_id
    )

    # Merge and deduplicate
    seen_ids = set()
    merged = []
    for a in ground_assets + other_assets:
        aid = a.get("id", "")
        if aid and aid not in seen_ids:
            seen_ids.add(aid)
            merged.append(a)

    return merged


# ═══════════════════════════════════════════════════════════
# DESIGN KNOWLEDGE EMBEDDING
# ═══════════════════════════════════════════════════════════


async def embed_design_knowledge() -> dict:
    """Generate and embed design knowledge dynamically from the actual asset catalog.

    Uses Claude to analyze the current assets and generate context-aware
    scene templates, compositions, NPC archetypes, challenge patterns, etc.

    This replaces the old static DESIGN_KNOWLEDGE approach.
    """
    from app.services.design_knowledge_generator import generate_design_knowledge

    return await generate_design_knowledge()


async def retrieve_design_knowledge(
    context: str,
    top_k: int = 8,
    category: Optional[str] = None,
) -> list[dict]:
    """Retrieve relevant design knowledge for the current scene context.

    Args:
        context: Semantic query (scene description, facets, mood)
        top_k: Number of results
        category: Optional filter (scene_template, composition, npc_archetype, etc.)

    Returns:
        List of design knowledge entries with content.
    """
    query_embedding = await embed_query(context)

    pc_filter = None
    if category:
        pc_filter = {"category": {"$eq": category}}

    results = await query_vectors(
        embedding=query_embedding,
        top_k=top_k,
        namespace=DESIGN_NAMESPACE,
        filter=pc_filter,
    )

    entries = []
    for r in results:
        meta = r.get("metadata", {})
        facets_str = meta.get("facets", "")
        entries.append(
            {
                "id": meta.get("entry_id", ""),
                "category": meta.get("category", ""),
                "title": meta.get("title", ""),
                "facets": [f.strip() for f in facets_str.split(",") if f.strip()],
                "content": meta.get("content", ""),
                "score": r.get("score", 0),
            }
        )

    logger.info(
        f"Retrieved {len(entries)} design knowledge entries for: '{context[:60]}...'"
        if entries
        else "No design knowledge found"
    )
    return entries


# ═══════════════════════════════════════════════════════════
# UNIFIED EMBEDDING (assets + design knowledge)
# ═══════════════════════════════════════════════════════════


async def embed_everything(platform_id: Optional[str] = None) -> dict:
    """Embed both asset catalog and design knowledge into Pinecone.

    This is the recommended single call to set up all embeddings.
    """
    asset_result = await embed_all_assets(platform_id=platform_id)
    design_result = await embed_design_knowledge()

    return {
        "status": "ok",
        "assets": asset_result,
        "design_knowledge": design_result,
    }


async def retrieve_all_context(
    messages: list[dict],
    current_scene: dict,
    asset_top_k: int = 35,
    design_top_k: int = 8,
    platform_id: Optional[str] = None,  # ← PHASE 0: Added platform filter
) -> dict:
    """Retrieve both relevant assets AND design knowledge for a conversation.

    This is the main entry point for scene_conversation.py.

    Returns:
        {
            "assets": [...],          # Relevant asset catalog entries
            "design_knowledge": [...], # Relevant design patterns/templates
        }
    """
    query = await build_context_query(messages, current_scene)

    # Parallel retrieval
    import asyncio

    ground_task = retrieve_relevant_assets(
        query, top_k=5, asset_type="tile", platform_id=platform_id
    )
    assets_task = retrieve_relevant_assets(
        query, top_k=asset_top_k, platform_id=platform_id
    )
    design_task = retrieve_design_knowledge(query, top_k=design_top_k)

    ground, assets, design = await asyncio.gather(
        ground_task,
        assets_task,
        design_task,
        return_exceptions=True,
    )

    # Handle errors gracefully
    if isinstance(ground, Exception):
        logger.warning(f"Ground tile retrieval failed: {ground}")
        ground = []
    if isinstance(assets, Exception):
        logger.warning(f"Asset retrieval failed: {assets}")
        assets = []
    if isinstance(design, Exception):
        logger.warning(f"Design knowledge retrieval failed: {design}")
        design = []

    # Merge and deduplicate assets
    seen_ids = set()
    merged_assets = []
    for a in ground + assets:
        aid = a.get("id", "")
        if aid and aid not in seen_ids:
            seen_ids.add(aid)
            merged_assets.append(a)

    return {
        "assets": merged_assets,
        "design_knowledge": design,
    }


# ═══════════════════════════════════════════════════════════
# PLATFORM CAPABILITY DETECTION (PHASE 0)
# ═══════════════════════════════════════════════════════════


async def get_platform_asset_capabilities(platform_id: str) -> dict:
    """Analyze what asset types and capabilities are available for a platform.

    This helps AI understand what kinds of games can be built:
    - Has NPC sprites? → Can build character dialogue games
    - Has collectibles? → Can build collection challenges
    - Has obstacles? → Can build puzzle/navigation games

    Returns:
        {
            "platform_id": "...",
            "asset_types": {"tile": 45, "sprite": 12, "object": 23, "npc": 5, ...},
            "capabilities": {
                "has_npcs": True,
                "has_collectibles": False,
                "has_animated_sprites": True,
                "has_obstacles": True,
                ...
            },
            "scene_types": ["forest", "garden", "cave"],  # from suitable_scenes
            "facets_supported": ["H", "E", "T"],  # from suitable_facets
        }
    """
    from app.services.pinecone_client import get_pinecone_index

    index = get_pinecone_index()

    # Query to get all assets for this platform (using a dummy vector)
    # We'll use list() with metadata filter instead
    # Note: This is a simplified approach — in production, you might want
    # to maintain a separate summary collection or cache this data

    # For now, fetch from kinship-assets API directly
    assets = await assets_client.fetch_all_assets(platform_id=platform_id)

    if not assets:
        return {
            "platform_id": platform_id,
            "asset_types": {},
            "capabilities": {
                "has_npcs": False,
                "has_collectibles": False,
                "has_animated_sprites": False,
                "has_obstacles": False,
                "has_interactives": False,
            },
            "scene_types": [],
            "facets_supported": [],
            "total_assets": 0,
        }

    # Count asset types
    asset_types: dict[str, int] = {}
    scene_types: set[str] = set()
    facets: set[str] = set()
    has_animated = False

    for asset in assets:
        atype = asset.get("type", "object")
        asset_types[atype] = asset_types.get(atype, 0) + 1

        # Check for animation capability
        meta = asset.get("metadata") or {}
        if meta.get("sprite_sheet") and meta["sprite_sheet"].get("frame_width"):
            has_animated = True

        # Collect scene types from knowledge
        knowledge = asset.get("knowledge") or {}
        for scene in knowledge.get("suitable_scenes", []):
            scene_types.add(scene)
        for facet in knowledge.get("suitable_facets", []):
            facets.add(facet)

    return {
        "platform_id": platform_id,
        "asset_types": asset_types,
        "capabilities": {
            "has_npcs": asset_types.get("npc", 0) > 0,
            "has_sprites": asset_types.get("sprite", 0) > 0,
            "has_collectibles": asset_types.get("object", 0)
            > 0,  # objects can be collectibles
            "has_animated_sprites": has_animated,
            "has_tiles": asset_types.get("tile", 0) > 0,
            "has_audio": asset_types.get("audio", 0) > 0,
        },
        "scene_types": sorted(scene_types),
        "facets_supported": sorted(facets),
        "total_assets": len(assets),
    }
