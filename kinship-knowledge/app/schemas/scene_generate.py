"""Pydantic schemas for AI-powered full scene generation with asset placement."""

from pydantic import BaseModel, Field


# ── Request ──

class SceneFullGenerateRequest(BaseModel):
    """Creator sends a single prompt → AI generates everything."""
    prompt: str = Field(..., description="Natural language description of the scene")
    scene_name: str = ""
    scene_type: str = ""
    target_facets: list[str] = []
    dimensions: dict = Field(
        default_factory=lambda: {"width": 16, "height": 16},
        description="Grid size. Default 16x16 — square works for both portrait and landscape mobile."
    )


class SceneRefineRequest(BaseModel):
    """Creator sends a refinement prompt to modify generated content."""
    prompt: str = Field(..., description="What to change")
    current: dict = Field(..., description="The current generated state to refine")


# ── Generated Entities ──

class AssetPlacement(BaseModel):
    """A specific asset placed at a grid position."""
    asset_name: str          # references catalog name (e.g. "campfire", "pine_tree_light")
    asset_id: str = ""       # UUID from kinship-assets DB — used for scene.asset_ids
    display_name: str = ""
    file: str = ""           # legacy — prefer file_url
    file_url: str = ""       # full GCS URL for Flutter to download the image
    x: int = 0
    y: int = 0
    z_index: int = 0
    layer: str = "ground"    # ground | ground_decor | objects
    scale: float = 1.0
    purpose: str = ""        # AI explains why it placed this here


class GeneratedNPC(BaseModel):
    name: str
    role: str = ""
    facet: str = "E"
    personality: str = ""
    background: str = ""
    dialogue_style: str = ""
    catchphrases: list[str] = []
    position: dict = Field(default_factory=lambda: {"x": 0, "y": 0})


class GeneratedChallenge(BaseModel):
    name: str
    description: str = ""
    facets: list[str] = []
    difficulty: str = "medium"
    steps: list[dict] = []
    success_criteria: str = ""
    base_delta: float = 5.0
    time_limit_sec: int = 0


class GeneratedQuest(BaseModel):
    name: str
    beat_type: str = "Exploration"
    facet: str = "E"
    description: str = ""
    narrative_content: str = ""
    sequence_order: int = 1


class GeneratedRoute(BaseModel):
    name: str
    from_scene: str = ""
    to_scene: str = ""
    description: str = ""
    trigger_type: str = "auto"
    conditions: list[dict] = []
    bidirectional: bool = False


class GeneratedScene(BaseModel):
    scene_name: str
    scene_type: str = "standard"
    description: str = ""
    lighting: str = "day"
    weather: str = "clear"
    target_facets: list[str] = []
    dimensions: dict = Field(default_factory=lambda: {"width": 20, "height": 15})


# ── Full Response ──

class SceneFullGenerateResponse(BaseModel):
    """Everything AI generated from the prompt — preview before saving."""
    scene: GeneratedScene
    asset_placements: list[AssetPlacement] = []
    npcs: list[GeneratedNPC] = []
    challenges: list[GeneratedChallenge] = []
    quests: list[GeneratedQuest] = []
    routes: list[GeneratedRoute] = []
    system_prompt: str = ""
    generation_notes: str = ""