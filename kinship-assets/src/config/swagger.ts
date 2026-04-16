import swaggerJsdoc from "swagger-jsdoc";

const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Kinship Assets API",
      version: "1.0.0",
      description:
        "Asset management service for Kinship Intelligence platform. Handles game assets with rich metadata including AOE, hitboxes, HEARTS facet mapping, and scene composition.",
      contact: {
        name: "Kinship Team",
      },
    },
    servers: [
      {
        url: "http://localhost:4000/api/v1",
        description: "Development",
      },
      {
        url: "https://assets.kinship.app/api/v1",
        description: "Production",
      },
    ],
    tags: [
      { name: "Assets", description: "Asset CRUD operations" },
      {
        name: "Metadata",
        description: "Asset metadata (AOE, hitbox, HEARTS mapping)",
      },
      { name: "Upload", description: "File upload to GCS" },
      { name: "Scenes", description: "Scene manifest management" },
      { name: "Health", description: "Service health checks" },
    ],
    components: {
      schemas: {
        Asset: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", example: "treadmill_01" },
            display_name: { type: "string", example: "Treadmill" },
            type: {
              type: "string",
              enum: [
                "tile",
                "sprite",
                "object",
                "npc",
                "avatar",
                "ui",
                "audio",
                "tilemap",
                "animation",
              ],
            },
            meta_description: {
              type: "string",
              example:
                "High-end cardio treadmill with speed controls. Located in gym area. Triggers Empowerment facet when used.",
            },
            file_url: { type: "string", format: "uri" },
            thumbnail_url: { type: "string", format: "uri", nullable: true },
            file_size: { type: "integer" },
            mime_type: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            version: { type: "integer" },
            is_active: { type: "boolean" },
            created_by: { type: "string" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
        AssetMetadata: {
          type: "object",
          properties: {
            aoe: {
              type: "object",
              properties: {
                shape: {
                  type: "string",
                  enum: ["circle", "rectangle", "polygon", "none"],
                },
                radius: { type: "number", example: 2.5 },
                width: { type: "number" },
                height: { type: "number" },
                unit: { type: "string", enum: ["tiles", "pixels"] },
              },
            },
            hitbox: {
              type: "object",
              properties: {
                width: { type: "number", example: 2 },
                height: { type: "number", example: 1 },
                offset_x: { type: "number", example: 0 },
                offset_y: { type: "number", example: 0 },
              },
            },
            interaction: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["tap", "long_press", "drag", "proximity", "none"],
                },
                range: { type: "number", example: 1.5 },
                cooldown_ms: { type: "integer", example: 500 },
                requires_facing: { type: "boolean" },
              },
            },
            hearts_mapping: {
              type: "object",
              properties: {
                primary_facet: {
                  type: "string",
                  enum: ["H", "E", "A", "R", "T", "Si", "So"],
                  nullable: true,
                },
                secondary_facet: {
                  type: "string",
                  enum: ["H", "E", "A", "R", "T", "Si", "So"],
                  nullable: true,
                },
                base_delta: { type: "number", example: 3.5 },
                description: { type: "string" },
              },
            },
            states: {
              type: "array",
              items: { type: "string" },
              example: ["idle", "in_use", "broken"],
            },
            spawn: {
              type: "object",
              properties: {
                default_position: {
                  type: "object",
                  properties: { x: { type: "number" }, y: { type: "number" } },
                },
                layer: { type: "string" },
                z_index: { type: "integer" },
              },
            },
            rules: {
              type: "object",
              properties: {
                requires_item: { type: "string", nullable: true },
                max_users: { type: "integer" },
                description: { type: "string" },
                is_movable: { type: "boolean" },
                is_destructible: { type: "boolean" },
                level_required: { type: "integer" },
              },
            },
          },
        },
        SceneManifest: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            scene_name: { type: "string", example: "Gym Scene - Level 1" },
            scene_type: {
              type: "string",
              enum: ["gym", "garden", "farm", "shared", "lobby"],
            },
            tile_map_url: { type: "string", format: "uri" },
            asset_ids: {
              type: "array",
              items: { type: "string", format: "uuid" },
            },
            spawn_points: { type: "array", items: { type: "object" } },
            ambient: {
              type: "object",
              properties: {
                music_track: { type: "string", nullable: true },
                lighting: {
                  type: "string",
                  enum: ["day", "night", "dawn", "dusk"],
                },
                weather: {
                  type: "string",
                  enum: ["clear", "rain", "fog", "snow", "none"],
                },
              },
            },
          },
        },
        PaginatedResponse: {
          type: "object",
          properties: {
            data: { type: "array", items: {} },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer" },
                limit: { type: "integer" },
                total: { type: "integer" },
                total_pages: { type: "integer" },
              },
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
            message: { type: "string" },
            details: { type: "object" },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(swaggerOptions);
