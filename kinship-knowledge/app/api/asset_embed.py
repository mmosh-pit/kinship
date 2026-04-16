"""Asset Embedding management API — sync, status, test retrieval."""

import logging
from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/embeddings", tags=["Embeddings"])


@router.post("/sync")
async def sync_embeddings(skip_design: bool = False):
    """Embed all assets + design knowledge into Pinecone.
    Does NOT regenerate Claude Vision knowledge — just embeds what's in DB.

    Args:
        skip_design: If True, skip design knowledge embedding (faster, assets only)
    """
    from app.services.asset_embeddings import embed_all_assets, embed_design_knowledge

    results = {}

    # Step 1: Embed assets (always works if Voyage + Pinecone are configured)
    try:
        asset_result = await embed_all_assets()
        results["assets"] = asset_result
    except Exception as e:
        logger.error(f"Asset embedding failed: {e}")
        results["assets"] = {"status": "error", "message": str(e)}

    # Step 2: Design knowledge (optional, can fail independently)
    if not skip_design:
        try:
            design_result = await embed_design_knowledge()
            results["design"] = design_result
        except Exception as e:
            logger.error(f"Design embedding failed: {e}")
            results["design"] = {"status": "error", "message": str(e)}
    else:
        results["design"] = {"status": "skipped"}

    return {"status": "ok", **results}


@router.post("/embed-assets-only")
async def embed_assets_only():
    """Quick: just embed assets into Pinecone. No Claude, no design, fastest option.

    Use this when:
    - Knowledge is already generated and saved in DB
    - You just need to populate/refresh Pinecone vectors
    - Full sync is timing out
    """
    from app.services.asset_embeddings import embed_all_assets

    try:
        result = await embed_all_assets()
        return {"status": "ok", **result}
    except Exception as e:
        logger.error(f"Asset embedding failed: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/status")
async def embedding_status():
    from app.services.pinecone_client import get_pinecone_index

    index = get_pinecone_index()
    stats = index.describe_index_stats()
    namespaces = {}
    for ns_name, ns_stats in (stats.get("namespaces", {}) or {}).items():
        namespaces[ns_name] = {"vectors": ns_stats.get("vector_count", 0)}
    return {
        "namespaces": namespaces,
        "total_vectors": stats.get("total_vector_count", 0),
    }


