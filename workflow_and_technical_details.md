# Omni-Queue 360: Detailed Workflow & Technical Architecture

This document describes the workflow and architecture of the Omni-Queue 360 system.

---

## PART 1: DETAILED WORKFLOW BY PERSONA

### Persona 1: Offline Customer (On-site Customer)

**Behaviour:** Walk-in customers arrive at the centre and use the touchscreen kiosk
(`kiosk-app`) to take a ticket.

1. **Ticket generation**
   - **UI:** the customer picks a service from the catalogue published by the
     backend, and is **offered** a phone number field (email optional). The kiosk no
     longer invents a placeholder address: a number that is given is real and
     enables ticket lookup and the duplicate-ticket cap; one that is skipped leaves
     the ticket genuinely anonymous, and the screen says so rather than implying
     otherwise. `requireKioskPhone` in the admin settings makes it mandatory.
   - **Backend (`POST /api/leads`):**
     - Rejects a service that is not in the catalogue, so a typo can never create a
       queue nobody serves.
     - Rejects the ticket outside opening hours, and after the walk-in cut-off that
       protects the customers already waiting.
     - Rejects a second live ticket for the same service by the same person, and a
       third concurrent service line.
     - Takes a distributed lock, increments the ticket sequence, asks the AI engine
       for an estimate, and stores the ticket as `Waiting`.
   - **Result:** a ticket plus a customer JWT scoped to that ticket alone.

2. **Virtual waiting room**
   - The ticket screen renders a **QR code** pointing at the online portal for that
     ticket number. Scanning it opens a live tracker on the customer's own phone, so
     they can leave the waiting area.
   - Both screens receive Socket.IO updates; no polling.

3. **Being served (staff console)**
   - **Call next** (`POST /api/staff/call-next`): locks that service line, picks the
     ticket with the earliest *effective queue time*, sets `Called`. A counter acts
     on its own assigned service by default; covering another line is possible but
     has to be asked for (`coveringFor`), and every action taken while covering is
     logged and pushed to the admin dashboard. Administrators may call any line.
   - **Start serving** (`PATCH /api/leads/:id`): sets `Serving`, records `servingAt`,
     and triggers an ETA recalculation for everyone behind.
   - **Exceptions:** `Mark No-Show`, `Recall` (capped), and `Transfer`
     to another service line. A transfer is only possible from `Called` or `Serving`,
     and the customer keeps the wait they have already served.
   - **Complete:** internal notes and service tags are saved, status becomes
     `Completed` with `completedAt`. That session's duration becomes training data
     for the wait-time model.

### Persona 2: Online Customer (Remote Customer)

**Behaviour:** Remote customers use the online portal (`online-portal`) to reserve an
appointment slot in advance.

1. **Booking**
   - The customer picks a service, then an **appointment slot** offered by the
     server. Free-text date entry is gone: every slot shown is already checked
     against opening hours, the booking horizon and remaining capacity.
   - **Verification:** the request is validated first, then a 6-digit code is issued
     and the validated booking is held inside the challenge. Only redeeming the code
     creates the ticket, so the details cannot be swapped between the two steps.
     Locally the provider is `console` — the code is logged and shown on screen,
     because no SMS gateway runs on a laptop.
   - The ticket is created as `Pending` and is invisible to the kiosk board and to
     staff until check-in.

2. **The check-in window**
   - `checkinOpensAt` = appointment − 30 min. Earlier than that is refused; the old
     behaviour let a 2:00 pm appointment occupy the live queue from 8:00 am.
   - `pendingExpiresAt` = appointment + 15 min grace. Within it, the ticket keeps the
     appointment's place in the queue.
   - After the grace period the reservation is **not cancelled**. For a further
     window (default 2 hours) the customer may still check in and is converted to a
     walk-in, ordered by arrival. Only past that is the reservation abandoned.

3. **Check-in**
   - `POST /api/online/checkin` with the ticket number and the email or phone used to
     book. Failed attempts are counted, and five failures lock that ticket/IP pair
     for 15 minutes.
   - **Location check: not implemented.** Check-in already requires the customer
     to be standing at the kiosk and to state the email or phone they booked with;
     indoor GPS accuracy is poor and IP matching breaks for anyone on mobile data.
     Every attempt is still written to `checkin_audit`.
   - Pressing check-in twice reports success rather than an error.

---

## PART 2: TECHNICAL ARCHITECTURE

Monorepo (npm workspaces) containing three React front ends, a Node.js backend and a
Python AI microservice.

### 1. Shared packages

