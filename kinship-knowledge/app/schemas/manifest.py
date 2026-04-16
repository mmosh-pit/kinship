"""Pydantic schemas for Flutter/Flame scene manifests."""

from pydantic import BaseModel, Field


class ManifestPosition(BaseModel):
    x: float
    y: float


class ManifestAssetPlacement(BaseModel):
    asset_id: str
    asset_name: str
    file_url: str
    position: ManifestPosition
    z_index: int = 1
    layer: str = "objects"
    scale: float = 1.0
    rotation: float = 0.0
    interaction: dict | None = None
    animation: str | None = None


class ManifestNPCPlacement(BaseModel):
    npc_id: str
    npc_name: str
    sprite_url: str | None = None
    position: ManifestPosition
    facet: str | None = None
    idle_animation: str | None = "idle"


class ManifestSpawnPoint(BaseModel):
    id: str = "default"
    position: ManifestPosition
    facing: str = "down"


class ManifestAmbient(BaseModel):
    lighting: str = "day"  # day, night, dawn, dusk
    weather: str = "clear"  # clear, rain, snow, fog
    audio_url: str | None = None


class SceneManifest(BaseModel):
    """The complete scene manifest that Flutter/Flame reads to render a scene."""
    scene_id: str
    scene_name: str
    scene_type: str = "standard"
    dimensions: dict = Field(default_factory=lambda: {"width": 20, "height": 15})
    tile_map_url: str | None = None
    assets: list[ManifestAssetPlacement] = []
    npcs: list[ManifestNPCPlacement] = []
    spawn_points: list[ManifestSpawnPoint] = [ManifestSpawnPoint(position=ManifestPosition(x=10, y=7))]
    ambient: ManifestAmbient = ManifestAmbient()
    boundaries: dict = Field(default_factory=lambda: {"min_x": 0, "min_y": 0, "max_x": 20, "max_y": 15})
    metadata: dict = {}

    # Populated at runtime for multi-player
    active_players: list[dict] = []
    npc_states: dict = {}  # npc_id → {state, occupied_by}


class SceneGenerateRequest(BaseModel):
    """Request body for AI scene generation."""
    prompt: str
    scene_type: str = "standard"
    scene_name: str = ""
    dimensions: dict = Field(default_factory=lambda: {"width": 20, "height": 15})
    target_facets: list[str] = []
    lighting: str = "day"
    weather: str = "clear"