@router.get("/list")
async def list_all_embeddings(
    limit: int = 1000,
    skip_design: bool = False,
    skip_assets: bool = False,
    include_metadata: bool = True,
    include_vectors: bool = False,
    platform_id: str = None,
    category: str = None,
):
    """List embeddings from Pinecone (assets and/or design).

    Args:
        limit: Maximum number of results per namespace (1-10000, default 1000)
        skip_design: Skip design knowledge embeddings (default False)
        skip_assets: Skip asset embeddings (default False)
        include_metadata: Whether to fetch full metadata (default True)
        include_vectors: Whether to include vector values (default False)
        platform_id: Filter assets by platform_id
        category: Filter design by category

    Returns:
        {
            "assets": [...] or null if skipped,
            "design": [...] or null if skipped,
            "total_assets": int,
            "total_design": int
        }
    """
    import json as _json
    from app.services.pinecone_client import get_pinecone_index
    from app.services.asset_embeddings import ASSET_NAMESPACE, DESIGN_NAMESPACE

    limit = max(1, min(10000, limit))
    index = get_pinecone_index()

    result = {
        "assets": None,
        "design": None,
        "total_assets": 0,
        "total_design": 0,
    }

    def collect_vector_ids(namespace: str, max_count: int) -> list:
        """Collect all vector IDs from a namespace using Pinecone list()."""
        vector_ids = []
        try:
            # Pinecone SDK v6: list() returns a generator that yields pages
            # Each page is a ListResponse with .vectors (list of IDs) and .pagination
            for page in index.list(namespace=namespace):
                # page.vectors is a list of vector IDs (strings)
                if hasattr(page, "__iter__"):
                    for item in page:
                        if isinstance(item, str):
                            vector_ids.append(item)
                        elif hasattr(item, "id"):
                            vector_ids.append(item.id)

                        if len(vector_ids) >= max_count:
                            break

                if len(vector_ids) >= max_count:
                    break

        except Exception as e:
            logger.error(f"Error listing vectors from {namespace}: {e}")

        return vector_ids[:max_count]

    # ═══════════════════════════════════════════════════════════
    # ASSETS
    # ═══════════════════════════════════════════════════════════
    if not skip_assets:
        try:
            vector_ids = collect_vector_ids(ASSET_NAMESPACE, limit)
            logger.info(f"Listed {len(vector_ids)} asset vector IDs from Pinecone")

            assets = []
            if vector_ids and (include_metadata or include_vectors):
                # Fetch metadata in batches
                batch_size = 100
                for i in range(0, len(vector_ids), batch_size):
                    batch_ids = vector_ids[i : i + batch_size]
                    fetch_result = index.fetch(ids=batch_ids, namespace=ASSET_NAMESPACE)
                    vectors = fetch_result.get("vectors", {})

                    for vec_id in batch_ids:
                        if vec_id in vectors:
                            vec_data = vectors[vec_id]
                            meta = dict(vec_data.get("metadata", {}))

                            if (
                                platform_id
                                and meta.get("platform_id", "") != platform_id
                            ):
                                continue

                            asset_id = (
                                vec_id.replace("asset_", "")
                                if vec_id.startswith("asset_")
                                else vec_id
                            )

                            parsed = {}
                            for key in (
                                "sprite_sheet_json",
                                "tile_config_json",
                                "audio_config_json",
                                "tilemap_config_json",
                                "movement_json",
                            ):
                                if key in meta and isinstance(meta[key], str):
                                    try:
                                        parsed[key.replace("_json", "")] = _json.loads(
                                            meta[key]
                                        )
                                    except (_json.JSONDecodeError, TypeError):
                                        pass

                            entry = {
                                "vector_id": vec_id,
                                "asset_id": asset_id,
                                "name": meta.get("name", ""),
                                "type": meta.get("type", ""),
                                "platform_id": meta.get("platform_id", ""),
                            }

                            if include_metadata:
                                entry["metadata"] = meta
                                entry["type_configs"] = parsed

                            if include_vectors:
                                entry["values"] = vec_data.get("values", [])
                                entry["dimension"] = len(vec_data.get("values", []))

                            assets.append(entry)
            elif vector_ids:
                for vec_id in vector_ids:
                    asset_id = (
                        vec_id.replace("asset_", "")
                        if vec_id.startswith("asset_")
                        else vec_id
                    )
                    assets.append({"vector_id": vec_id, "asset_id": asset_id})

            result["assets"] = assets
            result["total_assets"] = len(assets)
        except Exception as e:
            logger.error(f"Failed to list asset embeddings: {e}")
            result["assets"] = []
            result["assets_error"] = str(e)

    # ═══════════════════════════════════════════════════════════
    # DESIGN
    # ═══════════════════════════════════════════════════════════
    if not skip_design:
        try:
            vector_ids = collect_vector_ids(DESIGN_NAMESPACE, limit)
            logger.info(f"Listed {len(vector_ids)} design vector IDs from Pinecone")

            design = []
            if vector_ids and (include_metadata or include_vectors):
                batch_size = 100
                for i in range(0, len(vector_ids), batch_size):
                    batch_ids = vector_ids[i : i + batch_size]
                    fetch_result = index.fetch(
                        ids=batch_ids, namespace=DESIGN_NAMESPACE
                    )
                    vectors = fetch_result.get("vectors", {})

                    for vec_id in batch_ids:
                        if vec_id in vectors:
                            vec_data = vectors[vec_id]
                            meta = dict(vec_data.get("metadata", {}))

                            if category and meta.get("category", "") != category:
                                continue

                            facets_str = meta.get("facets", "")
                            facets = [
                                f.strip() for f in facets_str.split(",") if f.strip()
                            ]

                            entry = {
                                "vector_id": vec_id,
                                "entry_id": meta.get("entry_id", ""),
                                "category": meta.get("category", ""),
                                "title": meta.get("title", ""),
                                "facets": facets,
                            }

                            if include_metadata:
                                entry["content"] = meta.get("content", "")
                                entry["metadata"] = meta

                            if include_vectors:
                                entry["values"] = vec_data.get("values", [])
                                entry["dimension"] = len(vec_data.get("values", []))

                            design.append(entry)
            elif vector_ids:
                for vec_id in vector_ids:
                    design.append({"vector_id": vec_id})

            result["design"] = design
            result["total_design"] = len(design)
        except Exception as e:
            logger.error(f"Failed to list design embeddings: {e}")
            result["design"] = []
            result["design_error"] = str(e)

    return result


