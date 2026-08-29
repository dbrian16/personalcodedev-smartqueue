# Omni-Queue 360

A multi-channel queue management system for a service centre: walk-in customers take
tickets at a kiosk, remote customers book appointment slots online, staff serve the
queue from a console, and administrators manage services, policy and analytics from a
dashboard. Wait times are estimated by a Python engine that starts from a queueing
formula and learns from served tickets.

## Architecture

Monorepo (npm workspaces): three React front ends, a Node.js/Express backend, and a
Python AI microservice.

| Workspace | Stack | Dev port | Role |
|---|---|---|---|
| `apps/kiosk-app` | React | 3100 | On-site touchscreen: take / track / check-in tickets |
| `apps/admin-portal` | React | 3101 | Staff console + admin dashboard (analytics, staff, operations) |
| `apps/online-portal` | React | 3103 | Remote booking, verification and live tracking |
| `apps/api-server` | Node + Express | 5100 | REST API, Socket.IO, business rules, storage |
| `apps/ai-engine` | Python + Flask | 5001 | Wait-time prediction model |
| `packages/shared` | TypeScript | — | Shared types and endpoint constants |
| `packages/shared-ui` | React | — | Shared components and hooks (`Toast`, `useCatalog`, `useSocketRoom`) |

**Backend layering:** Controller → Service → Store, with routing, business logic and
data access strictly separated. The store is pluggable: in-process by default, Redis
when reachable, PostgreSQL when `DATABASE_URL` is set. `GET /api/health` reports which
combination is live.

## Quickstart

Requires **Node.js 20+** and (optionally) **Python 3.10+** for the AI engine.

```bash
npm run setup   # install workspaces, build shared UI, install AI-engine deps
npm start       # start all five services together
```

Then open the kiosk at http://localhost:3100, the online portal at
http://localhost:3103, and the admin/staff portal at http://localhost:3101.
Default admin login is `admin` / `admin123`; staff are `staff1`–`staff6` (password
same as username). These are development defaults; production requires real values
via environment variables.

A local run needs **no `.env` file**. To use PostgreSQL/Redis or the Docker stack,
see **[SETUP.md](SETUP.md)**.

## Common commands

```bash
npm test              # backend (Jest) + AI engine (pytest)
npm run test:api      # backend only
npm run build:shared  # rebuild the shared-ui package after editing it
npm run reset         # clear the queue store
npm run docker:up     # start PostgreSQL + Redis via docker-compose
```

## Documentation

- **[SETUP.md](SETUP.md)** — full local / Docker / PostgreSQL setup for new team members.
- **[workflow_and_technical_details.md](workflow_and_technical_details.md)** — detailed
  workflow by persona and the technical architecture.
- **[apps/api-server/docs/CODING_STANDARDS.md](apps/api-server/docs/CODING_STANDARDS.md)** — backend coding conventions.

## Security

This codebase has been audited across the following domains:

- **Secrets management** — all `.env` files are git-ignored; production requires explicit
  configuration via environment variables; JWT secret and admin credentials throw on
  missing values in production.
- **Authentication & authorisation** — JWT with role-based access control (`admin`,
  `staff`, `customer`); timing-safe credential comparison (`crypto.timingSafeEqual`);
  per-service staff access enforcement with cross-counter audit trail.
- **Rate limiting** — tiered limits on login (20/15 min), ticket token (60/15 min),
  lookup (30/15 min), and a general cap (3000/15 min); brute-force lockout on
  check-in attempts.
- **Input validation** — parameterised SQL everywhere; email / phone validation;
  strict status-transition whitelist; JSON body size cap (1 MB).
- **Infrastructure** — Helmet security headers; CORS origin whitelist in production;
  Docker services bound to loopback; AI engine on `127.0.0.1` only.
- **Data protection** — PII masking in logs and API responses; OTP codes stored as
  SHA-256 hashes with TTL; check-in audit identifiers hashed.
- **Concurrency** — distributed locking with Lua-script token verification and
  auto-renewal; double-booking prevention via re-validation inside the lock.

## Notes for contributors

- The `*.bat` scripts at the repo root are Windows convenience helpers; the
  cross-platform way to run everything is the `npm run` commands above.
- Copy `apps/api-server/.env.example` to `.env` only when you need PostgreSQL/Redis;
  the `.env` file is git-ignored and must never be committed.
