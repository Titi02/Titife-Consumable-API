# Titife Consumable API — Assessment Write-Up

What was built, the decisions behind it, and how it was verified. The API reference is deliberately **not** repeated here: every route, parameter, body, response shape, and `curl` example is in [`README.md`](README.md) §4,
requirements in [`docs/PRD.md`](docs/PRD.md), operating rules in [`AGENTS.md`](AGENTS.md).

## 1. Project Overview

A public read/write REST API for Nigerian intercity bus transport — **Next.js 15 (App Router), TypeScript, Prisma, PostgreSQL (Neon)**, Zod validation, Upstash Redis rate limiting — deployed on **Railway**
and consumed by a bundled web client. Money is stored strictly as integer kobo in NGN; every response uses one success envelope and one error envelope.
**Live public API base URL:** `https://exemplary-smile-production-8df4.up.railway.app/api/v1` (deployment origin
`https://exemplary-smile-production-8df4.up.railway.app`) — see §7.

## 2. Scope

**Built.** 18 endpoint/method combinations, all under `/api/v1/`: `GET`/`POST` on the 4 collections (8), `GET`/`PATCH` on the 4 `:id` routes (8), plus 2 read-only
sub-resource lists (`/operators/:id/routes`, `/routes/:id/schedules`). One consumer page (`src/app/page.tsx`) with resource tabs, a search/filter bar, and
next/previous paging driven entirely by the API's `meta` block.

| Resource | Prefix | Purpose | Seeded |
| :--- | :--- | :--- | :--- |
| Operators | `op_` | Transport companies | 200 |
| Routes | `rot_` | Intercity corridors between states/cities | 300 |
| Schedules | `sch_` | A specific departure on a route | 300 |
| Bookings | `bkg_` | A passenger ticket against a schedule | 500 |

**Intentionally excluded** (PRD non-goals — scope decisions, not omissions): no auth/JWT/RBAC, so all 18 endpoints are public; no admin panel or marketing pages, so the only page is
the consumer at `/`; no payment gateway, so bookings are recorded `CONFIRMED` with a `totalAmount` and no money moves (a webhook would add a secret, a reconciliation model, and
idempotency); no real-time GPS or WebSockets; no multi-currency, so `currency` is fixed `NGN` and all amounts are integer minor units.

## 3. Architecture and Implementation Summary

```
src/
  middleware.ts  rate limit gate (/api/:path*) · config/rateLimit.ts  RATE_LIMIT_CONFIG + checkRateLimit(ip)
  lib/           prisma singleton, cuid2 ids, envelope helpers, Zod schemas, pagination/sort validation
  app/           page.tsx consumer · api/[...path]/ JSON 404 catch-all · api/v1/<res>/ collections, [id]/, 2 subs
prisma/         schema.prisma (4 models, 4 enums, indexes) · seed.ts (deterministic Faker)
scripts/        test-hardening.ts (14 assertions)
```

- **One envelope, one error shape.** `successResponse` emits `{ data }`, adding `meta` only when pagination applies; `errorResponse` always emits `{ error: { code, message } }` (`envelope.ts:21,40`). No handler builds a response by hand, so a client parses any response without branching on the endpoint.
- **Framework errors intercepted, not leaked.** `api/[...path]/route.ts` returns a JSON `404` for all seven standard methods, so no unmatched path **under `/api/`** yields Next's HTML
  error page; every `v1` route also exports `PUT`/`DELETE`/`PATCH` handlers returning `405` with an `Allow` header. The catch-all governs `/api/**` only, so a page like `/operators`
  still falls through to Next's HTML 404.
- **Identifiers, money, connections.** Runtime IDs are non-sequential cuid2 with a resource prefix (`lib/id.ts:8`); seed IDs are `sha256("<prefix>:<natural key>")` truncated to 24
  hex chars, so re-seeding reproduces identical IDs and the README's examples stay valid. Malformed IDs are rejected by a prefix regex *before* any database call, so a bad ID
  yields `400`, never a `500` from a failed cast. Amounts are `Int` kobo (`₦18,215.00` → `1821500`), so there is no rounding path to get wrong. `schema.prisma:5-9` splits pooled
  `DATABASE_URL` (serverless handlers) from unpooled `DIRECT_URL` (`db push`, seeding); migrating on a pooled URL commonly causes advisory-lock timeouts.