@router.post("/test-retrieval")
async def test_retrieval(body: dict):
    from app.services.asset_embeddings import retrieve_relevant_assets

    query = body.get("query", "")
    if not query:
        return {"error": "query is required"}
    top_k = body.get("top_k", body.get("asset_top_k", 10))
    assets = await retrieve_relevant_assets(query, top_k=top_k)
    return {
        "query": query,
        "count": len(assets),
        "assets": [
            {
                "name": a.get("name", "?"),
                "type": a.get("type", "?"),
                "score": round(a.get("score", 0), 3),
                "has_sprite_sheet": bool(a.get("metadata", {}).get("sprite_sheet")),
                "has_tile_config": bool(a.get("metadata", {}).get("tile_config")),
                "has_movement": bool(a.get("metadata", {}).get("movement")),
                "has_audio_config": bool(a.get("metadata", {}).get("audio_config")),
            }
            for a in assets
        ],
    }


@router.post("/design/regenerate")
async def regenerate_design():
    from app.services.design_knowledge_generator import generate_design_knowledge

    return await generate_design_knowledge()


@router.delete("/clear-all")
async def clear_all_embeddings():
    """☢️ Delete ALL vectors from ALL namespaces. Use before full rebuild."""
    from app.services.pinecone_client import get_pinecone_index

    index = get_pinecone_index()
    stats = index.describe_index_stats()
    namespaces = list((stats.get("namespaces", {}) or {}).keys())

    deleted = {}
    for ns in namespaces:
        try:
            index.delete(delete_all=True, namespace=ns)
            deleted[ns] = "cleared"
            logger.info(f"Cleared Pinecone namespace: {ns}")
        except Exception as e:
            deleted[ns] = f"error: {e}"
            logger.error(f"Failed to clear namespace {ns}: {e}")

    # Also clear default namespace if not in list
    if "kinship" not in namespaces:
        try:
            index.delete(delete_all=True, namespace="kinship")
            deleted["kinship"] = "cleared"
        except Exception:
            pass

    return {"status": "ok", "namespaces_cleared": deleted}


@router.delete("/asset/{asset_id}")
async def delete_asset_embedding_endpoint(asset_id: str):
    """Delete embedding for a single asset from Pinecone.

    Called manually as a fallback when webhook may have failed,
    or from Studio when deleting an asset.
    """
    from app.services.asset_embeddings import delete_asset_embedding

    return await delete_asset_embedding(asset_id)


