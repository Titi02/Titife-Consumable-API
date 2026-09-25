# Titife Consumable API — Nigerian Intercity Bus Transport API

A production-grade, highly reliable RESTful Web API for intercity bus transport operations across Nigeria. Built with **Next.js (App Router)**, **TypeScript**, **Prisma**, and **PostgreSQL**.

---

## 1. Public API URL & Consumer Application
- **Public API Base URL**: `https://titife-consumable-api.vercel.app/api/v1`
- **Consumer Web App**: `https://titife-consumable-api.vercel.app/`

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

# Public API Base URL for consumer client
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

### Global Query Standards
- `limit`: Default `20`, maximum `100`. Values > 100 are automatically clamped to 100.
- `offset`: Default `0`. Negative or non-integer offsets return `400 Bad Request`.
- `sort` & `order`: Whitelisted per resource. Unrecognized sort fields return `400 Bad Request` listing valid fields.

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
  curl -X GET "https://titife-consumable-api.vercel.app/api/v1/operators?limit=2&sort=name&order=asc"
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
  curl -X POST "https://titife-consumable-api.vercel.app/api/v1/operators" \
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

#### 3. Get Operator Details
- **Method / Path**: `GET /api/v1/operators/:id`
- **Curl Example**:
  ```bash
  curl -X GET "https://titife-consumable-api.vercel.app/api/v1/operators/op_cm7xyz12345"
  ```

---

### Routes API

#### 1. List Routes
- **Method / Path**: `GET /api/v1/routes`
- **Query Parameters**: `limit`, `offset`, `sort` (`createdAt`, `baseFareAmount`, `distanceKm`, `originCity`), `order`, `originState`, `destinationState`, `status`, `operatorId`.
- **Curl Example**:
  ```bash
  curl -X GET "https://titife-consumable-api.vercel.app/api/v1/routes?originState=Lagos&destinationState=FCT"
  ```

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

---

### Schedules API

#### 1. List Schedules
- **Method / Path**: `GET /api/v1/schedules`
- **Query Parameters**: `limit`, `offset`, `sort` (`departureTime`, `fareAmount`, `availableSeats`, `createdAt`), `order`, `routeId`, `operatorId`, `status`, `departureDate` (YYYY-MM-DD), `minAvailableSeats`.
- **Curl Example**:
  ```bash
  curl -X GET "https://titife-consumable-api.vercel.app/api/v1/schedules?minAvailableSeats=5&sort=departureTime"
  ```

---

### Bookings API

#### 1. Create Passenger Booking (Atomic Seat Allocation)
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
- **Curl Example**:
  ```bash
  curl -X POST "https://titife-consumable-api.vercel.app/api/v1/bookings" \
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

---

## 6. Rate Limiting & Error Handling

### Rate Limiting Specification
- **Threshold**: 100 requests per minute per IP address.
- **Store**: Shared Upstash Redis (`@upstash/ratelimit`).
- **Degraded Mode Caveat**: If Upstash Redis environment variables are missing (e.g. during offline local development), the system automatically falls back to an in-memory sliding window rate limiter. *Note: In-memory rate limiting does not coordinate request counts across multiple serverless function instances.*
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