- **Rate limiting sits in middleware, not handlers**, keyed on IP (`x-forwarded-for` → `x-real-ip` → `127.0.0.1`) and short-circuiting with `429`, so a new endpoint inherits the
  limit automatically and cannot forget it. Pinned to the Node runtime (`middleware.ts:47`) because `checkRateLimit` uses the Upstash REST client. `schema.prisma` indexes the columns
  lists filter and sort on, so common reads are index scans.

## 4. Key Design Decisions

1. **Offset pagination, not cursor.** The consumer needs random page access; the contract mandates `meta.total`, which needs a `COUNT` regardless; and the data is bounded at
   200/300/300/500 rows. Cost accepted: `OFFSET N` is O(N), bounded by `MAX_LIMIT = 100` and sort-column indexes. Cursor would win for unbounded, forward-only tables, where
   `OFFSET 100000` still scans and discards and mid-paging inserts make clients duplicate one row and silently miss another.
2. **One transaction for seats; the constraint is the honest gap.** `POST /bookings` wraps the availability check, `availableSeats` decrement, and insert in one
   `prisma.$transaction` (`bookings/route.ts:98-152`), and `PATCH` returns the seat on `CONFIRMED`→`CANCELLED` (`bookings/[id]/route.ts:76-82`). **This guarantees atomicity, not full
   oversell protection:** under PostgreSQL's default `READ COMMITTED`, two genuinely simultaneous requests can read the same `availableSeats` before either commits. Closing that
   needs a database-level `CHECK (available_seats >= 0)` or an explicit `SELECT … FOR UPDATE`. The PRD calls for the constraint; **it is not yet in `schema.prisma`** — the next
   hardening step, stated rather than hidden.
3. **Validation and whitelists before the database.** Zod validates path params, query strings, and bodies first: query/path failures are `400`, body failures `422` naming the field path, and a non-whitelisted `sort` returns `400` listing the allowed fields.
4. **Integers for money, one currency.** `Int` kobo with `currency` defaulting to `NGN`; a second currency would need FX rates and rounding rules, which is exactly what integer minor units avoid.
5. **One rate-limit constant read by both backends.** `RATE_LIMIT_CONFIG` (`rateLimit.ts:4-7`) feeds the Upstash sliding window *and* the in-memory fallback, so a fallback incident cannot silently enforce a different limit than production. `middleware.ts` never mentions `100`, only the `{ success, limit, remaining, resetSeconds }` return, so the limiter is swappable.

## 5. Requirements Satisfied

| Requirement | How it is met |
| :--- | :--- |
| All endpoints under `/api/v1/`; one success + error envelope | No unversioned aliases; `{ data, meta? }` and `{ error: { code, message } }` from one helper each (`envelope.ts:21,40`) |
| JSON `404` on unmatched paths; `405` + `Allow` on bad methods | Catch-all (7 methods) plus explicit `PUT`/`DELETE`/`PATCH` stubs per route (`[...path]/route.ts`, `routes/route.ts:107`) |
| Pagination: default 20, max 100, clamp not reject, negative/non-integer `offset` → `400` | `DEFAULT_LIMIT`/`MAX_LIMIT`, `Math.min` clamp, `Number.isInteger` guards (`common.ts:5-6,30,41,46`) |
| `meta` = total, limit, offset, hasMore | Counted in parallel with the page query; `hasMore = offset + data.length < total` (`routes/route.ts:43-58`) |
| ≥2 filters per resource | 2–4 each (`status`, `search`, `originState`, `destinationState`, `operatorId`, `routeId`, `departureDate`, `minAvailableSeats`, `scheduleId`), all indexed; full list in README §4 |
| Whitelist-only sorting; body validated before DB access | Violation → `400` naming allowed fields; Zod `safeParse` failure → `422` with the field path (`common.ts:81-90`) |
| Integer kobo, single currency; prefixed non-sequential IDs | `Int` columns, `currency` default `NGN`; cuid2 at runtime, stable sha256 in seed (`schema.prisma:60,85,107`, `id.ts:8`) |
| IP rate limit 100/min, Redis-backed, with headers | `checkRateLimit(ip)` in middleware, Upstash sliding window; `X-RateLimit-*` always, `Retry-After` on `429` (`rateLimit.ts:4-7`, `middleware.ts:26-38`) |
| Deterministic repeatable seed | `faker.seed(42)`, fixed UTC anchors, natural-key-derived IDs (`seed.ts:14,21-27,74-77`) |

