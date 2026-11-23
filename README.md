# BayadRent

Landlord–renter rent tracking and payments with role-based access (`LANDLORD` | `RENTER`).

## Stack

| Layer | Choice |
|--------|--------|
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js 15, Tailwind CSS v4, React 19 |
| API | NestJS (modular monolith → microservices-ready) |
| Shared | `@bayadrent/shared-types` (Zod + enums) |
| Data (local) | Postgres 16, Redis 7, MinIO via Docker Compose |

## Repo layout

```text
apps/
  web/          # Next.js UI (landlord + renter)
  api/          # NestJS API (auth, property, billing, payment, notify)
packages/
  shared-types/ # Shared DTOs / enums
infra via docker-compose.yml
```

## Prerequisites

- Node.js 22+
- pnpm 12+
- Docker Desktop (for Postgres / Redis / MinIO)

## Getting started

```powershell
# install deps
pnpm install

# start databases (Postgres on host port 5433 + Redis)
pnpm db:up

# push Drizzle schema to Postgres
pnpm db:push


# build shared package, then run everything
pnpm --filter @bayadrent/shared-types build
pnpm dev
```

- Web: http://localhost:3000  
- Register / login: http://localhost:3000/register · http://localhost:3000/login  
- API: http://localhost:4000/api/health  
- Swagger: http://localhost:4000/docs  

### Auth endpoints

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/register` | public |
| POST | `/api/auth/login` | public |
| GET | `/api/auth/me` | Bearer JWT |

### Property / lease endpoints

| Method | Path | Role |
|--------|------|------|
| POST | `/api/properties` | LANDLORD |
| GET | `/api/properties` | LANDLORD |
| POST | `/api/properties/:propertyId/units` | LANDLORD |
| POST | `/api/units/:unitId/leases` | LANDLORD |
| GET | `/api/leases/me` | RENTER |

### Billing endpoints

| Method | Path | Role |
|--------|------|------|
| GET | `/api/billing/tracker` | LANDLORD |
| POST | `/api/billing/generate` | LANDLORD |
| GET | `/api/billing/my-invoices` | RENTER |
| POST | `/api/billing/invoices/:invoiceId/mark-paid` | LANDLORD (direct confirm) |

### Payment proof endpoints

| Method | Path | Role |
|--------|------|------|
| POST | `/api/payments/invoices/:invoiceId/submit` | RENTER (multipart: `proof`, `note`) |
| GET | `/api/payments/pending` | LANDLORD |
| POST | `/api/payments/:paymentId/confirm` | LANDLORD |
| POST | `/api/payments/:paymentId/reject` | LANDLORD |
| GET | `/api/payments/:paymentId/proof` | LANDLORD or RENTER |

### Notify / reminder endpoints

| Method | Path | Role |
|--------|------|------|
| GET | `/api/notify/inbox` | LANDLORD or RENTER |
| POST | `/api/notify/inbox/read-all` | LANDLORD or RENTER |
| POST | `/api/notify/inbox/:id/read` | LANDLORD or RENTER |
| POST | `/api/notify/reminders/run` | LANDLORD (queues BullMQ job) |

Reminders also run automatically every 6 hours via Redis/BullMQ (email is logged as a stub until SMTP/Resend is configured).

## Useful scripts

| Script | What it does |
|--------|----------------|
| `pnpm dev` | Run web + api (+ shared watch via turbo) |
| `pnpm build` | Build all packages |
| `pnpm lint` | Lint / typecheck |
| `pnpm db:up` | `docker compose up -d` |
| `pnpm db:down` | Stop containers |

## Environment

Copy examples if needed:

- `apps/api/.env.example` → `apps/api/.env`
- `apps/web/.env.example` → `apps/web/.env.local`

## CI

GitHub Actions workflow: `.github/workflows/ci.yml` (install → build shared → lint → build).

## Roadmap

1. Wire Postgres (Drizzle) + real auth (register/login + JWT guards)
2. Properties / units / leases
3. Invoice tracker (paid / due / overdue)
4. Payment proofs + landlord confirm
5. Reminder jobs (BullMQ + Redis)
6. Extract microservices when needed
