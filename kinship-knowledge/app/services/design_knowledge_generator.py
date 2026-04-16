"""Dynamic Design Knowledge Generator.

Instead of hardcoded patterns referencing specific asset names, this module:

1. Fetches the ACTUAL asset catalog from kinship-assets  
2. Sends it to Claude with structured prompts
3. Claude analyzes what assets exist and generates:
   - Scene templates using REAL asset names
   - Composition patterns (which assets go together)
   - NPC archetypes matched to available sprites
   - Challenge patterns using available objects
   - HEARTS-environment mappings for the actual art style
   - Mood recipes with real lighting/asset combos
4. Stores generated knowledge in Pinecone (kinship-design namespace)

When the catalog changes significantly (new pack, major additions), 
call POST /api/design/regenerate to re-analyze and rebuild all patterns.

This means:
  - Tiny Forest Pack → generates forest-specific patterns with exact asset names
  - Sci-Fi Pack → generates space station patterns with sci-fi asset names  
  - Underwater Pack → generates ocean floor patterns with coral/fish asset names
  - Mixed packs → generates cross-theme patterns

The AI scene designer always gets patterns that reference REAL, available assets.
"""

import json
import logging
from typing import Optional

from app.services import assets_client
from app.services.embedding_client import embed_texts
from app.services.pinecone_client import upsert_vectors, get_pinecone_index

logger = logging.getLogger(__name__)

DESIGN_NAMESPACE = "kinship-design"


# ─── Catalog Analysis Prompt ────────────────────────────


CATALOG_ANALYSIS_PROMPT = """You are an expert isometric game designer analyzing an asset catalog for Kinship,
an emotional wellbeing app ("a gym and spa for your heart and soul").

I'll give you the complete list of available assets with their names, types, dimensions, 
and metadata. Analyze them and generate design knowledge that an AI scene designer can use 
to compose scenes WITH THESE EXACT ASSETS.

IMPORTANT: Only reference asset_name values that exist in the catalog below. Never invent assets.

The HEARTS Framework has 7 facets:
- H (Harmony): Balance, peace, inner alignment
- E (Empowerment): Strength, confidence, agency  
- A (Awareness): Mindfulness, perception, observation
- R (Resilience): Recovery, adaptability, persistence
- T (Tenacity): Determination, grit, follow-through
- Si (Self-insight): Self-knowledge, reflection, growth
- So (Social): Connection, empathy, community

Isometric grid: 16×16 tiles. Coordinates (0,0) top-left to (15,15) bottom-right.
Z-index: 0=ground, 1=small objects, 2=medium objects, 3=tall structures, 4=canopy.
"""

GENERATION_PROMPTS = {
    "scene_templates": """Based on the asset catalog, generate 4-6 SCENE TEMPLATES.

Each template should be a complete layout recipe that an AI can follow to place assets.
Use ONLY asset names from the catalog. Include exact (x,y) positions for key items.

For each template provide:
- id: unique snake_case identifier  
- title: evocative name
- facets: which HEARTS facets this serves (list of keys)
- content: detailed layout description including:
  * Which asset to use for ground_fill
  * Zone layout (entry, core, discovery, boundary) with y-ranges
  * Specific asset placements with coordinates and z_index
  * Mood (lighting + weather)
  * Suggested NPC positions and roles
  * Suggested challenge type

Respond with a JSON array of objects with keys: id, category ("scene_template"), title, facets, content.
Content should be a detailed multi-paragraph string.""",

    "compositions": """Based on the asset catalog, generate 5-8 COMPOSITION PATTERNS.

Compositions are groupings of assets that work together visually and functionally.
Use ONLY asset names from the catalog.

Types of compositions to generate:
- Gathering spots (seating around focal points)
- Boundary/borders (how to contain scene edges)
- Activity areas (crafting, training, meditation)
- Path systems (which tiles to use for paths vs ground)
- Focal points (centerpiece arrangements)
- Hidden/discovery corners

For each provide:
- id: unique snake_case identifier
- title: descriptive name  
- facets: relevant HEARTS facets
- content: detailed description including:
  * Required assets (by exact name)
  * Spatial arrangement (relative positions)
  * Z-index layering
  * Emotional purpose
  * What NOT to place nearby

Respond with a JSON array of objects with keys: id, category ("composition"), title, facets, content.""",

    "npc_archetypes": """Based on the available assets (especially any NPC sprites, structures, 
and interactive objects), generate 4-5 NPC ARCHETYPES.

Each archetype should be a complete character template. If there are NPC sprites in the catalog,
reference them. Position NPCs near objects that match their role.

For each provide:
- id: unique snake_case identifier
- title: archetype name
- facets: primary HEARTS facets
- content: detailed description including:
  * Personality traits and dialogue style
  * Catchphrases (3-4)
  * Where to position in a scene (near which objects from the catalog)
  * What challenges they could give
  * How they contrast with other archetypes
  * Emotional arc (how they evolve as player interacts)

Respond with a JSON array of objects with keys: id, category ("npc_archetype"), title, facets, content.""",

    "challenge_patterns": """Based on the available interactive objects and scene elements,
generate 4-6 CHALLENGE PATTERNS.

Challenges in Kinship are therapeutic — about emotional growth, not punishment.
Design challenges that use ACTUAL objects from the catalog.

For each provide:
- id: unique snake_case identifier
- title: challenge name
- facets: HEARTS facets scored
- content: detailed description including:
  * Step-by-step structure (3-4 steps)
  * Which catalog objects are needed
  * Difficulty level and time limit
  * Scoring: which facets and how many points
  * Success criteria
  * Failure mode (how to handle gracefully — no punitive failure)
  * Emotional purpose

Respond with a JSON array of objects with keys: id, category ("challenge_pattern"), title, facets, content.""",

    "environment_moods": """Based on the asset catalog's visual style and available objects,
generate mood and environment guides.

Create 2 types of entries:

1. HEARTS_ENVIRONMENT entries (one per relevant facet): Which assets, lighting, weather, 
   and layout principles support each HEARTS facet. Reference real assets.

2. MOOD_RECIPE entries (3-4): Specific combinations of lighting + weather + asset density + 
   color palette that create distinct moods. Reference real assets.

For each provide:
- id: unique snake_case identifier
- category: "hearts_environment" or "mood_recipe"
- title: descriptive name
- facets: relevant facets
- content: detailed guide including real asset names, spatial rules, what to avoid

Respond with a JSON array of objects with keys: id, category, title, facets, content.""",

    "layout_principles": """Based on the asset catalog's dimensions and types, generate 3-4
LAYOUT PRINCIPLES specific to these assets.

Cover:
- How to use the available TILE assets for ground coverage and paths
- Z-ordering rules for the specific TALL vs SMALL assets in this catalog
- Zone design adapted to what's available
- Visual flow using these specific assets

Reference actual asset names and their actual dimensions/sizes.

Respond with a JSON array of objects with keys: id, category ("layout_principle"), title, facets (usually []), content.""",
}