- `@omni/shared` — TypeScript interfaces and the endpoint constants, so the front
  ends and the backend cannot drift on data shapes.
- `@omni/shared-ui` — `Toast`, `ErrorBoundary`, `QRCode`, and `useCatalog`, the hook
  every front end uses to read the service list. The list used to be hard-coded in
  three places.

### 2. Backend and storage

Controller → Service → Store, with routing, business logic and data access strictly
separated.

**The store is pluggable, and this is what makes the project runnable anywhere:**

| `QUEUE_STORE` | Backend | Use |
|---|---|---|
| `auto` | Redis if reachable, otherwise an in-process store | development default |
| `redis` | Redis, required | production default |
| `memory` | In-process only | tests and demos |

PostgreSQL is equally optional. With `DATABASE_URL` set it becomes the source of
truth for analytics and auditing, and its schema and migrations are applied at boot.
Without it, the key-value store holds everything. `GET /api/health` always reports
which combination is live.

### 3. Distributed lock

`SET key token NX PX ttl` with a per-holder token, released and extended by a Lua
script that compares the token first — so a slow request can never delete a lock a
different request has since acquired. The lock is renewed while it is held. On the
in-process store the same compare happens directly, since Node runs it in a single
turn of the event loop.

If the lock backend is unreachable the request **fails** rather than proceeding
unlocked.

### 4. Real-time communication

Events are addressed to three kinds of room:

- `admin_room` — the management dashboard
- `position_<service>` — the counters on that service line
- `ticket_<number>` — the one customer holding that ticket

There is no global broadcast. The dashboard is event-driven with a 30-second safety
poll, rather than re-fetching everything every five seconds.

### 5. AI engine (`apps/ai-engine`)

- **Baseline:** `queue position × average service time ÷ staff on duty`. This answers
  every request until there is history, and whenever the model is unavailable.
- **Learned model:** a scikit-learn `GradientBoostingRegressor` fitted on served
  tickets — the wait each ticket actually experienced, given the queue depth,
  staffing and time of day recorded when it was issued. The analytic estimate is
  itself a feature, so the model only has to learn the centre's deviation from
  textbook queueing.
- **Adoption gate:** a newly fitted model is kept only if its mean absolute error
  beats the baseline on held-out data. A bad fit can never make estimates worse.
- **No staff on duty:** the estimate is withheld (`queueStatus: "Unavailable"`)
  instead of reported as zero minutes. The count of staff on duty is no longer
  floored at 1.
- **Resilience:** any failure — engine down, timeout, malformed reply — falls back to
  the baseline. Ticket issuance is never blocked by the model.

### 6. Security

- **Rate limiting** per endpoint class, with a much tighter limit on contact-detail
  lookup because that endpoint is an enumeration oracle by nature.
- **JWT** with separate lifetimes: staff and admin sessions expire with the shift
  (12h), a customer's ticket token lasts 7 days.
- **RBAC** on every administrative endpoint; a customer token can only read the queue
  it is in and act on its own ticket.
- **Brute-force guard** on the check-in identifier.
- **Timing-safe comparison** for every credential and identifier check.
- **Helmet and CORS** with an explicit origin allow-list in production.

---

## PART 3: OPERATING RULES

None of the following are environment variables. They are seeded once and owned by
the admin **Operations** screen, so changing policy never means changing code.

| Rule | Default |
|---|---|
| Opening hours | Mon–Fri, 08:00–17:00, holidays list |
| Appointment slot | 30 min |
| Slot capacity | derived from the counters on that service |
| Booking horizon | 7 days |
| Queue ordering | appointment time or arrival, whichever is later |
| Check-in opens | 30 min before the appointment |
| Late arrival | downgraded to a walk-in, not cancelled |
| Tickets per customer | 1 per service, across at most 2 services |
| Self-cancellation | allowed until the ticket is called |
| Automatic no-show | 5 min after being called |
| Recall cap | 2, then automatic no-show |
| Long session | alert an administrator at 45 min, never auto-close |
| Walk-in cut-off | 30 min before closing |
| Cross-counter calls | allowed, but deliberate and logged; admins may call any |
| Transfer | from Called/Serving only, keeping the original queue time |
| Multiple devices | allowed |
| Kiosk contact detail | phone number offered, skippable |
| Booking verification | one-time code (`console` provider locally) |
| Lost ticket number | lookup by email or phone |
| Service catalogue | database-backed, managed from the admin screen |
| Location check at check-in | not built |
| Ratings | completed tickets only, submitted once |
