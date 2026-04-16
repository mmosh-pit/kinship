import StorageService from '../src/services/storage.service';

// Mock the GCS bucket
jest.mock('../src/config/storage', () => ({
  bucket: {
    file: jest.fn().mockReturnValue({
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue([true]),
      getMetadata: jest.fn().mockResolvedValue([{ size: 1024 }]),
      getSignedUrl: jest.fn().mockResolvedValue(['https://signed-url.com/file']),
      copy: jest.fn().mockResolvedValue(undefined),
    }),
    getFiles: jest.fn().mockResolvedValue([[
      { name: 'sprites/test1.png' },
      { name: 'sprites/test2.png' },
    ]]),
  },
  baseUrl: 'https://storage.googleapis.com/kinship-assets-poc',
  getFolderForType: jest.fn((type: string) => {
    const map: Record<string, string> = {
      tile: 'tiles',
      sprite: 'sprites',
      object: 'sprites/objects',
      npc: 'sprites/npcs',
      audio: 'audio',
    };
    return map[type] || 'misc';
  }),
}));

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    service = new StorageService();
  });

  describe('uploadFile', () => {
    it('should upload a file and return URL', async () => {
      const result = await service.uploadFile({
        buffer: Buffer.from('test-image-data'),
        originalName: 'treadmill.png',
        mimeType: 'image/png',
        assetType: 'object',
      });

      expect(result.fileUrl).toContain('https://storage.googleapis.com/kinship-assets-poc');
      expect(result.fileUrl).toContain('.png');
      expect(result.fileSize).toBe(15); // Buffer length
      expect(result.mimeType).toBe('image/png');
    });

    it('should include scene name in path when provided', async () => {
      const result = await service.uploadFile({
        buffer: Buffer.from('test'),
        originalName: 'floor.png',
        mimeType: 'image/png',
        assetType: 'tile',
        sceneName: 'gym',
      });

      expect(result.fileUrl).toContain('https://storage.googleapis.com/kinship-assets-poc');
    });
  });

  describe('extractGcsPath', () => {
    it('should extract path from full URL', () => {
      const url = 'https://storage.googleapis.com/kinship-assets-poc/sprites/objects/abc.png';
      const path = service.extractGcsPath(url);
      expect(path).toBe('sprites/objects/abc.png');
    });
  });

  describe('deleteFile', () => {
    it('should delete an existing file', async () => {
      await expect(service.deleteFile('sprites/test.png')).resolves.not.toThrow();
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const exists = await service.fileExists('sprites/test.png');
      expect(exists).toBe(true);
    });
  });

  describe('getSignedUrl', () => {
    it('should return a signed URL', async () => {
      const url = await service.getSignedUrl('sprites/test.png', 60);
      expect(url).toBe('https://signed-url.com/file');
    });
  });

  describe('listFiles', () => {
    it('should list files with prefix', async () => {
      const files = await service.listFiles('sprites/');
      expect(files).toHaveLength(2);
      expect(files[0]).toBe('sprites/test1.png');
    });
  });
});
