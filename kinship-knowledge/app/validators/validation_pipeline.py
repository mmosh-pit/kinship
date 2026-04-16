"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    VALIDATION PIPELINE                                        ║
║                                                                               ║
║  Comprehensive validation for generated game manifests.                       ║
║                                                                               ║
║  PIPELINE ORDER:                                                              ║
║  1. Schema Validation — Structure matches expected format                     ║
║  2. Reference Validation — All IDs resolve correctly                          ║
║  3. Gameplay Validation — Game is completable                                 ║
║  4. Spatial Validation — Grid, collision, pathfinding                         ║
║  5. Challenge Validation — Challenges are solvable                            ║
║  6. Route Validation — Player can reach all objectives                        ║
║                                                                               ║
║  Each validator produces ValidationResult.                                    ║
║  Pipeline continues even if one fails (collects all errors).                  ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional, Callable
from enum import Enum
import logging
import time


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  VALIDATION SEVERITY
# ═══════════════════════════════════════════════════════════════════════════════


class ValidationSeverity(str, Enum):
    """Severity level for validation issues."""

    ERROR = "error"  # Game cannot be played
    WARNING = "warning"  # Game playable but has issues
    INFO = "info"  # Informational only


# ═══════════════════════════════════════════════════════════════════════════════
#  VALIDATION ISSUE
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class ValidationIssue:
    """A single validation issue."""

    code: str  # e.g., "SCHEMA_001"
    message: str  # Human-readable message
    severity: ValidationSeverity  # error/warning/info
    validator: str  # Which validator found it
    location: str = ""  # Where in manifest (e.g., "scenes[0].spawn")
    details: dict = field(default_factory=dict)  # Additional context

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "message": self.message,
            "severity": self.severity.value,
            "validator": self.validator,
            "location": self.location,
            "details": self.details,
        }


# ═══════════════════════════════════════════════════════════════════════════════
#  VALIDATION RESULT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class ValidationResult:
    """Result from a single validator."""

    validator_name: str
    passed: bool = True
    issues: list[ValidationIssue] = field(default_factory=list)
    duration_ms: int = 0
    metadata: dict = field(default_factory=dict)

    @property
    def errors(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity == ValidationSeverity.ERROR]

    @property
    def warnings(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity == ValidationSeverity.WARNING]

    def add_error(self, code: str, message: str, location: str = "", **details):
        self.issues.append(
            ValidationIssue(
                code=code,
                message=message,
                severity=ValidationSeverity.ERROR,
                validator=self.validator_name,
                location=location,
                details=details,
            )
        )
        self.passed = False

    def add_warning(self, code: str, message: str, location: str = "", **details):
        self.issues.append(
            ValidationIssue(
                code=code,
                message=message,
                severity=ValidationSeverity.WARNING,
                validator=self.validator_name,
                location=location,
                details=details,
            )
        )

    def add_info(self, code: str, message: str, location: str = "", **details):
        self.issues.append(
            ValidationIssue(
                code=code,
                message=message,
                severity=ValidationSeverity.INFO,
                validator=self.validator_name,
                location=location,
                details=details,
            )
        )

    def to_dict(self) -> dict:
        return {
            "validator": self.validator_name,
            "passed": self.passed,
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
            "duration_ms": self.duration_ms,
            "issues": [i.to_dict() for i in self.issues],
        }


# ═══════════════════════════════════════════════════════════════════════════════
#  PIPELINE RESULT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class PipelineResult:
    """Result from the complete validation pipeline."""

    valid: bool = True
    results: list[ValidationResult] = field(default_factory=list)
    total_duration_ms: int = 0

    @property
    def all_errors(self) -> list[ValidationIssue]:
        errors = []
        for r in self.results:
            errors.extend(r.errors)
        return errors

    @property
    def all_warnings(self) -> list[ValidationIssue]:
        warnings = []
        for r in self.results:
            warnings.extend(r.warnings)
        return warnings

    def to_dict(self) -> dict:
        return {
            "valid": self.valid,
            "total_errors": len(self.all_errors),
            "total_warnings": len(self.all_warnings),
            "duration_ms": self.total_duration_ms,
            "validators": [r.to_dict() for r in self.results],
        }

    def summary(self) -> str:
        """Get a human-readable summary."""
        lines = [
            f"Validation {'PASSED' if self.valid else 'FAILED'}",
            f"  Errors: {len(self.all_errors)}",
            f"  Warnings: {len(self.all_warnings)}",
            f"  Duration: {self.total_duration_ms}ms",
            "",
        ]

        for r in self.results:
            status = "✓" if r.passed else "✗"
            lines.append(
                f"  {status} {r.validator_name}: {len(r.errors)} errors, {len(r.warnings)} warnings"
            )

        return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════════
