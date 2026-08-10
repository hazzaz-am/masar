# Masar — Product Requirements Document

**Multi-tenant dispatch and last-mile delivery management for small courier operators**

---

## Document control

| Field | Value |
|---|---|
| Product | Masar (مسار — "route/path") |
| Document version | 2.0 |
| Status | Approved for implementation |
| Owner | Hazzaz — Product & Engineering |
| Delivery window | 1 Aug 2026 → 15 Oct 2026 |
| Target release | MVP / Release 1.0 |
| Last updated | 30 Jul 2026 |

### Revision history

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | Jul 2026 | Hazzaz | Initial draft |
| 2.0 | 30 Jul 2026 | Hazzaz | Restructured for implementation: added success metrics, acceptance criteria, requirement priorities, security/privacy/retention requirements, API conventions, release criteria, assumptions and dependencies |

### How to read this document

- Requirement IDs are stable and must not be renumbered. Reference them in commits, tickets, tests, and pull requests.
- **P0** requirements are release-blocking. **P1** requirements ship in Release 1.0 if the schedule holds and may be deferred by explicit decision recorded in §13.
- Anything not stated as a requirement is out of scope. §11 is the authoritative scope boundary.

---

## 1. Product overview

Masar is a multi-tenant SaaS platform for dispatch and last-mile delivery management, aimed at courier operators running 5–50 drivers. It provides a live dispatch board for coordinators, an offline-capable driver application, unauthenticated shipment tracking for recipients, and a complete, append-only delivery history.

The product covers dispatch and tracking only. Fleet maintenance, HR and payroll, warehouse inventory, and accounting are separate product domains and are out of scope.

### 1.1 Problem statement

Small courier and last-mile operators coordinate daily operations through WhatsApp groups, spreadsheets, and phone calls. The prevailing workflow is:

1. A coordinator receives delivery requests by phone, WhatsApp, or email.
2. Addresses are pasted into a group chat; drivers claim jobs informally.
3. Drivers report completion with a photo message, or do not report at all.
4. Package location is unknowable without calling the driver.
5. Cash collected on delivery is reconciled at end of shift by counting notes against a handwritten list.
6. The recipient has no visibility and calls the coordinator to ask for status.

### 1.2 Consequences of the current workflow

| Problem | Business impact |
|---|---|
| No audit trail | Missing packages cannot be traced to a person, time, or location |
| No proof of delivery | Customer disputes are resolved by concession, not evidence |
| Status opacity | Coordinator capacity is consumed by inbound status calls |
| Manual cash reconciliation | Cash discrepancies surface days late and cannot be attributed |
| No recipient self-service | Every delivery generates avoidable support contact |

### 1.3 Product positioning

Masar replaces the group chat and the spreadsheet with three surfaces: a live dispatch board, a driver application that functions without network connectivity, and an append-only event history for every delivery.

The product does not compete on breadth with established platforms in this category. It competes on operational fit for small operators in bilingual (Arabic/English) markets: fast dispatch, reliable offline field capture, and dispute-grade delivery records.

---

## 2. Objectives and success metrics

### 2.1 Product objectives

| ID | Objective |
|---|---|
| PG-1 | A coordinator can create and assign a delivery in under 30 seconds |
| PG-2 | A driver can record status changes and capture proof of delivery with no network connection, and have that work sync reliably when connectivity returns |
| PG-3 | A recipient can view current delivery status without an account, from a link |
| PG-4 | Delivery history is append-only and complete enough to resolve a customer dispute without reference to any external system |
| PG-5 | Two tenants sharing a database can never read or write each other's data, enforced at the database layer rather than in application code alone |

### 2.2 Success metrics

Metrics marked *instrumented* are measured in Release 1.0; their targets are set after the first pilot deployment rather than assumed in advance.

| ID | Metric | Target | Measurement |
|---|---|---|---|
| SM-1 | Time from delivery-creation form open to driver assigned | ≤ 30s at p50 | Client-side instrumentation on the create-and-assign flow |
| SM-2 | Queued offline events lost | 0 | Sync reconciliation: every queued `client_event_id` is either applied or surfaced as a conflict |
| SM-3 | Offline events successfully applied on first sync attempt | ≥ 99% | Server-side sync outcome logging |
| SM-4 | Deliveries with a complete proof-of-delivery record on `delivered` | 100% | Database constraint + report |
| SM-5 | Cross-tenant access attempts that succeed | 0 | Automated isolation suite in CI (TR-2.7) |
| SM-6 | p95 read-endpoint latency under seeded load | < 200ms | Load test harness (§9.1) |
| SM-7 | Share of deliveries with ≥1 recipient tracking-page view | Instrumented | Tracking page analytics |
| SM-8 | Inbound status enquiries per 100 deliveries | Instrumented | Operator-reported, collected during pilot |

### 2.3 Non-goals for Release 1.0

- Feature parity with established last-mile platforms.
- Native iOS or Android applications.
- Vehicle routing problem (VRP) solving or route optimisation.
- Automated driver assignment.
- Live driver position streaming to recipients.

---

## 3. Users and roles

### 3.1 Coordinator (dispatcher) — primary user

Operations coordinator at a 5–50 driver courier company. Desk-based, working from a laptop with a phone in constant use. Typically bilingual; may prefer an English interface while reading Arabic addresses throughout the day.

- **Needs:** whole-operation visibility in one view, fast assignment, immediate notification of failures.
- **Primary success condition:** inbound "where is it?" calls decline because recipients can self-serve.

### 3.2 Driver — highest-risk surface

Field user completing 5–10 deliveries per shift on a mid-range Android device with intermittent data coverage. Basement car parks, service corridors, and lifts remove connectivity entirely. May read Arabic or English with limited literacy in the other.