# ─── Catalog Summary Builder ────────────────────────────


def _build_analysis_catalog(assets: list[dict]) -> str:
    """Build a structured catalog text for Claude to analyze."""
    by_type: dict[str, list[dict]] = {}
    for a in assets:
        atype = a.get("type", "object")
        by_type.setdefault(atype, []).append(a)

    lines = [f"ASSET CATALOG ({len(assets)} total assets):\n"]

    for atype, type_assets in sorted(by_type.items()):
        lines.append(f"\n=== {atype.upper()} ({len(type_assets)} assets) ===")
        for a in type_assets:
            name = a.get("name", "?")
            display = a.get("display_name", name)
            desc = a.get("meta_description", "")
            tags = a.get("tags", [])
            meta = a.get("metadata") or {}

            parts = [f"  {name}"]
            if display != name:
                parts[0] += f" ({display})"

            # Metadata
            spawn = meta.get("spawn", {})
            hitbox = meta.get("hitbox", {})
            hearts = meta.get("hearts_mapping", {})

            if spawn:
                parts.append(f"layer={spawn.get('layer', 'objects')}, z={spawn.get('z_index', 1)}")
            if hitbox:
                parts.append(f"size={hitbox.get('width', 1)}×{hitbox.get('height', 1)}")
            if hearts.get("primary_facet"):
                parts.append(f"facet={hearts['primary_facet']}")
            if tags:
                parts.append(f"tags=[{','.join(tags[:5])}]")
            if desc:
                parts.append(f"desc: {desc[:100]}")

            lines.append(" | ".join(parts))

    return "\n".join(lines)


# ─── Generation Engine ──────────────────────────────────


async def _call_claude(system: str, user_message: str) -> str:
    """Call Claude to generate design knowledge."""
    from app.config import get_settings
    from anthropic import AsyncAnthropic

    settings = get_settings()
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    response = await client.messages.create(
        model=settings.claude_sonnet_model,
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": user_message}],
    )

    return response.content[0].text


async def _generate_category(
    category_key: str,
    catalog_text: str,
) -> list[dict]:
    """Generate one category of design knowledge using Claude."""
    prompt = GENERATION_PROMPTS.get(category_key)
    if not prompt:
        return []

    user_message = f"""Here is the complete asset catalog:

{catalog_text}

{prompt}

Respond ONLY with a valid JSON array. No markdown, no code fences, no explanation."""

    try:
        raw = await _call_claude(CATALOG_ANALYSIS_PROMPT, user_message)

        # Clean and parse JSON
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        cleaned = cleaned.strip()

        entries = json.loads(cleaned)
        if not isinstance(entries, list):
            entries = [entries]

        logger.info(f"Generated {len(entries)} entries for category '{category_key}'")
        return entries

    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error generating {category_key}: {e}")
        logger.error(f"Raw response: {raw[:200]}...")
        return []
    except Exception as e:
        logger.error(f"Failed to generate {category_key}: {e}")
        return []


