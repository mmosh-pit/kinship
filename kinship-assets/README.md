# Kinship Assets Service

Asset management microservice for the Kinship Intelligence platform. Handles game assets with rich metadata including AOE, hitboxes, HEARTS facet mapping, animations, and scene composition.

## Tech Stack

- **Runtime:** Node.js 20 + TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL (via Knex.js)
- **Storage:** Google Cloud Storage
- **Validation:** Zod
- **Docs:** Swagger/OpenAPI 3.0
- **Testing:** Jest

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment config
cp .env.example .env
# Edit .env with your database and GCS credentials

# 3. Run database migrations
npm run migrate

# 4. Start development server
npm run dev

# Server runs on http://localhost:4000
# Swagger docs at http://localhost:4000/api/docs
```

## API Endpoints

### Assets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/assets` | List assets (filter, paginate, search) |
| GET | `/api/v1/assets/:id` | Get asset by ID (includes metadata) |
| POST | `/api/v1/assets` | Create asset with file upload |
| PATCH | `/api/v1/assets/:id` | Update asset properties |
| DELETE | `/api/v1/assets/:id` | Delete asset + file from GCS |
| GET | `/api/v1/assets/by-facet/:facet` | Get assets by HEARTS facet |
| GET | `/api/v1/assets/:id/audit` | Get asset audit log |

### Asset Metadata
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/assets/:id/metadata` | Get asset metadata |
| POST | `/api/v1/assets/:id/metadata` | Create metadata (AOE, hitbox, etc.) |
| PATCH | `/api/v1/assets/:id/metadata` | Update metadata |

### Scenes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/scenes` | List scenes |
| GET | `/api/v1/scenes/:id` | Get scene |
| GET | `/api/v1/scenes/:id/manifest` | Full manifest with assets + metadata |
| POST | `/api/v1/scenes` | Create scene |
| PATCH | `/api/v1/scenes/:id` | Update scene |
| DELETE | `/api/v1/scenes/:id` | Delete scene |
| POST | `/api/v1/scenes/:id/assets/:assetId` | Add asset to scene |
| DELETE | `/api/v1/scenes/:id/assets/:assetId` | Remove asset from scene |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Service health check |

## Scripts

```bash
npm run dev          # Development with hot reload
npm run build        # Compile TypeScript
npm start            # Run production build
npm test             # Run tests with coverage
npm run migrate      # Run database migrations
npm run migrate:rollback  # Rollback last migration
```

## Docker

```bash
docker build -t kinship-assets .
docker run -p 4000:4000 --env-file .env kinship-assets
```

## Project Structure

```
kinship-assets/
├── src/
│   ├── config/          # Database, GCS, Swagger config
│   ├── routes/          # Express routes with Swagger annotations
│   ├── services/        # Business logic (asset, storage, scene)
│   ├── models/          # Zod validation schemas
│   ├── middleware/       # Error handling, validation, multer
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Logger
│   ├── db/
│   │   └── migrations/  # Knex migrations
│   └── index.ts         # App entry point
├── tests/               # Jest tests
├── Dockerfile
└── package.json
```
