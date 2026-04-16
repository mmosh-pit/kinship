"""
Kinship Achievement Service - Business logic for achievements
"""

from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy import func, and_
from sqlalchemy.orm import Session


from app.db.achievement_models import (
    Achievement,
    PlayerAchievement,
    AchievementTier,
    AchievementType,
    TriggerEvent,
    AchievementCreate,
    AchievementUpdate,
    AchievementResponse,
    PlayerAchievementResponse,
    PlayerAchievementSummary,
    UnlockResult,
    ProgressUpdate,
    ProgressResult,
    TriggerCheckRequest,
    TriggerCheckResult,
)


class AchievementService:
    def __init__(self, db: Session):
        self.db = db

    # ─── CRUD ──────────────────────────────────────────────────────

    def create_achievement(self, game_id: str, data: AchievementCreate) -> Achievement:
        achievement = Achievement(game_id=game_id, **data.model_dump())
        self.db.add(achievement)
        self.db.commit()
        self.db.refresh(achievement)
        return achievement

    def get_achievement(self, achievement_id: str) -> Optional[Achievement]:
        return (
            self.db.query(Achievement).filter(Achievement.id == achievement_id).first()
        )

    def get_game_achievements(
        self,
        game_id: str,
        include_disabled: bool = False,
        tier: Optional[AchievementTier] = None,
    ) -> List[Achievement]:
        query = self.db.query(Achievement).filter(Achievement.game_id == game_id)
        if not include_disabled:
            query = query.filter(Achievement.is_enabled == True)
        if tier:
            query = query.filter(Achievement.tier == tier)
        return query.order_by(Achievement.sort_order).all()

    def update_achievement(
        self, achievement_id: str, updates: AchievementUpdate
    ) -> Optional[Achievement]:
        achievement = self.get_achievement(achievement_id)
        if not achievement:
            return None
        for key, value in updates.model_dump(exclude_unset=True).items():
            setattr(achievement, key, value)
        self.db.commit()
        self.db.refresh(achievement)
        return achievement

    def delete_achievement(self, achievement_id: str) -> bool:
        achievement = self.get_achievement(achievement_id)
        if not achievement:
            return False
        self.db.delete(achievement)
        self.db.commit()
        return True

    def get_achievement_stats(self, achievement_id: str) -> Dict[str, Any]:
        total = (
            self.db.query(func.count(func.distinct(PlayerAchievement.player_id)))
            .filter(PlayerAchievement.achievement_id == achievement_id)
            .scalar()
            or 0
        )
        unlocked = (
            self.db.query(func.count(PlayerAchievement.id))
            .filter(
                and_(
                    PlayerAchievement.achievement_id == achievement_id,
                    PlayerAchievement.is_unlocked == True,
                )
            )
            .scalar()
            or 0
        )
        return {
            "unlock_count": unlocked,
            "unlock_percentage": round((unlocked / total * 100) if total > 0 else 0, 2),
        }

    # ─── Player Achievements ───────────────────────────────────────

    def get_player_achievement(
        self, achievement_id: str, player_id: str
    ) -> Optional[PlayerAchievement]:
        return (
            self.db.query(PlayerAchievement)
            .filter(
                and_(
                    PlayerAchievement.achievement_id == achievement_id,
                    PlayerAchievement.player_id == player_id,
                )
            )
            .first()
        )

    def get_or_create_player_achievement(
        self, achievement_id: str, player_id: str, game_id: str
    ) -> PlayerAchievement:
        pa = self.get_player_achievement(achievement_id, player_id)
        if not pa:
            pa = PlayerAchievement(
                achievement_id=achievement_id, player_id=player_id, game_id=game_id
            )
            self.db.add(pa)
            self.db.commit()
            self.db.refresh(pa)
        return pa

    def get_player_achievements(
        self, game_id: str, player_id: str, unlocked_only: bool = False
    ) -> List[PlayerAchievementResponse]:
        achievements = self.get_game_achievements(game_id)
        player_achievements = {
            pa.achievement_id: pa
            for pa in self.db.query(PlayerAchievement)
            .filter(
                and_(
                    PlayerAchievement.game_id == game_id,
                    PlayerAchievement.player_id == player_id,
                )
            )
            .all()
        }

        results = []
        for a in achievements:
            pa = player_achievements.get(a.id)
            is_unlocked = pa.is_unlocked if pa else False
            if unlocked_only and not is_unlocked:
                continue
            if a.is_secret and not is_unlocked:
                continue

            progress_current = pa.progress_current if pa else 0
            stats = self.get_achievement_stats(a.id)

            results.append(
                PlayerAchievementResponse(
                    achievement_id=a.id,
                    player_id=player_id,
                    is_unlocked=is_unlocked,
                    unlocked_at=pa.unlocked_at if pa else None,
                    progress_current=progress_current,
                    progress_max=a.progress_max,
                    progress_percentage=min(
                        (
                            (progress_current / a.progress_max * 100)
                            if a.progress_max > 0
                            else 0
                        ),
                        100,
                    ),
                    achievement=AchievementResponse(
                        id=a.id,
                        game_id=a.game_id,
                        name=a.name,
                        description=a.description,
                        hint=a.hint,
                        icon=a.icon,
                        tier=a.tier,
                        achievement_type=a.achievement_type,
                        category=a.category,
                        is_enabled=a.is_enabled,
                        is_secret=a.is_secret,
                        xp_reward=a.xp_reward,
                        points_reward=a.points_reward,
                        trigger_event=a.trigger_event,
                        trigger_conditions=a.trigger_conditions,
                        requires_progress=a.requires_progress,
                        progress_max=a.progress_max,
                        progress_unit=a.progress_unit,
                        unlock_count=stats["unlock_count"],
                        unlock_percentage=stats["unlock_percentage"],
                    ),
                )
            )
        return results

    def get_player_summary(
        self, game_id: str, player_id: str
    ) -> PlayerAchievementSummary:
        all_achievements = self.get_player_achievements(game_id, player_id)
        unlocked = [a for a in all_achievements if a.is_unlocked]

        by_tier = {tier.value: 0 for tier in AchievementTier}
        for a in unlocked:
            by_tier[a.achievement.tier.value] += 1

        recent = sorted(
            [a for a in unlocked if a.unlocked_at],
            key=lambda x: x.unlocked_at,
            reverse=True,
        )[:5]
        in_progress = sorted(
            [
                a
                for a in all_achievements
                if not a.is_unlocked and a.progress_current > 0
            ],
            key=lambda x: x.progress_percentage,
            reverse=True,
        )[:5]

        return PlayerAchievementSummary(
            player_id=player_id,
            game_id=game_id,
            total_achievements=len(all_achievements),
            unlocked_count=len(unlocked),
            unlock_percentage=(
                (len(unlocked) / len(all_achievements) * 100) if all_achievements else 0
            ),
            total_xp_earned=sum(a.achievement.xp_reward for a in unlocked),
            by_tier=by_tier,
            recent_unlocks=recent,
            in_progress=in_progress,
        )

    # ─── Unlocking ─────────────────────────────────────────────────

    def unlock_achievement(
        self, achievement_id: str, player_id: str, game_id: Optional[str] = None
    ) -> UnlockResult:
        achievement = self.get_achievement(achievement_id)
        if not achievement:
            raise ValueError(f"Achievement {achievement_id} not found")

        game_id = game_id or achievement.game_id
        pa = self.get_or_create_player_achievement(achievement_id, player_id, game_id)

        was_unlocked = pa.is_unlocked
        newly_unlocked = False
        xp_earned = 0

        if not was_unlocked:
            pa.is_unlocked = True
            pa.unlocked_at = datetime.utcnow()
            pa.progress_current = achievement.progress_max
            pa.notification_seen = False
            newly_unlocked = True
            xp_earned = achievement.xp_reward
            self.db.commit()

        stats = self.get_achievement_stats(achievement_id)
        return UnlockResult(
            achievement_id=achievement_id,
            player_id=player_id,
            was_already_unlocked=was_unlocked,
            newly_unlocked=newly_unlocked,
            xp_earned=xp_earned,
            achievement=AchievementResponse(
                id=achievement.id,
                game_id=achievement.game_id,
                name=achievement.name,
                description=achievement.description,
                hint=achievement.hint,
                icon=achievement.icon,
                tier=achievement.tier,
                achievement_type=achievement.achievement_type,
                category=achievement.category,
                is_enabled=achievement.is_enabled,
                is_secret=achievement.is_secret,
                xp_reward=achievement.xp_reward,
                points_reward=achievement.points_reward,
                trigger_event=achievement.trigger_event,
                trigger_conditions=achievement.trigger_conditions,
                requires_progress=achievement.requires_progress,
                progress_max=achievement.progress_max,
                progress_unit=achievement.progress_unit,
                unlock_count=stats["unlock_count"],
                unlock_percentage=stats["unlock_percentage"],
            ),
        )

    def update_progress(
        self, achievement_id: str, update: ProgressUpdate
    ) -> ProgressResult:
        achievement = self.get_achievement(achievement_id)
        if not achievement:
            raise ValueError(f"Achievement {achievement_id} not found")

        pa = self.get_or_create_player_achievement(
            achievement_id, update.player_id, achievement.game_id
        )
        previous = pa.progress_current

        new_progress = (
            update.set_value
            if update.set_value is not None
            else previous + update.increment
        )
        new_progress = max(0, min(new_progress, achievement.progress_max))
        pa.progress_current = new_progress
        self.db.commit()

        newly_unlocked = False
        unlock_result = None
        if new_progress >= achievement.progress_max and not pa.is_unlocked:
            unlock_result = self.unlock_achievement(achievement_id, update.player_id)
            newly_unlocked = unlock_result.newly_unlocked

        return ProgressResult(
            achievement_id=achievement_id,
            player_id=update.player_id,
            previous_progress=previous,
            new_progress=new_progress,
            progress_max=achievement.progress_max,
            newly_unlocked=newly_unlocked,
            unlock_result=unlock_result,
        )

    def get_unseen_unlocks(
        self, game_id: str, player_id: str
    ) -> List[PlayerAchievementResponse]:
        pas = (
            self.db.query(PlayerAchievement)
            .filter(
                and_(
                    PlayerAchievement.game_id == game_id,
                    PlayerAchievement.player_id == player_id,
                    PlayerAchievement.is_unlocked == True,
                    PlayerAchievement.notification_seen == False,
                )
            )
            .all()
        )

        results = []
        for pa in pas:
            a = pa.achievement
            stats = self.get_achievement_stats(a.id)
            results.append(
                PlayerAchievementResponse(
                    achievement_id=a.id,
                    player_id=player_id,
                    is_unlocked=True,
                    unlocked_at=pa.unlocked_at,
                    progress_current=pa.progress_current,
                    progress_max=a.progress_max,
                    progress_percentage=100,
                    achievement=AchievementResponse(
                        id=a.id,
                        game_id=a.game_id,
                        name=a.name,
                        description=a.description,
                        hint=a.hint,
                        icon=a.icon,
                        tier=a.tier,
                        achievement_type=a.achievement_type,
                        category=a.category,
                        is_enabled=a.is_enabled,
                        is_secret=a.is_secret,
                        xp_reward=a.xp_reward,
                        points_reward=a.points_reward,
                        trigger_event=a.trigger_event,
                        trigger_conditions=a.trigger_conditions,
                        requires_progress=a.requires_progress,
                        progress_max=a.progress_max,
                        progress_unit=a.progress_unit,
                        unlock_count=stats["unlock_count"],
                        unlock_percentage=stats["unlock_percentage"],
                    ),
                )
            )
        return results

    def mark_seen(self, achievement_id: str, player_id: str) -> bool:
        pa = self.get_player_achievement(achievement_id, player_id)
        if not pa:
            return False
        pa.notification_seen = True
        self.db.commit()
        return True

    # ─── Trigger Checking ──────────────────────────────────────────

    def check_triggers(self, request: TriggerCheckRequest) -> TriggerCheckResult:
        achievements = (
            self.db.query(Achievement)
            .filter(
                and_(
                    Achievement.game_id == request.game_id,
                    Achievement.is_enabled == True,
                    Achievement.trigger_event == request.event,
                )
            )
            .all()
        )

        unlocked = []
        progress_updated = []

        for a in achievements:
            pa = self.get_player_achievement(a.id, request.player_id)
            if pa and pa.is_unlocked:
                continue

            should_unlock, should_increment = self._check_conditions(
                a, request.event_data or {}
            )

            if should_unlock:
                result = self.unlock_achievement(
                    a.id, request.player_id, request.game_id
                )
                if result.newly_unlocked:
                    unlocked.append(result)
            elif should_increment and a.requires_progress:
                result = self.update_progress(
                    a.id, ProgressUpdate(player_id=request.player_id, increment=1)
                )
                progress_updated.append(result)
                if result.newly_unlocked and result.unlock_result:
                    unlocked.append(result.unlock_result)

        return TriggerCheckResult(
            player_id=request.player_id,
            event=request.event,
            achievements_unlocked=unlocked,
            progress_updated=progress_updated,
        )

    def _check_conditions(
        self, achievement: Achievement, event_data: Dict[str, Any]
    ) -> Tuple[bool, bool]:
        conditions = achievement.trigger_conditions or {}
        if not conditions:
            return (True, True)

        if "target_id" in conditions:
            target = (
                event_data.get("target_id")
                or event_data.get("challenge_id")
                or event_data.get("scene_id")
            )
            if target != conditions["target_id"]:
                return (False, False)

        if "threshold" in conditions:
            value = event_data.get("value") or event_data.get("score") or 0
            if value < conditions["threshold"]:
                return (False, False)

        if "time_limit" in conditions:
            time_taken = event_data.get("time_taken") or float("inf")
            if time_taken > conditions["time_limit"]:
                return (False, False)

        if "hearts_facet" in conditions:
            hearts = event_data.get("hearts") or {}
            min_val = conditions.get("min_value", 0)
            if hearts.get(conditions["hearts_facet"], 0) < min_val:
                return (False, False)

        if "count" in conditions:
            return (False, True)

        return (True, True)


