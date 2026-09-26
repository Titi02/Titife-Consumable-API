# Titife Consumable API — Nigerian Intercity Bus Transport API

A production-grade, highly reliable RESTful Web API for intercity bus transport operations across Nigeria. Built with **Next.js (App Router)**, **TypeScript**, **Prisma**, and **PostgreSQL**.

---

## 1. Deployment Status & Consumer Application
- **Deployment URL**: Not deployed yet
- **Public API Base URL**: Not available until deployed (expected form: `<deployment-url>/api/v1`)
- **Consumer Web App**: Not available until deployed (expected form: `<deployment-url>/`)

There is no live URL to document yet. Once a deployment exists, replace the three lines above with the real values and set `NEXT_PUBLIC_API_BASE_URL` to the deployment origin (see [Section 2](#2-environment-variables--setup)). All `curl` examples in [Section 5](#5-api-endpoint-documentation) use a `$BASE` variable for this reason — set it to your deployment origin before running them:

```bash
export BASE="<deployment-url>"
```

### Consumer API Base URL Is Environment-Configurable
The bundled consumer web app does **not** hardcode a host. It reads the API origin at runtime from `NEXT_PUBLIC_API_BASE_URL`:

```ts
// src/app/page.tsx
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const url = `${apiBaseUrl}/api/v1/${activeTab}?${params.toString()}`;
const res = await fetch(url);
```

- If `NEXT_PUBLIC_API_BASE_URL` is set, requests go to that origin, so the consumer can be pointed at local, staging, or production deployments without code changes.
- If it is unset or empty, `apiBaseUrl` is `""` and requests resolve against the **same origin** the consumer app is served from. This is the default local-development behaviour and requires no configuration.
- The value must be the API **origin** only (scheme, host, optional port) — no trailing `/api/v1` and no trailing slash. The versioned `/api/v1` path is appended by the client.
- This variable is inlined at build time (`NEXT_PUBLIC_*`), so changing it requires a rebuild, not just a server restart.

---

## 2. Environment Variables & Setup

### Environment Variables (`.env`)
```bash
# Pooled connection string for serverless API routes
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/titife_dev?pgbouncer=true&schema=public"

# Direct connection string for Prisma migrations & seeding
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/titife_dev?schema=public"

# Upstash Redis credentials for shared IP rate limiting (Optional in dev, in-memory fallback used if omitted)
UPSTASH_REDIS_REST_URL="https://your-upstash-redis.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your_upstash_redis_token"

# Public API Base URL for consumer client (origin only, no trailing /api/v1).
# Leave empty or unset to make the consumer call the same origin it is served from.
NEXT_PUBLIC_API_BASE_URL="http://localhost:3000"
```

### Local Installation & Execution
```bash
# 1. Install dependencies
npm install

# 2. Push Prisma schema to local database
npx prisma db push

# 3. Seed database with deterministic Faker dataset
npm run db:seed

# 4. Start Next.js development server
npm run dev
```

---

## 3. Design Decisions

### Why These Resources?
The API models the core logistics domain of Nigerian intercity road transport:
1. **`Operators`**: Bus transport companies operating terminals and fleets across Nigeria.
2. **`Routes`**: City-to-city travel corridors connecting origin and destination states.
3. **`Schedules`**: Specific scheduled bus runs assigned to a route and vehicle with seat capacity and departure times.
4. **`Bookings`**: Passenger ticket reservations tied to a specific schedule with seat allocations.

### Why Generated String Identifiers over Sequential Integers?
All primary keys use non-sequential string identifiers prefixed by entity type (`op_`, `rot_`, `sch_`, `bkg_`) combined with CUID2.
- **Security**: Prevents sequential ID harvesting and enumeration attacks.
- **Developer Experience**: Prefixes immediately convey entity type in logs and external requests.
- **Safety**: Malformed string IDs are caught by path parameter validators, returning explicit `400 Bad Request` errors instead of database integer casting exceptions (`500`).

### Why Offset Pagination over Cursor Pagination?
- **User Experience**: Offset pagination (`limit` & `offset`) allows jump-to-page navigation and explicit metadata display (`total`, `limit`, `offset`, `hasMore`).
- **Compatibility**: Ideal for administrative list views and consumer data tables where users filter by state, status, or date range while viewing total record counts.

### Why Standardized Response Envelopes?
- **Predictability**: Clients receive a standard `{ "data": [...], "meta": { ... } }` payload on success and `{ "error": { "code": "...", "message": "..." } }` on failure.
- **Framework Error Interception**: Catches Next.js framework-level errors (such as unmatched routes or unsupported HTTP methods), guaranteeing JSON payloads instead of default HTML 404/text 405 responses.

---

## 4. Resource Specifications

### Currency Convention
All monetary amounts (`baseFareAmount`, `fareAmount`, `totalAmount`) are strictly stored as **integers in minor units (NGN kobo)** with an explicit `currency: "NGN"` field. (e.g., ₦25,000.00 is stored as `2500000` kobo). Floats are never used for monetary values.

### Resource Models Table

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
| | `busRegistrationNumber` | String | License plate number |
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

## 5. API Endpoint Documentation

All endpoints are versioned under `/api/v1`. There are no unversioned aliases and no `/v2` routes.

Every `curl` example below uses `$BASE`, which is the value of the `NEXT_PUBLIC_API_BASE_URL` environment variable (the public API base URL, without a trailing slash). Set it once per shell:

```bash
export BASE="https://your-deployment-url"
```

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

### Global Query Standards
- `limit`: Default `20`, maximum `100`. Values > 100 are automatically clamped to 100. Non-integer or `limit <= 0` return `400 Bad Request`.
- `offset`: Default `0`. Negative or non-integer offsets return `400 Bad Request`.
- `sort` & `order`: Whitelisted per resource. Unrecognized sort fields return `400 Bad Request` listing valid fields. `order` defaults to `asc`; any value other than `asc`/`desc` returns `400 Bad Request`.

### Path Parameter Validation
`:id` values are validated against the entity prefix before any database access. A malformed ID returns `400 Bad Request` (never a `500` from a failed cast), and a well-formed but unknown ID returns `404 Not Found`:

| Resource | Expected Pattern | Example |
| :--- | :--- | :--- |
| Operator | `^op_[a-z0-9]+$` | `op_cm7xyz12345` |
| Route | `^rot_[a-z0-9]+$` | `rot_cm7xyz12345` |
| Schedule | `^sch_[a-z0-9]+$` | `sch_cm7xyz12345` |
| Booking | `^bkg_[a-z0-9]+$` | `bkg_cm7xyz12345` |

### Framework Error Interception
- Any unmatched path under `/api` is caught by a catch-all route that returns `404 Not Found` with the standard error envelope for every HTTP method — JSON, never an HTML framework page.
- Any HTTP method not listed in the "Methods Allowed On Route" column returns `405 Method Not Allowed`, the standard error envelope, and an `Allow` header enumerating the permitted methods.
- Rate limiting is applied by middleware to all `/api/*` paths. See [Section 6](#6-rate-limiting--error-handling).

---

### Operators API

#### 1. List Operators
- **Method / Path**: `GET /api/v1/operators`
- **Query Parameters**:
  - `limit` (int, default 20, max 100)
  - `offset` (int, default 0)
  - `sort` (`createdAt`, `name`, `code`)
  - `order` (`asc`, `desc`)
  - `status` (`ACTIVE`, `INACTIVE`)
  - `search` (string: matches name or headquarters)
- **Curl Example**:
  ```bash
  curl -X GET "$BASE/api/v1/operators?limit=2&sort=name&order=asc"
  ```
- **Example Response**:
  ```json
  {
    "data": [
      {
        "id": "op_cm7xyz12345",
        "name": "ABC Transport Plc",
        "code": "ABC",
        "headquarters": "Imo",
        "supportEmail": "support@abctransport.ng",
        "supportPhone": "+2348030000007",
        "status": "ACTIVE",
        "createdAt": "2026-09-25T20:00:00.000Z",
        "updatedAt": "2026-09-25T20:00:00.000Z"
      },
      {
        "id": "op_cm7xyz67890",
        "name": "Chisco Transport Nigeria",
        "code": "CTN",
        "headquarters": "Lagos",
        "supportEmail": "help@chiscogroup.ng",
        "supportPhone": "+2348030000006",
        "status": "ACTIVE",
        "createdAt": "2026-09-25T20:00:00.000Z",
        "updatedAt": "2026-09-25T20:00:00.000Z"
      }
    ],
    "meta": {
      "total": 10,
      "limit": 2,
      "offset": 0,
      "hasMore": true
    }
  }
  ```

#### 2. Create Operator
- **Method / Path**: `POST /api/v1/operators`
- **Request Body**:
  ```json
  {
    "name": "Eagle Line Express",
    "code": "ELE",
    "headquarters": "Benin City",
    "supportEmail": "contact@eagleline.ng",
    "supportPhone": "+2348039998877"
  }
  ```
- **Curl Example**:
  ```bash
  curl -X POST "$BASE/api/v1/operators" \
    -H "Content-Type: application/json" \
    -d '{"name":"Eagle Line Express","code":"ELE","headquarters":"Benin City","supportEmail":"contact@eagleline.ng","supportPhone":"+2348039998877"}'
  ```
- **Example Response (`201 Created`)**:
  ```json
  {
    "data": {
      "id": "op_cm7new112233",
      "name": "Eagle Line Express",
      "code": "ELE",
      "headquarters": "Benin City",
      "supportEmail": "contact@eagleline.ng",
      "supportPhone": "+2348039998877",
      "status": "ACTIVE",
      "createdAt": "2026-09-25T21:00:00.000Z",
      "updatedAt": "2026-09-25T21:00:00.000Z"
    }
  }
  ```
- **Errors**: `422` (missing/short `name`, non-email `supportEmail`, `code` outside 2–10 chars, duplicate `name` or `code`), `429`, `500`.


#### 3. Get Operator Details
- **Method / Path**: `GET /api/v1/operators/:id`
- **Path Parameters**: `id` (string, pattern `^op_[a-z0-9]+$`)
- **Curl Example**:
  ```bash
  curl -X GET "$BASE/api/v1/operators/op_cm7xyz12345"
  ```
- **Response Notes**: Identical to the operator object shown in endpoint 2, plus a relation count object:
  ```json
  {
    "data": {
      "id": "op_cm7xyz12345",
      "name": "ABC Transport Plc",
      "code": "ABC",
      "headquarters": "Imo",
      "supportEmail": "support@abctransport.ng",
      "supportPhone": "+2348030000007",
      "status": "ACTIVE",
      "createdAt": "2026-09-25T20:00:00.000Z",
      "updatedAt": "2026-09-25T20:00:00.000Z",
      "_count": { "routes": 2, "schedules": 3 }
    }
  }
  ```
- **Errors**: `400` (malformed `id`), `404` (unknown but well-formed `id`), `429`, `500`.

#### 4. Update Operator
- **Method / Path**: `PATCH /api/v1/operators/:id`
- **Path Parameters**: `id` (string, pattern `^op_[a-z0-9]+$`)
- **Request Body**: All fields optional; only the supplied keys are updated. `code` is uppercased automatically.

  | Field | Type | Required | Notes |
  | :--- | :--- | :--- | :--- |
  | `name` | string | No | Min 2 characters. Must remain unique |
  | `code` | string | No | 2–10 characters, uppercased. Must remain unique |
  | `headquarters` | string | No | Min 2 characters |
  | `supportEmail` | string | No | Must be a valid email |
  | `supportPhone` | string | No | Min 5 characters |
  | `status` | enum | No | `ACTIVE`, `INACTIVE` |

- **Curl Example**:
  ```bash
  curl -X PATCH "$BASE/api/v1/operators/op_cm7xyz12345" \
    -H "Content-Type: application/json" \
    -d '{"status":"INACTIVE"}'
  ```
- **Example Response (`200 OK`)**: The updated operator object, with no `_count`.
- **Errors**: `400` (malformed `id` or unparseable JSON body), `404`, `422` (field-level validation failure, or unique constraint violation on `name`/`code`), `429`, `500`.

#### 5. List Routes for an Operator
- **Method / Path**: `GET /api/v1/operators/:id/routes`
- **Path Parameters**: `id` (string, pattern `^op_[a-z0-9]+$`)
- **Query Parameters**:
  - `limit` (int, default 20, max 100)
  - `offset` (int, default 0)
  - `sort` (`createdAt`, `baseFareAmount`, `distanceKm`, `originCity`)
  - `order` (`asc`, `desc`)
  - `status` (`ACTIVE`, `SUSPENDED`)
  - `originState` (string, case-insensitive exact match)
  - `destinationState` (string, case-insensitive exact match)
- **Curl Example**:
  ```bash
  curl -X GET "$BASE/api/v1/operators/op_cm7xyz12345/routes?status=ACTIVE&sort=baseFareAmount&order=asc"
  ```
- **Response Notes**: Paginated array of route objects. Unlike `GET /api/v1/routes`, this sub-resource does not embed the `operator` relation, since the operator is already implied by the path.
- **Errors**: `400` (malformed `id`, bad pagination/sort, invalid `status`), `404` (operator does not exist), `429`, `500`.

---

### Routes API

#### 1. List Routes
- **Method / Path**: `GET /api/v1/routes`
- **Query Parameters**:
  - `limit` (int, default 20, max 100)
  - `offset` (int, default 0)
  - `sort` (`createdAt`, `baseFareAmount`, `distanceKm`, `originCity`)
  - `order` (`asc`, `desc`)
  - `status` (`ACTIVE`, `SUSPENDED`)
  - `operatorId` (string)
  - `originState` (string, case-insensitive exact match)
  - `destinationState` (string, case-insensitive exact match)
- **Curl Example**:
  ```bash
  curl -X GET "$BASE/api/v1/routes?originState=Lagos&destinationState=FCT"
  ```
- **Response Notes**: Paginated array of route objects, each embedding `operator` as `{ id, name, code }`.
- **Errors**: `400` (bad pagination/sort, invalid `status`), `429`, `500`.

#### 2. Create Route
- **Method / Path**: `POST /api/v1/routes`
- **Request Body**:
  ```json
  {
    "operatorId": "op_cm7xyz12345",
    "originState": "Lagos",
    "originCity": "Jibowu Terminal",
    "destinationState": "FCT",
    "destinationCity": "Utako Central Park",
    "distanceKm": 750,
    "estimatedMinutes": 540,
    "baseFareAmount": 3500000
  }
  ```
- **Field Reference**:
  | Field | Type | Required | Notes |
  | :--- | :--- | :--- | :--- |
  | `operatorId` | string | Yes | Must reference an existing operator |
  | `originState` | string | Yes | Min 2 characters |
  | `originCity` | string | Yes | Min 2 characters |
  | `destinationState` | string | Yes | Min 2 characters |
  | `destinationCity` | string | Yes | Min 2 characters |
  | `distanceKm` | int | Yes | Must be positive |
  | `estimatedMinutes` | int | Yes | Must be positive |
  | `baseFareAmount` | int | Yes | Kobo, non-negative |
  | `currency` | string | No | Defaults to `"NGN"` |
  | `status` | enum | No | Defaults to `ACTIVE`; `ACTIVE`, `SUSPENDED` |
- **Curl Example**:
  ```bash
  curl -X POST "$BASE/api/v1/routes" \
    -H "Content-Type: application/json" \
    -d '{"operatorId":"op_cm7xyz12345","originState":"Lagos","originCity":"Jibowu Terminal","destinationState":"FCT","destinationCity":"Utako Central Park","distanceKm":750,"estimatedMinutes":540,"baseFareAmount":3500000}'
  ```
- **Example Response (`201 Created`)**: `{ "data": { ...route, "operator": { "id": ..., "name": ..., "code": ... } } }`
- **Errors**: `422` (missing required field, non-positive `distanceKm`/`estimatedMinutes`, negative `baseFareAmount`, unknown `operatorId`), `429`, `500`.

#### 3. Get Route Details
- **Method / Path**: `GET /api/v1/routes/:id`
- **Path Parameters**: `id` (string, pattern `^rot_[a-z0-9]+$`)
- **Curl Example**:
  ```bash
  curl -X GET "$BASE/api/v1/routes/rot_cm7xyz12345"
  ```
- **Response Notes**: The route object, plus:
  - `operator`: `{ id, name, code, headquarters }`
  - `_count`: `{ schedules: <number> }`
- **Errors**: `400` (malformed `id`), `404`, `429`, `500`.

#### 4. Update Route
- **Method / Path**: `PATCH /api/v1/routes/:id`
- **Path Parameters**: `id` (string, pattern `^rot_[a-z0-9]+$`)
- **Request Body**: Every field from the create schema is optional; only supplied keys are updated.
- **Curl Example**:
  ```bash
  curl -X PATCH "$BASE/api/v1/routes/rot_cm7xyz12345" \
    -H "Content-Type: application/json" \
    -d '{"baseFareAmount":3750000,"status":"SUSPENDED"}'
  ```
- **Example Response (`200 OK`)**: The updated route object with `operator` embedded as `{ id, name, code }` and no `_count`.
- **Errors**: `400` (malformed `id` or unparseable JSON body), `404`, `422` (field-level validation failure), `429`, `500`.

#### 5. List Schedules for a Route
- **Method / Path**: `GET /api/v1/routes/:id/schedules`
- **Path Parameters**: `id` (string, pattern `^rot_[a-z0-9]+$`)
- **Query Parameters**:
  - `limit` (int, default 20, max 100)
  - `offset` (int, default 0)
  - `sort` (`departureTime`, `fareAmount`, `availableSeats`, `createdAt`)
  - `order` (`asc`, `desc`)
  - `status` (`SCHEDULED`, `BOARDING`, `COMPLETED`, `CANCELLED`)
  - `minAvailableSeats` (int, non-negative; returns only schedules with at least this many seats free)
- **Curl Example**:
  ```bash
  curl -X GET "$BASE/api/v1/routes/rot_cm7xyz12345/schedules?minAvailableSeats=5&sort=departureTime"
  ```
- **Response Notes**: Paginated array of schedule objects, each embedding `operator` as `{ id, name, code }` and `route` as `{ id, originCity, destinationCity }`.
- **Errors**: `400` (malformed `id`, bad pagination/sort, invalid `status`, non-integer or negative `minAvailableSeats`), `404` (route does not exist), `429`, `500`.

---

### Schedules API

#### 1. List Schedules
- **Method / Path**: `GET /api/v1/schedules`
- **Query Parameters**:
  - `limit` (int, default 20, max 100)
  - `offset` (int, default 0)
  - `sort` (`departureTime`, `fareAmount`, `availableSeats`, `createdAt`)
  - `order` (`asc`, `desc`)
  - `status` (`SCHEDULED`, `BOARDING`, `COMPLETED`, `CANCELLED`)
  - `routeId` (string)
  - `operatorId` (string)
  - `departureDate` (`YYYY-MM-DD`; matches schedules departing on that calendar day)
  - `minAvailableSeats` (int, non-negative)
- **Curl Example**:
  ```bash
  curl -X GET "$BASE/api/v1/schedules?minAvailableSeats=5&sort=departureTime"
  ```
- **Response Notes**: Paginated array of schedule objects, each embedding `operator` as `{ id, name, code }` and `route` as `{ id, originState, originCity, destinationState, destinationCity }`.
- **Errors**: `400` (bad pagination/sort, invalid `status` or `departureDate`, non-integer or negative `minAvailableSeats`), `429`, `500`.

#### 2. Create Schedule
- **Method / Path**: `POST /api/v1/schedules`
- **Request Body**:
  ```json
  {
    "routeId": "rot_cm7xyz12345",
    "operatorId": "op_cm7xyz12345",
    "busRegistrationNumber": "LAG-482-KJ",
    "busModel": "Mercedes-Benz Tourismo",
    "totalSeats": 50,
    "departureTime": "2026-10-02T07:00:00.000Z",
    "arrivalTime": "2026-10-02T16:00:00.000Z",
    "fareAmount": 3500000
  }
  ```
- **Field Reference**:
  | Field | Type | Required | Notes |
  | :--- | :--- | :--- | :--- |
  | `routeId` | string | Yes | Must reference an existing route |
  | `operatorId` | string | Yes | Must reference an existing operator |
  | `busRegistrationNumber` | string | Yes | Min 3 characters |
  | `busModel` | string | Yes | Min 2 characters |
  | `totalSeats` | int | Yes | Must be positive |
  | `availableSeats` | int | No | Non-negative. Defaults to `totalSeats` when omitted |
  | `departureTime` | string | Yes | Valid ISO-8601 datetime |
  | `arrivalTime` | string | Yes | Valid ISO-8601 datetime |
  | `fareAmount` | int | Yes | Kobo, non-negative |
  | `currency` | string | No | Defaults to `"NGN"` |
  | `status` | enum | No | Defaults to `SCHEDULED`; `SCHEDULED`, `BOARDING`, `COMPLETED`, `CANCELLED` |
- **Curl Example**:
  ```bash
  curl -X POST "$BASE/api/v1/schedules" \
    -H "Content-Type: application/json" \
    -d '{"routeId":"rot_cm7xyz12345","operatorId":"op_cm7xyz12345","busRegistrationNumber":"LAG-482-KJ","busModel":"Mercedes-Benz Tourismo","totalSeats":50,"departureTime":"2026-10-02T07:00:00.000Z","arrivalTime":"2026-10-02T16:00:00.000Z","fareAmount":3500000}'
  ```
- **Example Response (`201 Created`)**: The created schedule with `operator` and `route` embedded as `{ id, originCity, destinationCity }`.
- **Errors**: `422` (missing required field, non-positive `totalSeats`, invalid ISO-8601 datetime, unknown `routeId` or `operatorId`), `429`, `500`.

#### 3. Get Schedule Details
- **Method / Path**: `GET /api/v1/schedules/:id`
- **Path Parameters**: `id` (string, pattern `^sch_[a-z0-9]+$`)
- **Curl Example**:
  ```bash
  curl -X GET "$BASE/api/v1/schedules/sch_cm7xyz998877"
  ```
- **Response Notes**: The schedule object, plus:
  - `operator`: `{ id, name, code, supportPhone }`
  - `route`: `{ id, originState, originCity, destinationState, destinationCity, distanceKm }`
  - `_count`: `{ bookings: <number> }`
- **Errors**: `400` (malformed `id`), `404`, `429`, `500`.

#### 4. Update Schedule
- **Method / Path**: `PATCH /api/v1/schedules/:id`
- **Path Parameters**: `id` (string, pattern `^sch_[a-z0-9]+$`)
- **Request Body**: Every field from the create schema is optional; only supplied keys are updated. `departureTime` and `arrivalTime` must be valid ISO-8601 datetimes when provided.
- **Curl Example**:
  ```bash
  curl -X PATCH "$BASE/api/v1/schedules/sch_cm7xyz998877" \
    -H "Content-Type: application/json" \
    -d '{"status":"BOARDING","departureTime":"2026-10-02T07:15:00.000Z"}'
  ```
- **Example Response (`200 OK`)**: The updated schedule with `operator` and `route` embedded, and no `_count`.
- **Errors**: `400` (malformed `id` or unparseable JSON body), `404`, `422` (field-level validation failure, including invalid ISO-8601 datetimes), `429`, `500`.

---

### Bookings API

#### 1. List Bookings
- **Method / Path**: `GET /api/v1/bookings`
- **Query Parameters**:
  - `limit` (int, default 20, max 100)
  - `offset` (int, default 0)
  - `sort` (`createdAt`, `seatNumber`, `totalAmount`)
  - `order` (`asc`, `desc`)
  - `status` (`CONFIRMED`, `CANCELLED`)
  - `scheduleId` (string)
  - `search` (string: case-insensitive match on `passengerName`, `passengerPhone`, or `bookingReference`)
- **Curl Example**:
  ```bash
  curl -X GET "$BASE/api/v1/bookings?status=CONFIRMED&search=Emeka&sort=createdAt&order=desc"
  ```
- **Response Notes**: Paginated array of booking objects, each embedding `schedule` as `{ id, departureTime, busModel, operator: { name, code }, route: { originCity, destinationCity } }`.
- **Errors**: `400` (bad pagination/sort, invalid `status`), `429`, `500`.

#### 2. Create Passenger Booking (Atomic Seat Allocation)
- **Method / Path**: `POST /api/v1/bookings`
- **Request Body**:
  ```json
  {
    "scheduleId": "sch_cm7xyz998877",
    "passengerName": "Emeka Chukwu",
    "passengerPhone": "+2348021234567",
    "passengerEmail": "emeka.chukwu@example.ng"
  }
  ```
- **Field Reference**:
  | Field | Type | Required | Notes |
  | :--- | :--- | :--- | :--- |
  | `scheduleId` | string | Yes | Must reference an existing schedule with seats available |
  | `passengerName` | string | Yes | Min 2 characters |
  | `passengerPhone` | string | Yes | Min 5 characters |
  | `passengerEmail` | string | Yes | Must be a valid email |
  | `seatNumber` | int | No | Positive integer. Auto-allocated as `totalSeats - availableSeats + 1` when omitted |
- **Seat Allocation Semantics**: The seat decrement and the booking insert run inside a single Prisma `$transaction`, so a failed allocation never leaves a partially decremented schedule. `totalAmount` is copied from the schedule's `fareAmount` and `currency` is always `NGN`. `bookingReference` is server-generated in the form `NG-BUS-<6 digits>`.
- **Curl Example**:
  ```bash
  curl -X POST "$BASE/api/v1/bookings" \
    -H "Content-Type: application/json" \
    -d '{"scheduleId":"sch_cm7xyz998877","passengerName":"Emeka Chukwu","passengerPhone":"+2348021234567","passengerEmail":"emeka.chukwu@example.ng"}'
  ```
- **Example Response (`201 Created`)**:
  ```json
  {
    "data": {
      "id": "bkg_cm7bkg554433",
      "scheduleId": "sch_cm7xyz998877",
      "passengerName": "Emeka Chukwu",
      "passengerPhone": "+2348021234567",
      "passengerEmail": "emeka.chukwu@example.ng",
      "seatNumber": 12,
      "totalAmount": 3500000,
      "currency": "NGN",
      "bookingReference": "NG-BUS-849201",
      "status": "CONFIRMED",
      "createdAt": "2026-09-25T21:30:00.000Z",
      "updatedAt": "2026-09-25T21:30:00.000Z"
    }
  }
  ```
- **Errors**:
  | Status | Condition |
  | :--- | :--- |
  | `400 Bad Request` | Body is not valid JSON |
  | `422 Unprocessable Entity` | Missing/short `passengerName`, short `passengerPhone`, non-email `passengerEmail`, unknown `scheduleId`, no available seats, or requested `seatNumber` exceeding bus capacity |
  | `429 Too Many Requests` | Rate limit exceeded |
  | `500 Internal Server Error` | Unexpected internal failure |

#### 3. Get Booking Details
- **Method / Path**: `GET /api/v1/bookings/:id`
- **Path Parameters**: `id` (string, pattern `^bkg_[a-z0-9]+$`)
- **Curl Example**:
  ```bash
  curl -X GET "$BASE/api/v1/bookings/bkg_cm7bkg554433"
  ```
- **Response Notes**: The booking object from endpoint 2, plus an embedded `schedule`:
  ```json
  {
    "data": {
      "id": "bkg_cm7bkg554433",
      "seatNumber": 12,
      "status": "CONFIRMED",
      "schedule": {
        "id": "sch_cm7xyz998877",
        "departureTime": "2026-10-02T07:00:00.000Z",
        "busRegistrationNumber": "LAG-482-KJ",
        "busModel": "Mercedes-Benz Tourismo",
        "operator": { "id": "op_cm7xyz12345", "name": "ABC Transport Plc", "code": "ABC", "supportPhone": "+2348030000007" },
        "route": { "originState": "Lagos", "originCity": "Jibowu Terminal", "destinationState": "FCT", "destinationCity": "Utako Central Park" }
      }
    }
  }
  ```
- **Errors**: `400` (malformed `id`), `404`, `429`, `500`.

#### 4. Update or Cancel Booking
- **Method / Path**: `PATCH /api/v1/bookings/:id`
- **Path Parameters**: `id` (string, pattern `^bkg_[a-z0-9]+$`)
- **Request Body**: All fields optional; only supplied keys are updated.

  | Field | Type | Notes |
  | :--- | :--- | :--- |
  | `status` | enum | `CONFIRMED`, `CANCELLED` |
  | `passengerName` | string | Min 2 characters |
  | `passengerPhone` | string | Min 5 characters |
  | `passengerEmail` | string | Must be a valid email |

- **Cancellation Semantics**: The update runs inside a Prisma `$transaction`. When a booking transitions from `CONFIRMED` to `CANCELLED`, the seat is returned to the schedule by incrementing `availableSeats` by 1 in the same transaction. A `CANCELLED` → `CONFIRMED` transition does not re-decrement, and re-cancelling an already-cancelled booking is a no-op for seat counts.
- **Curl Example**:
  ```bash
  curl -X PATCH "$BASE/api/v1/bookings/bkg_cm7bkg554433" \
    -H "Content-Type: application/json" \
    -d '{"status":"CANCELLED"}'
  ```
- **Example Response (`200 OK`)**: The updated booking with `schedule` embedded as `{ id, departureTime, operator: { name, code }, route: { originCity, destinationCity } }`.
- **Errors**: `400` (malformed `id` or unparseable JSON body), `404`, `422` (field-level validation failure, e.g. an invalid `status` value), `429`, `500`.

---

## 6. Rate Limiting & Error Handling

### Rate Limiting Specification
- **Threshold**: 100 requests per minute per IP address.
- **Store**: Shared Upstash Redis (`@upstash/ratelimit`), using a sliding window of `100` requests per `60 s`.
- **Degraded Mode Caveat**: If Upstash Redis environment variables are missing or empty (e.g. during offline local development), the system automatically falls back to an **in-memory fixed window** rate limiter. The window is anchored at the first request from an IP and resets 60 seconds later; individual request timestamps are not retained, so this fallback is *not* a sliding window. At a window boundary a client may briefly exceed the nominal threshold. *Note: In-memory rate limiting does not coordinate request counts across multiple serverless function instances.*
- **Headers Returned**:
  - `X-RateLimit-Limit`: Maximum requests permitted per window (`100`)
  - `X-RateLimit-Remaining`: Remaining request quota in current window
  - `Retry-After`: Seconds to wait before retrying when rate limited (`429`)

### Error Envelope & HTTP Status Codes

#### Standard Error Envelope
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid sort field 'invalid_sort'. Allowed fields: [createdAt, name, code]"
  }
}
```

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
