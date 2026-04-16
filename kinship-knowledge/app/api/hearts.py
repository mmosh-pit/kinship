"""HEARTS REST API — facets + rubric management."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete as sa_delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.api import crud
from app.db.database import get_db
from app.db.models import HeartsFacet, HeartsRubric, PlayerProfile
from app.schemas.hearts import (
    HeartsFacetResponse, HeartsFacetUpdate, HeartsRubricBulkUpdate, HeartsRubricResponse,
)

router = APIRouter(prefix="/api/hearts", tags=["HEARTS"])

# ── Stats ──

@router.get("/stats")
async def get_hearts_stats(db: AsyncSession = Depends(get_db)):
    """Get aggregate HEARTS statistics across all players."""
    result = await db.execute(select(PlayerProfile))
    players = result.scalars().all()
    
    if not players:
        return {
            "total_players": 0,
            "averages": {"H": 50, "E": 50, "A": 50, "R": 50, "T": 50, "Si": 50, "So": 50},
            "distributions": {}
        }
    
    # Calculate averages
    facet_keys = ["H", "E", "A", "R", "T", "Si", "So"]
    totals = {k: 0.0 for k in facet_keys}
    
    for player in players:
        scores = player.hearts_scores or {}
        for k in facet_keys:
            totals[k] += scores.get(k, 50)
    
    count = len(players)
    averages = {k: round(totals[k] / count, 1) for k in facet_keys}
    
    # Calculate distributions (buckets: 0-20, 21-40, 41-60, 61-80, 81-100)
    distributions = {k: [0, 0, 0, 0, 0] for k in facet_keys}
    for player in players:
        scores = player.hearts_scores or {}
        for k in facet_keys:
            score = scores.get(k, 50)
            bucket = min(int(score // 20), 4)
            distributions[k][bucket] += 1
    
    return {
        "total_players": count,
        "averages": averages,
        "distributions": distributions
    }

# ── Facets ──

@router.get("/facets", response_model=list[HeartsFacetResponse])
async def list_facets(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(HeartsFacet))
    return result.scalars().all()

@router.get("/facets/{key}", response_model=HeartsFacetResponse)
async def get_facet(key: str, db: AsyncSession = Depends(get_db)):
    item = await crud.get_by_key(db, HeartsFacet, key)
    if not item: raise HTTPException(404, "Facet not found")
    return item

@router.put("/facets/{key}", response_model=HeartsFacetResponse)
async def update_facet(key: str, body: HeartsFacetUpdate, db: AsyncSession = Depends(get_db)):
    item = await crud.get_by_key(db, HeartsFacet, key)
    if not item: raise HTTPException(404, "Facet not found")
    return await crud.update(db, item, body.model_dump(exclude_unset=True))

# ── Rubric ──

@router.get("/rubric", response_model=list[HeartsRubricResponse])
async def list_rubric(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(HeartsRubric))
    return result.scalars().all()

@router.put("/rubric", response_model=list[HeartsRubricResponse])
async def bulk_update_rubric(body: HeartsRubricBulkUpdate, db: AsyncSession = Depends(get_db)):
    """Replace all rubric entries with the provided set."""
    await db.execute(sa_delete(HeartsRubric))

    entries = []
    for entry in body.entries:
        rubric = HeartsRubric(**entry.model_dump())
        db.add(rubric)
        entries.append(rubric)

    await db.flush()
    for e in entries:
        await db.refresh(e)
    return entries

# ── Seed ──

@router.post("/seed", response_model=dict)
async def seed_hearts_data(db: AsyncSession = Depends(get_db)):
    """Seed default HEARTS facets and sample rubric entries."""
    from app.db.seed import FACETS, SAMPLE_RUBRIC
    
    # Check if already seeded
    result = await db.execute(select(HeartsFacet))
    existing = result.scalars().all()
    
    if existing:
        return {"message": "HEARTS data already exists", "facets": len(existing)}
    
    # Seed facets
    for f in FACETS:
        db.add(HeartsFacet(**f))
    await db.flush()
    
    # Seed rubric
    for r in SAMPLE_RUBRIC:
        db.add(HeartsRubric(**r))
    await db.flush()
    
    return {"message": "HEARTS data seeded successfully", "facets": len(FACETS), "rubric_entries": len(SAMPLE_RUBRIC)}
