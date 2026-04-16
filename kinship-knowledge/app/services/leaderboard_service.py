"""
Kinship Leaderboard Service

Business logic for leaderboard management, score updates, and rankings.
"""

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy import select, func, desc, asc, and_
from sqlalchemy.orm import Session

from app.db.leaderboard_models import LeaderboardConfig, LeaderboardConfigCreate, LeaderboardConfigUpdate, LeaderboardEntry, LeaderboardEntryResponse, LeaderboardPeriod, LeaderboardResponse, LeaderboardSnapshot, LeaderboardType, PlayerLeaderboardSummary, ScoreSubmission, ScoreUpdateResponse

# from .leaderboard_models import (
#     LeaderboardConfig,
#     LeaderboardEntry,
#     LeaderboardSnapshot,
#     LeaderboardType,
#     LeaderboardPeriod,
#     LeaderboardConfigCreate,
#     LeaderboardConfigUpdate,
#     LeaderboardEntryResponse,
#     LeaderboardResponse,
#     ScoreSubmission,
#     ScoreUpdateResponse,
#     PlayerLeaderboardSummary,
# )


# ═══════════════════════════════════════════════════════════════════
#  Leaderboard Service
# ═══════════════════════════════════════════════════════════════════


class LeaderboardService:
    """Service for managing leaderboards and scores"""

    def __init__(self, db: Session):
        self.db = db

    # ─── Leaderboard CRUD ──────────────────────────────────────────

    def create_leaderboard(
        self, game_id: str, config: LeaderboardConfigCreate
    ) -> LeaderboardConfig:
        """Create a new leaderboard for a game"""
        leaderboard = LeaderboardConfig(game_id=game_id, **config.model_dump())
        self.db.add(leaderboard)
        self.db.commit()
        self.db.refresh(leaderboard)
        return leaderboard

    def get_leaderboard(self, leaderboard_id: str) -> Optional[LeaderboardConfig]:
        """Get a leaderboard by ID"""
        return (
            self.db.query(LeaderboardConfig)
            .filter(LeaderboardConfig.id == leaderboard_id)
            .first()
        )

    def get_game_leaderboards(
        self, game_id: str, include_disabled: bool = False
    ) -> List[LeaderboardConfig]:
        """Get all leaderboards for a game"""
        query = self.db.query(LeaderboardConfig).filter(
            LeaderboardConfig.game_id == game_id
        )
        if not include_disabled:
            query = query.filter(LeaderboardConfig.is_enabled == True)
        return query.order_by(LeaderboardConfig.created_at).all()

    def update_leaderboard(
        self, leaderboard_id: str, updates: LeaderboardConfigUpdate
    ) -> Optional[LeaderboardConfig]:
        """Update leaderboard configuration"""
        leaderboard = self.get_leaderboard(leaderboard_id)
        if not leaderboard:
            return None

        update_data = updates.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(leaderboard, key, value)

        self.db.commit()
        self.db.refresh(leaderboard)
        return leaderboard

    def delete_leaderboard(self, leaderboard_id: str) -> bool:
        """Delete a leaderboard"""
        leaderboard = self.get_leaderboard(leaderboard_id)
        if not leaderboard:
            return False

        self.db.delete(leaderboard)
        self.db.commit()
        return True

    # ─── Score Management ──────────────────────────────────────────

    def submit_score(
        self, leaderboard_id: str, submission: ScoreSubmission
    ) -> Optional[ScoreUpdateResponse]:
        """Submit or update a player's score"""
        leaderboard = self.get_leaderboard(leaderboard_id)
        if not leaderboard or not leaderboard.is_enabled:
            return None

        # Get or create entry
        entry = (
            self.db.query(LeaderboardEntry)
            .filter(
                and_(
                    LeaderboardEntry.leaderboard_id == leaderboard_id,
                    LeaderboardEntry.player_id == submission.player_id,
                )
            )
            .first()
        )

        previous_score = 0.0
        previous_rank = None

        if entry:
            previous_score = entry.score_all_time
            previous_rank = self._get_player_rank(
                leaderboard_id, submission.player_id, LeaderboardPeriod.ALL_TIME
            )
        else:
            entry = LeaderboardEntry(
                leaderboard_id=leaderboard_id,
                player_id=submission.player_id,
                player_name=submission.player_name,
            )
            self.db.add(entry)

        # Update player name if provided
        if submission.player_name:
            entry.player_name = submission.player_name

        # Update scores based on leaderboard type
        new_score = submission.score

        # Update all-time score
        if leaderboard.sort_ascending:
            # Lower is better (e.g., time)
            if entry.score_all_time == 0 or new_score < entry.score_all_time:
                entry.score_all_time = new_score
        else:
            # Higher is better (default)
            entry.score_all_time = max(entry.score_all_time, new_score)

        # Update period scores
        now = datetime.utcnow()
        entry.score_daily = self._update_period_score(
            entry.score_daily,
            new_score,
            entry.daily_reset_at,
            self._get_daily_reset(),
            leaderboard.sort_ascending,
        )
        entry.daily_reset_at = self._get_daily_reset()

        entry.score_weekly = self._update_period_score(
            entry.score_weekly,
            new_score,
            entry.weekly_reset_at,
            self._get_weekly_reset(),
            leaderboard.sort_ascending,
        )
        entry.weekly_reset_at = self._get_weekly_reset()

        entry.score_monthly = self._update_period_score(
            entry.score_monthly,
            new_score,
            entry.monthly_reset_at,
            self._get_monthly_reset(),
            leaderboard.sort_ascending,
        )
        entry.monthly_reset_at = self._get_monthly_reset()

        # Update stats
        entry.games_played += 1
        entry.last_score = new_score
        entry.last_played_at = now

        if leaderboard.sort_ascending:
            if entry.best_score == 0 or new_score < entry.best_score:
                entry.best_score = new_score
        else:
            entry.best_score = max(entry.best_score, new_score)

        # Store extra data
        if submission.extra_data:
            entry.extra_data = submission.extra_data

        self.db.commit()
        self.db.refresh(entry)

        # Get new rank
        new_rank = self._get_player_rank(
            leaderboard_id, submission.player_id, LeaderboardPeriod.ALL_TIME
        )

        return ScoreUpdateResponse(
            leaderboard_id=leaderboard_id,
            player_id=submission.player_id,
            new_score=entry.score_all_time,
            previous_score=previous_score,
            new_rank=new_rank,
            previous_rank=previous_rank,
            is_personal_best=entry.score_all_time == entry.best_score,
            rank_change=(previous_rank - new_rank) if previous_rank else 0,
        )

    def increment_score(
        self,
        leaderboard_id: str,
        player_id: str,
        amount: float,
        player_name: Optional[str] = None,
    ) -> Optional[ScoreUpdateResponse]:
        """Increment a player's score by an amount"""
        entry = (
            self.db.query(LeaderboardEntry)
            .filter(
                and_(
                    LeaderboardEntry.leaderboard_id == leaderboard_id,
                    LeaderboardEntry.player_id == player_id,
                )
            )
            .first()
        )

        current_score = entry.score_all_time if entry else 0
        new_score = current_score + amount

        return self.submit_score(
            leaderboard_id,
            ScoreSubmission(
                player_id=player_id, player_name=player_name, score=new_score
            ),
        )

    # ─── Leaderboard Retrieval ─────────────────────────────────────

    def get_leaderboard_entries(
        self,
        leaderboard_id: str,
        period: LeaderboardPeriod = LeaderboardPeriod.ALL_TIME,
        limit: int = 100,
        offset: int = 0,
        player_id: Optional[str] = None,
    ) -> Optional[LeaderboardResponse]:
        """Get leaderboard entries with rankings"""
        leaderboard = self.get_leaderboard(leaderboard_id)
        if not leaderboard:
            return None

        # Get score column based on period
        score_column = self._get_score_column(period)

        # Build query
        order = asc(score_column) if leaderboard.sort_ascending else desc(score_column)

        query = (
            self.db.query(LeaderboardEntry)
            .filter(LeaderboardEntry.leaderboard_id == leaderboard_id)
            .order_by(order)
        )

        total_players = query.count()
        entries = query.offset(offset).limit(limit).all()

        # Build response entries with ranks
        response_entries = []
        for idx, entry in enumerate(entries):
            rank = offset + idx + 1
            score = getattr(entry, score_column.key)

            response_entries.append(
                LeaderboardEntryResponse(
                    rank=rank,
                    player_id=entry.player_id,
                    player_name=entry.player_name,
                    player_avatar_url=entry.player_avatar_url,
                    score=round(score, leaderboard.score_precision),
                    games_played=entry.games_played,
                    best_score=round(entry.best_score, leaderboard.score_precision),
                    last_played_at=entry.last_played_at,
                    extra_data=entry.extra_data,
                )
            )

        # Get requesting player's entry if specified
        player_entry = None
        if player_id:
            player_entry = self._get_player_entry_response(
                leaderboard_id, player_id, period, leaderboard
            )

        return LeaderboardResponse(
            leaderboard_id=leaderboard_id,
            name=leaderboard.name,
            leaderboard_type=leaderboard.leaderboard_type,
            period=period,
            total_players=total_players,
            entries=response_entries,
            last_updated=datetime.utcnow(),
            player_entry=player_entry,
        )

    def get_player_rank(
        self,
        leaderboard_id: str,
        player_id: str,
        period: LeaderboardPeriod = LeaderboardPeriod.ALL_TIME,
    ) -> Optional[int]:
        """Get a player's rank on a leaderboard"""
        return self._get_player_rank(leaderboard_id, player_id, period)

    def get_player_summary(
        self, game_id: str, player_id: str
    ) -> PlayerLeaderboardSummary:
        """Get a player's summary across all leaderboards in a game"""
        leaderboards = self.get_game_leaderboards(game_id)

        summary_boards = []
        total_points = 0
        best_rank = float("inf")

        for lb in leaderboards:
            entry = (
                self.db.query(LeaderboardEntry)
                .filter(
                    and_(
                        LeaderboardEntry.leaderboard_id == lb.id,
                        LeaderboardEntry.player_id == player_id,
                    )
                )
                .first()
            )

            if entry:
                rank = self._get_player_rank(
                    lb.id, player_id, LeaderboardPeriod.ALL_TIME
                )
                summary_boards.append(
                    {
                        "leaderboard_id": lb.id,
                        "name": lb.name,
                        "rank": rank,
                        "score": entry.score_all_time,
                        "period": "all_time",
                    }
                )
                total_points += entry.score_all_time
                if rank and rank < best_rank:
                    best_rank = rank

        return PlayerLeaderboardSummary(
            player_id=player_id,
            player_name=None,  # Would need to fetch from player table
            leaderboards=summary_boards,
            total_points=total_points,
            best_rank=best_rank if best_rank != float("inf") else 0,
            total_leaderboards=len(summary_boards),
        )

    def get_nearby_entries(
        self,
        leaderboard_id: str,
        player_id: str,
        period: LeaderboardPeriod = LeaderboardPeriod.ALL_TIME,
        above: int = 2,
        below: int = 2,
    ) -> List[LeaderboardEntryResponse]:
        """Get entries around a player's rank"""
        leaderboard = self.get_leaderboard(leaderboard_id)
        if not leaderboard:
            return []

        rank = self._get_player_rank(leaderboard_id, player_id, period)
        if not rank:
            return []

        # Calculate offset
        start_rank = max(1, rank - above)
        limit = above + below + 1
        offset = start_rank - 1

        result = self.get_leaderboard_entries(
            leaderboard_id, period, limit=limit, offset=offset
        )

        return result.entries if result else []

    # ─── Period Management ─────────────────────────────────────────

    def reset_period_scores(
        self, period: LeaderboardPeriod, game_id: Optional[str] = None
    ) -> int:
        """Reset scores for a period across leaderboards"""
        query = self.db.query(LeaderboardEntry)

        if game_id:
            query = query.join(LeaderboardConfig).filter(
                LeaderboardConfig.game_id == game_id
            )

        score_column = self._get_score_column(period)
        count = query.update({score_column: 0})
        self.db.commit()

        return count

    def create_snapshot(
        self, leaderboard_id: str, period: LeaderboardPeriod, top_n: int = 100
    ) -> LeaderboardSnapshot:
        """Create a snapshot of current standings"""
        result = self.get_leaderboard_entries(leaderboard_id, period, limit=top_n)

        snapshot = LeaderboardSnapshot(
            leaderboard_id=leaderboard_id,
            period=period,
            snapshot_date=datetime.utcnow(),
            top_entries=[e.model_dump() for e in result.entries] if result else [],
            total_players=result.total_players if result else 0,
        )

        self.db.add(snapshot)
        self.db.commit()
        self.db.refresh(snapshot)

        return snapshot

    # ─── Utility Methods ───────────────────────────────────────────

    def _get_score_column(self, period: LeaderboardPeriod):
        """Get the appropriate score column for a period"""
        columns = {
            LeaderboardPeriod.ALL_TIME: LeaderboardEntry.score_all_time,
            LeaderboardPeriod.DAILY: LeaderboardEntry.score_daily,
            LeaderboardPeriod.WEEKLY: LeaderboardEntry.score_weekly,
            LeaderboardPeriod.MONTHLY: LeaderboardEntry.score_monthly,
        }
        return columns.get(period, LeaderboardEntry.score_all_time)

    def _get_player_rank(
        self, leaderboard_id: str, player_id: str, period: LeaderboardPeriod
    ) -> Optional[int]:
        """Calculate a player's rank"""
        leaderboard = self.get_leaderboard(leaderboard_id)
        if not leaderboard:
            return None

        entry = (
            self.db.query(LeaderboardEntry)
            .filter(
                and_(
                    LeaderboardEntry.leaderboard_id == leaderboard_id,
                    LeaderboardEntry.player_id == player_id,
                )
            )
            .first()
        )

        if not entry:
            return None

        score_column = self._get_score_column(period)
        player_score = getattr(entry, score_column.key)

        # Count players with better scores
        if leaderboard.sort_ascending:
            # Lower is better
            better_count = (
                self.db.query(LeaderboardEntry)
                .filter(
                    and_(
                        LeaderboardEntry.leaderboard_id == leaderboard_id,
                        score_column < player_score,
                    )
                )
                .count()
            )
        else:
            # Higher is better
            better_count = (
                self.db.query(LeaderboardEntry)
                .filter(
                    and_(
                        LeaderboardEntry.leaderboard_id == leaderboard_id,
                        score_column > player_score,
                    )
                )
                .count()
            )

        return better_count + 1

    def _get_player_entry_response(
        self,
        leaderboard_id: str,
        player_id: str,
        period: LeaderboardPeriod,
        leaderboard: LeaderboardConfig,
    ) -> Optional[LeaderboardEntryResponse]:
        """Get a player's entry as a response object"""
        entry = (
            self.db.query(LeaderboardEntry)
            .filter(
                and_(
                    LeaderboardEntry.leaderboard_id == leaderboard_id,
                    LeaderboardEntry.player_id == player_id,
                )
            )
            .first()
        )

        if not entry:
            return None

        rank = self._get_player_rank(leaderboard_id, player_id, period)
        score_column = self._get_score_column(period)
        score = getattr(entry, score_column.key)

        return LeaderboardEntryResponse(
            rank=rank or 0,
            player_id=entry.player_id,
            player_name=entry.player_name,
            player_avatar_url=entry.player_avatar_url,
            score=round(score, leaderboard.score_precision),
            games_played=entry.games_played,
            best_score=round(entry.best_score, leaderboard.score_precision),
            last_played_at=entry.last_played_at,
            extra_data=entry.extra_data,
        )

    def _update_period_score(
        self,
        current_score: float,
        new_score: float,
        last_reset: Optional[datetime],
        period_reset: datetime,
        sort_ascending: bool,
    ) -> float:
        """Update a period score, resetting if period has changed"""
        # Reset if period has changed
        if last_reset is None or last_reset < period_reset:
            return new_score

        # Update based on sort order
        if sort_ascending:
            return min(current_score, new_score) if current_score > 0 else new_score
        else:
            return max(current_score, new_score)

    def _get_daily_reset(self) -> datetime:
        """Get the start of the current day (UTC)"""
        now = datetime.utcnow()
        return now.replace(hour=0, minute=0, second=0, microsecond=0)

    def _get_weekly_reset(self) -> datetime:
        """Get the start of the current week (Monday, UTC)"""
        now = datetime.utcnow()
        days_since_monday = now.weekday()
        monday = now - timedelta(days=days_since_monday)
        return monday.replace(hour=0, minute=0, second=0, microsecond=0)

    def _get_monthly_reset(self) -> datetime:
        """Get the start of the current month (UTC)"""
        now = datetime.utcnow()
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


