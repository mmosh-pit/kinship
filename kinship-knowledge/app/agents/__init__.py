"""
Multi-Agent Generation Pipeline — Agents Module

This module contains all generation agents:
- SceneAgent: Layout and decorations
- ChallengeAgent: Fill challenge templates
- NPCAgent: Place NPCs and assign roles
- DialogueAgent: Generate NPC dialogue
- VerificationAgent: Validate all rules

NOTE: Orchestrator and EditorAgent are NOT imported here.
They have cross-dependencies that cause circular imports at
package init time. Import them directly:
    from app.agents.orchestrator import Orchestrator
    from app.agents.editor_agent import EditorAgent
"""

from app.agents.base_agent import (
    AgentStatus,
    AgentResult,
    AgentConfig,
    BaseAgent,
)

from app.agents.scene_agent import SceneAgent
from app.agents.challenge_agent import ChallengeAgent
from app.agents.npc_agent import NPCAgent
from app.agents.dialogue_agent import DialogueAgent
from app.agents.verification_agent import VerificationAgent


__all__ = [
    # Base
    "AgentStatus",
    "AgentResult",
    "AgentConfig",
    "BaseAgent",
    # Agents
    "SceneAgent",
    "ChallengeAgent",
    "NPCAgent",
    "DialogueAgent",
    "VerificationAgent",
]
