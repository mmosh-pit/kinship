"""
SQLAlchemy ORM model for wallet-based game progress persistence.

Table: wallet_game_progress
  - Keyed on (game_id, wallet_user_id, scene_id)
  - Auto-created by init_db() on server startup — no migration needed.

Different from the existing player_game_progress table which uses
UUID player_id foreign keys. This table uses wallet_user_id (string)
to match the wallet leaderboard system.
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlalchemy import Index, Integer, String, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class WalletGameProgress(Base):
    """
    Per-player, per-scene checkpoint for wallet-identified players.

    Stores everything needed to resume a game session exactly where
    the player left off:
      - completed_challenge_ids  (ordered list)
      - challenge_scores         (per-challenge point breakdown)
      - last_challenge_index     (0-based index of the NEXT challenge)
      - completed_quest_ids
      - total_score / level / xp / hearts_scores
      - inventory / visited_zones / unlocked_routes
    """

    __tablename__ = "wallet_game_progress"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )

    # ── Key identifiers (same naming as wallet leaderboard tables) ──
    game_id: Mapped[str] = mapped_column(String(255), nullable=False)
    wallet_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    scene_id: Mapped[str] = mapped_column(String(255), nullable=False, default="")

    # ── Scene metadata ──────────────────────────────────────────────
    scene_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    scene_level: Mapped[int] = mapped_column(Integer, default=1)

    # ── Challenge progress ──────────────────────────────────────────
    # ["ch_1", "ch_2", ...]
    completed_challenge_ids: Mapped[list] = mapped_column(JSONB, default=list)
    # {"ch_1": 50, "ch_2": 30}
    challenge_scores: Mapped[dict] = mapped_column(JSONB, default=dict)
    # 0-based index of the NEXT challenge to activate
    last_challenge_index: Mapped[int] = mapped_column(Integer, default=0)

    # ── Quest progress ──────────────────────────────────────────────
    completed_quest_ids: Mapped[list] = mapped_column(JSONB, default=list)

    # ── Aggregated scores ───────────────────────────────────────────
    total_score: Mapped[int] = mapped_column(Integer, default=0)
    level: Mapped[int] = mapped_column(Integer, default=1)
    xp: Mapped[int] = mapped_column(Integer, default=0)
    # {H:x, E:x, A:x, R:x, T:x, Si:x, So:x}
    hearts_scores: Mapped[dict] = mapped_column(JSONB, default=dict)

    # ── Full session state ──────────────────────────────────────────
    inventory: Mapped[dict] = mapped_column(JSONB, default=dict)
    visited_zones: Mapped[list] = mapped_column(JSONB, default=list)
    unlocked_routes: Mapped[list] = mapped_column(JSONB, default=list)
    # Arbitrary extra state (active_quests, objective_progress, etc.)
    extra_state: Mapped[dict] = mapped_column(JSONB, default=dict)

    # ── Timestamps ──────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    __table_args__ = (
        # One record per player per game per scene
        UniqueConstraint(
            "game_id", "wallet_user_id", "scene_id",
            name="uq_wallet_game_scene"
        ),
        Index("idx_wgp_game_wallet", "game_id", "wallet_user_id"),
        Index("idx_wgp_wallet", "wallet_user_id"),
        Index("idx_wgp_updated", "updated_at"),
    )