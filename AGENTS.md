# AGENTS.md — Engineering Rules & Operational Guidelines

This document defines the strict engineering guidelines and operational workflows for developers and AI agents working on **Titife Consumable API**.

---

## 1. Operating Rules & Workflow

1. **Read Governance Documents First**: Read `PRD.md` and `AGENTS.md` in full before starting any phase or writing any code.
2. **Inspect Before Acting**: Always inspect existing files, git status, and dependencies before modifying or creating files.
3. **Plan Before Implementation**: For every phase, produce an implementation plan artifact and review it before executing.
4. **Sequential Execution**: Work sequentially through the defined implementation phases (Phase 0 to Phase 6). Do not attempt to run phases in parallel.
5. **Real Verification Required**: Every claim in a verification report must come from a command actually executed, a browser interaction performed, or an output captured during the session. Never fabricate verification.
6. **Stop for Review**: After completing a phase and generating the required Verification Report, **STOP** and wait for approval before starting the next phase.
7. **Destructive Commands Policy**: Always state the reason explicitly before executing commands that delete, overwrite, or reset data/history (`git push --force`, dropping tables, deleting `.env`).
8. **Missing Credentials Policy**: If a credential (e.g., database connection string, Redis API token) is missing, ask for it by name. Do not invent fake placeholders for live connections.

---

## 2. Technical Stack & Architecture

- **Framework**: Next.js (App Router, TypeScript)
- **Database**: PostgreSQL (Managed via Neon)
- **ORM**: Prisma
- **Validation**: Zod
- **Rate Limiting**: `@upstash/redis` + `@upstash/ratelimit` (with documented in-memory fallback for local dev)
- **Seeding**: `@faker-js/faker` (deterministic, fixed seed)

---

## 3. Core API Conventions

- **Versioned Base Path**: All API endpoints MUST be prefixed with `/api/v1/`. No unversioned aliases (e.g. `/operators`) and no `/v2/` routes are allowed.
- **Envelope Standard**:
  - **Success Envelope**:
    ```json
    {
      "data": [...],
      "meta": { "total": 340, "limit": 20, "offset": 0, "hasMore": true }
    }
    ```
  - **Error Envelope**:
    ```json
    {
      "error": { "code": "NOT_FOUND", "message": "Route not found" }
    }
    ```
- **Framework Error Interception**:
  - Unmatched API paths must be caught by a catch-all route at `src/app/api/[...path]/route.ts` returning `404` with the standard error envelope.
  - Every route handler file must export explicit handlers for all standard HTTP methods. Unsupported methods return `405 Method Not Allowed` with an `Allow` header and standard error envelope.

---

## 4. Query Handling (Pagination, Filtering, Sorting)

- **Pagination**:
  - Query parameters: `limit` (default: 20, max: 100), `offset` (default: 0).
  - `limit > 100` MUST be clamped to 100.
  - `offset < 0` or non-integer values MUST return `400 Bad Request`.
- **Filtering**:
  - Every list endpoint must support at least two resource-specific filters (e.g., `status`, `originState`, `departureDate`).
- **Sorting**:
  - Query parameters: `sort` and `order` (`asc` / `desc`).
  - Strict whitelist validation: if `sort` is not in the resource whitelist, return `400 Bad Request` with error message naming allowed fields.

---

## 5. Input Validation & Status Codes

- Use Zod schemas to validate all request path parameters, query strings, and JSON request bodies before hitting database logic.
- **Status Codes**:
  - `200 OK`: Successful fetch/update
  - `201 Created`: Successful creation
  - `400 Bad Request`: Validation failure on query/path parameters, invalid sort key, negative offset
  - `404 Not Found`: Resource or endpoint does not exist
  - `405 Method Not Allowed`: HTTP method not supported on route
  - `422 Unprocessable Entity`: Validation failure on JSON request body (e.g. missing required field)
  - `429 Too Many Requests`: Rate limit threshold exceeded
  - `500 Internal Server Error`: Unexpected internal failure

---

## 6. Database Connection Split & Concurrency Rules

- **Serverless API Routes**: Use `DATABASE_URL` (pooled connection string for serverless performance).
- **Migrations & Seeding**: Use `DIRECT_URL` (direct unpooled connection string).
- **Seat Booking Safety**: Wrap booking creations and seat decrement logic in Prisma `$transaction` blocks with database-level `CHECK (available_seats >= 0)` constraints to prevent overselling under concurrent requests.

---

## 7. Scope Boundaries (Strict Non-Goals)

Do NOT build:
- User login / authentication / JWT / OAuth
- Multi-role authorization
- Payment gateway integrations
- Admin management panels
- Multi-currency conversions (all pricing is stored strictly as integer kobo in NGN)
- Unnecessary frontend pages or landing pages