def create_default_achievements(db: Session, game_id: str) -> List[Achievement]:
    service = AchievementService(db)
    defaults = [
        AchievementCreate(
            name="First Steps",
            description="Complete your first challenge",
            icon="👣",
            tier=AchievementTier.BRONZE,
            trigger_event=TriggerEvent.CHALLENGE_COMPLETE,
            trigger_conditions={"count": 1},
            requires_progress=True,
            progress_max=1,
            xp_reward=10,
        ),
        AchievementCreate(
            name="Getting Started",
            description="Complete 5 challenges",
            icon="🌱",
            tier=AchievementTier.BRONZE,
            trigger_event=TriggerEvent.CHALLENGE_COMPLETE,
            trigger_conditions={"count": 5},
            requires_progress=True,
            progress_max=5,
            xp_reward=25,
        ),
        AchievementCreate(
            name="Explorer",
            description="Visit 10 different scenes",
            icon="🗺️",
            tier=AchievementTier.BRONZE,
            trigger_event=TriggerEvent.SCENE_ENTER,
            trigger_conditions={"count": 10},
            requires_progress=True,
            progress_max=10,
            xp_reward=20,
        ),
        AchievementCreate(
            name="Challenge Master",
            description="Complete 25 challenges",
            icon="⚡",
            tier=AchievementTier.SILVER,
            trigger_event=TriggerEvent.CHALLENGE_COMPLETE,
            trigger_conditions={"count": 25},
            requires_progress=True,
            progress_max=25,
            xp_reward=50,
        ),
        AchievementCreate(
            name="Quest Seeker",
            description="Complete 10 quests",
            icon="📖",
            tier=AchievementTier.SILVER,
            trigger_event=TriggerEvent.QUEST_COMPLETE,
            trigger_conditions={"count": 10},
            requires_progress=True,
            progress_max=10,
            xp_reward=75,
        ),
        AchievementCreate(
            name="Dedicated Player",
            description="Play for 7 days in a row",
            icon="🔥",
            tier=AchievementTier.SILVER,
            achievement_type=AchievementType.STREAK,
            trigger_event=TriggerEvent.DAILY_LOGIN,
            trigger_conditions={"consecutive_days": 7},
            requires_progress=True,
            progress_max=7,
            xp_reward=100,
        ),
        AchievementCreate(
            name="Speed Demon",
            description="Complete any challenge in under 10 seconds",
            icon="💨",
            tier=AchievementTier.GOLD,
            achievement_type=AchievementType.SPEED,
            trigger_event=TriggerEvent.CHALLENGE_COMPLETE,
            trigger_conditions={"time_limit": 10},
            xp_reward=150,
        ),
        AchievementCreate(
            name="Champion",
            description="Complete 100 challenges",
            icon="🏆",
            tier=AchievementTier.GOLD,
            trigger_event=TriggerEvent.CHALLENGE_COMPLETE,
            trigger_conditions={"count": 100},
            requires_progress=True,
            progress_max=100,
            xp_reward=200,
        ),
        AchievementCreate(
            name="Perfectionist",
            description="Get perfect scores on 50 challenges",
            icon="💎",
            tier=AchievementTier.DIAMOND,
            trigger_event=TriggerEvent.CHALLENGE_COMPLETE,
            trigger_conditions={"count": 50, "min_value": 100},
            requires_progress=True,
            progress_max=50,
            xp_reward=500,
        ),
        AchievementCreate(
            name="???",
            description="A mysterious achievement...",
            hint="Try failing a lot...",
            icon="🔒",
            tier=AchievementTier.SPECIAL,
            achievement_type=AchievementType.SECRET,
            is_secret=True,
            trigger_event=TriggerEvent.CHALLENGE_FAIL,
            trigger_conditions={"count": 10},
            requires_progress=True,
            progress_max=10,
            xp_reward=50,
        ),
    ]

    achievements = []
    for i, data in enumerate(defaults):
        data.sort_order = i
        achievements.append(service.create_achievement(game_id, data))
    return achievements
