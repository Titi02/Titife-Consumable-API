# Titife Consumable API — Nigerian Intercity Bus Transport API

RESTful Web API for Nigerian intercity bus transport, built with **Next.js (App Router)**, **TypeScript**, **Prisma**, and **PostgreSQL**. All endpoints are versioned under `/api/v1`; there are no unversioned aliases and no `/v2` routes.

- [1. Setup](#1-setup)
- [2. Design Decisions](#2-design-decisions)
- [3. Resource Specifications](#3-resource-specifications)
- [4. API Endpoint Documentation](#4-api-endpoint-documentation)
- [5. Rate Limiting & Error Handling](#5-rate-limiting--error-handling)

---

## 1. Setup

### Deployment Status

- **Deployment URL**: Not deployed yet.
- **Public API base URL**: Not available until deployed (expected form `<deployment-url>/api/v1`).
- **Consumer web app**: Not available until deployed (expected form `<deployment-url>/`).

Once deployed, set the values above and point `NEXT_PUBLIC_API_BASE_URL` at the API origin. Every `curl` example below uses `$BASE`, so set it once per shell:

```bash
export BASE="<deployment-url>"
```

### Environment Variables (`.env`)

```bash
# Pooled connection string for serverless API routes
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/titife_dev?pgbouncer=true&schema=public"

# Direct connection string for Prisma migrations & seeding
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/titife_dev?schema=public"

# Upstash Redis credentials for shared IP rate limiting (optional in dev; in-memory fallback if omitted)
UPSTASH_REDIS_REST_URL="https://your-upstash-redis.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your_upstash_redis_token"

# API origin for the consumer client (origin only, no trailing /api/v1 or slash)
NEXT_PUBLIC_API_BASE_URL="http://localhost:3000"
```

### Local Installation & Execution

```bash
npm install       # install dependencies
npx prisma db push # push Prisma schema to the local database
npm run db:seed   # seed with the deterministic Faker dataset
npm run dev       # start the Next.js development server
```

### Consumer App Configuration

The bundled consumer web app (`src/app/page.tsx`) never hardcodes a host. It reads the origin at runtime and appends the versioned path itself:

```ts
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const url = `${apiBaseUrl}/api/v1/${activeTab}?${params.toString()}`;
```

- If set, requests go to that origin, so the consumer can target local, staging, or production without code changes.
- If unset or empty, requests resolve against the **same origin** the consumer is served from — the default local-development behaviour, requiring no configuration.
- The value must be the **origin only** (scheme, host, optional port): no trailing `/api/v1` and no trailing slash.
- `NEXT_PUBLIC_*` values are inlined at build time, so changing this requires a **rebuild**, not just a restart.

---

## 2. Design Decisions

### Why These Resources?

The API models the core logistics domain of Nigerian intercity road transport:

1. **`Operators`** — bus transport companies operating terminals and fleets across Nigeria.
2. **`Routes`** — city-to-city travel corridors connecting origin and destination states.
3. **`Schedules`** — specific scheduled bus runs assigned to a route and vehicle, with seat capacity and departure times.
4. **`Bookings`** — passenger ticket reservations tied to a schedule with seat allocations.

### Why Generated String Identifiers over Sequential Integers?

All primary keys are non-sequential CUID2 strings prefixed by entity type (`op_`, `rot_`, `sch_`, `bkg_`).

- **Security**: prevents sequential ID harvesting and enumeration attacks.
- **Developer experience**: the prefix immediately conveys entity type in logs and external requests.
- **Safety**: malformed IDs are caught by path-parameter validators, returning an explicit `400 Bad Request` instead of a database cast failure (`500`).

### Why Offset Pagination over Cursor Pagination?

Offset pagination (`limit` & `offset`) allows jump-to-page navigation and explicit metadata (`total`, `limit`, `offset`, `hasMore`). It suits administrative list views and the bundled consumer app, where users filter by state, status, or date range while viewing total record counts, and where datasets are bounded well inside the range where offset's degradation becomes material.

The trade-offs accepted in exchange:

- **Deep-page scan cost**: `offset` is positional, so the database walks and discards `offset` rows before returning the page. Cost grows linearly with depth; the `limit` cap of 100 bounds page size but not skip depth. Cursor pagination seeks on an indexed sort key at roughly constant cost.
- **Unstable pages under concurrent writes**: rows are addressed by position, not value, so an insert or delete between two page requests shifts every later row. A client walking pages can see a record twice or miss it entirely. Keyset pagination is immune, since each page anchors on the last seen sort key.
- **Aggregate cost of `meta.total`**: reporting `total` and `hasMore` requires a second `COUNT(*)` on every list request, frequently more expensive than fetching the page itself.
- **What cursor pagination would cost instead**: it forfeits random access (no "jump to page 40"), forces clients to carry and decode an opaque cursor token, and still cannot report a total row count without the same `COUNT(*)`.

Every list endpoint exposes `limit` and `offset` explicitly so clients page deliberately rather than by accident.

### Why Standardized Response Envelopes?

- **Predictability**: clients always receive `{ "data": [...], "meta": { ... } }` on success and `{ "error": { "code": "...", "message": "..." } }` on failure.
- **Framework error interception**: unmatched routes and unsupported HTTP methods are caught before the Next.js default HTML `404`/text `405` responses can be returned, guaranteeing JSON payloads.

---

## 3. Resource Specifications

### Currency Convention

All monetary amounts (`baseFareAmount`, `fareAmount`, `totalAmount`) are strictly stored as **integers in minor units (NGN kobo)** with an explicit `currency: "NGN"` field — ₦25,000.00 is stored as `2500000`. Floats are never used for monetary values.

### Resource Models

| Resource | Field | Type | Constraints / Details |
| :--- | :--- | :--- | :--- |
| **Operator** | `id` | String | Primary Key, `op_` prefix |
| | `name` | String | Unique commercial name |
| | `code` | String | Unique uppercase ticker (e.g. `PMT`) |
| | `headquarters` | String | Primary operational hub city |
| | `status` | Enum | `ACTIVE`, `INACTIVE` |
| **Route** | `id` | String | Primary Key, `rot_` prefix |
| | `operatorId` | String | Foreign Key -> `Operator.id` |
| | `originState` / `originCity` | String | Departure origin location |
| | `destinationState` / `destinationCity` | String | Destination location |
| | `baseFareAmount` | Int | Ticket price in NGN kobo |
| | `status` | Enum | `ACTIVE`, `SUSPENDED` |
| **Schedule** | `id` | String | Primary Key, `sch_` prefix |
| | `routeId` / `operatorId` | String | Foreign Keys |
| | `busRegistrationNumber` | String | Licence plate number |
| | `totalSeats` / `availableSeats` | Int | Seat capacity & remaining count |
| | `departureTime` / `arrivalTime` | DateTime | ISO-8601 timestamps |
| | `fareAmount` | Int | Scheduled trip fare in NGN kobo |
| | `status` | Enum | `SCHEDULED`, `BOARDING`, `COMPLETED`, `CANCELLED` |
| **Booking** | `id` | String | Primary Key, `bkg_` prefix |
| | `scheduleId` | String | Foreign Key -> `Schedule.id` |
| | `passengerName` / `passengerPhone` | String | Passenger contact details |
| | `seatNumber` | Int | Allocated seat number |
| | `totalAmount` | Int | Total paid in NGN kobo |
| | `bookingReference` | String | Unique code (e.g. `NG-BUS-123456`) |
| | `status` | Enum | `CONFIRMED`, `CANCELLED` |

---

## 4. API Endpoint Documentation

### Endpoint Summary

| Method | Path | Purpose | Methods Allowed On Route |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/operators` | List operators | `GET`, `POST` |
| `POST` | `/api/v1/operators` | Create an operator | `GET`, `POST` |
| `GET` | `/api/v1/operators/:id` | Operator detail | `GET`, `PATCH` |
| `PATCH` | `/api/v1/operators/:id` | Update an operator | `GET`, `PATCH` |
| `GET` | `/api/v1/operators/:id/routes` | List routes for an operator | `GET` |
| `GET` | `/api/v1/routes` | List routes | `GET`, `POST` |
| `POST` | `/api/v1/routes` | Create a route | `GET`, `POST` |
| `GET` | `/api/v1/routes/:id` | Route detail | `GET`, `PATCH` |
| `PATCH` | `/api/v1/routes/:id` | Update a route | `GET`, `PATCH` |
| `GET` | `/api/v1/routes/:id/schedules` | List schedules for a route | `GET` |
| `GET` | `/api/v1/schedules` | List schedules | `GET`, `POST` |
| `POST` | `/api/v1/schedules` | Create a schedule | `GET`, `POST` |
| `GET` | `/api/v1/schedules/:id` | Schedule detail | `GET`, `PATCH` |
| `PATCH` | `/api/v1/schedules/:id` | Update a schedule | `GET`, `PATCH` |
| `GET` | `/api/v1/bookings` | List bookings | `GET`, `POST` |
| `POST` | `/api/v1/bookings` | Create a booking (atomic seat allocation) | `GET`, `POST` |
| `GET` | `/api/v1/bookings/:id` | Booking detail | `GET`, `PATCH` |
| `PATCH` | `/api/v1/bookings/:id` | Update a booking, including cancellation | `GET`, `PATCH` |

### Global Conventions

- **Pagination**: `limit` defaults to `20` and is capped at `100`; values above `100` are clamped to `100`. A non-integer or `limit <= 0` returns `400 Bad Request`. `offset` defaults to `0`; a negative or non-integer value returns `400 Bad Request`.
- **Sorting**: `sort` and `order` are whitelisted per resource. An unrecognized sort field returns `400 Bad Request` listing the valid fields. `order` defaults to `asc`; any value other than `asc`/`desc` returns `400 Bad Request`.
- **Path parameters**: `:id` is validated against the entity prefix before any database access. A malformed ID returns `400 Bad Request` (never a `500` from a failed cast); a well-formed but unknown ID returns `404 Not Found`.

| Resource | Expected Pattern | Example |
| :--- | :--- | :--- |
| Operator | `^op_[a-z0-9]+$` | `op_6d0e5071af696dfda8012a95` |
| Route | `^rot_[a-z0-9]+$` | `rot_a9031cfd75bc16c78c42d0b8` |
| Schedule | `^sch_[a-z0-9]+$` | `sch_6b09dbe92295ab9a9dadfca7` |
| Booking | `^bkg_[a-z0-9]+$` | `bkg_00ac512663e0edcafa77b05e` |

- **Framework error interception**: any unmatched path under `/api` is caught by a catch-all route returning `404 Not Found` with the standard error envelope for every HTTP method — JSON, never an HTML framework page. Any method not listed in the "Methods Allowed On Route" column returns `405 Method Not Allowed`, the standard error envelope, and an `Allow` header enumerating the permitted methods.
- **Rate limiting** applies to all `/api/*` paths via middleware — see [Section 5](#5-rate-limiting--error-handling).

---

### Operators API

#### 1. List Operators — `GET /api/v1/operators`

- **Query**: `limit` (int, default 20, max 100) · `offset` (int, default 0) · `sort` (`createdAt`, `name`, `code`) · `order` (`asc`, `desc`) · `status` (`ACTIVE`, `INACTIVE`) · `search` (case-insensitive match on `name` or `headquarters`)
- **Curl**:
  ```bash
  curl -X GET "$BASE/api/v1/operators?limit=2&sort=name&order=asc"
  ```
- **Response**:
  ```json
  {
    "data": [
      {
        "id": "op_6d0e5071af696dfda8012a95", "name": "ABC Transport Plc", "code": "ABC", "headquarters": "Imo",
        "supportEmail": "support@abctransport.ng", "supportPhone": "+2348030000007", "status": "ACTIVE",
        "createdAt": "2026-09-01T04:30:00.000Z", "updatedAt": "2026-09-01T04:30:00.000Z"
      },
      {
        "id": "op_3a207e7eb2330a147cd932ac", "name": "Abshire Group (NTL-0064)", "code": "NTL-0064", "headquarters": "FCT",
        "supportEmail": "ops.ntl0064@example.com", "supportPhone": "+2348000578087", "status": "ACTIVE",
        "createdAt": "2026-09-01T10:05:00.000Z", "updatedAt": "2026-09-01T10:05:00.000Z"
      }
    ],
    "meta": { "total": 200, "limit": 2, "offset": 0, "hasMore": true }
  }
  ```
- **Errors**: `400` (bad pagination/sort, invalid `status`), `429`, `500`.

#### 2. Create Operator — `POST /api/v1/operators`

- **Body**: `name` (string, required, min 2) · `code` (string, required, 2–10 chars, uppercased) · `headquarters` (string, required, min 2) · `supportEmail` (string, required, valid email) · `supportPhone` (string, required, min 5) · `status` (enum, optional, defaults to `ACTIVE`; `ACTIVE`, `INACTIVE`)
  ```json
  {
    "name": "Eagle Line Express", "code": "ELE", "headquarters": "Benin City",
    "supportEmail": "contact@eagleline.ng", "supportPhone": "+2348039998877"
  }
  ```
- **Curl**:
  ```bash
  curl -X POST "$BASE/api/v1/operators" \
    -H "Content-Type: application/json" \
    -d '{"name":"Eagle Line Express","code":"ELE","headquarters":"Benin City","supportEmail":"contact@eagleline.ng","supportPhone":"+2348039998877"}'
  ```
- **Response (`201 Created`)**:
  ```json
  {
    "data": {
      "id": "op_4m8n2p9q7r3s5t1u6v8w2xayz", "name": "Eagle Line Express", "code": "ELE", "headquarters": "Benin City",
      "supportEmail": "contact@eagleline.ng", "supportPhone": "+2348039998877", "status": "ACTIVE",
      "createdAt": "2026-09-25T21:00:00.000Z", "updatedAt": "2026-09-25T21:00:00.000Z"
    }
  }
  ```
- **Errors**: `422` (missing/short `name`, non-email `supportEmail`, `code` outside 2–10 chars, duplicate `name` or `code`), `429`, `500`.

#### 3. Get Operator Details — `GET /api/v1/operators/:id`

- **Path**: `id` (string, pattern `^op_[a-z0-9]+$`)
- **Curl**:
  ```bash
  curl -X GET "$BASE/api/v1/operators/op_6d0e5071af696dfda8012a95"
  ```
- **Response**: the operator object from endpoint 2, plus a relation count object.
  ```json
  {
    "data": {
      "id": "op_6d0e5071af696dfda8012a95", "name": "ABC Transport Plc", "code": "ABC", "headquarters": "Imo",
      "supportEmail": "support@abctransport.ng", "supportPhone": "+2348030000007", "status": "ACTIVE",
      "createdAt": "2026-09-01T04:30:00.000Z", "updatedAt": "2026-09-01T04:30:00.000Z",
      "_count": { "routes": 2, "schedules": 2 }
    }
  }
  ```
- **Errors**: `400` (malformed `id`), `404` (unknown but well-formed `id`), `429`, `500`.

#### 4. Update Operator — `PATCH /api/v1/operators/:id`

- **Path**: `id` (string, pattern `^op_[a-z0-9]+$`)
- **Body**: all fields optional; only supplied keys are updated. `code` is uppercased automatically.
  - `name` (string, min 2, must remain unique) · `code` (string, 2–10 chars, uppercased, must remain unique) · `headquarters` (string, min 2) · `supportEmail` (string, valid email) · `supportPhone` (string, min 5) · `status` (enum, `ACTIVE`, `INACTIVE`)
- **Curl**:
  ```bash
  curl -X PATCH "$BASE/api/v1/operators/op_6d0e5071af696dfda8012a95" \
    -H "Content-Type: application/json" \
    -d '{"status":"INACTIVE"}'
  ```
- **Response (`200 OK`)**: the updated operator object, with no `_count`.
  ```json
  {
    "data": {
      "id": "op_6d0e5071af696dfda8012a95", "name": "ABC Transport Plc", "code": "ABC", "headquarters": "Imo",
      "supportEmail": "support@abctransport.ng", "supportPhone": "+2348030000007", "status": "INACTIVE",
      "createdAt": "2026-09-01T04:30:00.000Z", "updatedAt": "2026-09-01T22:40:00.000Z"
    }
  }
  ```
- **Errors**: `400` (malformed `id` or unparseable JSON body), `404`, `422` (field-level validation failure, or unique constraint violation on `name`/`code`), `429`, `500`.

#### 5. List Routes for an Operator — `GET /api/v1/operators/:id/routes`

- **Path**: `id` (string, pattern `^op_[a-z0-9]+$`)
- **Query**: `limit` (int, default 20, max 100) · `offset` (int, default 0) · `sort` (`createdAt`, `baseFareAmount`, `distanceKm`, `originCity`) · `order` (`asc`, `desc`) · `status` (`ACTIVE`, `SUSPENDED`) · `originState` (string, case-insensitive exact match) · `destinationState` (string, case-insensitive exact match)
- **Curl**:
  ```bash
  curl -X GET "$BASE/api/v1/operators/op_6d0e5071af696dfda8012a95/routes?status=ACTIVE&sort=baseFareAmount&order=asc"
  ```
- **Response**: paginated array of route objects. Unlike `GET /api/v1/routes`, this sub-resource does not embed the `operator` relation, since the operator is already implied by the path.
  ```json
  {
    "data": [
      {
        "id": "rot_700d704cc030b191fb6326c7", "operatorId": "op_6d0e5071af696dfda8012a95",
        "originState": "Lagos", "originCity": "Ajah Terminal",
        "destinationState": "Kaduna", "destinationCity": "Kaduna Central Park",
        "distanceKm": 752, "estimatedMinutes": 1192, "baseFareAmount": 1893700, "currency": "NGN", "status": "ACTIVE",
        "createdAt": "2026-09-01T21:10:00.000Z", "updatedAt": "2026-09-01T21:10:00.000Z"
      },
      {
        "id": "rot_714ffa5b062362ba2733397c", "operatorId": "op_6d0e5071af696dfda8012a95",
        "originState": "Lagos", "originCity": "Jibowu Terminal",
        "destinationState": "Anambra", "destinationCity": "Awka Terminal",
        "distanceKm": 219, "estimatedMinutes": 412, "baseFareAmount": 3280800, "currency": "NGN", "status": "ACTIVE",
        "createdAt": "2026-09-01T04:30:00.000Z", "updatedAt": "2026-09-01T04:30:00.000Z"
      }
    ],
    "meta": { "total": 2, "limit": 20, "offset": 0, "hasMore": false }
  }
  ```
- **Errors**: `400` (malformed `id`, bad pagination/sort, invalid `status`), `404` (operator does not exist), `429`, `500`.

---

### Routes API

#### 1. List Routes — `GET /api/v1/routes`

- **Query**: `limit` (int, default 20, max 100) · `offset` (int, default 0) · `sort` (`createdAt`, `baseFareAmount`, `distanceKm`, `originCity`) · `order` (`asc`, `desc`) · `status` (`ACTIVE`, `SUSPENDED`) · `operatorId` (string) · `originState` (string, case-insensitive exact match) · `destinationState` (string, case-insensitive exact match)
- **Curl**:
  ```bash
  curl -X GET "$BASE/api/v1/routes?originState=Lagos&destinationState=FCT"
  ```
- **Response**: paginated array of route objects, each embedding `operator` as `{ id, name, code }`.
  ```json
  {
    "data": [
      {
        "id": "rot_a9031cfd75bc16c78c42d0b8", "operatorId": "op_97ed372ee62590b27007c669",
        "originState": "Lagos", "originCity": "Jibowu Terminal",
        "destinationState": "FCT", "destinationCity": "Utako Central Park",
        "distanceKm": 545, "estimatedMinutes": 875, "baseFareAmount": 1821500, "currency": "NGN", "status": "ACTIVE",
        "createdAt": "2026-09-01T04:10:00.000Z", "updatedAt": "2026-09-01T04:10:00.000Z",
        "operator": { "id": "op_97ed372ee62590b27007c669", "name": "Young Shall Grow Motors", "code": "YSG" }
      },
      {
        "id": "rot_2c3ababeb9f7d8e683b15c89", "operatorId": "op_cfdfc23388f25fad27bd0064",
        "originState": "Lagos", "originCity": "Jibowu Terminal",
        "destinationState": "FCT", "destinationCity": "Jabi Park",
        "distanceKm": 491, "estimatedMinutes": 794, "baseFareAmount": 2227400, "currency": "NGN", "status": "ACTIVE",
        "createdAt": "2026-09-01T04:15:00.000Z", "updatedAt": "2026-09-01T04:15:00.000Z",
        "operator": { "id": "op_cfdfc23388f25fad27bd0064", "name": "GUO Transport Service", "code": "GUO" }
      }
    ],
    "meta": { "total": 12, "limit": 20, "offset": 0, "hasMore": false }
  }
  ```
- **Errors**: `400` (bad pagination/sort, invalid `status`), `429`, `500`.

#### 2. Create Route — `POST /api/v1/routes`

- **Body**: `operatorId` (string, required, must reference an existing operator) · `originState`, `originCity`, `destinationState`, `destinationCity` (string, required, min 2 each) · `distanceKm` (int, required, positive) · `estimatedMinutes` (int, required, positive) · `baseFareAmount` (int, required, kobo, non-negative) · `currency` (string, optional, defaults to `"NGN"`) · `status` (enum, optional, defaults to `ACTIVE`; `ACTIVE`, `SUSPENDED`)
  ```json
  {
    "operatorId": "op_6d0e5071af696dfda8012a95", "originState": "Lagos", "originCity": "Jibowu Terminal",
    "destinationState": "FCT", "destinationCity": "Utako Central Park",
    "distanceKm": 750, "estimatedMinutes": 540, "baseFareAmount": 3500000
  }
  ```
- **Curl**:
  ```bash
  curl -X POST "$BASE/api/v1/routes" \
    -H "Content-Type: application/json" \
    -d '{"operatorId":"op_6d0e5071af696dfda8012a95","originState":"Lagos","originCity":"Jibowu Terminal","destinationState":"FCT","destinationCity":"Utako Central Park","distanceKm":750,"estimatedMinutes":540,"baseFareAmount":3500000}'
  ```
- **Response (`201 Created`)**:
  ```json
  {
    "data": {
      "id": "rot_4m8n2p9q7r3s5t1u6v8w2xayz", "operatorId": "op_6d0e5071af696dfda8012a95",
      "originState": "Lagos", "originCity": "Jibowu Terminal",
      "destinationState": "FCT", "destinationCity": "Utako Central Park",
      "distanceKm": 750, "estimatedMinutes": 540, "baseFareAmount": 3500000, "currency": "NGN", "status": "ACTIVE",
      "createdAt": "2026-09-25T21:00:00.000Z", "updatedAt": "2026-09-25T21:00:00.000Z",
      "operator": { "id": "op_6d0e5071af696dfda8012a95", "name": "ABC Transport Plc", "code": "ABC" }
    }
  }
  ```
- **Errors**: `422` (missing required field, non-positive `distanceKm`/`estimatedMinutes`, negative `baseFareAmount`, unknown `operatorId`), `429`, `500`.

#### 3. Get Route Details — `GET /api/v1/routes/:id`

- **Path**: `id` (string, pattern `^rot_[a-z0-9]+$`)
- **Curl**:
  ```bash
  curl -X GET "$BASE/api/v1/routes/rot_a9031cfd75bc16c78c42d0b8"
  ```
- **Response**: the route object from endpoint 1, plus `operator` as `{ id, name, code, headquarters }` and `_count` as `{ schedules: <number> }`.
  ```json
  {
    "data": {
      "id": "rot_a9031cfd75bc16c78c42d0b8", "operatorId": "op_97ed372ee62590b27007c669",
      "originState": "Lagos", "originCity": "Jibowu Terminal",
      "destinationState": "FCT", "destinationCity": "Utako Central Park",
      "distanceKm": 545, "estimatedMinutes": 875, "baseFareAmount": 1821500, "currency": "NGN", "status": "ACTIVE",
      "createdAt": "2026-09-01T04:10:00.000Z", "updatedAt": "2026-09-01T04:10:00.000Z",
      "operator": { "id": "op_97ed372ee62590b27007c669", "name": "Young Shall Grow Motors", "code": "YSG", "headquarters": "Lagos" },
      "_count": { "schedules": 1 }
    }
  }
  ```
- **Errors**: `400` (malformed `id`), `404`, `429`, `500`.

#### 4. Update Route — `PATCH /api/v1/routes/:id`

- **Path**: `id` (string, pattern `^rot_[a-z0-9]+$`)
- **Body**: every field from the create schema is optional; only supplied keys are updated.
- **Curl**:
  ```bash
  curl -X PATCH "$BASE/api/v1/routes/rot_a9031cfd75bc16c78c42d0b8" \
    -H "Content-Type: application/json" \
    -d '{"baseFareAmount":3750000,"status":"SUSPENDED"}'
  ```
- **Response (`200 OK`)**: the updated route object with `operator` embedded as `{ id, name, code }` and no `_count`.
  ```json
  {
    "data": {
      "id": "rot_a9031cfd75bc16c78c42d0b8", "operatorId": "op_97ed372ee62590b27007c669",
      "originState": "Lagos", "originCity": "Jibowu Terminal",
      "destinationState": "FCT", "destinationCity": "Utako Central Park",
      "distanceKm": 545, "estimatedMinutes": 875, "baseFareAmount": 3750000, "currency": "NGN", "status": "SUSPENDED",
      "createdAt": "2026-09-01T04:10:00.000Z", "updatedAt": "2026-09-01T22:15:00.000Z",
      "operator": { "id": "op_97ed372ee62590b27007c669", "name": "Young Shall Grow Motors", "code": "YSG" }
    }
  }
  ```
- **Errors**: `400` (malformed `id` or unparseable JSON body), `404`, `422` (field-level validation failure), `429`, `500`.

#### 5. List Schedules for a Route — `GET /api/v1/routes/:id/schedules`

- **Path**: `id` (string, pattern `^rot_[a-z0-9]+$`)
- **Query**: `limit` (int, default 20, max 100) · `offset` (int, default 0) · `sort` (`departureTime`, `fareAmount`, `availableSeats`, `createdAt`) · `order` (`asc`, `desc`) · `status` (`SCHEDULED`, `BOARDING`, `COMPLETED`, `CANCELLED`) · `minAvailableSeats` (int, non-negative; only schedules with at least this many seats free)
- **Curl**:
  ```bash
  curl -X GET "$BASE/api/v1/routes/rot_700d704cc030b191fb6326c7/schedules?minAvailableSeats=5&sort=departureTime"
  ```
- **Response**: paginated array of schedule objects, each embedding `operator` as `{ id, name, code }` and `route` as `{ id, originCity, destinationCity }`.
  ```json
  {
    "data": [
      {
        "id": "sch_25e739c66439251e5d65ea2a", "routeId": "rot_700d704cc030b191fb6326c7", "operatorId": "op_6d0e5071af696dfda8012a95",
        "busRegistrationNumber": "YS-255-XZ", "busModel": "Mercedes-Benz Sprinter 18-Seater", "totalSeats": 18, "availableSeats": 17,
        "departureTime": "2026-10-31T16:00:00.000Z", "arrivalTime": "2026-11-01T11:52:00.000Z",
        "fareAmount": 1747600, "currency": "NGN", "status": "SCHEDULED",
        "createdAt": "2026-09-01T21:10:00.000Z", "updatedAt": "2026-09-01T21:10:00.000Z",
        "operator": { "id": "op_6d0e5071af696dfda8012a95", "name": "ABC Transport Plc", "code": "ABC" },
        "route": { "id": "rot_700d704cc030b191fb6326c7", "originCity": "Ajah Terminal", "destinationCity": "Kaduna Central Park" }
      }
    ],
    "meta": { "total": 1, "limit": 20, "offset": 0, "hasMore": false }
  }
  ```
- **Errors**: `400` (malformed `id`, bad pagination/sort, invalid `status`, non-integer or negative `minAvailableSeats`), `404` (route does not exist), `429`, `500`.

---

### Schedules API

#### 1. List Schedules — `GET /api/v1/schedules`

- **Query**: `limit` (int, default 20, max 100) · `offset` (int, default 0) · `sort` (`departureTime`, `fareAmount`, `availableSeats`, `createdAt`) · `order` (`asc`, `desc`) · `status` (`SCHEDULED`, `BOARDING`, `COMPLETED`, `CANCELLED`) · `routeId` (string) · `operatorId` (string) · `departureDate` (`YYYY-MM-DD`; schedules departing on that calendar day) · `minAvailableSeats` (int, non-negative)
- **Curl**:
  ```bash
  curl -X GET "$BASE/api/v1/schedules?minAvailableSeats=5&sort=departureTime"
  ```
- **Response**: paginated array of schedule objects, each embedding `operator` as `{ id, name, code }` and `route` as `{ id, originState, originCity, destinationState, destinationCity }`.
  ```json
  {
    "data": [
      {
        "id": "sch_6b09dbe92295ab9a9dadfca7", "routeId": "rot_270f0897dc6adeeae10b1b27", "operatorId": "op_131dfd33d3b9daf68da8dcc3",
        "busRegistrationNumber": "GD-918-NZ", "busModel": "Mercedes-Benz Sprinter 18-Seater", "totalSeats": 18, "availableSeats": 16,
        "departureTime": "2026-10-05T04:00:00.000Z", "arrivalTime": "2026-10-05T17:49:00.000Z",
        "fareAmount": 1625100, "currency": "NGN", "status": "SCHEDULED",
        "createdAt": "2026-09-01T04:00:00.000Z", "updatedAt": "2026-09-01T04:00:00.000Z",
        "operator": { "id": "op_131dfd33d3b9daf68da8dcc3", "name": "Peace Mass Transit", "code": "PMT" },
        "route": { "id": "rot_270f0897dc6adeeae10b1b27", "originState": "Lagos", "originCity": "Jibowu Terminal", "destinationState": "Lagos", "destinationCity": "Ajah Terminal" }
      },
      {
        "id": "sch_99b23b12de19ed9be929b193", "routeId": "rot_8220444d834f8df8556b9228", "operatorId": "op_f7ff3bea174c7583afeb3bfb",
        "busRegistrationNumber": "CU-426-KC", "busModel": "Toyota Coaster 30-Seater", "totalSeats": 30, "availableSeats": 28,
        "departureTime": "2026-10-05T06:00:00.000Z", "arrivalTime": "2026-10-06T03:43:00.000Z",
        "fareAmount": 1955900, "currency": "NGN", "status": "SCHEDULED",
        "createdAt": "2026-09-01T06:30:00.000Z", "updatedAt": "2026-09-01T06:30:00.000Z",
        "operator": { "id": "op_f7ff3bea174c7583afeb3bfb", "name": "Schmitt - Blanda", "code": "NTL-0021" },
        "route": { "id": "rot_8220444d834f8df8556b9228", "originState": "Lagos", "originCity": "Ojota Bus Park", "destinationState": "Enugu", "destinationCity": "Holy Ghost Park" }
      }
    ],
    "meta": { "total": 300, "limit": 20, "offset": 0, "hasMore": true }
  }
  ```
- **Errors**: `400` (bad pagination/sort, invalid `status` or `departureDate`, non-integer or negative `minAvailableSeats`), `429`, `500`.

#### 2. Create Schedule — `POST /api/v1/schedules`

- **Body**: `routeId` (string, required, existing route) · `operatorId` (string, required, existing operator) · `busRegistrationNumber` (string, required, min 3) · `busModel` (string, required, min 2) · `totalSeats` (int, required, positive) · `availableSeats` (int, optional, non-negative, defaults to `totalSeats`) · `departureTime`, `arrivalTime` (string, required, ISO-8601 datetime) · `fareAmount` (int, required, kobo, non-negative) · `currency` (string, optional, defaults to `"NGN"`) · `status` (enum, optional, defaults to `SCHEDULED`; `SCHEDULED`, `BOARDING`, `COMPLETED`, `CANCELLED`)
  ```json
  {
    "routeId": "rot_a9031cfd75bc16c78c42d0b8", "operatorId": "op_97ed372ee62590b27007c669",
    "busRegistrationNumber": "YS-255-XZ", "busModel": "Mercedes-Benz Sprinter 18-Seater", "totalSeats": 18,
    "departureTime": "2026-11-05T07:00:00.000Z", "arrivalTime": "2026-11-05T21:35:00.000Z", "fareAmount": 3500000
  }
  ```
- **Curl**:
  ```bash
  curl -X POST "$BASE/api/v1/schedules" \
    -H "Content-Type: application/json" \
    -d '{"routeId":"rot_a9031cfd75bc16c78c42d0b8","operatorId":"op_97ed372ee62590b27007c669","busRegistrationNumber":"YS-255-XZ","busModel":"Mercedes-Benz Sprinter 18-Seater","totalSeats":18,"departureTime":"2026-11-05T07:00:00.000Z","arrivalTime":"2026-11-05T21:35:00.000Z","fareAmount":3500000}'
  ```
- **Response (`201 Created`)**:
  ```json
  {
    "data": {
      "id": "sch_4m8n2p9q7r3s5t1u6v8w2xayz", "routeId": "rot_a9031cfd75bc16c78c42d0b8", "operatorId": "op_97ed372ee62590b27007c669",
      "busRegistrationNumber": "YS-255-XZ", "busModel": "Mercedes-Benz Sprinter 18-Seater", "totalSeats": 18, "availableSeats": 18,
      "departureTime": "2026-11-05T07:00:00.000Z", "arrivalTime": "2026-11-05T21:35:00.000Z",
      "fareAmount": 3500000, "currency": "NGN", "status": "SCHEDULED",
      "createdAt": "2026-09-25T21:00:00.000Z", "updatedAt": "2026-09-25T21:00:00.000Z",
      "operator": { "id": "op_97ed372ee62590b27007c669", "name": "Young Shall Grow Motors", "code": "YSG" },
      "route": { "id": "rot_a9031cfd75bc16c78c42d0b8", "originCity": "Jibowu Terminal", "destinationCity": "Utako Central Park" }
    }
  }
  ```
- **Errors**: `422` (missing required field, non-positive `totalSeats`, invalid ISO-8601 datetime, unknown `routeId` or `operatorId`), `429`, `500`.

#### 3. Get Schedule Details — `GET /api/v1/schedules/:id`

- **Path**: `id` (string, pattern `^sch_[a-z0-9]+$`)
- **Curl**:
  ```bash
  curl -X GET "$BASE/api/v1/schedules/sch_6b09dbe92295ab9a9dadfca7"
  ```
- **Response**: the schedule object from endpoint 1, plus `operator` as `{ id, name, code, supportPhone }`, `route` as `{ id, originState, originCity, destinationState, destinationCity, distanceKm }`, and `_count` as `{ bookings: <number> }`.
  ```json
  {
    "data": {
      "id": "sch_6b09dbe92295ab9a9dadfca7", "routeId": "rot_270f0897dc6adeeae10b1b27", "operatorId": "op_131dfd33d3b9daf68da8dcc3",
      "busRegistrationNumber": "GD-918-NZ", "busModel": "Mercedes-Benz Sprinter 18-Seater", "totalSeats": 18, "availableSeats": 16,
      "departureTime": "2026-10-05T04:00:00.000Z", "arrivalTime": "2026-10-05T17:49:00.000Z",
      "fareAmount": 1625100, "currency": "NGN", "status": "SCHEDULED",
      "createdAt": "2026-09-01T04:00:00.000Z", "updatedAt": "2026-09-01T04:00:00.000Z",
      "operator": { "id": "op_131dfd33d3b9daf68da8dcc3", "name": "Peace Mass Transit", "code": "PMT", "supportPhone": "+2348030000001" },
      "route": { "id": "rot_270f0897dc6adeeae10b1b27", "originState": "Lagos", "originCity": "Jibowu Terminal", "destinationState": "Lagos", "destinationCity": "Ajah Terminal", "distanceKm": 504 },
      "_count": { "bookings": 2 }
    }
  }
  ```
- **Errors**: `400` (malformed `id`), `404`, `429`, `500`.

#### 4. Update Schedule — `PATCH /api/v1/schedules/:id`

- **Path**: `id` (string, pattern `^sch_[a-z0-9]+$`)
- **Body**: every field from the create schema is optional; only supplied keys are updated. `departureTime` and `arrivalTime` must be valid ISO-8601 datetimes when provided.
- **Curl**:
  ```bash
  curl -X PATCH "$BASE/api/v1/schedules/sch_6b09dbe92295ab9a9dadfca7" \
    -H "Content-Type: application/json" \
    -d '{"status":"BOARDING","departureTime":"2026-10-05T04:15:00.000Z"}'
  ```
- **Response (`200 OK`)**: the updated schedule with `operator` and `route` embedded, and no `_count`.
  ```json
  {
    "data": {
      "id": "sch_6b09dbe92295ab9a9dadfca7", "routeId": "rot_270f0897dc6adeeae10b1b27", "operatorId": "op_131dfd33d3b9daf68da8dcc3",
      "busRegistrationNumber": "GD-918-NZ", "busModel": "Mercedes-Benz Sprinter 18-Seater", "totalSeats": 18, "availableSeats": 16,
      "departureTime": "2026-10-05T04:15:00.000Z", "arrivalTime": "2026-10-05T17:49:00.000Z",
      "fareAmount": 1625100, "currency": "NGN", "status": "BOARDING",
      "createdAt": "2026-09-01T04:00:00.000Z", "updatedAt": "2026-09-01T22:05:00.000Z",
      "operator": { "id": "op_131dfd33d3b9daf68da8dcc3", "name": "Peace Mass Transit", "code": "PMT" },
      "route": { "id": "rot_270f0897dc6adeeae10b1b27", "originCity": "Jibowu Terminal", "destinationCity": "Ajah Terminal" }
    }
  }
  ```
- **Errors**: `400` (malformed `id` or unparseable JSON body), `404`, `422` (field-level validation failure, including invalid ISO-8601 datetimes), `429`, `500`.

---

### Bookings API

#### 1. List Bookings — `GET /api/v1/bookings`

- **Query**: `limit` (int, default 20, max 100) · `offset` (int, default 0) · `sort` (`createdAt`, `seatNumber`, `totalAmount`) · `order` (`asc`, `desc`) · `status` (`CONFIRMED`, `CANCELLED`) · `scheduleId` (string) · `search` (case-insensitive match on `passengerName`, `passengerPhone`, or `bookingReference`)
- **Curl**:
  ```bash
  curl -X GET "$BASE/api/v1/bookings?status=CONFIRMED&search=Claude&sort=createdAt&order=desc"
  ```
- **Response**: paginated array of booking objects, each embedding `schedule` as `{ id, departureTime, busModel, operator: { name, code }, route: { originCity, destinationCity } }`.
  ```json
  {
    "data": [
      {
        "id": "bkg_00ac512663e0edcafa77b05e", "scheduleId": "sch_6b09dbe92295ab9a9dadfca7",
        "passengerName": "Claude Keebler", "passengerPhone": "+2348055780718", "passengerEmail": "kane.haley@yahoo.com",
        "seatNumber": 1, "totalAmount": 1625100, "currency": "NGN", "bookingReference": "NG-BUS-100000", "status": "CONFIRMED",
        "createdAt": "2026-09-01T04:00:00.000Z", "updatedAt": "2026-09-01T04:00:00.000Z",
        "schedule": {
          "id": "sch_6b09dbe92295ab9a9dadfca7", "departureTime": "2026-10-05T04:00:00.000Z",
          "busModel": "Mercedes-Benz Sprinter 18-Seater",
          "operator": { "name": "Peace Mass Transit", "code": "PMT" },
          "route": { "originCity": "Jibowu Terminal", "destinationCity": "Ajah Terminal" }
        }
      }
    ],
    "meta": { "total": 1, "limit": 20, "offset": 0, "hasMore": false }
  }
  ```
- **Errors**: `400` (bad pagination/sort, invalid `status`), `429`, `500`.

#### 2. Create Passenger Booking (Atomic Seat Allocation) — `POST /api/v1/bookings`

- **Body**: `scheduleId` (string, required, must reference an existing schedule with seats available) · `passengerName` (string, required, min 2) · `passengerPhone` (string, required, min 5) · `passengerEmail` (string, required, valid email) · `seatNumber` (int, optional, positive; auto-allocated as `totalSeats - availableSeats + 1` when omitted)
  ```json
  {
    "scheduleId": "sch_6b09dbe92295ab9a9dadfca7", "passengerName": "Emeka Chukwu",
    "passengerPhone": "+2348021234567", "passengerEmail": "emeka.chukwu@example.ng"
  }
  ```
- **Seat allocation semantics**: the seat decrement and the booking insert run inside a single Prisma `$transaction`, so a failed allocation never leaves a partially decremented schedule. `totalAmount` is copied from the schedule's `fareAmount`, `currency` is always `NGN`, and `bookingReference` is server-generated as `NG-BUS-<6 digits>`.
- **Curl**:
  ```bash
  curl -X POST "$BASE/api/v1/bookings" \
    -H "Content-Type: application/json" \
    -d '{"scheduleId":"sch_6b09dbe92295ab9a9dadfca7","passengerName":"Emeka Chukwu","passengerPhone":"+2348021234567","passengerEmail":"emeka.chukwu@example.ng"}'
  ```
- **Response (`201 Created`)**: the new booking, with `schedule` embedded as `{ id, departureTime, busModel, operator: { name, code }, route: { originCity, destinationCity } }`. Seats `1` and `2` of this schedule are already taken by the seed data, so the next allocation is `18 - 16 + 1 = 3`, and `totalAmount` mirrors the schedule's `fareAmount` of `1625100`.
  ```json
  {
    "data": {
      "id": "bkg_4m8n2p9q7r3s5t1u6v8w2xayz", "scheduleId": "sch_6b09dbe92295ab9a9dadfca7",
      "passengerName": "Emeka Chukwu", "passengerPhone": "+2348021234567", "passengerEmail": "emeka.chukwu@example.ng",
      "seatNumber": 3, "totalAmount": 1625100, "currency": "NGN", "bookingReference": "NG-BUS-742318", "status": "CONFIRMED",
      "createdAt": "2026-09-01T04:00:00.000Z", "updatedAt": "2026-09-01T04:00:00.000Z",
      "schedule": {
        "id": "sch_6b09dbe92295ab9a9dadfca7", "departureTime": "2026-10-05T04:00:00.000Z",
        "busModel": "Mercedes-Benz Sprinter 18-Seater",
        "operator": { "name": "Peace Mass Transit", "code": "PMT" },
        "route": { "originCity": "Jibowu Terminal", "destinationCity": "Ajah Terminal" }
      }
    }
  }
  ```
- **Errors**: `400` (body is not valid JSON) · `422` (missing/short `passengerName`, short `passengerPhone`, non-email `passengerEmail`, unknown `scheduleId`, no available seats, or requested `seatNumber` exceeding bus capacity) · `429` (rate limit exceeded) · `500` (unexpected internal failure).

#### 3. Get Booking Details — `GET /api/v1/bookings/:id`

- **Path**: `id` (string, pattern `^bkg_[a-z0-9]+$`)
- **Curl**:
  ```bash
  curl -X GET "$BASE/api/v1/bookings/bkg_00ac512663e0edcafa77b05e"
  ```
- **Response**: the full booking object from endpoint 1, plus a richer `schedule` that also includes `busRegistrationNumber`, `operator.supportPhone`, and the route's state fields.
  ```json
  {
    "data": {
      "id": "bkg_00ac512663e0edcafa77b05e", "scheduleId": "sch_6b09dbe92295ab9a9dadfca7",
      "passengerName": "Claude Keebler", "passengerPhone": "+2348055780718", "passengerEmail": "kane.haley@yahoo.com",
      "seatNumber": 1, "totalAmount": 1625100, "currency": "NGN", "bookingReference": "NG-BUS-100000", "status": "CONFIRMED",
      "createdAt": "2026-09-01T04:00:00.000Z", "updatedAt": "2026-09-01T04:00:00.000Z",
      "schedule": {
        "id": "sch_6b09dbe92295ab9a9dadfca7", "departureTime": "2026-10-05T04:00:00.000Z",
        "busRegistrationNumber": "GD-918-NZ", "busModel": "Mercedes-Benz Sprinter 18-Seater",
        "operator": { "id": "op_131dfd33d3b9daf68da8dcc3", "name": "Peace Mass Transit", "code": "PMT", "supportPhone": "+2348030000001" },
        "route": { "originState": "Lagos", "originCity": "Jibowu Terminal", "destinationState": "Lagos", "destinationCity": "Ajah Terminal" }
      }
    }
  }
  ```
- **Errors**: `400` (malformed `id`), `404`, `429`, `500`.

#### 4. Update or Cancel Booking — `PATCH /api/v1/bookings/:id`

- **Path**: `id` (string, pattern `^bkg_[a-z0-9]+$`)
- **Body**: all fields optional; only supplied keys are updated — `status` (enum, `CONFIRMED`, `CANCELLED`) · `passengerName` (string, min 2) · `passengerPhone` (string, min 5) · `passengerEmail` (string, valid email)
- **Cancellation semantics**: the update runs inside a Prisma `$transaction`. On a `CONFIRMED` → `CANCELLED` transition the seat is returned to the schedule by incrementing `availableSeats` by 1 in the same transaction. A `CANCELLED` → `CONFIRMED` transition does not re-decrement, and re-cancelling an already-cancelled booking is a no-op for seat counts.
- **Curl**:
  ```bash
  curl -X PATCH "$BASE/api/v1/bookings/bkg_00ac512663e0edcafa77b05e" \
    -H "Content-Type: application/json" \
    -d '{"status":"CANCELLED"}'
  ```
- **Response (`200 OK`)**: the updated booking with `schedule` embedded as `{ id, departureTime, operator: { name, code }, route: { originCity, destinationCity } }`.
  ```json
  {
    "data": {
      "id": "bkg_00ac512663e0edcafa77b05e", "scheduleId": "sch_6b09dbe92295ab9a9dadfca7",
      "passengerName": "Claude Keebler", "passengerPhone": "+2348055780718", "passengerEmail": "kane.haley@yahoo.com",
      "seatNumber": 1, "totalAmount": 1625100, "currency": "NGN", "bookingReference": "NG-BUS-100000", "status": "CANCELLED",
      "createdAt": "2026-09-01T04:00:00.000Z", "updatedAt": "2026-09-01T23:10:00.000Z",
      "schedule": {
        "id": "sch_6b09dbe92295ab9a9dadfca7", "departureTime": "2026-10-05T04:00:00.000Z",
        "operator": { "name": "Peace Mass Transit", "code": "PMT" },
        "route": { "originCity": "Jibowu Terminal", "destinationCity": "Ajah Terminal" }
      }
    }
  }
  ```
- **Errors**: `400` (malformed `id` or unparseable JSON body), `404`, `422` (field-level validation failure, e.g. an invalid `status` value), `429`, `500`.

---

## 5. Rate Limiting & Error Handling

### Rate Limiting Specification

- **Threshold**: 100 requests per minute per IP address, applied by middleware to all `/api/*` paths.
- **Store**: shared Upstash Redis (`@upstash/ratelimit`) with a sliding window of `100` requests per `60 s`.
- **Degraded-mode caveat**: if the Upstash Redis environment variables are missing or empty (e.g. during offline local development), the system falls back to an **in-memory fixed window** limiter. The window is anchored at the first request from an IP and resets 60 seconds later; individual request timestamps are not retained, so this fallback is *not* a sliding window, and at a window boundary a client may briefly exceed the nominal threshold. In-memory rate limiting also does not coordinate request counts across multiple serverless function instances.
- **Headers returned**: `X-RateLimit-Limit` (maximum requests permitted per window, `100`) · `X-RateLimit-Remaining` (remaining quota in the current window) · `Retry-After` (seconds to wait before retrying, on `429`).

### Error Envelope

Every failure returns the standard envelope, e.g.:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid sort field 'invalid_sort'. Allowed fields: [createdAt, name, code]"
  }
}
```

### HTTP Status Codes

| HTTP Status | Error Code | Description |
| :--- | :--- | :--- |
| `200 OK` | N/A | Successful GET / PATCH operation |
| `201 Created` | N/A | Successful POST creation |
| `400 Bad Request` | `BAD_REQUEST` | Validation error on query params, invalid sort field, negative offset, malformed ID |
| `404 Not Found` | `NOT_FOUND` | Resource or endpoint does not exist |
| `405 Method Not Allowed` | `METHOD_NOT_ALLOWED` | Unsupported HTTP method on route (returns `Allow` header) |
| `422 Unprocessable Entity` | `UNPROCESSABLE_ENTITY` | Request body validation failure (missing required field, type mismatch, zero seats) |
| `429 Too Many Requests` | `TOO_MANY_REQUESTS` | Rate limit threshold exceeded (returns `Retry-After` header) |
| `500 Internal Error` | `INTERNAL_SERVER_ERROR` | Unhandled internal server error |