- **Needs:** today's assigned list, large touch targets, full function without signal, no loss of captured proof of delivery.
- **Primary success condition:** the driver never needs to call the coordinator to report a status.

### 3.3 Recipient — unauthenticated

Receives a tracking link. Opens it once or twice per delivery. Sees delivery status, expected time window, and driver first name. Sees nothing else, under any circumstances.

### 3.4 Merchant — Phase 2

The business whose goods are delivered; creates deliveries and sees only its own. The data model carries a nullable `merchant_id` on deliveries in Release 1.0 so that Phase 2 does not require a data migration. No merchant interface is built in Release 1.0.

This establishes nested authorisation — tenant → merchant → deliveries — as the intended long-term authorisation model.

### 3.5 Role and permission matrix

| Capability | `owner` | `dispatcher` | `driver` | `merchant_user` (Phase 2) |
|---|---|---|---|---|
| Tenant settings | ✅ | ❌ | ❌ | ❌ |
| Billing and subscription | ✅ | ❌ | ❌ | ❌ |
| User management and invites | ✅ | ❌ | ❌ | ❌ |
| Create / edit deliveries | ✅ | ✅ | ❌ | Own merchant only |
| Assign / reassign drivers | ✅ | ✅ | ❌ | ❌ |
| Cancel a delivery | ✅ | ✅ | ❌ | ❌ |
| View all tenant deliveries | ✅ | ✅ | Assigned only | Own merchant only |
| Driver status transitions | ❌ | ❌ | Assigned only | ❌ |
| View audit log | ✅ | ❌ | ❌ | ❌ |

**Rules:** all roles are scoped to a single tenant. A user belongs to exactly one tenant. Role escalation is an `owner`-only action and is audit-logged.

---

## 4. Domain model

### 4.1 Terminology

| Term | Definition |
|---|---|
| Tenant | A courier operator account. The unit of data isolation and billing. |
| Delivery | A single job: one pickup, one dropoff. Named `Delivery` rather than `Order` to avoid e-commerce ambiguity. |
| Attempt | One physical effort to complete a dropoff. Tracked by `attempt_count`. |
| POD | Proof of delivery: photograph, signature, and recipient name captured at handover. |
| COD | Cash on delivery: money the driver collects from the recipient. |
| Seat | One active driver, the unit of subscription billing. |
| Tracking number | Public, non-sequential external identifier for a delivery. |
| Client event ID | UUID generated on the driver device to make event submission idempotent. |

### 4.2 Delivery entity

