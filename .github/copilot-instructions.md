# Site Factory — Project Guidelines

## Architecture

Monorepo: `server/` (Fastify API) + `client/` (React SPA).

- **Backend**: Fastify 4 + TypeScript + SQLite (better-sqlite3 + Drizzle ORM) + ssh2
- **Frontend**: React 18 + TypeScript + Vite 5 + Tailwind CSS 3 + TanStack Query/Table + Zustand + axios
- **Data**: SQLite DB + template files stored in `server/data/` (gitignored)

### Key Boundaries

| Layer | Responsibility |
|-------|---------------|
| `server/src/routes/` | FastifyPlugin per resource (templates, servers, sites) — validation, CRUD, orchestration |
| `server/src/services/` | Business logic — `templater.ts` (string replacement), `deployer.ts` (SSH/SFTP) |
| `server/src/panels/` | Panel adapters (Hestia, FastPanel, ISP Manager, cPanel) — `PanelAdapter` interface + factory |
| `client/src/api/` | TanStack Query hooks per resource — all API calls go through axios client |
| `client/src/pages/` | Page components with colocated logic (Dashboard, Templates, Servers, Deploy) |

### Deploy Flow

1. Template processed → literal string replacement (all case variants: lower, UPPER, kebab, snake, camelCase)
2. Panel adapter creates domain on remote server
3. SFTP uploads processed files to `webRootPattern`

## Build and Test

```bash
# Install all dependencies
npm run install:all

# Dev (both server + client via concurrently)
npm run dev

# Server only (port 3001, tsx watch)
cd server && npm run dev

# Client only (port 5173, proxies /api → :3001)
cd client && npm run dev

# Production build
npm run build
```

No test suite yet. Verify changes by running `npm run dev` from root and checking both server startup and client build.

## Conventions

### Code Style
- ESM imports everywhere (`import`/`export`), no CommonJS
- Named exports for API hooks and components
- Database columns: `snake_case`. TypeScript interfaces: `camelCase`
- Routes are Fastify plugins registered with prefix (`/api/templates`, etc.)
- Credentials masked with `'***'` in API responses; only update if value ≠ `'***'`

### Panel Adapters
- All implement `PanelAdapter` interface: `createSite()`, `deleteSite()`, `testConnection()`
- Constructed with `ServerConnectionConfig` + panel-specific args (host, panelPassword)
- Prefer API when available (FastPanel), fall back to SSH CLI commands
- Log steps with `console.log` prefix describing the action

### Frontend
- One page per route in `client/src/pages/`
- API hooks in `client/src/api/` — use `useQuery`/`useMutation` with cache invalidation
- Dark theme via Tailwind classes (`bg-gray-900`, `text-white`)
- Notifications via `react-hot-toast`
- UI language: Russian (labels, placeholders, toasts)

### Database
- 3 tables: `templates`, `servers`, `sites`
- Raw SQL init in `server/src/db/index.ts` with ALTER TABLE migrations for schema evolution
- Drizzle ORM schema in `server/src/db/schema.ts` for type-safe queries
- Foreign keys enabled, WAL mode

## Pitfalls

- `server/data/` is gitignored — DB and templates are local only
- Template ZIP upload auto-flattens single root directory
- `processTemplate()` returns a temp dir path — caller must clean up
- SSH connections use `ssh2` library, not `node-ssh`
- cPanel adapter is still a skeleton — needs full implementation
