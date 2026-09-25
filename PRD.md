# Product Requirements Document (PRD) — Titife Consumable API

## 1. Product Summary
**Titife Consumable API** is a production-grade, highly reliable RESTful Web API for intercity bus transport operations across Nigeria. Built on Next.js (App Router), TypeScript, Prisma, and PostgreSQL, the API provides public read/write capabilities for operators, intercity routes, bus schedules, and passenger bookings. All monetary amounts are stored strictly as integers in minor units (NGN kobo). The project features strict validation (Zod), standardized success/error response envelopes, IP-based rate limiting via a shared Redis store, repeatable deterministic database seeding, comprehensive documentation, and a minimal web consumer application deployed on Vercel.

---

## 2. Problem Statement & Goals
### Problem Statement
Intercity bus travel systems require predictable, low-latency, and well-structured API contracts to manage schedules, seat availability, and bookings across various operators. Unhandled edge cases, inconsistent error responses, floating-point monetary errors, and unthrottled endpoints often cause integration friction and runtime instability.

### Goals
- **API Standardization**: Enforce a strict `/api/v1/` endpoint convention with standard success and error response envelopes for all requests, including unmatched routes (`404`) and unsupported methods (`405`).
- **Data Integrity & Consistency**: Enforce strict validation (Zod), whitelist-based sorting, offset-based pagination with clamping (max 100), and integer minor units for NGN currency.
- **Race Condition Safety**: Protect seat allocation during booking creation using atomic Prisma transactions and database CHECK constraints.
- **Production Hardening**: Enforce IP-based rate limiting (100 req/min) via Redis, honest HTTP status codes (200, 201, 400, 404, 405, 422, 429, 500), and comprehensive OpenAPI-style documentation in `README.md`.
- **Public Proof & Consumption**: Deploy to Vercel with Neon PostgreSQL and Upstash Redis, and provide a lightweight web consumer UI to verify live pagination, filtering, and data fetching.

### Non-Goals
- User authentication, login/JWT, or RBAC.
- Admin dashboards or marketing landing pages.
- Real-time GPS tracking or WebSocket notifications.
- Payment gateway integration (Flutterwave/Paystack live calls).
- Support for multiple currencies outside of NGN.

---

## 3. Resource Model & Schema Architecture

All resources use prefix-based non-sequential generated string identifiers (e.g. `op_...`, `rot_...`, `sch_...`, `bkg_...`).

### Resource 1: Operator (`operators`)
Represents an intercity bus transport company.
- `id` (String, PK): Prefixed CUID/UUID (e.g., `op_cm7...`)
- `name` (String, Unique): Public commercial name (e.g., "Peace Mass Transit")
- `code` (String, Unique): Short 3-4 letter uppercase ticker (e.g., "PMT")
- `headquarters` (String): Primary operational hub city (e.g., "Enugu", "Lagos")
- `supportEmail` (String): Support contact email
- `supportPhone` (String): Support contact phone number
- `status` (Enum: `ACTIVE`, `INACTIVE`): Operational status
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

### Resource 2: Route (`routes`)
Represents an intercity travel corridor between two Nigerian cities/states.
- `id` (String, PK): Prefixed ID (e.g., `rot_...`)
- `operatorId` (String, FK -> `Operator.id`): Operating transport company
- `originState` (String): Departure state (e.g., "Lagos")
- `originCity` (String): Departure city/terminal (e.g., "Jibowu")
- `destinationState` (String): Arrival state (e.g., "FCT")
- `destinationCity` (String): Arrival city/terminal (e.g., "Utako")
- `distanceKm` (Int): Route distance in kilometers
- `estimatedMinutes` (Int): Estimated travel duration in minutes
- `baseFareAmount` (Int): Base ticket price in NGN kobo (e.g., 2500000 = ₦25,000.00)
- `currency` (String, Default: "NGN"): Fixed currency unit
- `status` (Enum: `ACTIVE`, `SUSPENDED`)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

### Resource 3: Schedule (`schedules`)
Represents a specific scheduled bus departure for a route.
- `id` (String, PK): Prefixed ID (e.g., `sch_...`)
- `routeId` (String, FK -> `Route.id`)
- `operatorId` (String, FK -> `Operator.id`)
- `busRegistrationNumber` (String): Vehicle license plate (e.g., "LSD-492-XY")
- `busModel` (String): Vehicle type (e.g., "Toyota HiAce 14-Seater")
- `totalSeats` (Int): Total passenger capacity
- `availableSeats` (Int): Remaining unbooked seats (must be >= 0)
- `departureTime` (DateTime): Scheduled departure time
- `arrivalTime` (DateTime): Estimated arrival time
- `fareAmount` (Int): Ticket price in NGN kobo
- `currency` (String, Default: "NGN")
- `status` (Enum: `SCHEDULED`, `BOARDING`, `COMPLETED`, `CANCELLED`)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

