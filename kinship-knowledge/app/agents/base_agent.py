"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    BASE AGENT                                                 ║
║                                                                               ║
║  Abstract base class for all generation agents.                               ║
║                                                                               ║
║  PRINCIPLES:                                                                  ║
║  • System controls structure, AI fills flavor                                 ║
║  • Agents are stateless — state lives in PipelineState                        ║
║  • Each agent has single responsibility                                       ║
║  • Validation after every step                                                ║
║                                                                               ║
║  AGENT TYPES:                                                                 ║
║  • SceneAgent — Layout + decorations                                          ║
║  • ChallengeAgent — Fill challenge templates                                  ║
║  • NPCAgent — Place NPCs + assign roles                                       ║
║  • DialogueAgent — Generate NPC dialogue                                      ║
║  • VerificationAgent — Validate all rules                                     ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional
from enum import Enum
import logging
import time


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  AGENT STATUS
# ═══════════════════════════════════════════════════════════════════════════════


class AgentStatus(str, Enum):
    """Status of an agent execution."""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"
    RETRYING = "retrying"


# ═══════════════════════════════════════════════════════════════════════════════
#  AGENT RESULT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class AgentResult:
    """Result of an agent execution."""

    agent_name: str
    status: AgentStatus

    # Output data (varies by agent)
    data: dict = field(default_factory=dict)

    # Timing
    duration_ms: int = 0

    # Errors/warnings
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    # Retry info
    attempt: int = 1
    max_attempts: int = 3

    def is_success(self) -> bool:
        return self.status == AgentStatus.SUCCESS

    def is_failure(self) -> bool:
        return self.status == AgentStatus.FAILED

    def can_retry(self) -> bool:
        return self.attempt < self.max_attempts


# ═══════════════════════════════════════════════════════════════════════════════
#  AGENT CONFIG
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class AgentConfig:
    """Configuration for an agent."""

    # Retry settings
    max_retries: int = 3
    retry_delay_seconds: float = 1.0

    # Timeout
    timeout_seconds: float = 60.0

    # Validation
    validate_output: bool = True
    strict_validation: bool = False  # Fail on warnings

    # Logging
    log_level: str = "INFO"
    log_inputs: bool = False
    log_outputs: bool = True

    # AI settings (for agents that use LLM)
    use_ai: bool = True
    ai_model: str = "claude-sonnet-4-20250514"
    ai_temperature: float = 0.7
    ai_max_tokens: int = 2000


# ═══════════════════════════════════════════════════════════════════════════════
#  BASE AGENT
# ═══════════════════════════════════════════════════════════════════════════════


class BaseAgent(ABC):
    """
    Abstract base class for all generation agents.

    Subclasses must implement:
    - name property
    - _execute() method
    - _validate_output() method
    """

    def __init__(self, config: AgentConfig = None):
        self.config = config or AgentConfig()
        self._logger = logging.getLogger(f"agent.{self.name}")

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique name for this agent."""
        pass

    @abstractmethod
    async def _execute(self, state: "PipelineState") -> dict:
        """
        Execute the agent's task.

        Args:
            state: Shared pipeline state

        Returns:
            Output data dict
        """
        pass

    @abstractmethod
    def _validate_output(
        self, output: dict, state: "PipelineState"
    ) -> tuple[bool, list[str]]:
        """
        Validate the agent's output.

        Args:
            output: Output data from _execute
            state: Shared pipeline state

        Returns:
            (is_valid, list of error messages)
        """
        pass

    async def run(self, state: "PipelineState") -> AgentResult:
        """
        Run the agent with retry logic.

        Args:
            state: Shared pipeline state

        Returns:
            AgentResult
        """
        result = AgentResult(
            agent_name=self.name,
            status=AgentStatus.PENDING,
            max_attempts=self.config.max_retries,
        )

        for attempt in range(1, self.config.max_retries + 1):
            result.attempt = attempt
            result.status = AgentStatus.RUNNING

            self._logger.info(
                f"Running {self.name} (attempt {attempt}/{self.config.max_retries})"
            )

            start_time = time.time()

            try:
                # Execute agent
                output = await self._execute(state)

                # Validate output
                if self.config.validate_output:
                    is_valid, errors = self._validate_output(output, state)

                    if not is_valid:
                        result.errors.extend(errors)

                        if attempt < self.config.max_retries:
                            result.status = AgentStatus.RETRYING
                            self._logger.warning(
                                f"{self.name} validation failed, retrying: {errors}"
                            )
                            await self._delay_retry()
                            continue
                        else:
                            result.status = AgentStatus.FAILED
                            self._logger.error(
                                f"{self.name} failed validation: {errors}"
                            )
                            break

                # Success
                result.status = AgentStatus.SUCCESS
                result.data = output

                elapsed_ms = int((time.time() - start_time) * 1000)
                result.duration_ms = elapsed_ms

                self._logger.info(f"{self.name} completed in {elapsed_ms}ms")

                if self.config.log_outputs:
                    self._logger.debug(f"{self.name} output: {list(output.keys())}")

                break

            except Exception as e:
                result.errors.append(str(e))

                elapsed_ms = int((time.time() - start_time) * 1000)
                result.duration_ms = elapsed_ms

                if attempt < self.config.max_retries:
                    result.status = AgentStatus.RETRYING
                    self._logger.warning(f"{self.name} failed, retrying: {e}")
                    await self._delay_retry()
                else:
                    result.status = AgentStatus.FAILED
                    self._logger.error(
                        f"{self.name} failed after {attempt} attempts: {e}"
                    )

        return result

    async def _delay_retry(self):
        """Wait before retrying."""
        import asyncio

        await asyncio.sleep(self.config.retry_delay_seconds)

    def _log_input(self, state: "PipelineState"):
        """Log input state for debugging."""
        if self.config.log_inputs:
            self._logger.debug(
                f"{self.name} input state keys: {list(state.data.keys())}"
            )


# ═══════════════════════════════════════════════════════════════════════════════
#  PIPELINE STATE (Forward declaration for type hints)
# ═══════════════════════════════════════════════════════════════════════════════

# Import actual PipelineState at runtime to avoid circular imports
# Type hint uses string literal "PipelineState"