@router.get("/asset/{asset_id}")
async def get_asset_embedding(asset_id: str):
    """Fetch the Pinecone metadata for a single asset.
    Useful for verifying sprite_sheet, tile_config, movement etc. are stored."""
    import json as _json
    from app.services.pinecone_client import get_pinecone_index
    from app.services.asset_embeddings import ASSET_NAMESPACE

    index = get_pinecone_index()
    try:
        result = index.fetch(ids=[f"asset_{asset_id}"], namespace=ASSET_NAMESPACE)
        vectors = result.get("vectors", {})
        vec_id = f"asset_{asset_id}"
        if vec_id not in vectors:
            return {"error": f"No embedding found for asset {asset_id}"}

        meta = dict(vectors[vec_id].get("metadata", {}))

        # Parse JSON string fields for readable output
        parsed = {}
        for key in (
            "sprite_sheet_json",
            "tile_config_json",
            "audio_config_json",
            "tilemap_config_json",
            "movement_json",
        ):
            if key in meta and isinstance(meta[key], str):
                try:
                    parsed[key.replace("_json", "")] = _json.loads(meta[key])
                    del meta[key]  # remove raw JSON string from output
                except (_json.JSONDecodeError, TypeError):
                    pass

        return {
            "asset_id": asset_id,
            "name": meta.get("name", ""),
            "type": meta.get("type", ""),
            "metadata": meta,
            "type_configs": parsed,
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/assets/list")
async def list_asset_embeddings(
    limit: int = 100,
    cursor: str = None,
    platform_id: str = None,
    include_metadata: bool = True,
    include_vectors: bool = False,
):
    """List all asset embeddings from Pinecone.

    Args:
        limit: Maximum number of results (1-1000, default 100)
        cursor: Pagination cursor from previous response
        platform_id: Optional filter by platform_id
        include_metadata: Whether to fetch full metadata (default True)
        include_vectors: Whether to include vector values (default False - vectors are large!)

    Returns:
        {
            "embeddings": [...],
            "total": int,
            "next_cursor": str or null,
            "namespace": str
        }
    """
    import json as _json
    from app.services.pinecone_client import get_pinecone_index
    from app.services.asset_embeddings import ASSET_NAMESPACE

    # Clamp limit
    limit = max(1, min(1000, limit))

    index = get_pinecone_index()

    try:
        # List vector IDs with pagination
        list_kwargs = {
            "namespace": ASSET_NAMESPACE,
            "limit": limit,
        }
        if cursor:
            list_kwargs["pagination_token"] = cursor

        # Pinecone list() returns an iterator, we need to handle it properly
        list_response = index.list(**list_kwargs)

        # Extract vector IDs from the response
        vector_ids = []
        next_cursor = None

        # Handle different response formats from Pinecone SDK
        if hasattr(list_response, "vectors"):
            # Newer SDK format
            vector_ids = [
                v.id if hasattr(v, "id") else v for v in list_response.vectors
            ]
            next_cursor = (
                getattr(list_response, "pagination", {}).get("next")
                if hasattr(list_response, "pagination")
                else None
            )
        elif hasattr(list_response, "__iter__"):
            # Iterator format - collect IDs
            for page in list_response:
                if hasattr(page, "vectors"):
                    vector_ids.extend(
                        [v.id if hasattr(v, "id") else v for v in page.vectors]
                    )
                elif isinstance(page, list):
                    vector_ids.extend(page)
                elif isinstance(page, str):
                    vector_ids.append(page)
                # Get pagination token if available
                if hasattr(page, "pagination"):
                    next_cursor = page.pagination.get("next")
                # Only process up to limit
                if len(vector_ids) >= limit:
                    vector_ids = vector_ids[:limit]
                    break

        if not vector_ids:
            return {
                "embeddings": [],
                "total": 0,
                "next_cursor": None,
                "namespace": ASSET_NAMESPACE,
            }

        embeddings = []

        if (include_metadata or include_vectors) and vector_ids:
            # Fetch full data in batches (Pinecone allows up to 1000 IDs per fetch)
            batch_size = 100
            for i in range(0, len(vector_ids), batch_size):
                batch_ids = vector_ids[i : i + batch_size]
                fetch_result = index.fetch(ids=batch_ids, namespace=ASSET_NAMESPACE)
                vectors = fetch_result.get("vectors", {})

                for vec_id in batch_ids:
                    if vec_id in vectors:
                        vec_data = vectors[vec_id]
                        meta = dict(vec_data.get("metadata", {}))

                        # Filter by platform_id if specified
                        if platform_id and meta.get("platform_id", "") != platform_id:
                            continue

                        # Extract asset_id from vector ID (format: "asset_{asset_id}")
                        asset_id = (
                            vec_id.replace("asset_", "")
                            if vec_id.startswith("asset_")
                            else vec_id
                        )

                        # Parse JSON string fields
                        parsed = {}
                        for key in (
                            "sprite_sheet_json",
                            "tile_config_json",
                            "audio_config_json",
                            "tilemap_config_json",
                            "movement_json",
                        ):
                            if key in meta and isinstance(meta[key], str):
                                try:
                                    parsed[key.replace("_json", "")] = _json.loads(
                                        meta[key]
                                    )
                                except (_json.JSONDecodeError, TypeError):
                                    pass

                        embedding_entry = {
                            "vector_id": vec_id,
                            "asset_id": asset_id,
                            "name": meta.get("name", ""),
                            "type": meta.get("type", ""),
                            "platform_id": meta.get("platform_id", ""),
                            "tags": meta.get("tags", []),
                            "has_sprite_sheet": bool(parsed.get("sprite_sheet")),
                            "has_tile_config": bool(parsed.get("tile_config")),
                            "has_movement": bool(parsed.get("movement")),
                            "has_audio_config": bool(parsed.get("audio_config")),
                        }

                        if include_metadata:
                            embedding_entry["metadata"] = meta
                            embedding_entry["type_configs"] = parsed

                        if include_vectors:
                            # Include the actual vector values
                            embedding_entry["values"] = vec_data.get("values", [])
                            embedding_entry["dimension"] = len(
                                vec_data.get("values", [])
                            )

                        embeddings.append(embedding_entry)
        else:
            # Just return IDs without metadata
            for vec_id in vector_ids:
                asset_id = (
                    vec_id.replace("asset_", "")
                    if vec_id.startswith("asset_")
                    else vec_id
                )
                embeddings.append(
                    {
                        "vector_id": vec_id,
                        "asset_id": asset_id,
                    }
                )

        return {
            "embeddings": embeddings,
            "total": len(embeddings),
            "next_cursor": next_cursor,
            "namespace": ASSET_NAMESPACE,
        }

    except Exception as e:
        logger.error(f"Failed to list embeddings: {e}")
        return {"error": str(e), "embeddings": [], "total": 0}


@router.get("/design/list")
async def list_design_embeddings(
    limit: int = 100,
    cursor: str = None,
    category: str = None,
    include_content: bool = True,
    include_vectors: bool = False,
):
    """List all design knowledge embeddings from Pinecone.

    Args:
        limit: Maximum number of results (1-1000, default 100)
        cursor: Pagination cursor from previous response
        category: Optional filter by category (scene_template, composition, npc_archetype, etc.)
        include_content: Whether to fetch full content (default True)
        include_vectors: Whether to include vector values (default False - vectors are large!)

    Returns:
        {
            "embeddings": [...],
            "total": int,
            "next_cursor": str or null,
            "namespace": str
        }
    """
    from app.services.pinecone_client import get_pinecone_index
    from app.services.asset_embeddings import DESIGN_NAMESPACE

    # Clamp limit
    limit = max(1, min(1000, limit))

    index = get_pinecone_index()

    try:
        # List vector IDs with pagination
        list_kwargs = {
            "namespace": DESIGN_NAMESPACE,
            "limit": limit,
        }
        if cursor:
            list_kwargs["pagination_token"] = cursor

        list_response = index.list(**list_kwargs)

        # Extract vector IDs from the response
        vector_ids = []
        next_cursor = None

        # Handle different response formats from Pinecone SDK
        if hasattr(list_response, "vectors"):
            vector_ids = [
                v.id if hasattr(v, "id") else v for v in list_response.vectors
            ]
            next_cursor = (
                getattr(list_response, "pagination", {}).get("next")
                if hasattr(list_response, "pagination")
                else None
            )
        elif hasattr(list_response, "__iter__"):
            for page in list_response:
                if hasattr(page, "vectors"):
                    vector_ids.extend(
                        [v.id if hasattr(v, "id") else v for v in page.vectors]
                    )
                elif isinstance(page, list):
                    vector_ids.extend(page)
                elif isinstance(page, str):
                    vector_ids.append(page)
                if hasattr(page, "pagination"):
                    next_cursor = page.pagination.get("next")
                if len(vector_ids) >= limit:
                    vector_ids = vector_ids[:limit]
                    break

        if not vector_ids:
            return {
                "embeddings": [],
                "total": 0,
                "next_cursor": None,
                "namespace": DESIGN_NAMESPACE,
            }

        embeddings = []

        if (include_content or include_vectors) and vector_ids:
            # Fetch full data in batches
            batch_size = 100
            for i in range(0, len(vector_ids), batch_size):
                batch_ids = vector_ids[i : i + batch_size]
                fetch_result = index.fetch(ids=batch_ids, namespace=DESIGN_NAMESPACE)
                vectors = fetch_result.get("vectors", {})

                for vec_id in batch_ids:
                    if vec_id in vectors:
                        vec_data = vectors[vec_id]
                        meta = dict(vec_data.get("metadata", {}))

                        # Filter by category if specified
                        if category and meta.get("category", "") != category:
                            continue

                        # Parse facets string to list
                        facets_str = meta.get("facets", "")
                        facets = [f.strip() for f in facets_str.split(",") if f.strip()]

                        embedding_entry = {
                            "vector_id": vec_id,
                            "entry_id": meta.get("entry_id", ""),
                            "category": meta.get("category", ""),
                            "title": meta.get("title", ""),
                            "facets": facets,
                        }

                        if include_content:
                            embedding_entry["content"] = meta.get("content", "")
                            embedding_entry["metadata"] = meta

                        if include_vectors:
                            embedding_entry["values"] = vec_data.get("values", [])
                            embedding_entry["dimension"] = len(
                                vec_data.get("values", [])
                            )

                        embeddings.append(embedding_entry)
        else:
            # Just return IDs without content
            for vec_id in vector_ids:
                embeddings.append(
                    {
                        "vector_id": vec_id,
                    }
                )

        return {
            "embeddings": embeddings,
            "total": len(embeddings),
            "next_cursor": next_cursor,
            "namespace": DESIGN_NAMESPACE,
        }

    except Exception as e:
        logger.error(f"Failed to list design embeddings: {e}")
        return {"error": str(e), "embeddings": [], "total": 0}


@router.post("/rebuild-all")
async def rebuild_all(skip_design: bool = False):
    """Full rebuild from scratch:
    1. Clear all Pinecone vectors
    2. Generate asset knowledge (Claude Vision for each asset)
    3. Embed all assets with knowledge into Pinecone
    4. Generate design knowledge patterns (unless skip_design=True)
    5. Embed design patterns into Pinecone (unless skip_design=True)

    Takes ~2 minutes for 63 assets, costs ~$1.26

    Args:
        skip_design: If True, skip steps 4-5 (design knowledge generation)
    """
    results = {}

    # Step 1: Clear Pinecone
    logger.info("Step 1/5: Clearing Pinecone...")
    from app.services.pinecone_client import get_pinecone_index

    index = get_pinecone_index()
    stats = index.describe_index_stats()
    for ns in list((stats.get("namespaces", {}) or {}).keys()):
        try:
            index.delete(delete_all=True, namespace=ns)
        except Exception:
            pass
    results["step1_clear"] = "done"
    logger.info("Step 1/5: ✅ Pinecone cleared")

    # Step 2: Generate knowledge for all assets (Claude Vision)
    logger.info("Step 2/5: Generating asset knowledge...")
    from app.services.knowledge_generator import generate_knowledge_for_all

    knowledge_result = await generate_knowledge_for_all(skip_existing=False)
    results["step2_knowledge"] = knowledge_result
    logger.info(
        f"Step 2/5: ✅ Knowledge generated ({knowledge_result.get('generated', 0)} assets)"
    )

    # Step 3: Embed all assets
    logger.info("Step 3/5: Embedding assets...")
    from app.services.asset_embeddings import embed_all_assets

    asset_embed_result = await embed_all_assets()
    results["step3_asset_embed"] = asset_embed_result
    logger.info(
        f"Step 3/5: ✅ Assets embedded ({asset_embed_result.get('total', 0)} vectors)"
    )

    # Step 4: Generate design knowledge patterns (optional)
    if not skip_design:
        logger.info("Step 4/5: Generating design patterns...")
        from app.services.design_knowledge_generator import generate_design_knowledge

        try:
            design_result = await generate_design_knowledge()
            results["step4_design"] = design_result
            logger.info("Step 4/5: ✅ Design patterns generated")
        except Exception as e:
            results["step4_design"] = {"status": "error", "message": str(e)}
            logger.warning(f"Step 4/5: ⚠️ Design generation failed: {e}")
    else:
        results["step4_design"] = {"status": "skipped"}
        logger.info("Step 4/5: ⏭️ Design patterns skipped")

    # Step 5: Verify
    logger.info("Step 5/5: Verifying...")
    stats = index.describe_index_stats()
    namespaces = {}
    for ns_name, ns_stats in (stats.get("namespaces", {}) or {}).items():
        namespaces[ns_name] = ns_stats.get("vector_count", 0)
    results["step5_verify"] = {
        "total_vectors": stats.get("total_vector_count", 0),
        "namespaces": namespaces,
    }
    logger.info(f"Step 5/5: ✅ Total vectors: {stats.get('total_vector_count', 0)}")

    return {"status": "ok", "results": results}