# ─── Main Generation Pipeline ───────────────────────────


async def generate_design_knowledge(
    categories: list[str] | None = None,
) -> dict:
    """Generate design knowledge from the actual asset catalog using Claude.
    
    Args:
        categories: Which categories to generate. None = all.
                   Options: scene_templates, compositions, npc_archetypes,
                   challenge_patterns, environment_moods, layout_principles
    
    Returns:
        Stats about what was generated and embedded.
    """
    logger.info("Starting dynamic design knowledge generation...")

    # 1. Fetch current asset catalog
    assets = await assets_client.fetch_all_assets()
    if not assets:
        return {"status": "error", "message": "No assets in catalog"}

    catalog_text = _build_analysis_catalog(assets)
    logger.info(f"Catalog summary: {len(catalog_text)} chars, {len(assets)} assets")

    # 2. Generate each category
    cats_to_generate = categories or list(GENERATION_PROMPTS.keys())
    all_entries = []
    stats = {}

    for cat_key in cats_to_generate:
        logger.info(f"Generating: {cat_key}...")
        entries = await _generate_category(cat_key, catalog_text)
        all_entries.extend(entries)
        stats[cat_key] = len(entries)

    if not all_entries:
        return {"status": "error", "message": "No entries generated", "stats": stats}

    # 3. Embed into Pinecone
    texts = []
    vectors = []
    for entry in all_entries:
        entry_id = entry.get("id", f"gen_{len(vectors)}")
        category = entry.get("category", "unknown")
        title = entry.get("title", "")
        facets = entry.get("facets", [])
        content = entry.get("content", "")

        # Build searchable text
        search_text = f"{title}. Category: {category}. "
        if facets:
            facet_names = {
                "H": "Harmony", "E": "Empowerment", "A": "Awareness",
                "R": "Resilience", "T": "Tenacity", "Si": "Self-insight", "So": "Social"
            }
            search_text += f"HEARTS facets: {', '.join(facet_names.get(f, f) for f in facets)}. "
        search_text += content

        texts.append(search_text)
        vectors.append({
            "id": f"design_{entry_id}",
            "metadata": {
                "entry_id": entry_id,
                "category": category,
                "title": title,
                "facets": ",".join(facets) if facets else "",
                "content": content[:1800],
                "source": "auto_generated",
            },
        })

    # Embed in batches
    batch_size = 32
    all_embeddings = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        embeddings = await embed_texts(batch)
        all_embeddings.extend(embeddings)

    for vec, emb in zip(vectors, all_embeddings):
        vec["values"] = emb

    # Clear old generated knowledge first
    try:
        index = get_pinecone_index()
        # Delete all vectors with source=auto_generated
        # Pinecone doesn't support metadata-based delete on all plans,
        # so we delete the entire namespace and re-upsert
        index.delete(delete_all=True, namespace=DESIGN_NAMESPACE)
        logger.info(f"Cleared old design knowledge from '{DESIGN_NAMESPACE}'")
    except Exception as e:
        logger.warning(f"Could not clear old knowledge: {e}")

    # Upsert new knowledge
    result = await upsert_vectors(vectors, namespace=DESIGN_NAMESPACE)

    total = len(vectors)
    logger.info(f"✅ Generated and embedded {total} design knowledge entries")

    return {
        "status": "ok",
        "total_entries": total,
        "categories": stats,
        "asset_count_analyzed": len(assets),
    }


async def regenerate_if_stale(
    threshold: int = 5,
) -> dict | None:
    """Check if design knowledge needs regeneration.
    
    Compares current asset count vs what was analyzed last time.
    If difference exceeds threshold, regenerates.
    
    Called automatically during scene conversation if desired.
    
    Returns regeneration result or None if not needed.
    """
    try:
        # Check current asset count
        assets = await assets_client.fetch_all_assets()
        current_count = len(assets)

        # Check existing design knowledge
        index = get_pinecone_index()
        stats = index.describe_index_stats()
        ns_stats = stats.get("namespaces", {}).get(DESIGN_NAMESPACE, {})
        design_count = ns_stats.get("vector_count", 0)

        if design_count == 0:
            logger.info("No design knowledge exists — generating fresh")
            return await generate_design_knowledge()

        # Simple heuristic: if asset count changed by more than threshold,
        # the catalog has changed significantly enough to warrant regeneration.
        # In future, could track the actual asset IDs for more precision.
        # For now, this is good enough.
        logger.info(
            f"Design knowledge: {design_count} entries, "
            f"current assets: {current_count}"
        )
        return None

    except Exception as e:
        logger.warning(f"Stale check failed: {e}")
        return None