| Group | Fields |
|---|---|
| Pickup | address text, geo point, contact name, contact phone, window start, window end, notes |
| Dropoff | address text, geo point, contact name, contact phone, window start, window end, notes |
| Package | description, weight (kg), dimensions, fragile flag, piece count |
| Money | `price` (tenant's charge), `cod_amount` (nullable), `currency` |
| Assignment | `assigned_driver_id`, `assigned_at`, `assigned_by` |
| Identity | `tracking_number` (public, non-sequential), UUID primary key (internal only) |
| State | `status`, `attempt_count` |

### 4.3 Status lifecycle

```
created ──> assigned ──> accepted ──> en_route_to_pickup ──> picked_up
                │                                                │
                │                                                v
                │                                          in_transit
                │                                                │
                │                        ┌───────────────────────┤
                │                        v                       v
                │                  failed_attempt           delivered  [terminal]
                │                        │
                │              ┌─────────┴─────────┐
                │              v                   v
                │        rescheduled      returned_to_sender [terminal]
                │              │
                └──────────────┘  (back to assigned, attempt_count += 1)

cancelled [terminal] — reachable from any non-terminal state, dispatcher only
```

### 4.4 Transition table

This table is the specification. The server-side state machine must implement exactly these transitions and reject all others.

| From | To | Permitted actor | Guard conditions |
|---|---|---|---|
| `created` | `assigned` | `owner`, `dispatcher` | Target driver is active within the tenant |
| `assigned` | `accepted` | Assigned driver | — |
| `accepted` | `en_route_to_pickup` | Assigned driver | — |
| `en_route_to_pickup` | `picked_up` | Assigned driver | — |
| `picked_up` | `in_transit` | Assigned driver | — |
| `in_transit` | `delivered` | Assigned driver only | POD record present (BR-5) |
| `in_transit` | `failed_attempt` | Assigned driver | Failure reason code required (§4.5) |
| `failed_attempt` | `rescheduled` | `owner`, `dispatcher` | `attempt_count` < 3; new future dropoff window supplied |
| `failed_attempt` | `returned_to_sender` | `owner`, `dispatcher` | — |
| `rescheduled` | `assigned` | `owner`, `dispatcher` | `attempt_count` incremented on transition |
| Any non-terminal | `cancelled` | `owner`, `dispatcher` | — |

**Terminal states:** `delivered`, `returned_to_sender`, `cancelled`. No transition out of a terminal state exists.

### 4.5 Failure reason codes

Required on every `failed_attempt` transition:

`recipient_absent` · `recipient_refused` · `wrong_address` · `no_building_access` · `payment_unavailable` (COD) · `damaged_in_transit` · `other` (free-text note mandatory)

### 4.6 Business rules

| ID | Rule |
|---|---|
| BR-1 | Maximum 3 delivery attempts. On the third `failed_attempt`, `rescheduled` is no longer a legal transition; only `returned_to_sender` remains. |
| BR-2 | `rescheduled` requires a new dropoff time window with a start time in the future. |
| BR-3 | Only the assigned driver may transition a delivery to `delivered`. Coordinators may cancel or reassign but may not mark a delivery delivered. |
| BR-4 | All transitions are validated server-side against the state machine in §4.4. Illegal transitions return `409 Conflict`; malformed requests return `400 Bad Request`. The distinction is contractual — the offline client depends on it to separate "invalid request" from "no longer valid". |
| BR-5 | A `delivered` transition must be accompanied by a POD record containing at minimum a photograph or a signature, plus recipient name. |
| BR-6 | Reassigning an already-accepted delivery resets its state to `assigned` and records both the previous and new driver in the event log. |
| BR-7 | `cod_amount` is immutable once a delivery reaches `picked_up`. |

### 4.7 Event log

`delivery_events` is append-only and is the source of truth for delivery history. The `status` column on `deliveries` is a derived read optimisation, written in the same transaction as the corresponding event insert.

Every event carries:

| Field | Purpose |
|---|---|
| `from_status`, `to_status`, `reason_code` | The transition |
| `actor_user_id` | Attribution |
| `lat`, `lng` | Device location where available |
| `occurred_at` | When the event happened on the device |
| `recorded_at` | When the server received the event |
| `client_event_id` | Device-generated UUID; the idempotency key |

The separation of `occurred_at` from `recorded_at` is what makes offline operation correct. A `delivered` event may arrive at the server 40 minutes after the physical event. History is displayed using `occurred_at`; sync ordering, debugging, and reconciliation use `recorded_at`.

### 4.8 Data model

All tenant-scoped tables carry `tenant_id uuid NOT NULL` as the first column after the primary key.

```
tenants              id, name, slug, status, default_locale, timezone,
                     currency, created_at

users                id, tenant_id, email, password_hash, role, name,
                     phone, locale, status, last_login_at
                     UNIQUE (tenant_id, email)

drivers              id, tenant_id, user_id, vehicle_type, plate_number,
                     capacity_kg, status, seat_active_from, seat_active_to

merchants            id, tenant_id, name, contact_email, status
                     -- schema in Release 1.0, no UI until Phase 2

deliveries           id, tenant_id, merchant_id NULL, tracking_number,
                     status, attempt_count,
                     pickup_*, dropoff_*,
                     package_*, price, cod_amount, currency,
                     assigned_driver_id NULL, assigned_at, assigned_by,
                     created_by, created_at, updated_at
                     UNIQUE (tracking_number)

delivery_events      id, tenant_id, delivery_id, from_status, to_status,
                     reason_code NULL, notes, actor_user_id,
                     lat, lng, occurred_at, recorded_at, client_event_id
                     UNIQUE (tenant_id, client_event_id)

proofs_of_delivery   id, tenant_id, delivery_id, attempt_number,
                     photo_key, signature_key, recipient_name, captured_at

zones                id, tenant_id, name,
                     geometry geography(POLYGON, 4326)
                     -- schema in Release 1.0, used in Phase 2

subscriptions        id, tenant_id, stripe_customer_id,
                     stripe_subscription_id, seat_count, status,
                     current_period_start, current_period_end

stripe_events        id (Stripe event id, PK), type, payload, processed_at
                     -- webhook idempotency ledger; not tenant-scoped

audit_log            id, tenant_id, actor_user_id, action, entity_type,
                     entity_id, before jsonb, after jsonb, ip_address,
                     created_at
```

**Design note — `drivers` separate from `users`:** a driver carries domain attributes (vehicle, capacity, plate) and a seat-billing lifecycle (`seat_active_from`, `seat_active_to`) that a generic user record does not. Separating them keeps the proration query in §6.6 a simple interval calculation.

---

## 5. Functional requirements

Priority: **P0** = release-blocking, **P1** = in scope, deferrable by recorded decision.

### 5.1 Tenant onboarding and authentication

| ID | Priority | Requirement |
|---|---|---|
| FR-1.1 | P0 | Public signup creates a tenant and an `owner` user in a single transaction |
| FR-1.2 | P0 | Tenant selects default locale (`en`/`ar`), timezone, and currency at signup |
| FR-1.3 | P0 | Owner invites users by email with an assigned role; invite tokens expire after 72 hours and are single-use |
| FR-1.4 | P0 | Session authentication via httpOnly, `Secure`, `SameSite` cookie. The driver PWA uses a longer-lived refresh token; drivers must not be logged out mid-shift. |
| FR-1.5 | P0 | Password reset flow with single-use, time-limited tokens |
| FR-1.6 | P0 | Deactivating a user immediately invalidates all active sessions for that user |
| FR-1.7 | P0 | Password storage uses a memory-hard hash (Argon2id or bcrypt with cost ≥ 12). Authentication endpoints are rate limited per IP and per account. |

**Acceptance criteria**

- Signup creating a tenant whose slug already exists fails atomically, leaving no orphaned tenant or user row.
- An expired or already-consumed invite token returns a generic failure that does not reveal whether the email is registered.
- A deactivated user's next authenticated request returns `401` even with a previously valid cookie.

### 5.2 Coordinator web application

| ID | Priority | Requirement |
|---|---|---|
| FR-2.1 | P0 | Create delivery: pickup, dropoff, package, price, optional COD amount, time windows |
| FR-2.2 | P0 | Address entry is free text with optional manual map pin. No paid geocoding provider in Release 1.0 (§8.4). |
| FR-2.3 | P0 | Delivery list view with filters for status, driver, and date range; search by tracking number or recipient phone |
| FR-2.4 | P0 | Board view: columns by status, live-updating, drag a card onto a driver to assign |
| FR-2.5 | P0 | Manual assign, reassign, and unassign |
| FR-2.6 | P0 | Delivery detail view: full event timeline with actor and timestamp, POD photograph and signature, map of captured event locations |
| FR-2.7 | P0 | Board and detail views update in real time over WebSocket when a driver changes status — no polling, no manual refresh |
| FR-2.8 | P1 | Bulk create via CSV upload with row-level error reporting; partial success permitted |
| FR-2.9 | P0 | Driver management: add, deactivate, view today's assigned load |
| FR-2.10 | P0 | Failed deliveries are visually distinct in list and board views and filterable as a group |
| FR-2.11 | P0 | All list endpoints are paginated with a server-enforced maximum page size |

**Acceptance criteria**

- Assignment made in one browser session appears in a second session viewing the same board within 2 seconds, without refresh.
- WebSocket disconnection is visible to the user, and reconnection reconciles missed state rather than leaving a stale board.
- A CSV upload containing valid and invalid rows imports the valid rows and returns a per-row error report identifying each rejected row by line number.

### 5.3 Driver PWA — offline-first

The highest-risk surface in the product. Requirements here are specified more tightly than elsewhere because the failure modes are silent.

| ID | Priority | Requirement |
|---|---|---|
| FR-3.1 | P0 | Installable PWA; login persists across application restarts |
| FR-3.2 | P0 | "My jobs today" list ordered by dropoff window, showing only deliveries assigned to the authenticated driver |
| FR-3.3 | P0 | Today's jobs are cached locally (IndexedDB) and fully readable with no network connection |
| FR-3.4 | P0 | All status transitions function offline, queued locally with `client_event_id`, `occurred_at`, and device coordinates where available |
| FR-3.5 | P0 | POD capture works offline: client-compressed photograph, signature canvas, recipient name, held as a blob in IndexedDB until upload succeeds |
| FR-3.6 | P0 | Sync on reconnect replays the queue in `occurred_at` order; the server deduplicates on `(tenant_id, client_event_id)` |
| FR-3.7 | P0 | Sync state is always visible: pending count, syncing, synced, failed. A driver must never be uncertain whether work was saved. |
| FR-3.8 | P0 | Conflict handling: a queued transition rejected as illegal (`409`) — for example, the delivery was cancelled while the driver was offline — is marked conflicted, retained locally for audit, and surfaced to the driver in plain language. It is never silently discarded. |
| FR-3.9 | P1 | One-tap call to recipient via `tel:` link |
| FR-3.10 | P0 | COD amount displayed prominently on the delivery card when present |
| FR-3.11 | P0 | Queue replay is bounded and backs off on repeated failure; a permanently failing event surfaces to the driver rather than retrying indefinitely |

**Acceptance criteria**

- With the device in airplane mode, a driver can complete a full delivery from `accepted` to `delivered` including POD capture; on reconnection all events and the POD upload are applied exactly once.
- Killing the application and restarting the device with events queued loses nothing (NFR-4).
- Replaying the same queue twice produces no duplicate events and no duplicate POD records.
- A conflicted event remains visible in the driver's history with an explanation and is never resubmitted automatically.

### 5.4 Public tracking page

Unauthenticated surface. Treated as hostile by default.

| ID | Priority | Requirement |
|---|---|---|
| FR-4.1 | P0 | `GET /t/:trackingNumber` — no authentication, no session |
| FR-4.2 | P0 | Tracking numbers are non-sequential and non-guessable: 12-character base32, approximately 60 bits of entropy. UUID primary keys and integer IDs are never exposed. |
| FR-4.3 | P0 | Response payload is minimal and explicitly allowlisted: status, coarse status history (timestamps only), dropoff time window, driver first name, tenant display name and logo |
| FR-4.4 | P0 | Never exposed: recipient phone or full address, price, COD amount, driver phone or surname, internal identifiers, any other delivery, any information about any other tenant |
| FR-4.5 | P0 | Rate limited per IP (30 requests/minute) and per tracking number. Returns `404` for both "not found" and "not permitted" — no enumeration oracle. |
| FR-4.6 | P0 | Renders in the tenant's default locale with a manual EN/AR toggle |
| FR-4.7 | P0 | No live driver position. This is a deliberate privacy decision and is documented as such. |
| FR-4.8 | P0 | Page is `noindex`; tracking URLs must not be indexable by search engines |

**Acceptance criteria**

- Response body is asserted in tests against an explicit allowlist; adding a field to the delivery serialiser must not leak it to this endpoint.
- Sequential and randomised enumeration attempts are indistinguishable from valid-but-absent lookups in both status code and response timing envelope.

### 5.5 Notifications

| ID | Priority | Requirement |
|---|---|---|
| FR-5.1 | P0 | Notification events fire on `assigned`, `picked_up`, `failed_attempt`, and `delivered` |
| FR-5.2 | P0 | SMS delivery sits behind a `NotificationProvider` interface. Release 1.0 ships a `ConsoleProvider`; a provider implementation for a commercial gateway is added at commercial launch (§8.4). |
| FR-5.3 | P0 | Outbound notification attempts are logged and visible to the coordinator, including payload and intended recipient |
| FR-5.4 | P1 | Notification dispatch is queued, retried with backoff, and failures are recorded against the delivery |

### 5.6 Billing — per-driver seat with proration

| ID | Priority | Requirement |
|---|---|---|
| FR-6.1 | P0 | Stripe subscription priced per active driver seat per month |
| FR-6.2 | P0 | Adding a driver increments seat quantity mid-cycle; Stripe prorates the charge |
| FR-6.3 | P0 | Deactivating a driver decrements the seat and generates a proration credit |
| FR-6.4 | P0 | 14-day trial, no card required. On expiry without payment the tenant becomes read-only. Tenant data is never deleted as a consequence of non-payment. |
| FR-6.5 | P0 | Webhooks handled: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid` |
| FR-6.6 | P0 | Webhook idempotency: every Stripe event ID is inserted into `stripe_events` before processing; a duplicate insert short-circuits the handler. Signatures are verified on every request. Handlers acknowledge with `200` immediately and perform work asynchronously. |
| FR-6.7 | P0 | Seat count is reconciled against actual active drivers on a schedule to recover from missed webhooks. Drift is logged at warning level or above. |
| FR-6.8 | P0 | Billing page: current plan, seat count, next invoice estimate, invoice history, link to Stripe Customer Portal |
| FR-6.9 | P0 | Read-only mode is enforced server-side, not by hiding controls in the UI |

**Acceptance criteria**

- Replaying an identical Stripe webhook produces no second state change and no duplicate charge.
- Adding and then removing a driver within one billing cycle produces a net charge consistent with the active seat interval.
- A tenant in read-only mode receives `403` on every mutating endpoint, including the API surface used by the driver PWA.

**Design rationale — per-seat rather than flat:** mid-cycle quantity changes and proration are where subscription billing integrations accumulate correctness bugs. A flat monthly plan would not exercise seat reconciliation, proration credits, or webhook-driven quantity drift, all of which this product needs.

### 5.7 Audit log

| ID | Priority | Requirement |
|---|---|---|
| FR-7.1 | P0 | Every mutating action writes an audit row: actor, action, entity type, entity ID, before/after JSON, IP address |
| FR-7.2 | P0 | Append-only. No update or delete path exists in the application, enforced by a database trigger. |
| FR-7.3 | P0 | Visible to `owner`, filterable by actor, entity type, and date range |
| FR-7.4 | P0 | Audit writes participate in the same transaction as the action they record; a failed audit write fails the action |

---

## 6. Internationalisation and RTL

English and Arabic are both first-class from the first commit. Retrofitting RTL support is materially more expensive than building with it.

| ID | Priority | Requirement |
|---|---|---|
| I18N-1 | P0 | English and Arabic complete across all surfaces. No mixed-language screens, no untranslated fallback strings in the UI. |
| I18N-2 | P0 | `dir="rtl"` on `<html>` for Arabic, with full layout mirroring |
| I18N-3 | P0 | CSS logical properties only — `ms-*`/`me-*`, `ps-*`/`pe-*`, `start`/`end`. Physical `left`/`right` is a lint error. |
| I18N-4 | P0 | Directional icons (arrows, chevrons, back) mirror; non-directional icons (clock, camera, checkmark) do not |
| I18N-5 | P0 | Dates, times, and numbers formatted through `Intl` per locale, with an optional Arabic-Indic numeral preference per user |
| I18N-6 | P0 | Currency formatted correctly per tenant for AED, SAR, EUR, and USD, including locale-correct symbol position |
| I18N-7 | P1 | Optional Hijri date display alongside Gregorian |
| I18N-8 | P0 | Validation messages, error states, empty states, and toasts are all localised |
| I18N-9 | P0 | User-level locale preference defaulting to the tenant default. A driver may use Arabic while the coordinator uses English. |
| I18N-10 | P0 | Automated test renders key screens in both directions and asserts no layout overflow or clipping |
| I18N-11 | P0 | Arabic copy is reviewed by a fluent speaker before release. Unreviewed machine translation does not ship. |

---

## 7. Architecture and technical requirements

### 7.1 Technology stack

| Layer | Choice | Rationale |
|---|---|---|
| Backend | Nest.js + TypeScript | Dependency injection and module structure keep per-request tenant context explicit and testable |
| Database | PostgreSQL 16 + PostGIS | Row-Level Security is the isolation mechanism; PostGIS supports zone geometry and distance queries |
| ORM | Prisma or Drizzle — decision due in Week 1 (OD-1) | Must support session-variable-scoped RLS. Raw SQL for tenant context is an acceptable outcome. |
| Coordinator web | Next.js (App Router) + TypeScript | Server rendering for list and detail views; shared type definitions with the API |
| Driver app | Separate PWA — Vite + React | Independent caching strategy, bundle budget, and fully controlled service worker |
| Real-time | WebSockets (Socket.IO or native `ws`) — OD-2 | Reconnection semantics are the deciding factor |
| Offline store | IndexedDB via Dexie.js | Transaction support and blob storage for queued POD payloads |
| Styling | Tailwind CSS with logical properties | RTL correctness (§6) |
| Object storage | S3-compatible (MinIO in development) | POD photographs and signatures |
| Queue | BullMQ + Redis | Webhook processing, notification dispatch, scheduled reconciliation |
| Authentication | Custom, httpOnly cookies | Session control required for FR-1.6 immediate invalidation |

### 7.2 Multi-tenancy

**Decision: shared schema, `tenant_id` column, PostgreSQL Row-Level Security.**

Rejected alternatives:

| Alternative | Reason rejected |
|---|---|
| Schema-per-tenant | Clean isolation, but migration across hundreds of schemas becomes an operational liability and connection pooling degrades. Acceptable at 20 tenants, painful at 500. |
| Database-per-tenant | Strongest isolation, highest unit cost, worst operational profile for a small-tenant SaaS. |
| Application-layer filtering only | A single omitted `WHERE tenant_id = ?` is a data breach. Rejected on principle: isolation must not depend on developer discipline. |

| ID | Priority | Requirement |
|---|---|---|
| TR-2.1 | P0 | Every tenant-scoped table declares `tenant_id uuid NOT NULL`, `ENABLE ROW LEVEL SECURITY`, and `FORCE ROW LEVEL SECURITY` |
| TR-2.2 | P0 | Policy: `USING (tenant_id = current_setting('app.current_tenant')::uuid)` |
| TR-2.3 | P0 | The application connects as a non-owner database role. Table owners bypass RLS; connecting as owner produces isolation that appears to work and does not. |
| TR-2.4 | P0 | `SET LOCAL app.current_tenant` is issued inside the transaction at the start of every request, derived from the authenticated session only — never from a header, query parameter, or request body |
| TR-2.5 | P0 | Absent tenant context fails closed: queries return nothing or error. No unscoped fallback path exists. |
| TR-2.6 | P0 | Composite indexes lead with `tenant_id` |
| TR-2.7 | P0 | Isolation test suite: seed two tenants, then attempt cross-tenant reads and writes against every table and every API endpoint. All must fail. The suite is a required CI check. |
| TR-2.8 | P0 | Cross-tenant access attempts are logged at warning level with actor, endpoint, and target tenant |

### 7.3 API conventions

| ID | Priority | Requirement |
|---|---|---|
| TR-3.1 | P0 | REST over JSON. Resource-oriented paths, plural nouns, no verbs in paths. |
| TR-3.2 | P0 | Every request carries a `request_id`, generated at the edge if absent, returned in the response and present on every log line |
| TR-3.3 | P0 | Error responses share one shape: `{ error: { code, message, details? } }`. `code` is a stable machine-readable string; `message` is localised for display. |
| TR-3.4 | P0 | Status code semantics are contractual: `400` malformed, `401` unauthenticated, `403` authenticated but not permitted, `404` absent or not visible to caller, `409` state conflict, `422` semantic validation failure, `429` rate limited |
| TR-3.5 | P0 | Every endpoint validates its input against a schema (Zod). No unvalidated request body reaches a service layer. |
| TR-3.6 | P0 | Mutating endpoints used by the driver client accept an idempotency key and are safe to retry |
| TR-3.7 | P1 | API is versioned by path prefix (`/v1`) from the first release |

### 7.4 Third-party integrations — Release 1.0 posture

Release 1.0 is a functional release without commercial traffic. Paid external dependencies are therefore stubbed behind interfaces, with a concrete provider added at commercial launch. In every case the seam is real and the interface is the shipped abstraction, not a placeholder.

| Dependency | Release 1.0 | At commercial launch |
|---|---|---|
| Geocoding / maps | `GeocodingProvider` interface with a free-tier or static-tile implementation and a hard request cap; deterministic mock in tests; manual pin placement always available | Commercial geocoding provider behind the same interface |
| SMS | `NotificationProvider` with `ConsoleProvider`; logged, inspectable outbound attempts | Commercial SMS gateway implementation |
| Email | Local SMTP capture in development, console transport in CI | Transactional email provider |
| Payments | Stripe test mode | Stripe live mode; no code change beyond configuration |

---

## 8. Non-functional requirements

### 8.1 Performance and capacity

| ID | Priority | Requirement |
|---|---|---|
| NFR-1 | P0 | p95 API latency < 200ms on read endpoints at 1,000 deliveries per tenant across 50 seeded tenants |
| NFR-2 | P0 | Coordinator board renders 200 active deliveries without visible jank |
| NFR-3 | P0 | Driver PWA initial JavaScript bundle < 200KB gzipped; interactive in < 3s on simulated 3G |
| NFR-4 | P0 | Offline queue survives application termination, device restart, and 24 hours offline |
| NFR-5 | P0 | Real-time updates reach connected clients within 2 seconds of the originating transition |

### 8.2 Security

| ID | Priority | Requirement |
|---|---|---|
| SEC-1 | P0 | All traffic over TLS; HSTS enabled |
| SEC-2 | P0 | Secrets supplied through environment variables only. No credentials committed to the repository, verified by a CI secret scan. |
| SEC-3 | P0 | Object storage is private; POD media is served through short-lived signed URLs scoped to an authorised requester |
| SEC-4 | P0 | Rate limiting on authentication, password reset, invite acceptance, and the public tracking endpoint |
| SEC-5 | P0 | Dependency vulnerability scanning runs in CI; critical advisories block the build |
| SEC-6 | P0 | Security headers set: CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` |
| SEC-7 | P0 | Uploaded files are validated by content type and size, stored under generated keys, and never served from an origin that can execute them |

### 8.3 Privacy and data retention

Delivery records contain personal data for recipients who are not users of the product. This constrains retention and export.

| ID | Priority | Requirement |
|---|---|---|
| DP-1 | P0 | Personal data fields are catalogued in the repository documentation: recipient name, phone, address, geo coordinates, POD photograph, signature, recipient name at handover |
| DP-2 | P0 | POD media retention is configurable per tenant with a documented default; expiry deletes the object and retains the event record |
| DP-3 | P0 | Tenant offboarding supports full data export and, on request, hard deletion of tenant data |
| DP-4 | P0 | The public tracking response exposes no personal data of the recipient beyond delivery status (FR-4.3, FR-4.4) |
| DP-5 | P0 | Audit log entries and delivery events are retained for the tenant's configured dispute window and are excluded from routine deletion |
| DP-6 | P1 | Driver location is captured only at transition events, never continuously (FR-4.7, §11.3) |

### 8.4 Reliability

| ID | Priority | Requirement |
|---|---|---|
| REL-1 | P0 | Database migrations are versioned, forward-only, and run automatically on deploy |
| REL-2 | P0 | Automated database backups with a documented and tested restore procedure |
| REL-3 | P0 | Queue jobs are idempotent and retried with exponential backoff; exhausted jobs land in a dead-letter queue that is visible |
| REL-4 | P0 | Health and readiness endpoints suitable for the deployment platform |
| REL-5 | P0 | Scheduled reconciliation jobs are idempotent and safe to run concurrently |

### 8.5 Observability

| ID | Priority | Requirement |
|---|---|---|
| OBS-1 | P0 | Structured JSON logging with `request_id` and `tenant_id` on every line |
| OBS-2 | P0 | Error tracking (Sentry) on the backend and both frontends, with tenant tagging |
| OBS-3 | P0 | Offline sync outcomes — applied, deduplicated, conflicted, failed — are logged and countable |
| OBS-4 | P0 | Billing reconciliation drift and webhook processing failures raise a visible alert |
| OBS-5 | P1 | Request latency and error rate are queryable per endpoint |

### 8.6 Accessibility

| ID | Priority | Requirement |
|---|---|---|
| A11Y-1 | P0 | WCAG 2.1 AA on the coordinator and driver applications: keyboard navigation, visible focus states, contrast ratios |
| A11Y-2 | P0 | Driver PWA touch targets ≥ 44×44 CSS pixels, usable one-handed and in direct sunlight contrast conditions |
| A11Y-3 | P0 | Form errors are programmatically associated with their inputs and announced to assistive technology |

### 8.7 Quality and testing

| ID | Priority | Requirement |
|---|---|---|
| QA-1 | P0 | Backend test coverage ≥ 70% on domain logic: state machine, sync, billing, RLS |
| QA-2 | P0 | State machine has exhaustive transition tests, including every illegal transition |
| QA-3 | P0 | Tenant isolation suite (TR-2.7) is a required CI check |
| QA-4 | P0 | Offline sync has integration tests covering duplicate replay, out-of-order arrival, conflict, and restart-with-queued-events |
| QA-5 | P0 | Billing has integration tests covering webhook replay, proration on add and remove, and read-only enforcement on expiry |
| QA-6 | P0 | Bidirectional rendering tests (I18N-10) run in CI |
| QA-7 | P0 | `docker compose up` produces a working full stack: API, both frontends, PostgreSQL + PostGIS, Redis, object storage, mail capture |
| QA-8 | P0 | CI runs on every pull request: typecheck, lint, unit tests, integration tests, isolation suite, secret scan, build |

---

## 9. Performance validation

Performance work is a defined deliverable with a recorded baseline, not opportunistic optimisation.

### 9.1 Method

| ID | Priority | Requirement |
|---|---|---|
| PERF-1 | P0 | Seed script generating 50 tenants × ~1,000 deliveries × full event history |
| PERF-2 | P0 | Load test scripts (k6) for the three heaviest read paths |
| PERF-3 | P0 | Baseline measured and recorded **before** any optimisation |
| PERF-4 | P0 | Remediate what the baseline reveals: N+1 queries, missing composite indexes, over-fetching, unbounded list endpoints |
| PERF-5 | P0 | Publish before/after p50, p95, and p99 with the specific change responsible for each improvement |

The baseline in PERF-3 cannot be reconstructed after optimisation. It must be captured and committed before any remediation begins.

---

## 10. Delivery plan

Ten and a half weeks, 1 August to 15 October 2026. Schedule buffer exists to absorb overrun on the offline sync workstream and the release week; it is not available for additional scope.

| Milestone | Window | Focus | Exit criteria |
|---|---|---|---|
| M1 | Aug 1–7 | Foundation | Docker compose stack running · schema migrated · RLS policies live · non-owner database role in use · tenant context middleware · first isolation test passing · i18n scaffolding with direction switching · ORM decision recorded |
| M2 | Aug 8–14 | Auth and tenancy | Signup, login, invites, roles, session handling · audit log · isolation suite covering all existing endpoints |
| M3 | Aug 15–28 | Delivery core | Delivery CRUD · state machine with all failure branches and attempt limits · append-only `delivery_events` · assignment · coordinator list view · CSV import |
| M4 | Aug 29–Sep 4 | Real-time | WebSocket layer · live board · drag-to-assign · reconnection and state reconciliation |
| M5 | Sep 5–18 | Driver PWA | Highest-risk workstream. Offline shell · IndexedDB cache · queued transitions · offline POD capture · sync with deduplication · conflict surfacing · sync status UI |
| M6 | Sep 19–25 | Billing | Stripe per-seat · proration on seat add and remove · idempotent webhooks · trial and read-only expiry · reconciliation job · billing UI |
| M7 | Sep 26–Oct 2 | Tracking and i18n | Public tracking page with full security requirements · complete Arabic pass on every screen · RTL layout audit · bidirectional render tests |
| M8 | Oct 3–9 | Performance | Seed at scale · baseline recorded · N+1 and index remediation · before/after results published |
| M9 | Oct 10–15 | Release | Deploy · seeded demonstration tenants with per-role logins · documentation complete · decision records written |

**Hard stop: 15 October 2026.** Work incomplete at that date moves to Phase 2 (§11.2). The date does not move.

### 10.1 Release criteria

Release 1.0 ships when all of the following hold:

1. A first-time user can reach the deployed environment, sign in as each of the three roles, and complete the core flow for that role without guidance.
2. The driver PWA completes a full delivery in airplane mode, including POD capture, and syncs correctly and exactly once on reconnection.
3. The tenant isolation suite passes and is enforced as a required CI check.
4. English and Arabic are complete, with RTL correct on every screen and bidirectional render tests passing.
5. A measured p95 improvement is documented with before/after numbers and attributed to specific changes.
6. All P0 requirements in this document are implemented and tested; any deferred P1 is recorded in §13 with a reason.
7. Decision records exist for: multi-tenancy approach, offline sync and conflict resolution, per-seat billing, derived-status event log, ORM selection, and the exclusion of route optimisation.
8. Documentation includes product description, local setup verified from a clean clone, architecture diagram, and API error-code reference.

---

## 11. Scope boundary

### 11.1 Release 1.0 — in scope

Tenant signup with RLS isolation · roles and invites · coordinator web application (create, list, board, assign, detail timeline) · CSV bulk create · driver PWA with full offline support and POD capture · complete status lifecycle including failure branches, attempt limits, and reschedule · public tracking page · notification interface with console provider · Stripe per-seat subscription with proration and idempotent webhooks · audit log · English and Arabic with RTL throughout · seeded demonstration environment · CI pipeline with isolation tests · load test and published performance results.

### 11.2 Phase 2 — deferred, designed for

| Feature | Enabled in Release 1.0 by |
|---|---|
| Automatic assignment (nearest available driver with remaining capacity — not a VRP solver) | Driver capacity and status fields |
| Stop sequencing within a driver's day | Event log with coordinates |
| COD reconciliation: end-of-shift expected vs collected, discrepancy workflow, settlement records | `cod_amount`, POD records, event log |
| Merchant portal with nested authorisation (tenant → merchant → deliveries) | `merchants` table, nullable `merchant_id` |
| Zone-based pricing rules | `zones` PostGIS geometry |
| Outbound webhooks for tenant integrations | Event log |
| Analytics: on-time rate, failure reason breakdown, driver throughput | Event log, reason codes |
| Recurring and scheduled deliveries | — |

### 11.3 Out of scope

| Not building | Reason |
|---|---|
| VRP / route optimisation solver | Substantial engineering cost for marginal gain over nearest-driver assignment; a partial implementation is worse than none |
| Native iOS / Android applications | The PWA satisfies the offline requirement; two app store pipelines add distribution cost without capability |
| Live driver GPS streaming to recipients | Privacy decision (FR-4.7); continuous location ingest is a separate and substantial engineering problem |
| Fleet maintenance, payroll, accounting, warehouse inventory | Separate product domains |

Scope changes require a version increment of this document and a recorded decision. Features listed in §11.3 are not reconsidered within the Release 1.0 window.

---

## 12. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Trigger / decision point |
|---|---|---|---|---|---|
| R-1 | Offline sync workstream overruns M5 | Medium | High | Reduced scope: ship offline reads and queued status transitions; move offline POD capture to Phase 2 | Decision made by end of M5, not later |
| R-2 | RLS and ORM interaction proves awkward | Medium | High | Resolve in M1 via a spike. Raw SQL for tenant context is an accepted outcome. | M1 exit criteria |
| R-3 | Scope creep toward automatic assignment or routing | Medium | Medium | §11.3 is authoritative; scope change requires a document revision | Reviewed at each milestone exit |
| R-4 | Arabic content quality insufficient for target market | Medium | High | Reviewed translation pass by a fluent speaker (I18N-11); unreviewed machine output does not ship | M7 |
| R-5 | Release week compressed by earlier overrun | Medium | High | M9 is protected. Overrun is absorbed by deferring P1 requirements, not by shortening M9. | M8 exit criteria |
| R-6 | Real-time layer reconnection handling proves unreliable at scale | Low | Medium | Board reconciles full state on reconnect rather than relying on missed-event replay | M4 |
| R-7 | Stripe proration behaviour differs from assumption | Low | Medium | Verify against Stripe test mode in M6 before building the billing UI | M6 |

---

## 13. Assumptions, dependencies, and open decisions

### 13.1 Assumptions

| ID | Assumption | Consequence if false |
|---|---|---|
| A-1 | Target operators run 5–50 drivers and 50–500 deliveries per day per tenant | Capacity targets in §8.1 require revision |
| A-2 | Drivers carry Android devices capable of running a modern PWA with IndexedDB and camera access | The offline strategy requires reconsideration |
| A-3 | Coordinators work from a desktop or laptop browser | Board view requires a responsive redesign |
| A-4 | Free text plus manual map pin is adequate address capture for Release 1.0 | Geocoding moves into Release 1.0 scope |
| A-5 | Per-seat monthly pricing is acceptable to the target segment | Billing model requires revision; seat mechanics remain reusable |

### 13.2 Dependencies

| Dependency | Type | Risk if unavailable |
|---|---|---|
| Stripe (test mode) | External service | Billing workstream blocked |
| PostgreSQL 16 with PostGIS on the hosting target | Infrastructure | Isolation and geometry approach blocked; hosting decision constrained (OD-5) |
| Redis | Infrastructure | Queue and reconciliation jobs blocked |
| S3-compatible object storage | Infrastructure | POD capture cannot persist |
| Fluent Arabic reviewer | Human | I18N-11 unmet; release quality bar not reached |

### 13.3 Open decisions

| ID | Decision | Owner | Due |
|---|---|---|---|
| OD-1 | Prisma vs Drizzle — verify RLS session-variable support in a spike before committing | Hazzaz | M1 |
| OD-2 | Socket.IO vs native `ws` — reconnection handling is the deciding criterion | Hazzaz | M4 |
| OD-3 | Tracking number alphabet — Crockford base32 proposed, since recipients may read codes aloud over the phone | Hazzaz | M3 |
| OD-4 | Final product name and domain | Hazzaz | M7 |
| OD-5 | Hosting target — must support PostGIS and Redis within budget | Hazzaz | M8 |
| OD-6 | Whether drivers may initiate `rescheduled`, or coordinators only (currently specified as coordinators only, §4.4) | Hazzaz | M3 |
| OD-7 | Per-seat price point and currency handling for non-USD tenants | Hazzaz | M6 |
| OD-8 | Default POD media retention period (DP-2) | Hazzaz | M7 |

---

## Appendix A — Requirement index

| Prefix | Domain | Section |
|---|---|---|
| PG | Product goals | §2.1 |
| SM | Success metrics | §2.2 |
| BR | Business rules | §4.6 |
| FR-1 | Onboarding and authentication | §5.1 |
| FR-2 | Coordinator web application | §5.2 |
| FR-3 | Driver PWA | §5.3 |
| FR-4 | Public tracking | §5.4 |
| FR-5 | Notifications | §5.5 |
| FR-6 | Billing | §5.6 |
| FR-7 | Audit log | §5.7 |
| I18N | Internationalisation and RTL | §6 |
| TR-2 | Multi-tenancy | §7.2 |
| TR-3 | API conventions | §7.3 |
| NFR | Performance and capacity | §8.1 |
| SEC | Security | §8.2 |
| DP | Privacy and retention | §8.3 |
| REL | Reliability | §8.4 |
| OBS | Observability | §8.5 |
| A11Y | Accessibility | §8.6 |
| QA | Quality and testing | §8.7 |
| PERF | Performance validation | §9.1 |
| R | Risks | §12 |
| A | Assumptions | §13.1 |
| OD | Open decisions | §13.3 |