#  BASE VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


class BaseValidator:
    """Base class for all validators."""

    @property
    def name(self) -> str:
        raise NotImplementedError

    def validate(self, manifest: dict) -> ValidationResult:
        raise NotImplementedError


# ═══════════════════════════════════════════════════════════════════════════════
#  VALIDATION PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════


class ValidationPipeline:
    """
    Orchestrates all validators in sequence.

    Pipeline order (matches proposed architecture):
    1. Schema Validation — Structure matches expected format
    2. Reference Validation — All IDs resolve correctly
    3. Gameplay Validation — Game is completable
    4. Spatial Validation — Grid, collision, pathfinding
    5. Challenge Validation — Challenges are solvable
    6. Route Validation — Player can reach all objectives
    7. NPC Validation — NPCs assigned and valid
    8. Dialogue Validation — Dialogue linked properly
    9. Mechanic Validation — Mechanics compatible with engine
    10. Engine Validation — Assets, tilemaps, physics
    11. Manifest Validation — Final schema correctness
    """

    def __init__(
        self,
        stop_on_error: bool = False,
        skip_validators: list[str] = None,
    ):
        """
        Args:
            stop_on_error: Stop pipeline on first error
            skip_validators: List of validator names to skip
        """
        self.stop_on_error = stop_on_error
        self.skip_validators = set(skip_validators or [])

        # Import validators
        from app.validators.schema_validator import SchemaValidator
        from app.validators.reference_validator import ReferenceValidator
        from app.validators.gameplay_validator import GameplayValidator
        from app.validators.spatial_validator import SpatialValidator
        from app.validators.challenge_validator import ChallengeValidator
        from app.validators.route_validator import RouteValidator
        from app.validators.npc_validator import NPCValidator
        from app.validators.dialogue_validator import DialogueValidator
        from app.validators.mechanic_validator import MechanicValidator
        from app.validators.engine_validator import EngineValidator
        from app.validators.manifest_validator import ManifestValidator
        from app.validators.softlock_path_validator import SoftlockPathValidator

        # Validator order matters!
        # Softlock + pathfinding runs AFTER scene/npc/challenge/route
        # and BEFORE manifest (final schema check)
        self.validators: list[BaseValidator] = [
            SchemaValidator(),
            ReferenceValidator(),
            GameplayValidator(),
            SpatialValidator(),
            ChallengeValidator(),
            RouteValidator(),
            NPCValidator(),
            DialogueValidator(),
            MechanicValidator(),
            EngineValidator(),
            SoftlockPathValidator(),
            ManifestValidator(),
        ]

    def validate(self, manifest: dict) -> PipelineResult:
        """
        Run all validators on the manifest.

        Args:
            manifest: Game manifest to validate

        Returns:
            PipelineResult with all validation results
        """
        pipeline_result = PipelineResult()
        start_time = time.time()

        for validator in self.validators:
            # Check if skipped
            if validator.name in self.skip_validators:
                logger.debug(f"Skipping validator: {validator.name}")
                continue

            # Run validator
            logger.info(f"Running validator: {validator.name}")

            validator_start = time.time()
            try:
                result = validator.validate(manifest)
            except Exception as e:
                # Validator crashed
                result = ValidationResult(validator_name=validator.name)
                result.add_error(
                    code="VALIDATOR_CRASH",
                    message=f"Validator crashed: {str(e)}",
                )
                logger.error(f"Validator {validator.name} crashed: {e}")

            result.duration_ms = int((time.time() - validator_start) * 1000)
            pipeline_result.results.append(result)

            # Check if we should stop
            if not result.passed:
                pipeline_result.valid = False

                if self.stop_on_error:
                    logger.warning(
                        f"Stopping pipeline due to errors in {validator.name}"
                    )
                    break

        pipeline_result.total_duration_ms = int((time.time() - start_time) * 1000)

        logger.info(
            f"Validation complete: {'PASSED' if pipeline_result.valid else 'FAILED'} "
            f"({pipeline_result.total_duration_ms}ms)"
        )

        return pipeline_result


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════


def validate_manifest(
    manifest: dict,
    stop_on_error: bool = False,
) -> PipelineResult:
    """
    Validate a game manifest through the full pipeline.

    Args:
        manifest: Game manifest to validate
        stop_on_error: Stop on first error

    Returns:
        PipelineResult
    """
    pipeline = ValidationPipeline(stop_on_error=stop_on_error)
    return pipeline.validate(manifest)
