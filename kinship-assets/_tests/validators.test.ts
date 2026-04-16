import {
  CreateAssetSchema,
  UpdateAssetSchema,
  CreateMetadataSchema,
  AssetQuerySchema,
  CreateSceneSchema,
} from '../src/models/validators';

// ==========================================
// ASSET VALIDATION TESTS
// ==========================================

describe('CreateAssetSchema', () => {
  it('should validate a correct asset', () => {
    const data = {
      name: 'treadmill_01',
      display_name: 'Treadmill',
      type: 'object',
      created_by: 'admin',
      tags: ['gym', 'equipment'],
    };

    const result = CreateAssetSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should reject invalid name (uppercase)', () => {
    const data = {
      name: 'Treadmill_01',
      display_name: 'Treadmill',
      type: 'object',
      created_by: 'admin',
    };

    const result = CreateAssetSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject invalid name (spaces)', () => {
    const data = {
      name: 'treadmill 01',
      display_name: 'Treadmill',
      type: 'object',
      created_by: 'admin',
    };

    const result = CreateAssetSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject invalid type', () => {
    const data = {
      name: 'treadmill_01',
      display_name: 'Treadmill',
      type: 'weapon', // not in enum
      created_by: 'admin',
    };

    const result = CreateAssetSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should accept all valid asset types', () => {
    const types = ['tile', 'sprite', 'object', 'npc', 'avatar', 'ui', 'audio', 'tilemap', 'animation'];

    types.forEach((type) => {
      const result = CreateAssetSchema.safeParse({
        name: `test_${type}`,
        display_name: `Test ${type}`,
        type,
        created_by: 'admin',
      });
      expect(result.success).toBe(true);
    });
  });

  it('should reject empty name', () => {
    const result = CreateAssetSchema.safeParse({
      name: '',
      display_name: 'Test',
      type: 'object',
      created_by: 'admin',
    });
    expect(result.success).toBe(false);
  });

  it('should default tags to empty array', () => {
    const result = CreateAssetSchema.safeParse({
      name: 'test_asset',
      display_name: 'Test',
      type: 'object',
      created_by: 'admin',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
    }
  });

  it('should default meta_description to empty string', () => {
    const result = CreateAssetSchema.safeParse({
      name: 'test_asset',
      display_name: 'Test',
      type: 'object',
      created_by: 'admin',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.meta_description).toBe('');
    }
  });

  it('should accept meta_description', () => {
    const result = CreateAssetSchema.safeParse({
      name: 'treadmill_01',
      display_name: 'Treadmill',
      type: 'object',
      meta_description: 'High-end cardio treadmill in the gym. Triggers Empowerment facet.',
      created_by: 'admin',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.meta_description).toBe('High-end cardio treadmill in the gym. Triggers Empowerment facet.');
    }
  });

  it('should reject meta_description over 1000 chars', () => {
    const result = CreateAssetSchema.safeParse({
      name: 'test_asset',
      display_name: 'Test',
      type: 'object',
      meta_description: 'a'.repeat(1001),
      created_by: 'admin',
    });
    expect(result.success).toBe(false);
  });
});

describe('UpdateAssetSchema', () => {
  it('should accept partial updates', () => {
    const result = UpdateAssetSchema.safeParse({ display_name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = UpdateAssetSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept is_active toggle', () => {
    const result = UpdateAssetSchema.safeParse({ is_active: false });
    expect(result.success).toBe(true);
  });
});

// ==========================================
// METADATA VALIDATION TESTS
// ==========================================

describe('CreateMetadataSchema', () => {
  it('should validate full metadata', () => {
    const data = {
      aoe: {
        shape: 'circle',
        radius: 2.5,
        unit: 'tiles',
      },
      hitbox: {
        width: 2,
        height: 1,
        offset_x: 0,
        offset_y: 0,
      },
      interaction: {
        type: 'tap',
        range: 1.5,
        cooldown_ms: 500,
        requires_facing: false,
      },
      hearts_mapping: {
        primary_facet: 'E',
        secondary_facet: 'T',
        base_delta: 3.5,
        description: 'Empowerment through physical activity',
      },
      states: ['idle', 'in_use', 'broken'],
      spawn: {
        default_position: { x: 5, y: 3 },
        layer: 'objects',
        z_index: 2,
      },
      rules: {
        requires_item: null,
        max_users: 1,
        description: 'A treadmill for cardio training',
        is_movable: false,
        is_destructible: false,
        level_required: 0,
      },
    };

    const result = CreateMetadataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should accept minimal metadata', () => {
    const result = CreateMetadataSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should validate all AOE shapes', () => {
    const shapes = ['circle', 'rectangle', 'polygon', 'none'];

    shapes.forEach((shape) => {
      const result = CreateMetadataSchema.safeParse({
        aoe: { shape, unit: 'tiles' },
      });
      expect(result.success).toBe(true);
    });
  });

  it('should validate all HEARTS facets', () => {
    const facets = ['H', 'E', 'A', 'R', 'T', 'Si', 'So'];

    facets.forEach((facet) => {
      const result = CreateMetadataSchema.safeParse({
        hearts_mapping: {
          primary_facet: facet,
          base_delta: 1.0,
        },
      });
      expect(result.success).toBe(true);
    });
  });

  it('should reject invalid HEARTS facet', () => {
    const result = CreateMetadataSchema.safeParse({
      hearts_mapping: {
        primary_facet: 'X',
        base_delta: 1.0,
      },
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative hitbox dimensions', () => {
    const result = CreateMetadataSchema.safeParse({
      hitbox: {
        width: -1,
        height: 1,
        offset_x: 0,
        offset_y: 0,
      },
    });
    expect(result.success).toBe(false);
  });

  it('should accept polygon AOE with vertices', () => {
    const result = CreateMetadataSchema.safeParse({
      aoe: {
        shape: 'polygon',
        vertices: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 2 },
          { x: 0, y: 2 },
        ],
        unit: 'tiles',
      },
    });
    expect(result.success).toBe(true);
  });

  it('should validate animation config', () => {
    const result = CreateMetadataSchema.safeParse({
      animations: {
        idle: { file: 'treadmill_idle.json', frames: 8, fps: 12, loop: true },
        active: { file: 'treadmill_active.json', frames: 16, fps: 24, loop: true },
      },
    });
    expect(result.success).toBe(true);
  });
});

// ==========================================
// QUERY VALIDATION TESTS
// ==========================================

describe('AssetQuerySchema', () => {
  it('should accept empty query (defaults)', () => {
    const result = AssetQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.sort_order).toBe('desc');
    }
  });

  it('should accept valid filters', () => {
    const result = AssetQuerySchema.safeParse({
      type: 'object',
      scene_type: 'gym',
      page: '2',
      limit: '10',
    });
    expect(result.success).toBe(true);
  });

  it('should reject limit over 100', () => {
    const result = AssetQuerySchema.safeParse({ limit: '200' });
    expect(result.success).toBe(false);
  });

  it('should coerce string numbers', () => {
    const result = AssetQuerySchema.safeParse({ page: '3', limit: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(50);
    }
  });
});

// ==========================================
// SCENE VALIDATION TESTS
// ==========================================

describe('CreateSceneSchema', () => {
  it('should validate a valid scene', () => {
    const result = CreateSceneSchema.safeParse({
      scene_name: 'Gym Scene - Level 1',
      scene_type: 'gym',
      created_by: 'admin',
    });
    expect(result.success).toBe(true);
  });

  it('should accept full scene with spawn points', () => {
    const result = CreateSceneSchema.safeParse({
      scene_name: 'Garden Scene',
      scene_type: 'garden',
      tile_map_url: 'https://storage.googleapis.com/kinship-assets/tilemaps/garden.tmx',
      spawn_points: [
        {
          id: 'sp_1',
          label: 'Player Start',
          position: { x: 5, y: 5 },
          type: 'player',
          assigned_asset_id: null,
        },
      ],
      ambient: {
        lighting: 'day',
        weather: 'clear',
        music_track: null,
      },
      created_by: 'admin',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid scene type', () => {
    const result = CreateSceneSchema.safeParse({
      scene_name: 'Test',
      scene_type: 'dungeon',
      created_by: 'admin',
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid scene types', () => {
    const types = ['gym', 'garden', 'farm', 'shared', 'lobby'];

    types.forEach((type) => {
      const result = CreateSceneSchema.safeParse({
        scene_name: `${type} scene`,
        scene_type: type,
        created_by: 'admin',
      });
      expect(result.success).toBe(true);
    });
  });
});