## 6. Deployment and Verification

Deployed to Railway against Neon PostgreSQL with Upstash Redis; local reproduction is README §1 (`db:push` → `db:seed` → `dev`). `NEXT_PUBLIC_API_BASE_URL` is inlined at build
time, so changing it requires a rebuild, not a restart. Release order: provision Neon → set both DB URLs → push and seed against the **direct** URL → set Upstash credentials →
deploy → set the consumer origin and rebuild.

**Automated suite.** `scripts/test-hardening.ts` runs 14 assertions against a running server (`BASE_URL`, `scripts/test-hardening.ts:3`), exiting non-zero on failure: limit clamping,
negative limit/offset, unknown `sort`, invalid `order`, malformed and unknown IDs, malformed JSON, missing required field, missing parent operator, unversioned and invented paths,
`405` + `Allow`, and rate limit headers on `200`. Commit `2ebe8fb` records **14/14 passed**; `npm run build` and `npx tsc --noEmit` pass.

**Live probes** against a production build reproduced every documented value, including `GET /routes?originState=Lagos&destinationState=FCT` → `total=12`; `offset=980` on operators → `200` with `data: []` and `hasMore: false` (the §8.2 answer); `PUT /routes` → `405` with `Allow: GET, POST`; and rate limit headers present even on a `404`.

**Database drift, documented not hidden.** The live database is not at a pure seed baseline: `sch_6b09dbe92295ab9a9dadfca7` reports `availableSeats=15` with 3 bookings, because a booking
from an earlier test run sits beside the two seeded rows. README examples state the **seed baseline** (`availableSeats=16`, 2 bookings), which `db:seed` restores exactly — and that
drift is itself proof of the seat formula: the test booking was issued `seatNumber=3` = `totalSeats(18) − availableSeats(16) + 1`.

## 7. Evidence

**Live API base URL:** `https://exemplary-smile-production-8df4.up.railway.app/api/v1` (deployment origin `https://exemplary-smile-production-8df4.up.railway.app`).

This is the **publicly accessible deployed API**, not a local server. It was **externally verified**: the artefacts below were captured against that deployment and agree with
the contract documented in README §4. Anyone can reproduce them by pointing `curl` or a browser at the base URL above.

| Artifact | What it demonstrates |
| :--- | :--- |
| [`prisma/seed.ts`](prisma/seed.ts) | **Repeatable seed evidence.** `faker.seed(42)` with fixed UTC anchors makes rows reproducible; IDs are `sha256`-derived from natural keys truncated to 24 hex chars (`seed.ts:74-77`); the run wipes first (`seed.ts:102-106`) so re-seeding cannot duplicate; `availableSeats` is `totalSeats` minus that schedule's bookings (`seed.ts:182`); it then asserts no overbooking, no duplicate `(scheduleId, seatNumber)` pair and no non-positive fare, and prints a dataset fingerprint (`seed.ts:256-297`). Source of truth for every documented example value. |
| ![Live API pagination](evidence/live-api-pagination.png) | **Live API pagination.** A deployed list response returns `data` together with a `meta` block carrying `total`, `limit`, `offset`, and `hasMore` — not a bare array, and not a client-side-computed page count. |
| ![Live rate limit 429](evidence/live-rate-limit-429.png) | **Live `429 Too Many Requests` rate-limit response.** The limit is enforced in production, not merely configured: crossing the threshold returns `429` with the error envelope, and `Retry-After`, `X-RateLimit-Limit`, and `X-RateLimit-Remaining` travel with the response. |
| ![Live consumer](evidence/live-consumer.png) | **Consumer displaying data from the live API.** The bundled consumer renders real rows, tabs, filters, and paging purely from the documented envelope, with no bespoke endpoints. |

