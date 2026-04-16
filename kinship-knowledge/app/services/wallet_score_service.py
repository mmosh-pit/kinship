"""
Kinship Wallet Score & Leaderboard Service

Business logic for wallet-based scoring and leaderboards.
SIMPLIFIED - uses raw SQL for all queries to match existing DB schema.
"""

from datetime import datetime, timedelta
from typing import Optional, List, Tuple, Dict, Any
from uuid import uuid4
import logging
import json
from sqlalchemy import select, desc, func, and_, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.wallet_score_models import (
    TimePeriod,
    ScoreboardType,
    WalletScoreSubmit,
    ScoreSubmitResponse,
    LeaderboardEntryResponse,
    LeaderboardResponse,
    ScoreboardResponse,
    PlayerRankResponse,
    NearbyPlayersResponse,
)


logger = logging.getLogger(__name__)


class WalletScoreService:
    """
    Service for managing wallet-based scores and leaderboards.
    Uses raw SQL to match existing DB schema exactly.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # ═══════════════════════════════════════════════════════════════════
    #  Player Management (using raw SQL)
    # ═══════════════════════════════════════════════════════════════════

    async def get_or_create_player(
        self,
        wallet_user_id: str,
        wallet_username: str,
    ) -> Dict[str, Any]:
        """Get existing player or create new one using raw SQL."""
        wallet_user_id = wallet_user_id.strip()
        now = datetime.utcnow()

        # Try to find existing player using raw SQL
        result = await self.db.execute(
            text(
                """
                SELECT id, wallet_address, wallet_username, avatar_url,
                       total_games_played, total_score, created_at, updated_at
                FROM wallet_players 
                WHERE wallet_address = :wallet_address
            """
            ),
            {"wallet_address": wallet_user_id},
        )
        row = result.fetchone()

        if row:
            player = {
                "id": row[0],
                "wallet_address": row[1],
                "wallet_username": row[2],
                "avatar_url": row[3],
                "total_games_played": row[4] or 0,
                "total_score": row[5] or 0,
                "created_at": row[6],
                "updated_at": row[7],
            }
            # Update username if different
            if wallet_username and player["wallet_username"] != wallet_username:
                await self.db.execute(
                    text(
                        """
                        UPDATE wallet_players 
                        SET wallet_username = :username, updated_at = :updated_at
                        WHERE wallet_address = :wallet_address
                    """
                    ),
                    {
                        "username": wallet_username,
                        "updated_at": now,
                        "wallet_address": wallet_user_id,
                    },
                )
                player["wallet_username"] = wallet_username
            return player

        # Create new player
        player_id = str(uuid4())
        display_name = wallet_username or self._generate_default_username(
            wallet_user_id
        )

        await self.db.execute(
            text(
                """
                INSERT INTO wallet_players 
                (id, wallet_address, wallet_username, total_games_played, total_score, created_at, updated_at)
                VALUES (:id, :wallet_address, :username, 0, 0, :created_at, :updated_at)
            """
            ),
            {
                "id": player_id,
                "wallet_address": wallet_user_id,
                "username": display_name,
                "created_at": now,
                "updated_at": now,
            },
        )

        return {
            "id": player_id,
            "wallet_address": wallet_user_id,
            "wallet_username": display_name,
            "avatar_url": None,
            "total_games_played": 0,
            "total_score": 0,
            "created_at": now,
            "updated_at": now,
        }

    async def get_player(self, wallet_user_id: str) -> Optional[Dict[str, Any]]:
        """Get player by wallet user ID using raw SQL."""
        wallet_user_id = wallet_user_id.strip()
        result = await self.db.execute(
            text(
                """
                SELECT id, wallet_address, wallet_username, avatar_url,
                       total_games_played, total_score, created_at, updated_at
                FROM wallet_players 
                WHERE wallet_address = :wallet_address
            """
            ),
            {"wallet_address": wallet_user_id},
        )
        row = result.fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "wallet_address": row[1],
            "wallet_username": row[2],
            "avatar_url": row[3],
            "total_games_played": row[4] or 0,
            "total_score": row[5] or 0,
            "created_at": row[6],
            "updated_at": row[7],
        }

    async def update_player(
        self,
        wallet_user_id: str,
        wallet_username: Optional[str] = None,
        avatar_url: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update player profile using raw SQL."""
        player = await self.get_player(wallet_user_id)
        if not player:
            return None

        now = datetime.utcnow()
        updates = []
        params = {"wallet_address": wallet_user_id, "updated_at": now}

        if wallet_username is not None:
            updates.append("wallet_username = :username")
            params["username"] = wallet_username
        if avatar_url is not None:
            updates.append("avatar_url = :avatar_url")
            params["avatar_url"] = avatar_url

        if updates:
            updates.append("updated_at = :updated_at")
            await self.db.execute(
                text(
                    f"UPDATE wallet_players SET {', '.join(updates)} WHERE wallet_address = :wallet_address"
                ),
                params,
            )

        return await self.get_player(wallet_user_id)

    async def _update_player_stats(self, wallet_user_id: str, score: int) -> None:
        """Update player stats after score submission."""
        now = datetime.utcnow()
        await self.db.execute(
            text(
                """
                UPDATE wallet_players 
                SET total_games_played = total_games_played + 1,
                    total_score = total_score + :score,
                    updated_at = :updated_at
                WHERE wallet_address = :wallet_address
            """
            ),
            {"score": score, "updated_at": now, "wallet_address": wallet_user_id},
        )

    def _generate_default_username(self, wallet_user_id: str) -> str:
        """Generate a default display name from wallet user ID."""
        if len(wallet_user_id) > 8:
            return f"{wallet_user_id[:6]}...{wallet_user_id[-4:]}"
        return wallet_user_id

    # ═══════════════════════════════════════════════════════════════════
    #  Score Submission
    # ═══════════════════════════════════════════════════════════════════

    async def submit_score(self, submission: WalletScoreSubmit) -> ScoreSubmitResponse:
        """Submit a new score for a wallet using raw SQL."""
        wallet_user_id = submission.wallet_user_id.strip()
        wallet_username = submission.wallet_username
        now = datetime.utcnow()

        # Ensure player exists
        player = await self.get_or_create_player(wallet_user_id, wallet_username)

        # Get previous best score
        prev_entry = await self._get_leaderboard_entry(
            submission.game_id, wallet_user_id
        )
        previous_high_score = prev_entry["best_total_score"] if prev_entry else 0
        previous_rank = (
            await self._get_player_rank(submission.game_id, wallet_user_id)
            if prev_entry
            else None
        )

        # Create score record in wallet_game_scores using raw SQL
        score_id = str(uuid4())
        await self.db.execute(
            text(
                """
                INSERT INTO wallet_game_scores 
                (id, game_id, wallet_address, wallet_username, total_score, level, 
                 hearts_scores, challenges_completed, quests_completed, collectibles_found,
                 time_played_seconds, scene_id, scene_name, extra_data, created_at)
                VALUES (:id, :game_id, :wallet_address, :username, :total_score, :level,
                        :hearts_scores, :challenges, :quests, :collectibles,
                        :time_played, :scene_id, :scene_name, :extra_data, :created_at)
            """
            ),
            {
                "id": score_id,
                "game_id": submission.game_id,
                "wallet_address": wallet_user_id,
                "username": wallet_username,
                "total_score": submission.total_score,
                "level": submission.level,
                "hearts_scores": (
                    json.dumps(submission.hearts_scores)
                    if submission.hearts_scores
                    else None
                ),
                "extra_data": (
                    json.dumps(submission.extra_data) if submission.extra_data else None
                ),
                "challenges": submission.challenges_completed,
                "quests": submission.quests_completed,
                "collectibles": submission.collectibles_found,
                "time_played": submission.time_played_seconds,
                "scene_id": submission.scene_id,
                "scene_name": submission.scene_name,
                "created_at": now,
            },
        )

        # Update or create leaderboard entry
        await self._update_leaderboard_entry(submission)

        # Update player stats
        await self._update_player_stats(wallet_user_id, submission.total_score)

        # Flush to ensure data is written before we query for rank
        await self.db.flush()

        # Get new rank
        is_high_score = submission.total_score > previous_high_score
        new_rank = await self._get_player_rank(submission.game_id, wallet_user_id)
        rank_change = (previous_rank - new_rank) if previous_rank and new_rank else None

        return ScoreSubmitResponse(
            id=score_id,
            game_id=submission.game_id,
            wallet_user_id=wallet_user_id,
            wallet_username=wallet_username,
            total_score=submission.total_score,
            rank=new_rank,
            is_high_score=is_high_score,
            previous_high_score=(
                previous_high_score if previous_high_score > 0 else None
            ),
            rank_change=rank_change,
            created_at=now,
        )

    async def _get_leaderboard_entry(
        self, game_id: str, wallet_user_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get existing leaderboard entry using raw SQL."""
        result = await self.db.execute(
            text(
                """
                SELECT id, game_id, wallet_address, wallet_username, 
                       best_total_score, games_played, created_at, updated_at
                FROM wallet_leaderboard_entries 
                WHERE game_id = :game_id AND wallet_address = :wallet_address
            """
            ),
            {"game_id": game_id, "wallet_address": wallet_user_id},
        )
        row = result.fetchone()
        if not row:
            return None

        return {
            "id": row[0],
            "game_id": row[1],
            "wallet_address": row[2],
            "wallet_username": row[3],
            "best_total_score": row[4] or 0,
            "games_played": row[5] or 0,
            "created_at": row[6],
            "updated_at": row[7],
        }

    async def _update_leaderboard_entry(self, submission: WalletScoreSubmit) -> None:
        """Update or create leaderboard entry using raw SQL."""
        wallet_user_id = submission.wallet_user_id.strip()
        now = datetime.utcnow()

        entry = await self._get_leaderboard_entry(submission.game_id, wallet_user_id)

        if entry:
            # Update existing entry - only update best_total_score if new score is higher
            new_best = max(entry["best_total_score"], submission.total_score)
            await self.db.execute(
                text(
                    """
                    UPDATE wallet_leaderboard_entries 
                    SET best_total_score = :best_score,
                        games_played = games_played + 1,
                        wallet_username = :username,
                        updated_at = :updated_at
                    WHERE game_id = :game_id AND wallet_address = :wallet_address
                """
                ),
                {
                    "best_score": new_best,
                    "username": submission.wallet_username,
                    "updated_at": now,
                    "game_id": submission.game_id,
                    "wallet_address": wallet_user_id,
                },
            )
        else:
            # Create new entry
            await self.db.execute(
                text(
                    """
                    INSERT INTO wallet_leaderboard_entries 
                    (id, game_id, wallet_address, wallet_username, best_total_score, games_played, created_at, updated_at)
                    VALUES (:id, :game_id, :wallet_address, :username, :best_score, 1, :created_at, :updated_at)
                """
                ),
                {
                    "id": str(uuid4()),
                    "game_id": submission.game_id,
                    "wallet_address": wallet_user_id,
                    "username": submission.wallet_username,
                    "best_score": submission.total_score,
                    "created_at": now,
                    "updated_at": now,
                },
            )

    # ═══════════════════════════════════════════════════════════════════
    #  Leaderboard Queries
    # ═══════════════════════════════════════════════════════════════════

    async def get_leaderboard(
        self,
        game_id: str,
        period: TimePeriod = TimePeriod.ALL_TIME,
        scoreboard_type: ScoreboardType = ScoreboardType.TOTAL_SCORE,
        limit: int = 100,
        offset: int = 0,
        current_wallet: Optional[str] = None,
    ) -> LeaderboardResponse:
        """Get leaderboard for a game using raw SQL."""
        # Use raw SQL to only select existing columns
        result = await self.db.execute(
            text(
                """
                SELECT id, game_id, wallet_address, wallet_username, 
                       best_total_score, games_played, created_at, updated_at
                FROM wallet_leaderboard_entries 
                WHERE game_id = :game_id 
                ORDER BY best_total_score DESC
                LIMIT :limit OFFSET :offset
            """
            ),
            {"game_id": game_id, "limit": limit, "offset": offset},
        )
        rows = result.fetchall()

        # Get total count
        total_result = await self.db.execute(
            text(
                "SELECT COUNT(*) FROM wallet_leaderboard_entries WHERE game_id = :game_id"
            ),
            {"game_id": game_id},
        )
        total_players = total_result.scalar() or 0

        # Build response entries
        response_entries = []
        for i, row in enumerate(rows):
            wallet_addr = row[2]
            response_entries.append(
                LeaderboardEntryResponse(
                    rank=offset + i + 1,
                    wallet_user_id=wallet_addr,
                    wallet_username=row[3],
                    avatar_url=None,
                    score=row[4] or 0,
                    level=1,
                    games_played=row[5] or 0,
                    hearts_scores=None,
                    last_played_at=row[7],
                    is_current_player=(
                        (current_wallet and wallet_addr == current_wallet.strip())
                        if current_wallet
                        else False
                    ),
                )
            )

        # Get current player's entry if requested
        player_entry = None
        if current_wallet:
            player_entry = await self._get_player_entry_response(
                game_id, current_wallet
            )

        return LeaderboardResponse(
            game_id=game_id,
            scoreboard_type=scoreboard_type,
            period=period,
            total_players=total_players,
            entries=response_entries,
            last_updated=datetime.utcnow(),
            player_entry=player_entry,
        )

    async def get_top_entries(
        self,
        game_id: str,
        period: TimePeriod = TimePeriod.ALL_TIME,
        limit: int = 10,
    ) -> List[LeaderboardEntryResponse]:
        """Get top N entries for quick display."""
        response = await self.get_leaderboard(game_id, period, limit=limit)
        return response.entries

    async def _get_player_entry_response(
        self,
        game_id: str,
        wallet_user_id: str,
    ) -> Optional[LeaderboardEntryResponse]:
        """Get a specific player's entry as response."""
        wallet_user_id = wallet_user_id.strip()
        entry = await self._get_leaderboard_entry(game_id, wallet_user_id)
        if not entry:
            return None

        rank = await self._get_player_rank(game_id, wallet_user_id)

        return LeaderboardEntryResponse(
            rank=rank or 0,
            wallet_user_id=entry["wallet_address"],
            wallet_username=entry["wallet_username"],
            avatar_url=None,
            score=entry["best_total_score"],
            level=1,
            games_played=entry["games_played"],
            hearts_scores=None,
            last_played_at=entry["updated_at"],
            is_current_player=True,
        )

    # ═══════════════════════════════════════════════════════════════════
    #  Player Rank & Scoreboard
    # ═══════════════════════════════════════════════════════════════════

    async def get_player_scoreboard(
        self,
        game_id: str,
        wallet_user_id: str,
    ) -> Optional[ScoreboardResponse]:
        """Get player's personal scoreboard data using raw SQL."""
        wallet_user_id = wallet_user_id.strip()

        entry = await self._get_leaderboard_entry(game_id, wallet_user_id)
        if not entry:
            return None

        # Get latest score for additional data using raw SQL
        latest_result = await self.db.execute(
            text(
                """
                SELECT total_score, level, hearts_scores, challenges_completed,
                       quests_completed, collectibles_found, time_played_seconds
                FROM wallet_game_scores
                WHERE game_id = :game_id AND wallet_address = :wallet_address
                ORDER BY created_at DESC
                LIMIT 1
            """
            ),
            {"game_id": game_id, "wallet_address": wallet_user_id},
        )
        latest_row = latest_result.fetchone()

        # Get rank info
        rank = await self._get_player_rank(game_id, wallet_user_id)
        total_players = await self._get_total_players(game_id)
        percentile = self._calculate_percentile(rank, total_players) if rank else None

        return ScoreboardResponse(
            game_id=game_id,
            wallet_user_id=wallet_user_id,
            wallet_username=entry["wallet_username"],
            current_score=latest_row[0] if latest_row else 0,
            best_score=entry["best_total_score"],
            level=latest_row[1] if latest_row else 1,
            rank=rank,
            total_players=total_players,
            percentile=percentile,
            games_played=entry["games_played"],
            hearts_scores=None,
            challenges_completed=latest_row[3] if latest_row else 0,
            quests_completed=latest_row[4] if latest_row else 0,
            collectibles_found=latest_row[5] if latest_row else 0,
            time_played_seconds=latest_row[6] if latest_row else 0,
            last_played_at=entry["updated_at"],
        )

    async def get_player_rank(
        self,
        game_id: str,
        wallet_user_id: str,
        period: TimePeriod = TimePeriod.ALL_TIME,
    ) -> Optional[PlayerRankResponse]:
        """Get player's rank on leaderboard."""
        wallet_user_id = wallet_user_id.strip()

        rank = await self._get_player_rank(game_id, wallet_user_id)
        if not rank:
            return None

        entry = await self._get_leaderboard_entry(game_id, wallet_user_id)
        if not entry:
            return None

        total_players = await self._get_total_players(game_id)
        percentile = self._calculate_percentile(rank, total_players)

        return PlayerRankResponse(
            wallet_user_id=wallet_user_id,
            wallet_username=entry["wallet_username"],
            rank=rank,
            total_players=total_players,
            score=entry["best_total_score"],
            percentile=percentile,
            period=period,
        )

    async def get_nearby_players(
        self,
        game_id: str,
        wallet_user_id: str,
        period: TimePeriod = TimePeriod.ALL_TIME,
        above: int = 2,
        below: int = 2,
    ) -> Optional[NearbyPlayersResponse]:
        """Get players ranked near the current player."""
        wallet_user_id = wallet_user_id.strip()

        rank = await self._get_player_rank(game_id, wallet_user_id)
        if not rank:
            return None

        # Calculate offset
        start_rank = max(1, rank - above)
        limit = above + below + 1

        # Fetch nearby entries
        response = await self.get_leaderboard(
            game_id,
            period,
            limit=limit,
            offset=start_rank - 1,
            current_wallet=wallet_user_id,
        )

        # Mark current player
        for entry in response.entries:
            entry.is_current_player = entry.wallet_user_id == wallet_user_id

        return NearbyPlayersResponse(
            wallet_user_id=wallet_user_id,
            current_rank=rank,
            entries=response.entries,
        )

    async def _get_player_rank(
        self, game_id: str, wallet_user_id: str
    ) -> Optional[int]:
        """Calculate player's rank using raw SQL."""
        entry = await self._get_leaderboard_entry(game_id, wallet_user_id)
        if not entry:
            return None

        score = entry["best_total_score"]

        # Count players with higher scores
        count_result = await self.db.execute(
            text(
                """
                SELECT COUNT(*) FROM wallet_leaderboard_entries 
                WHERE game_id = :game_id AND best_total_score > :score
            """
            ),
            {"game_id": game_id, "score": score},
        )
        players_above = count_result.scalar() or 0

        return players_above + 1

    async def _get_total_players(self, game_id: str) -> int:
        """Get total number of players for a game."""
        result = await self.db.execute(
            text(
                "SELECT COUNT(*) FROM wallet_leaderboard_entries WHERE game_id = :game_id"
            ),
            {"game_id": game_id},
        )
        return result.scalar() or 0

    def _calculate_percentile(self, rank: int, total: int) -> int:
        """Calculate percentile (100 = top, 0 = bottom)."""
        if total <= 0 or rank <= 0:
            return 0
        return int(((total - rank + 1) / total) * 100)

    # ═══════════════════════════════════════════════════════════════════
    #  Score History
    # ═══════════════════════════════════════════════════════════════════

    async def get_score_history(
        self,
        game_id: str,
        wallet_user_id: str,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """Get player's score history using raw SQL."""
        wallet_user_id = wallet_user_id.strip()

        result = await self.db.execute(
            text(
                """
                SELECT id, game_id, wallet_address, wallet_username, total_score, level,
                       hearts_scores, challenges_completed, quests_completed, collectibles_found,
                       time_played_seconds, scene_id, scene_name, extra_data, created_at
                FROM wallet_game_scores
                WHERE game_id = :game_id AND wallet_address = :wallet_address
                ORDER BY created_at DESC
                LIMIT :limit
            """
            ),
            {"game_id": game_id, "wallet_address": wallet_user_id, "limit": limit},
        )
        rows = result.fetchall()

        return [
            {
                "id": row[0],
                "game_id": row[1],
                "wallet_address": row[2],
                "wallet_username": row[3],
                "total_score": row[4],
                "level": row[5],
                "hearts_scores": row[6],
                "challenges_completed": row[7],
                "quests_completed": row[8],
                "collectibles_found": row[9],
                "time_played_seconds": row[10],
                "scene_id": row[11],
                "scene_name": row[12],
                "extra_data": row[13],
                "created_at": row[14],
            }
            for row in rows
        ]