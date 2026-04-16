"""
Validation Pipeline Module

Comprehensive validation for generated game manifests.

PIPELINE ORDER:
1. Schema Validation — Structure matches expected format
2. Reference Validation — All IDs resolve correctly
3. Gameplay Validation — Game is completable
4. Spatial Validation — Grid, collision, pathfinding
5. Challenge Validation — Challenges are solvable
6. Route Validation — Player can reach all objectives

USAGE:
    from app.validators import validate_manifest

    result = validate_manifest(manifest)
    
    if result.valid:
        print("Manifest is valid!")
    else:
        for error in result.all_errors:
            print(f"Error: {error.message}")
"""

# Validation Pipeline
from app.validators.validation_pipeline import (
    ValidationSeverity,
    ValidationIssue,
    ValidationResult,
    PipelineResult,
    BaseValidator,
    ValidationPipeline,
    validate_manifest,
)

# Individual Validators
from app.validators.schema_validator import SchemaValidator
from app.validators.reference_validator import ReferenceValidator
from app.validators.gameplay_validator import GameplayValidator
from app.validators.spatial_validator import (
    GridValidator,
    CollisionValidator,
    PathfindingValidator,
    SpatialValidator,
)
from app.validators.challenge_validator import ChallengeValidator
from app.validators.route_validator import RouteValidator

# Legacy Softlock Validator
from app.validators.softlock_validator import (
    SoftlockType,
    SoftlockIssue,
    SoftlockValidationResult,
    check_reachability,
    validate_key_lock_reachability,
    validate_push_puzzle,
    validate_collectibles,
    validate_npc_reachability,
    validate_exit_reachability,
    validate_dependencies,
    validate_scene_for_softlocks,
)


__all__ = [
    # Pipeline Core
    "ValidationSeverity",
    "ValidationIssue",
    "ValidationResult",
    "PipelineResult",
    "BaseValidator",
    "ValidationPipeline",
    "validate_manifest",
    # Validators
    "SchemaValidator",
    "ReferenceValidator",
    "GameplayValidator",
    "GridValidator",
    "CollisionValidator",
    "PathfindingValidator",
    "SpatialValidator",
    "ChallengeValidator",
    "RouteValidator",
    # Legacy Softlock
    "SoftlockType",
    "SoftlockIssue",
    "SoftlockValidationResult",
    "check_reachability",
    "validate_key_lock_reachability",
    "validate_push_puzzle",
    "validate_collectibles",
    "validate_npc_reachability",
    "validate_exit_reachability",
    "validate_dependencies",
    "validate_scene_for_softlocks",
]
