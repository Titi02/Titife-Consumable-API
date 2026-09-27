# Titife Consumable API — Nigerian Intercity Bus Transport API

REST API for Nigerian intercity bus transport, built with **Next.js (App Router)**, **TypeScript**, **Prisma**, and **PostgreSQL**. Every endpoint is versioned under `/api/v1` — no unversioned aliases, no `/v2`.

- [1. Setup](#1-setup)
- [2. Design Decisions](#2-design-decisions)
- [3. Resource Specifications](#3-resource-specifications)
- [4. API Endpoint Documentation](#4-api-endpoint-documentation)
- [5. Rate Limiting & Error Handling](#5-rate-limiting--error-handling)

This README is the complete API reference. Design rationale and verification evidence live in [`DOCUMENTATION.md`](DOCUMENTATION.md); requirements are in [`docs/PRD.md`](docs/PRD.md).

---

## 1. Setup

### Live Deployment

- **Deployment origin**: `https://exemplary-smile-production-8df4.up.railway.app`
- **Public API base URL**: `https://exemplary-smile-production-8df4.up.railway.app/api/v1`
- **Host**: Railway (Neon PostgreSQL, Upstash Redis).

Every `curl` example below uses `$BASE`, which is the **origin** — each example appends `/api/v1` itself:

```bash
export BASE="https://exemplary-smile-production-8df4.up.railway.app"
```

### Environment Variables (`.env`)

```bash
# Pooled connection string for serverless API routes
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/titife_dev?pgbouncer=true&schema=public"
# Direct (unpooled) connection string for Prisma migrations & seeding
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/titife_dev?schema=public"
# Upstash Redis credentials for the shared rate limit store (optional; in-memory fallback if omitted)
UPSTASH_REDIS_REST_URL="https://your-upstash-redis.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your_upstash_redis_token"
# API origin for the consumer client (origin only, no trailing /api/v1 or slash)
NEXT_PUBLIC_API_BASE_URL="http://localhost:3000"
```

### Local Installation & Execution

```bash
npm install        # install dependencies
npx prisma db push # push the Prisma schema to your database
npm run db:seed    # seed the deterministic Faker dataset (200/300/300/500)
npm run dev        # start the dev server on http://localhost:3000
```

### Consumer App Configuration

The bundled consumer (`src/app/page.tsx`) never hardcodes a host — it reads the origin at runtime and appends the versioned path:

```ts
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const url = `${apiBaseUrl}/api/v1/${activeTab}?${params.toString()}`;
```

- If set, the consumer targets that origin, so it can point at local, staging, or production without code changes.
- If unset or empty, requests resolve against the **same origin** the consumer is served from — the zero-config local default.
- Must be the **origin only** (scheme, host, optional port): no trailing `/api/v1`, no trailing slash.
- `NEXT_PUBLIC_*` values are inlined at build time, so changing one requires a **rebuild**, not just a restart.

---

## 2. Design Decisions

Full rationale is in [`DOCUMENTATION.md`](DOCUMENTATION.md) §2 and §6. In brief:

- **Four resources** — `Operators` (bus companies), `Routes` (city-to-city corridors), `Schedules` (a specific bus run with seat capacity and departure time), `Bookings` (a passenger ticket against a schedule). These are the core entities of the logistics domain.
- **Prefixed non-sequential IDs** — cuid2 strings prefixed by entity type (`op_`, `rot_`, `sch_`, `bkg_`). The prefix makes the entity type obvious in logs and requests, and non-sequential values prevent ID-harvesting and enumeration. Malformed IDs are rejected by a prefix regex *before* any database call, so a bad ID yields `400`, never a cast-error `500`.
- **Offset pagination** (`limit`/`offset`) over cursor — it permits random page access and the mandated `meta.total`, and the dataset (200/300/300/500 rows) is far too small for deep-offset degradation to matter. The accepted trade-offs, and when a cursor would win, are argued in `DOCUMENTATION.md` §6.1.
- **Standardized envelopes** — `{ "data": ..., "meta": ... }` on success and `{ "error": { "code", "message" } }` on failure, both from single helpers, so a client parses any response without branching on the endpoint.
- **Framework errors intercepted, not leaked** — a catch-all route under `/api/` returns a JSON `404`, and every route file exports explicit handlers for all standard methods so unsupported ones return `405` with an `Allow` header. No HTML error page ever escapes `/api/`.
- **Rate limiting in middleware** — applied to `/api/:path*` before route logic, so a new endpoint inherits the limit automatically and cannot forget it.

---

## 3. Resource Specifications

**Currency convention.** All monetary amounts (`baseFareAmount`, `fareAmount`, `totalAmount`) are **integers in minor units (NGN kobo)** alongside an explicit `currency: "NGN"` field — ₦25,000.00 is stored as `2500000`. Floats are never used for money.

| Resource | ID prefix | Fields |
| :--- | :--- | :--- |
| **Operator** | `op_` | `name` (str, unique) · `code` (str, unique, uppercased) · `headquarters` (str) · `supportEmail` (str, email) · `supportPhone` (str) · `status` (`ACTIVE`\|`INACTIVE`) · `createdAt` · `updatedAt` |
| **Route** | `rot_` | `operatorId` (fk → Operator) · `originState` · `originCity` · `destinationState` · `destinationCity` · `distanceKm` (int) · `estimatedMinutes` (int) · `baseFareAmount` (int, kobo) · `currency` (`NGN`) · `status` (`ACTIVE`\|`SUSPENDED`) · `createdAt` · `updatedAt` |
| **Schedule** | `sch_` | `routeId` (fk) · `operatorId` (fk) · `busRegistrationNumber` · `busModel` · `totalSeats` (int) · `availableSeats` (int) · `departureTime` · `arrivalTime` · `fareAmount` (int, kobo) · `currency` (`NGN`) · `status` (`SCHEDULED`\|`BOARDING`\|`COMPLETED`\|`CANCELLED`) · `createdAt` · `updatedAt` |
| **Booking** | `bkg_` | `scheduleId` (fk) · `passengerName` · `passengerPhone` · `passengerEmail` · `seatNumber` (int) · `totalAmount` (int, kobo) · `currency` (`NGN`) · `bookingReference` (str, unique) · `status` (`CONFIRMED`\|`CANCELLED`) · `createdAt` · `updatedAt` |

---

## 4. API Endpoint Documentation

### Endpoint Summary

| Method | Path | Purpose | Methods Allowed |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/operators` | List operators | `GET, POST` |
| `POST` | `/api/v1/operators` | Create an operator | `GET, POST` |
| `GET` | `/api/v1/operators/:id` | Operator detail | `GET, PATCH` |
| `PATCH` | `/api/v1/operators/:id` | Update an operator | `GET, PATCH` |
| `GET` | `/api/v1/operators/:id/routes` | Routes for an operator | `GET` |
| `GET` | `/api/v1/routes` | List routes | `GET, POST` |
| `POST` | `/api/v1/routes` | Create a route | `GET, POST` |
| `GET` | `/api/v1/routes/:id` | Route detail | `GET, PATCH` |
| `PATCH` | `/api/v1/routes/:id` | Update a route | `GET, PATCH` |
| `GET` | `/api/v1/routes/:id/schedules` | Schedules for a route | `GET` |
| `GET` | `/api/v1/schedules` | List schedules | `GET, POST` |
| `POST` | `/api/v1/schedules` | Create a schedule | `GET, POST` |
| `GET` | `/api/v1/schedules/:id` | Schedule detail | `GET, PATCH` |
| `PATCH` | `/api/v1/schedules/:id` | Update a schedule | `GET, PATCH` |
| `GET` | `/api/v1/bookings` | List bookings | `GET, POST` |
| `POST` | `/api/v1/bookings` | Create a booking (atomic seat allocation) | `GET, POST` |
| `GET` | `/api/v1/bookings/:id` | Booking detail | `GET, PATCH` |
| `PATCH` | `/api/v1/bookings/:id` | Update or cancel a booking | `GET, PATCH` |

### Global Conventions

These apply to every endpoint below.

- **Envelopes** — success is `{ "data": ..., "meta": ... }`; `meta` is present **only** on list endpoints (`{ total, limit, offset, hasMore }`). Single-entity `GET`/`POST`/`PATCH` responses are `{ "data": { ... } }`. Every failure is `{ "error": { "code": "BAD_REQUEST", "message": "..." } }`.
- **Pagination** (all list endpoints) — `limit` (int, default `20`, max `100`; values above `100` are **clamped** to `100`; non-integer or `<= 0` → `400`) · `offset` (int, default `0`; negative or non-integer → `400`). A valid `offset` past the end of the data returns `200` with an empty `data` array, not an error.
- **Sorting** — `sort` is whitelisted per endpoint and `order` is `asc` (default) or `desc`. An unlisted `sort` field returns `400` naming the allowed fields; any other `order` value returns `400`.
- **Path parameters** — `:id` is matched against `^op_[a-z0-9]+$` (Operator), `^rot_[a-z0-9]+$` (Route), `^sch_[a-z0-9]+$` (Schedule), `^bkg_[a-z0-9]+$` (Booking) before any database access. Malformed → `400`; well-formed but unknown → `404`.
- **Error interception** — any unmatched path under `/api` returns a JSON `404`. Any method not in the "Methods Allowed" column returns `405` with an `Allow` header. Framework HTML error pages never occur inside `/api/`.
- **Rate limiting** — every `/api/*` path is rate limited by middleware; see [Section 5](#5-rate-limiting--error-handling).

### Operators API

#### 1. List operators — `GET /api/v1/operators`
- **Query**: `limit` (int, 20, max 100) · `offset` (int, 0) · `sort` (`createdAt`\|`name`\|`code`, default `createdAt`) · `order` (`asc`\|`desc`) · `status` (`ACTIVE`\|`INACTIVE`) · `search` (case-insensitive match on `name` or `headquarters`)
- **Curl**: `curl -X GET "$BASE/api/v1/operators?limit=2&sort=name&order=asc"`
- **Response** (`200`):
  ```json
  { "data": [ { "id": "op_6d0e5071af696dfda8012a95", "name": "ABC Transport Plc", "code": "ABC", "headquarters": "Imo", "supportEmail": "support@abctransport.ng", "supportPhone": "+2348030000007", "status": "ACTIVE", "createdAt": "2026-09-01T04:30:00.000Z", "updatedAt": "2026-09-01T04:30:00.000Z" } ],
    "meta": { "total": 200, "limit": 2, "offset": 0, "hasMore": true } }
  ```
- **Errors**: `400` (bad pagination/sort, invalid `status`) · `429` · `500`

#### 2. Create an operator — `POST /api/v1/operators`
- **Body**: `name` (str, required, min 2, unique) · `code` (str, required, 2–10 chars, uppercased, unique) · `headquarters` (str, required, min 2) · `supportEmail` (str, required, valid email) · `supportPhone` (str, required, min 5) · `status` (enum, optional, default `ACTIVE`; `ACTIVE`\|`INACTIVE`)
- **Curl**:
  ```bash
  curl -X POST "$BASE/api/v1/operators" -H "Content-Type: application/json" \
    -d '{"name":"Eagle Line Express","code":"ELE","headquarters":"Benin City","supportEmail":"contact@eagleline.ng","supportPhone":"+2348039998877"}'
  ```
- **Response** (`201`):
  ```json
  { "data": { "id": "op_4m8n2p9q7r3s5t1u6v8w2xayz", "name": "Eagle Line Express", "code": "ELE", "headquarters": "Benin City", "supportEmail": "contact@eagleline.ng", "supportPhone": "+2348039998877", "status": "ACTIVE", "createdAt": "2026-09-25T21:00:00.000Z", "updatedAt": "2026-09-25T21:00:00.000Z" } }
  ```
- **Errors**: `400` (unparseable JSON) · `422` (missing/short `name`, `code` outside 2–10 chars, non-email `supportEmail`, duplicate `name` or `code`) · `429` · `500`

#### 3. Get operator details — `GET /api/v1/operators/:id`
- **Path**: `id` (string, `^op_[a-z0-9]+$`)
- **Curl**: `curl -X GET "$BASE/api/v1/operators/op_6d0e5071af696dfda8012a95"`
- **Response** (`200`) — the operator plus relation counts:
  ```json
  { "data": { "id": "op_6d0e5071af696dfda8012a95", "name": "ABC Transport Plc", "code": "ABC", "headquarters": "Imo", "supportEmail": "support@abctransport.ng", "supportPhone": "+2348030000007", "status": "ACTIVE", "createdAt": "2026-09-01T04:30:00.000Z", "updatedAt": "2026-09-01T04:30:00.000Z", "_count": { "routes": 2, "schedules": 2 } } }
  ```
- **Errors**: `400` (malformed `id`) · `404` (unknown `id`) · `429` · `500`

#### 4. Update an operator — `PATCH /api/v1/operators/:id`
- **Path**: `id` (string, `^op_[a-z0-9]+$`)
- **Body**: any subset of the create fields — all optional, only supplied keys are written. `code` is uppercased automatically.
- **Curl**:
  ```bash
  curl -X PATCH "$BASE/api/v1/operators/op_6d0e5071af696dfda8012a95" -H "Content-Type: application/json" -d '{"status":"INACTIVE"}'
  ```
- **Response** (`200`) — the updated operator, no `_count`:
  ```json
  { "data": { "id": "op_6d0e5071af696dfda8012a95", "name": "ABC Transport Plc", "code": "ABC", "headquarters": "Imo", "supportEmail": "support@abctransport.ng", "supportPhone": "+2348030000007", "status": "INACTIVE", "createdAt": "2026-09-01T04:30:00.000Z", "updatedAt": "2026-09-01T22:40:00.000Z" } }
  ```
- **Errors**: `400` (malformed `id` or unparseable JSON) · `404` · `422` (field-level validation failure) · `429` · `500` (also returned if the update would duplicate an existing `name` or `code`)

#### 5. List routes for an operator — `GET /api/v1/operators/:id/routes`
- **Path**: `id` (string, `^op_[a-z0-9]+$`) · **Query**: `limit` (int, 20, max 100) · `offset` (int, 0) · `sort` (`createdAt`\|`baseFareAmount`\|`distanceKm`\|`originCity`, default `createdAt`) · `order` (`asc`\|`desc`) · `status` (`ACTIVE`\|`SUSPENDED`) · `originState` (str, case-insensitive exact match) · `destinationState` (str, case-insensitive exact match)
- **Curl**: `curl -X GET "$BASE/api/v1/operators/op_6d0e5071af696dfda8012a95/routes?status=ACTIVE&sort=baseFareAmount&order=asc"`
- **Response** (`200`) — paginated routes. Unlike `GET /api/v1/routes`, the `operator` relation is **not** embedded, since the path already implies it.
  ```json
  { "data": [ { "id": "rot_700d704cc030b191fb6326c7", "operatorId": "op_6d0e5071af696dfda8012a95", "originState": "Lagos", "originCity": "Ajah Terminal", "destinationState": "Kaduna", "destinationCity": "Kaduna Central Park", "distanceKm": 752, "estimatedMinutes": 1192, "baseFareAmount": 1893700, "currency": "NGN", "status": "ACTIVE", "createdAt": "2026-09-01T21:10:00.000Z", "updatedAt": "2026-09-01T21:10:00.000Z" } ],
    "meta": { "total": 2, "limit": 20, "offset": 0, "hasMore": false } }
  ```
- **Errors**: `400` (malformed `id`, bad pagination/sort, invalid `status`) · `404` (operator does not exist) · `429` · `500`

### Routes API

#### 1. List routes — `GET /api/v1/routes`
- **Query**: `limit` (int, 20, max 100) · `offset` (int, 0) · `sort` (`createdAt`\|`baseFareAmount`\|`distanceKm`\|`originCity`, default `createdAt`) · `order` (`asc`\|`desc`) · `status` (`ACTIVE`\|`SUSPENDED`) · `operatorId` (str) · `originState` (str, case-insensitive exact match) · `destinationState` (str, case-insensitive exact match)
- **Curl**: `curl -X GET "$BASE/api/v1/routes?originState=Lagos&destinationState=FCT"`
- **Response** (`200`) — each route embeds `operator` as `{ id, name, code }`:
  ```json
  { "data": [ { "id": "rot_a9031cfd75bc16c78c42d0b8", "operatorId": "op_97ed372ee62590b27007c669", "originState": "Lagos", "originCity": "Jibowu Terminal", "destinationState": "FCT", "destinationCity": "Utako Central Park", "distanceKm": 545, "estimatedMinutes": 875, "baseFareAmount": 1821500, "currency": "NGN", "status": "ACTIVE", "createdAt": "2026-09-01T04:10:00.000Z", "updatedAt": "2026-09-01T04:10:00.000Z", "operator": { "id": "op_97ed372ee62590b27007c669", "name": "Young Shall Grow Motors", "code": "YSG" } } ],
    "meta": { "total": 12, "limit": 20, "offset": 0, "hasMore": false } }
  ```
- **Errors**: `400` (bad pagination/sort, invalid `status`) · `429` · `500`

#### 2. Create a route — `POST /api/v1/routes`
- **Body**: `operatorId` (str, required, must reference an existing operator) · `originState`, `originCity`, `destinationState`, `destinationCity` (str, required, min 2 each) · `distanceKm` (int, required, positive) · `estimatedMinutes` (int, required, positive) · `baseFareAmount` (int, required, kobo, non-negative) · `currency` (str, optional, default `"NGN"`) · `status` (enum, optional, default `ACTIVE`; `ACTIVE`\|`SUSPENDED`)
- **Curl**:
  ```bash
  curl -X POST "$BASE/api/v1/routes" -H "Content-Type: application/json" \
    -d '{"operatorId":"op_6d0e5071af696dfda8012a95","originState":"Lagos","originCity":"Jibowu Terminal","destinationState":"FCT","destinationCity":"Utako Central Park","distanceKm":750,"estimatedMinutes":540,"baseFareAmount":3500000}'
  ```
- **Response** (`201`):
  ```json
  { "data": { "id": "rot_4m8n2p9q7r3s5t1u6v8w2xayz", "operatorId": "op_6d0e5071af696dfda8012a95", "originState": "Lagos", "originCity": "Jibowu Terminal", "destinationState": "FCT", "destinationCity": "Utako Central Park", "distanceKm": 750, "estimatedMinutes": 540, "baseFareAmount": 3500000, "currency": "NGN", "status": "ACTIVE", "createdAt": "2026-09-25T21:00:00.000Z", "updatedAt": "2026-09-25T21:00:00.000Z", "operator": { "id": "op_6d0e5071af696dfda8012a95", "name": "ABC Transport Plc", "code": "ABC" } } }
  ```
- **Errors**: `400` (unparseable JSON) · `422` (missing required field, non-positive `distanceKm`/`estimatedMinutes`, negative `baseFareAmount`, unknown `operatorId`) · `429` · `500`

#### 3. Get route details — `GET /api/v1/routes/:id`
- **Path**: `id` (string, `^rot_[a-z0-9]+$`)
- **Curl**: `curl -X GET "$BASE/api/v1/routes/rot_a9031cfd75bc16c78c42d0b8"`
- **Response** (`200`) — the route plus a richer `operator` and schedule count:
  ```json
  { "data": { "id": "rot_a9031cfd75bc16c78c42d0b8", "operatorId": "op_97ed372ee62590b27007c669", "originState": "Lagos", "originCity": "Jibowu Terminal", "destinationState": "FCT", "destinationCity": "Utako Central Park", "distanceKm": 545, "estimatedMinutes": 875, "baseFareAmount": 1821500, "currency": "NGN", "status": "ACTIVE", "createdAt": "2026-09-01T04:10:00.000Z", "updatedAt": "2026-09-01T04:10:00.000Z", "operator": { "id": "op_97ed372ee62590b27007c669", "name": "Young Shall Grow Motors", "code": "YSG", "headquarters": "Lagos" }, "_count": { "schedules": 1 } } }
  ```
- **Errors**: `400` (malformed `id`) · `404` · `429` · `500`

#### 4. Update a route — `PATCH /api/v1/routes/:id`
- **Path**: `id` (string, `^rot_[a-z0-9]+$`)
- **Body**: any subset of the create fields — all optional, only supplied keys are written.
- **Curl**:
  ```bash
  curl -X PATCH "$BASE/api/v1/routes/rot_a9031cfd75bc16c78c42d0b8" -H "Content-Type: application/json" -d '{"baseFareAmount":3750000,"status":"SUSPENDED"}'
  ```
- **Response** (`200`) — the updated route with `operator` as `{ id, name, code }`, no `_count`:
  ```json
  { "data": { "id": "rot_a9031cfd75bc16c78c42d0b8", "operatorId": "op_97ed372ee62590b27007c669", "originState": "Lagos", "originCity": "Jibowu Terminal", "destinationState": "FCT", "destinationCity": "Utako Central Park", "distanceKm": 545, "estimatedMinutes": 875, "baseFareAmount": 3750000, "currency": "NGN", "status": "SUSPENDED", "createdAt": "2026-09-01T04:10:00.000Z", "updatedAt": "2026-09-01T22:15:00.000Z", "operator": { "id": "op_97ed372ee62590b27007c669", "name": "Young Shall Grow Motors", "code": "YSG" } } }
  ```
- **Errors**: `400` (malformed `id` or unparseable JSON) · `404` · `422` (field-level validation failure) · `429` · `500`

#### 5. List schedules for a route — `GET /api/v1/routes/:id/schedules`
- **Path**: `id` (string, `^rot_[a-z0-9]+$`) · **Query**: `limit` (int, 20, max 100) · `offset` (int, 0) · `sort` (`departureTime`\|`fareAmount`\|`availableSeats`\|`createdAt`, default `departureTime`) · `order` (`asc`\|`desc`) · `status` (`SCHEDULED`\|`BOARDING`\|`COMPLETED`\|`CANCELLED`) · `minAvailableSeats` (int, non-negative; only schedules with at least this many seats free)
- **Curl**: `curl -X GET "$BASE/api/v1/routes/rot_700d704cc030b191fb6326c7/schedules?minAvailableSeats=5&sort=departureTime"`
- **Response** (`200`) — each schedule embeds `operator` as `{ id, name, code }` and `route` as `{ id, originCity, destinationCity }`:
  ```json
  { "data": [ { "id": "sch_25e739c66439251e5d65ea2a", "routeId": "rot_700d704cc030b191fb6326c7", "operatorId": "op_6d0e5071af696dfda8012a95", "busRegistrationNumber": "YS-255-XZ", "busModel": "Mercedes-Benz Sprinter 18-Seater", "totalSeats": 18, "availableSeats": 17, "departureTime": "2026-10-31T16:00:00.000Z", "arrivalTime": "2026-11-01T11:52:00.000Z", "fareAmount": 1747600, "currency": "NGN", "status": "SCHEDULED", "createdAt": "2026-09-01T21:10:00.000Z", "updatedAt": "2026-09-01T21:10:00.000Z", "operator": { "id": "op_6d0e5071af696dfda8012a95", "name": "ABC Transport Plc", "code": "ABC" }, "route": { "id": "rot_700d704cc030b191fb6326c7", "originCity": "Ajah Terminal", "destinationCity": "Kaduna Central Park" } } ],
    "meta": { "total": 1, "limit": 20, "offset": 0, "hasMore": false } }
  ```
- **Errors**: `400` (malformed `id`, bad pagination/sort, invalid `status`, non-integer or negative `minAvailableSeats`) · `404` (route does not exist) · `429` · `500`

### Schedules API

#### 1. List schedules — `GET /api/v1/schedules`
- **Query**: `limit` (int, 20, max 100) · `offset` (int, 0) · `sort` (`departureTime`\|`fareAmount`\|`availableSeats`\|`createdAt`, default `departureTime`) · `order` (`asc`\|`desc`) · `status` (`SCHEDULED`\|`BOARDING`\|`COMPLETED`\|`CANCELLED`) · `routeId` (str) · `operatorId` (str) · `departureDate` (`YYYY-MM-DD`, matching that UTC calendar day) · `minAvailableSeats` (int, non-negative)
- **Curl**: `curl -X GET "$BASE/api/v1/schedules?minAvailableSeats=5&sort=departureTime"`
- **Response** (`200`) — each schedule embeds `operator` as `{ id, name, code }` and `route` as `{ id, originState, originCity, destinationState, destinationCity }`:
  ```json
  { "data": [ { "id": "sch_6b09dbe92295ab9a9dadfca7", "routeId": "rot_270f0897dc6adeeae10b1b27", "operatorId": "op_131dfd33d3b9daf68da8dcc3", "busRegistrationNumber": "GD-918-NZ", "busModel": "Mercedes-Benz Sprinter 18-Seater", "totalSeats": 18, "availableSeats": 16, "departureTime": "2026-10-05T04:00:00.000Z", "arrivalTime": "2026-10-05T17:49:00.000Z", "fareAmount": 1625100, "currency": "NGN", "status": "SCHEDULED", "createdAt": "2026-09-01T04:00:00.000Z", "updatedAt": "2026-09-01T04:00:00.000Z", "operator": { "id": "op_131dfd33d3b9daf68da8dcc3", "name": "Peace Mass Transit", "code": "PMT" }, "route": { "id": "rot_270f0897dc6adeeae10b1b27", "originState": "Lagos", "originCity": "Jibowu Terminal", "destinationState": "Lagos", "destinationCity": "Ajah Terminal" } } ],
    "meta": { "total": 300, "limit": 20, "offset": 0, "hasMore": true } }
  ```
- **Errors**: `400` (bad pagination/sort, invalid `status` or `departureDate` format, non-integer or negative `minAvailableSeats`) · `429` · `500`

#### 2. Create a schedule — `POST /api/v1/schedules`
- **Body**: `routeId` (str, required, existing route) · `operatorId` (str, required, existing operator) · `busRegistrationNumber` (str, required, min 3) · `busModel` (str, required, min 2) · `totalSeats` (int, required, positive) · `availableSeats` (int, optional, non-negative, defaults to `totalSeats`) · `departureTime`, `arrivalTime` (str, required, ISO-8601 datetime) · `fareAmount` (int, required, kobo, non-negative) · `currency` (str, optional, default `"NGN"`) · `status` (enum, optional, default `SCHEDULED`; `SCHEDULED`\|`BOARDING`\|`COMPLETED`\|`CANCELLED`)
- **Curl**:
  ```bash
  curl -X POST "$BASE/api/v1/schedules" -H "Content-Type: application/json" \
    -d '{"routeId":"rot_a9031cfd75bc16c78c42d0b8","operatorId":"op_97ed372ee62590b27007c669","busRegistrationNumber":"YS-255-XZ","busModel":"Mercedes-Benz Sprinter 18-Seater","totalSeats":18,"departureTime":"2026-11-05T07:00:00.000Z","arrivalTime":"2026-11-05T21:35:00.000Z","fareAmount":3500000}'
  ```
- **Response** (`201`) — `route` embedded as `{ id, originCity, destinationCity }`:
  ```json
  { "data": { "id": "sch_4m8n2p9q7r3s5t1u6v8w2xayz", "routeId": "rot_a9031cfd75bc16c78c42d0b8", "operatorId": "op_97ed372ee62590b27007c669", "busRegistrationNumber": "YS-255-XZ", "busModel": "Mercedes-Benz Sprinter 18-Seater", "totalSeats": 18, "availableSeats": 18, "departureTime": "2026-11-05T07:00:00.000Z", "arrivalTime": "2026-11-05T21:35:00.000Z", "fareAmount": 3500000, "currency": "NGN", "status": "SCHEDULED", "createdAt": "2026-09-25T21:00:00.000Z", "updatedAt": "2026-09-25T21:00:00.000Z", "operator": { "id": "op_97ed372ee62590b27007c669", "name": "Young Shall Grow Motors", "code": "YSG" }, "route": { "id": "rot_a9031cfd75bc16c78c42d0b8", "originCity": "Jibowu Terminal", "destinationCity": "Utako Central Park" } } }
  ```
- **Errors**: `400` (unparseable JSON) · `422` (missing required field, non-positive `totalSeats`, invalid ISO-8601 datetime, unknown `routeId` or `operatorId`) · `429` · `500`

#### 3. Get schedule details — `GET /api/v1/schedules/:id`
- **Path**: `id` (string, `^sch_[a-z0-9]+$`)
- **Curl**: `curl -X GET "$BASE/api/v1/schedules/sch_6b09dbe92295ab9a9dadfca7"`
- **Response** (`200`) — the schedule plus a richer `operator`/`route` and a booking count:
  ```json
  { "data": { "id": "sch_6b09dbe92295ab9a9dadfca7", "routeId": "rot_270f0897dc6adeeae10b1b27", "operatorId": "op_131dfd33d3b9daf68da8dcc3", "busRegistrationNumber": "GD-918-NZ", "busModel": "Mercedes-Benz Sprinter 18-Seater", "totalSeats": 18, "availableSeats": 16, "departureTime": "2026-10-05T04:00:00.000Z", "arrivalTime": "2026-10-05T17:49:00.000Z", "fareAmount": 1625100, "currency": "NGN", "status": "SCHEDULED", "createdAt": "2026-09-01T04:00:00.000Z", "updatedAt": "2026-09-01T04:00:00.000Z", "operator": { "id": "op_131dfd33d3b9daf68da8dcc3", "name": "Peace Mass Transit", "code": "PMT", "supportPhone": "+2348030000001" }, "route": { "id": "rot_270f0897dc6adeeae10b1b27", "originState": "Lagos", "originCity": "Jibowu Terminal", "destinationState": "Lagos", "destinationCity": "Ajah Terminal", "distanceKm": 504 }, "_count": { "bookings": 2 } } }
  ```
- **Errors**: `400` (malformed `id`) · `404` · `429` · `500`

#### 4. Update a schedule — `PATCH /api/v1/schedules/:id`
- **Path**: `id` (string, `^sch_[a-z0-9]+$`)
- **Body**: any subset of the create fields — all optional, only supplied keys are written. `departureTime` and `arrivalTime` must be valid ISO-8601 datetimes when supplied.
- **Curl**:
  ```bash
  curl -X PATCH "$BASE/api/v1/schedules/sch_6b09dbe92295ab9a9dadfca7" -H "Content-Type: application/json" -d '{"status":"BOARDING","departureTime":"2026-10-05T04:15:00.000Z"}'
  ```
- **Response** (`200`) — the updated schedule with `route` as `{ id, originCity, destinationCity }`, no `_count`:
  ```json
  { "data": { "id": "sch_6b09dbe92295ab9a9dadfca7", "routeId": "rot_270f0897dc6adeeae10b1b27", "operatorId": "op_131dfd33d3b9daf68da8dcc3", "busRegistrationNumber": "GD-918-NZ", "busModel": "Mercedes-Benz Sprinter 18-Seater", "totalSeats": 18, "availableSeats": 16, "departureTime": "2026-10-05T04:15:00.000Z", "arrivalTime": "2026-10-05T17:49:00.000Z", "fareAmount": 1625100, "currency": "NGN", "status": "BOARDING", "createdAt": "2026-09-01T04:00:00.000Z", "updatedAt": "2026-09-01T22:05:00.000Z", "operator": { "id": "op_131dfd33d3b9daf68da8dcc3", "name": "Peace Mass Transit", "code": "PMT" }, "route": { "id": "rot_270f0897dc6adeeae10b1b27", "originCity": "Jibowu Terminal", "destinationCity": "Ajah Terminal" } } }
  ```
- **Errors**: `400` (malformed `id` or unparseable JSON) · `404` · `422` (field-level validation failure, including invalid ISO-8601 datetimes) · `429` · `500`

### Bookings API

#### 1. List bookings — `GET /api/v1/bookings`
- **Query**: `limit` (int, 20, max 100) · `offset` (int, 0) · `sort` (`createdAt`\|`seatNumber`\|`totalAmount`, default `createdAt`) · `order` (`asc`\|`desc`) · `status` (`CONFIRMED`\|`CANCELLED`) · `scheduleId` (str) · `search` (case-insensitive match on `passengerName`, `passengerPhone`, or `bookingReference`)
- **Curl**: `curl -X GET "$BASE/api/v1/bookings?status=CONFIRMED&search=Claude&sort=createdAt&order=desc"`
- **Response** (`200`) — each booking embeds `schedule` as `{ id, departureTime, busModel, operator: { name, code }, route: { originCity, destinationCity } }`:
  ```json
  { "data": [ { "id": "bkg_00ac512663e0edcafa77b05e", "scheduleId": "sch_6b09dbe92295ab9a9dadfca7", "passengerName": "Claude Keebler", "passengerPhone": "+2348055780718", "passengerEmail": "kane.haley@yahoo.com", "seatNumber": 1, "totalAmount": 1625100, "currency": "NGN", "bookingReference": "NG-BUS-100000", "status": "CONFIRMED", "createdAt": "2026-09-01T04:00:00.000Z", "updatedAt": "2026-09-01T04:00:00.000Z", "schedule": { "id": "sch_6b09dbe92295ab9a9dadfca7", "departureTime": "2026-10-05T04:00:00.000Z", "busModel": "Mercedes-Benz Sprinter 18-Seater", "operator": { "name": "Peace Mass Transit", "code": "PMT" }, "route": { "originCity": "Jibowu Terminal", "destinationCity": "Ajah Terminal" } } } ],
    "meta": { "total": 1, "limit": 20, "offset": 0, "hasMore": false } }
  ```
- **Errors**: `400` (bad pagination/sort, invalid `status`) · `429` · `500`

#### 2. Create a booking (atomic seat allocation) — `POST /api/v1/bookings`
- **Body**: `scheduleId` (str, required, must reference an existing schedule with seats available) · `passengerName` (str, required, min 2) · `passengerPhone` (str, required, min 5) · `passengerEmail` (str, required, valid email) · `seatNumber` (int, optional, positive; auto-allocated as `totalSeats - availableSeats + 1` when omitted)
- **Seat allocation semantics** — the availability check, the `availableSeats` decrement, and the insert run inside a single Prisma `$transaction`, so a failed allocation never leaves a partially decremented schedule. `totalAmount` is copied from the schedule's `fareAmount`, `currency` is always `"NGN"`, `bookingReference` is server-generated as `NG-BUS-<6 digits>`, and the booking is created `CONFIRMED`.
- **Curl**:
  ```bash
  curl -X POST "$BASE/api/v1/bookings" -H "Content-Type: application/json" \
    -d '{"scheduleId":"sch_6b09dbe92295ab9a9dadfca7","passengerName":"Emeka Chukwu","passengerPhone":"+2348021234567","passengerEmail":"emeka.chukwu@example.ng"}'
  ```
- **Response** (`201`) — seats `1` and `2` of this schedule are already taken by the seed data, so the next allocation is `18 - 16 + 1 = 3`:
  ```json
  { "data": { "id": "bkg_4m8n2p9q7r3s5t1u6v8w2xayz", "scheduleId": "sch_6b09dbe92295ab9a9dadfca7", "passengerName": "Emeka Chukwu", "passengerPhone": "+2348021234567", "passengerEmail": "emeka.chukwu@example.ng", "seatNumber": 3, "totalAmount": 1625100, "currency": "NGN", "bookingReference": "NG-BUS-742318", "status": "CONFIRMED", "createdAt": "2026-09-01T04:00:00.000Z", "updatedAt": "2026-09-01T04:00:00.000Z", "schedule": { "id": "sch_6b09dbe92295ab9a9dadfca7", "departureTime": "2026-10-05T04:00:00.000Z", "busModel": "Mercedes-Benz Sprinter 18-Seater", "operator": { "name": "Peace Mass Transit", "code": "PMT" }, "route": { "originCity": "Jibowu Terminal", "destinationCity": "Ajah Terminal" } } } }
  ```
- **Errors**: `400` (unparseable JSON) · `422` (missing/short `passengerName`, short `passengerPhone`, non-email `passengerEmail`, unknown `scheduleId`, no available seats, or a `seatNumber` exceeding bus capacity) · `429` · `500`

#### 3. Get booking details — `GET /api/v1/bookings/:id`
- **Path**: `id` (string, `^bkg_[a-z0-9]+$`)
- **Curl**: `curl -X GET "$BASE/api/v1/bookings/bkg_00ac512663e0edcafa77b05e"`
- **Response** (`200`) — the full booking with a richer `schedule` that also carries `busRegistrationNumber`, `operator.supportPhone`, and the route's state fields:
  ```json
  { "data": { "id": "bkg_00ac512663e0edcafa77b05e", "scheduleId": "sch_6b09dbe92295ab9a9dadfca7", "passengerName": "Claude Keebler", "passengerPhone": "+2348055780718", "passengerEmail": "kane.haley@yahoo.com", "seatNumber": 1, "totalAmount": 1625100, "currency": "NGN", "bookingReference": "NG-BUS-100000", "status": "CONFIRMED", "createdAt": "2026-09-01T04:00:00.000Z", "updatedAt": "2026-09-01T04:00:00.000Z", "schedule": { "id": "sch_6b09dbe92295ab9a9dadfca7", "departureTime": "2026-10-05T04:00:00.000Z", "busRegistrationNumber": "GD-918-NZ", "busModel": "Mercedes-Benz Sprinter 18-Seater", "operator": { "id": "op_131dfd33d3b9daf68da8dcc3", "name": "Peace Mass Transit", "code": "PMT", "supportPhone": "+2348030000001" }, "route": { "originState": "Lagos", "originCity": "Jibowu Terminal", "destinationState": "Lagos", "destinationCity": "Ajah Terminal" } } } }
  ```
- **Errors**: `400` (malformed `id`) · `404` · `429` · `500`

#### 4. Update or cancel a booking — `PATCH /api/v1/bookings/:id`
- **Path**: `id` (string, `^bkg_[a-z0-9]+$`)
- **Body**: any subset of — `status` (enum, `CONFIRMED`\|`CANCELLED`) · `passengerName` (str, min 2) · `passengerPhone` (str, min 5) · `passengerEmail` (str, valid email)
- **Cancellation semantics** — the update runs inside a Prisma `$transaction`. A `CONFIRMED` → `CANCELLED` transition returns the seat by incrementing the schedule's `availableSeats` by 1 in the same transaction. A `CANCELLED` → `CONFIRMED` transition does *not* re-decrement, and re-cancelling an already-cancelled booking is a no-op for seat counts.
- **Curl**:
  ```bash
  curl -X PATCH "$BASE/api/v1/bookings/bkg_00ac512663e0edcafa77b05e" -H "Content-Type: application/json" -d '{"status":"CANCELLED"}'
  ```
- **Response** (`200`) — the updated booking, `schedule` embedded as `{ id, departureTime, operator: { name, code }, route: { originCity, destinationCity } }`:
  ```json
  { "data": { "id": "bkg_00ac512663e0edcafa77b05e", "scheduleId": "sch_6b09dbe92295ab9a9dadfca7", "passengerName": "Claude Keebler", "passengerPhone": "+2348055780718", "passengerEmail": "kane.haley@yahoo.com", "seatNumber": 1, "totalAmount": 1625100, "currency": "NGN", "bookingReference": "NG-BUS-100000", "status": "CANCELLED", "createdAt": "2026-09-01T04:00:00.000Z", "updatedAt": "2026-09-01T23:10:00.000Z", "schedule": { "id": "sch_6b09dbe92295ab9a9dadfca7", "departureTime": "2026-10-05T04:00:00.000Z", "operator": { "name": "Peace Mass Transit", "code": "PMT" }, "route": { "originCity": "Jibowu Terminal", "destinationCity": "Ajah Terminal" } } } }
  ```
- **Errors**: `400` (malformed `id` or unparseable JSON) · `404` · `422` (field-level validation failure, e.g. an invalid `status`) · `429` · `500`

---

## 5. Rate Limiting & Error Handling

### Rate Limiting

- **Threshold** — 100 requests per minute per IP address, enforced by middleware on all `/api/*` paths.
- **Store** — shared Upstash Redis via `@upstash/ratelimit`, using a **sliding window** of `100` requests per `60 s`.
- **Client key** — the first `x-forwarded-for` entry, falling back to `x-real-ip`, then `127.0.0.1`.
- **Degraded-mode caveat** — if `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are missing or empty (e.g. offline local development), the limiter falls back to an **in-memory fixed window** anchored at an IP's first request. That fallback is *not* sliding, so a client can briefly exceed 100 at a window boundary, and it is per-process, so it does not coordinate counts across multiple serverless instances.
- **Headers** — `X-RateLimit-Limit` (per-window maximum, `100`) and `X-RateLimit-Remaining` (quota left) are returned on every `/api/*` response; a breach adds `Retry-After` (seconds to wait) to the `429`.

### Error Envelope

Every failure returns the same shape, whatever the endpoint:

```json
{ "error": { "code": "BAD_REQUEST", "message": "Invalid sort field 'invalid_sort'. Allowed fields: [createdAt, name, code]" } }
```

| HTTP status | `error.code` | Cause |
| :--- | :--- | :--- |
| `400 Bad Request` | `BAD_REQUEST` | Query parameter validation, unlisted `sort` field, negative `offset`, malformed ID, unparseable JSON body |
| `404 Not Found` | `NOT_FOUND` | Resource or endpoint does not exist |
| `405 Method Not Allowed` | `METHOD_NOT_ALLOWED` | Unsupported method on an existing route (returned with an `Allow` header) |
| `422 Unprocessable Entity` | `UNPROCESSABLE_ENTITY` | Request **body** validation failure (missing required field, wrong type, no seats, unknown foreign key) |
| `429 Too Many Requests` | `TOO_MANY_REQUESTS` | Rate limit threshold exceeded (returned with `Retry-After`) |
| `500 Internal Server Error` | `INTERNAL_SERVER_ERROR` | Unhandled internal error |