# ═══════════════════════════════════════════════════════════════════
#  Default Leaderboard Templates
# ═══════════════════════════════════════════════════════════════════


def create_default_leaderboards(db: Session, game_id: str) -> List[LeaderboardConfig]:
    """Create a standard set of leaderboards for a new game"""
    service = LeaderboardService(db)

    defaults = [
        LeaderboardConfigCreate(
            name="Top Scores",
            description="Players with the highest total scores",
            leaderboard_type=LeaderboardType.TOTAL_SCORE,
            enable_all_time=True,
            enable_weekly=True,
            enable_monthly=True,
        ),
        LeaderboardConfigCreate(
            name="Challenge Masters",
            description="Most challenges completed",
            leaderboard_type=LeaderboardType.CHALLENGES_COMPLETED,
            enable_all_time=True,
            enable_weekly=True,
        ),
        LeaderboardConfigCreate(
            name="Quest Champions",
            description="Most quests completed",
            leaderboard_type=LeaderboardType.QUESTS_COMPLETED,
            enable_all_time=True,
        ),
        LeaderboardConfigCreate(
            name="Collectors",
            description="Most collectibles found",
            leaderboard_type=LeaderboardType.COLLECTIBLES_FOUND,
            enable_all_time=True,
        ),
    ]

    leaderboards = []
    for config in defaults:
        lb = service.create_leaderboard(game_id, config)
        leaderboards.append(lb)

    return leaderboards