## 8. Defence Questions

### 1. Why offset pagination, and when would cursor be better?

**Chosen: offset**, for the three project-specific reasons in §4.1 — the consumer needs random page access, `meta.total` requires a `COUNT` either way, and the datasets are
bounded at 200/300/300/500 rows. The real cost is O(N) offset scanning, mitigated by the `MAX_LIMIT = 100` clamp and sort-column indexes. **Cursor would be better** when a table grows
unboundedly and clients only move forward (infinite scroll, event feeds), where `OFFSET 100000` still scans and discards 100,000 rows, or where rows are inserted mid-paging and shift
the window so clients duplicate one row and silently miss another. A cursor anchors on the last-seen sort key and is immune, at the cost of the random access and absolute totals this
consumer needs.

### 2. What happens if I request page 50 of a resource that has 30 pages?

There is no `page` parameter — pages are a client-side concept, `page = offset / limit + 1`. So "page 50 at limit 20" is `GET /api/v1/operators?limit=20&offset=980`, returning **`200 OK`
with an empty `data` array** and `meta.hasMore: false` — not a `404`, and not an error. `980` is a valid non-negative integer, so `parsePaginationParams` accepts it
(`common.ts:46`); only a *negative* or non-integer offset is a `400`. Prisma's `skip: 980` past the end of the 200-row operators set is a legitimate result, not a client mistake.
`hasMore = offset + data.length < total` → `980 + 0 < 200` → `false` (`routes/route.ts:58`). That `hasMore: false` is the contract that stops the client, and the accurate `total`
also lets it detect the overrun itself. Confirmed live — see §6.

### 3. Where does the rate limit number live, and why there?

`src/config/rateLimit.ts:4-7` — `RATE_LIMIT_CONFIG = { maxRequests: 100, windowSeconds: 60 }`. `checkRateLimit()` reads this one constant in *both* branches: the Upstash sliding window
(`rateLimit.ts:31-34`) and the in-memory fixed-window fallback (`rateLimit.ts:65,74,82`). If the number were duplicated per branch, a fallback incident could silently enforce a different
limit than production; one constant makes divergence impossible. The value is a capacity policy tied to Neon's pooled connection limits and Railway function concurrency, so it belongs
in version control where it is reviewable in a diff, not in an env var where an accidental production override would change behaviour with no code trace.

**Honest caveat:** the fallback is a *fixed* window, not sliding, so a client can briefly exceed 100 at a boundary, and being per-process it does not coordinate across serverless instances. It exists so local dev works without Redis, and the caveat is documented at `rateLimit.ts:12-15`.

### 4. I want to add a field to a resource without breaking existing clients.

**Rule: only ever add. Never rename, retype, or remove.** Additive changes are cheap here because no client keys off column ordinals, no ID is a database integer, and responses are not field-whitelisted at the top level.

1. **Migration** — give the column a `NOT NULL DEFAULT` or make it nullable (`refundPolicy String?`), then `db:push`: additive, so no table rewrite and no lock of consequence.
2. **Accept on write, but optional** — add `refundPolicy: z.string().min(2).max(120).optional()` to the create schema. This is the real breaking point in most APIs: a body from a client built before the field existed must still return `201`.
3. **Sorting is opt-in** — `SORT_WHITELIST` is closed (`routes/route.ts:9`), so the field is not sortable until deliberately added; that also guards against `ORDER BY` on an unindexed column.
4. **No response-layer change** — `findMany`/`findUnique` return scalars with no explicit field list, so the column appears in list and detail automatically, and a full-entity `PATCH` needs no handler change. Filtering it requires a `where` block plus an index.
5. **Check strict clients, then document** — the consumer reads `json.data` into a loosely typed `any[]` (`page.tsx:30,68`), so an extra key is invisible to it; a client using `additionalProperties: false` would need a change. Then add the field to the README §3 resource table — the README is the contract, so an undocumented field is still undocumented.

**Off-limits because it would break clients:** renaming a field, `Int` → `String`, changing an enum's existing members, making an optional field required, or turning a `data` array into an object. Removing a field is a rename with extra steps. If a field must change meaning, add a new one and deprecate the old.