### Resource 4: Booking (`bookings`)
Represents a passenger ticket reservation.
- `id` (String, PK): Prefixed ID (e.g., `bkg_...`)
- `scheduleId` (String, FK -> `Schedule.id`)
- `passengerName` (String): Passenger full name
- `passengerPhone` (String): Contact phone number
- `passengerEmail` (String): Contact email address
- `seatNumber` (Int): Allocated seat number
- `totalAmount` (Int): Total paid in NGN kobo
- `currency` (String, Default: "NGN")
- `bookingReference` (String, Unique): Alphanumeric code (e.g., "NG-BUS-789012")
- `status` (Enum: `CONFIRMED`, `CANCELLED`)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

---

## 4. Identifier Strategy
- All primary keys use custom prefix strings:
  - Operators: `op_` + `cuid2` / nanoid
  - Routes: `rot_` + `cuid2` / nanoid
  - Schedules: `sch_` + `cuid2` / nanoid
  - Bookings: `bkg_` + `cuid2` / nanoid
- Public IDs are non-sequential to prevent enumeration attacks.
- Malformed IDs submitted in URL parameters are caught by Zod path validators and return `400 Bad Request` or `404 Not Found`, never causing internal database `500` crashes.

---

## 5. Endpoint Inventory

All endpoints strictly live under `/api/v1/`.

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/operators` | List bus operators (Paginated, Filtered, Sorted) |
| `POST` | `/api/v1/operators` | Create a new bus operator |
| `GET` | `/api/v1/operators/:id` | Get operator details by ID |
| `PATCH` | `/api/v1/operators/:id` | Update operator details |
| `GET` | `/api/v1/operators/:id/routes` | List routes operated by operator |
| `GET` | `/api/v1/routes` | List intercity routes (Paginated, Filtered, Sorted) |
| `POST` | `/api/v1/routes` | Create a new intercity route |
| `GET` | `/api/v1/routes/:id` | Get route details by ID |
| `PATCH` | `/api/v1/routes/:id` | Update route details |
| `GET` | `/api/v1/routes/:id/schedules` | List upcoming schedules for route |
| `GET` | `/api/v1/schedules` | List bus schedules (Paginated, Filtered, Sorted) |
| `POST` | `/api/v1/schedules` | Create a new bus schedule |
| `GET` | `/api/v1/schedules/:id` | Get schedule details by ID |
| `PATCH` | `/api/v1/schedules/:id` | Update schedule details/status |
| `GET` | `/api/v1/bookings` | List bookings (Paginated, Filtered, Sorted) |
| `POST` | `/api/v1/bookings` | Create a passenger booking (atomic seat decrement) |
| `GET` | `/api/v1/bookings/:id` | Get booking details by ID |
| `PATCH` | `/api/v1/bookings/:id` | Cancel/update booking |
| `ALL` | `/api/v1/[...path]` | Catch-all returning JSON `404 NOT_FOUND` |

---

## 6. Pagination, Filtering, & Sorting Standard

### Pagination Rules
- Query Parameters: `limit` (default: 20, max: 100), `offset` (default: 0).
- Limits > 100 are automatically clamped to 100 (not rejected).
- Negative offset or invalid non-integer query params return `400 Bad Request`.
- Meta Object in Envelope:
  ```json
  "meta": {
    "total": 340,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
  ```

### Filtering Rules (At least 2 per resource)
- **Operators**: `status` (`ACTIVE`/`INACTIVE`), `search` (matches name or headquarters)
- **Routes**: `originState`, `destinationState`, `status` (`ACTIVE`/`SUSPENDED`), `operatorId`
- **Schedules**: `routeId`, `operatorId`, `status` (`SCHEDULED`/`BOARDING`/etc.), `departureDate` (YYYY-MM-DD), `minAvailableSeats`
- **Bookings**: `scheduleId`, `status` (`CONFIRMED`/`CANCELLED`), `search` (passenger name or phone)

### Sorting Rules
- Query Parameters: `sort` (field name), `order` (`asc` or `desc`, default `asc`).
- Whitelisted Sort Fields per resource:
  - **Operators**: `createdAt`, `name`, `code`
  - **Routes**: `createdAt`, `baseFareAmount`, `distanceKm`, `originCity`
  - **Schedules**: `departureTime`, `fareAmount`, `availableSeats`, `createdAt`
  - **Bookings**: `createdAt`, `seatNumber`, `totalAmount`
- If an un-whitelisted `sort` field is supplied, the API MUST return `400 Bad Request` with an explicit error envelope: `"Invalid sort field 'xyz'. Allowed fields: [...]"`.

---

## 7. Response Envelopes & Error Handling

### Standard Success Envelope
Every successful response (`200 OK`, `201 Created`) uses this structure:
```json
{
  "data": [...],
  "meta": {
    "total": 340,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```
*Note: Single entity `GET` / `POST` responses return `"data": { ... }` without the `"meta"` pagination object.*

### Standard Error Envelope
Every error response uses this structure:
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Negative offset is not allowed"
  }
}
```

### Framework Default Error Interception
To guarantee no bare HTML 404 or bare text 405 error escapes:
1. **Unmatched API Paths**: A catch-all route `src/app/api/[...path]/route.ts` catches any route under `/api/` not matched by specific route handlers, returning `404` with `{ "error": { "code": "NOT_FOUND", "message": "Route not found" } }`.
2. **Unsupported Methods**: Every route handler exports explicit handler functions for all standard HTTP methods (`GET`, `POST`, `PATCH`, `PUT`, `DELETE`). Unsupported methods return `405 Method Not Allowed` with header `Allow: GET, POST` (as appropriate) and body `{ "error": { "code": "METHOD_NOT_ALLOWED", "message": "Method PUT not allowed on this endpoint" } }`.

### Status Codes Matrix
- `200 OK`: Successful fetch/update.
- `201 Created`: Successful resource creation.
- `400 Bad Request`: Invalid query parameters, bad sorting fields, negative offset, malformed UUID/CUID.
- `404 Not Found`: Resource does not exist or unmatched endpoint.
- `405 Method Not Allowed`: Unsupported HTTP method on existing route.
- `422 Unprocessable Entity`: Validation failure on request body (missing required fields, type mismatch).
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: Unhandled server error.

---

## 8. Rate Limiting Architecture
- Keyed on client IP address.
- Configuration: 100 requests per minute.
- Config location: Centralized in `src/config/rateLimit.ts`.
- Shared Store: Upstash Redis (`@upstash/redis` + `@upstash/ratelimit`).
- Degraded In-Memory Fallback: Documented fallback for local offline dev or missing Redis env vars.
- Headers returned on `429`:
  - `Retry-After`: seconds until window reset
  - `X-RateLimit-Limit`: max requests
  - `X-RateLimit-Remaining`: remaining requests

---

## 9. Seed Strategy
- Deterministic random generation using Faker (`@faker-js/faker`) with a fixed seed (`faker.seed(42)`).
- Volume:
  - 10 Operators
  - 50 Routes
  - 200 Schedules
  - 500 Bookings
- Idempotency: Re-running `prisma db seed` wipes and re-seeds clean without duplication or ID drift.
- Currency: All monetary amounts generated as integer kobo (e.g. 1,500,000 to 4,500,000 kobo).

---

## 10. Database Connection Architecture
- Serverless API Routes (`src/app/api/...`): Use `DATABASE_URL` (Pooled Connection via Prisma Accelerate / PgBouncer / Neon pooled string).
- Migrations & Seeding (`prisma migrate`, `prisma db seed`): Use `DIRECT_URL` (Direct Connection string to PostgreSQL instance).

---

## 11. Consumer Application Architecture
- Lightweight Next.js client rendered at root `/` or `/consumer`.
- Fetches data directly from the deployed API public production URL (configured via `NEXT_PUBLIC_API_BASE_URL`).
- UI Controls:
  - Resource selector (Operators / Routes / Schedules / Bookings).
  - Search / Filter bar (e.g. State filter, Status filter).
  - Next Page / Previous Page controls displaying pagination meta (`total`, `hasMore`, `offset`, `limit`).
  - Graceful rendering for Loading states, Empty state, and API Error states.

---

## 12. Risks & Assumptions
### Risks
- Serverless cold starts on Vercel with Prisma connection pool exhaustion (mitigated by using Neon connection pooling `DATABASE_URL`).
- Race conditions during peak seat booking attempts (mitigated by Prisma `$transaction` and SQL CHECK constraint `available_seats >= 0`).

### Assumptions
- Upstash Redis credentials will be provided in environment variables (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) or in-memory fallback will run cleanly with explicit documentation.
- Vercel and Neon Postgres credentials will be available for production deployment.

---

## 13. Phased Implementation Roadmap
- **Phase 0**: Governance Documents (`PRD.md`, `AGENTS.md`) & Review.
- **Phase 1**: Scaffold Next.js App Router project, TypeScript, Prisma schema, PostgreSQL connection config, Zod schemas, helper utilities, seed script.
- **Phase 2**: Implement core API routes (`/api/v1/...`), list pagination/filtering/sorting, detail handlers, atomic booking creation, catch-all 404 route, method 405 handlers.
- **Phase 3**: Hardening, rate limiting integration, error envelope verification, bad input rejection testing (Step 4 checks).
- **Phase 4**: Production documentation in `README.md`, git setup, Vercel deployment setup, Neon DB migration, production seed execution, live URL verification.
- **Phase 5**: Web consumer UI implementation calling live URL, verification via browser tool.
- **Phase 6**: Final audit against requirements and acceptance criteria.
