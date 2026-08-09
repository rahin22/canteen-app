# School Canteen Card System

Prepaid canteen wallet for schools. Students carry a QR card, top up with cash
(or online via Stripe), and the canteen operator scans the card with any phone
to charge purchases against their balance.

## How it works

| Role | URL | What they do |
|---|---|---|
| **Admin** | `/admin` | Manage students & cards, menu, cash top-ups, reports, CSV export |
| **Operator** (or admin) | `/scan` | Phone camera till: scan card → tap items → charge |
| **Student** | `/me` | See balance & history, top up online, backup QR card |

Money is stored as integer cents in an append-only `Transaction` ledger;
the cached `User.balance` is only ever written atomically alongside a ledger
row, and charges use a conditional decrement so a card can never go below zero
(even with two tills charging simultaneously).

## Local development

```bash
npm install
docker run -d --name canteen-postgres -e POSTGRES_PASSWORD=canteen \
  -e POSTGRES_DB=canteen -p 54329:5432 postgres:17-alpine
cp .env.example .env        # then fill in values
npx prisma migrate dev
npx prisma db seed          # creates admin/admin1234 + sample menu
npm run dev
```

Sign in as `admin` / `admin1234` — **change this password immediately** via
the *Password* link in the top-right corner.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `SESSION_SECRET` | Long random string signing login cookies |
| `PHOTO_ENCRYPTION_KEY` | 64 hex chars (`openssl rand -hex 32`). Encrypts student photos at rest — back it up with the database |
| `RESEND_API_KEY` | Resend API key. Empty = the app sends no email at all (see *Running without email*) |
| `EMAIL_FROM` | Sender, e.g. `School Canteen <canteen@school.edu.au>`. The domain must be verified in Resend |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_…`). Empty = online top-ups hidden |
| `STRIPE_WEBHOOK_SECRET` | From the Stripe webhook endpoint (`whsec_…`) |
| `APP_URL` | Public URL, used for Stripe redirects |
| `NEXT_PUBLIC_SCHOOL_NAME` | Branding shown across the app and on printed cards |
| `NEXT_PUBLIC_CURRENCY` | ISO code, e.g. `AUD` — also the Stripe charge currency |
| `NEXT_PUBLIC_LOCALE` | e.g. `en-AU`, controls money formatting |
| `TZ` | Server timezone, e.g. `Australia/Sydney` — affects "today" reports |
| `SCHOOL_TIMEZONE` | Overrides `TZ` for deciding when the canteen day rolls over (daily spending limits, "sales today"). Defaults to `TZ`, then `Australia/Sydney` — never UTC, so an unconfigured server doesn't reset limits mid-lunch |

## Deploying (Railway)

1. Create a project with a **Postgres** service and a **web** service from this
   repo/directory.
2. On the web service set the env vars above; `DATABASE_URL` should reference
   the Postgres service's internal URL (`${{Postgres.DATABASE_URL}}`).
3. Set the start command: `npx prisma migrate deploy && npm run start`
   (build command `npm run build` is detected automatically).
4. Generate a public domain (HTTPS is required for phone camera access).
5. Run the seed once: `npx prisma db seed` with `DATABASE_URL` pointed at the
   public Postgres URL.

## Multiple schools

One deployment serves several schools — it ships with **Islamic School
Canberra** and **Taqwa School**, and you can add more under **Admin →
Settings → Schools**.

- **Students, menus and registrations** each belong to exactly one school.
  Admins and parents don't: an admin oversees all of them, and a parent may
  well have children at both.
- **The admin header has a school selector.** It sets a cookie, so the choice
  follows you across every admin page — dashboard figures, students,
  transactions, the kitchen list and the badges all narrow to it. *All schools*
  gives the combined view.
- **Menus are separate.** Each school prices and stocks its own list, so the
  Menu page always edits one school; with the header on *All schools* it asks
  which one first.
- **Parents pick the school** when they register a child, and approval carries
  that choice onto the new student record.
- **Schools are retired, never deleted.** A retired school stops appearing
  where new students and orders are created, and every past student,
  transaction and order stays attached to it.

### The till and kiosk aren't tied to a school

Neither device is configured for one. The menu, prices and school name arrive
with whoever presents a card, so the same till or iPad works at either canteen
and there's nothing to set up or get wrong. Ordering is scoped server-side to
the student's own school, so neither a stale screen nor a crafted request can
buy from the other school's menu.

## Settings (Admin → Settings)

Schools are managed here too (see *Multiple schools*). Then four switches, all
**off** by default, plus the preorder cutoff time:

- **Online top-ups** — when off, every top-up screen tells students and parents
  to pay cash instead, and the checkout action refuses even if someone crafts
  the request by hand. Needs `STRIPE_SECRET_KEY` set before it can be enabled.
  Cash top-ups recorded by an admin work regardless.
- **Parent self-registration** — opens `/signup` so parents can create their
  own account and register their children.
- **Email confirmation & password reset** — see below. Needs `RESEND_API_KEY`
  and `EMAIL_FROM` set before it can be enabled.
- **Preordering** — opens the office kiosk and the parent portal's *Order
  ahead* panel. Orders are paid for as they're placed. **Orders close at** sets
  the daily cutoff (default 09:30, school local time). See *Preordering* below.

## Accounts, passwords and email

Only parents have email addresses. Students and canteen staff sign in with a
school-issued ID and a password generated by an admin, so the email flows
below never apply to them — the office resets those from Admin → Students or
Admin → Staff.

- **Email confirmation** — a parent gets a 6-digit code on signup and must
  enter it before they can register any children. Codes last 15 minutes, are
  single-use, allow 5 wrong guesses, and only a hash is stored.
- **Forgot password** (`/forgot-password`) — emails a reset code. The reply is
  the same whether or not the address is registered, so the page can't be used
  to find out who has an account.
- **Sessions are revoked on password change.** Every session carries a version
  number; changing or resetting a password bumps it, which signs out every
  other device immediately. Disabling an account does the same.

### Running without email

The app is designed to work with email switched off, which is the default.
Turning the **Email confirmation & password reset** setting off (or simply
never setting `RESEND_API_KEY`) means:

- Parents sign up and go straight to registering a child — no code, no
  confirmation step, and no reminder banners.
- `/forgot-password` shows "contact the school office" instead of a form, and
  `/reset-password` redirects to it. Both server actions refuse as well, so a
  hand-crafted request can't reset a password either — including with a code
  issued before the setting was turned off.
- **Nobody can reset their own password.** An admin resets a parent's from any
  of their children's pages (Students → open the student → Parents → *Reset
  password*); students and staff are reset the same way as always.

Nothing is weakened by turning it off. A parent account on its own grants no
access to anything, and every child a parent submits still waits for an admin
to approve it — that approval, not the email, is what stops a stranger
attaching themselves to a student. What you lose is the guarantee that the
address on file actually reaches the parent, and some protection against a
bored person filling the approval queue with junk (still rate-limited to 5
signups per IP per hour).

Turning it back on later immediately reinstates confirmation for parents who
signed up without it — the app never records a fake "verified" timestamp to
paper over the setting being off.

## Parent self-registration

1. A parent signs up at `/signup` with their email (which is their username),
   name and password. The account starts empty — no children, no balance.
2. They confirm their email with the code we send them (skipped when email is
   switched off).
3. They add each child: full name, school student ID, class, and a photo.
4. Requests land in **Admin → Registrations** with a badge showing the count.
   Nothing exists in the canteen system until an admin approves — self-signup
   can never create a student account, a card or a balance on its own.
5. On approval, if a student with that ID already exists (the usual case after
   a roll import) the parent is linked to that record; otherwise a new student
   and QR card are created and the login details are shown once.
6. Declining asks for a reason, which the parent sees on their dashboard.

### Daily spending limits

A parent can cap what each child spends per day from **Family → child → Daily
spending limit**. Only a linked parent can set it; admins can see it on the
student page but deliberately can't change it.

- The cap is enforced in the ledger, inside the same database transaction that
  moves the money, behind a row lock — two tills scanning the same card at once
  can't both slip a purchase under the same cap.
- It counts `PURCHASE` rows since local midnight (see `SCHOOL_TIMEZONE`), less
  any `REFUND` rows — a cancelled preorder never became food, so it gives its
  allowance back. Top-ups obviously aren't spending, and manual `ADJUSTMENT`
  rows stay excluded so an admin correcting a balance can't quietly hand back
  cap headroom.
- Preorders count against it too: they're paid for when placed, so a child
  can't use the kiosk to spend around the cap.
- It caps *spending*, not the balance. Money already on the card stays there
  and unspent allowance doesn't roll over.
- `$0` is a valid cap and blocks canteen spending entirely — useful for pausing
  a card without disabling the account. Removing the cap lifts it.
- Staff see the remaining allowance on the till screen before they build the
  order, and the Charge button is disabled once an order goes past it.

### Avoiding double charges

Students routinely rejoin the queue while their food is being made, so the
order screen leads with the card's last purchase — amount, items, who served
it, and how long ago. Anything within the last 30 minutes is shown as a
full-width warning rather than a quiet history line. It's a prompt, not a
block: staff can still charge again when it's a genuine second order.

## Preordering

Students order at the start of the day and collect at the canteen. Turn it on
in **Admin → Settings**, where you also set the time orders close.

Two ways in, one set of rules:

- **Office kiosk** (`/kiosk`) — an iPad students order from themselves. Sign
  the device in as an **operator** account and leave it on that page. A student
  tapping their card is *identified*, never signed in: no session is created
  for them and the screen shows only their name, balance and today's orders.
  It clears itself back to the scan screen after a minute of inactivity so one
  child's details aren't left up for the next.
- **Parent portal** — parents order for a child from **Family → child → Order
  ahead**.

Either way the food is paid for as it's ordered; the counter just hands it
over.

Both go through `src/lib/preorders.ts`, so they can't drift apart on prices,
cutoffs, limits or affordability. The menu picker (`OrderComposer`) and the
card reader (`CardScanner`) are shared components too, the kiosk just renders
them at iPad size.

### Orders are paid for when they're placed

The money comes off the card at order time. The ledger charge and the order row
are written in one database transaction, so there's never a child charged for
an order that doesn't exist, or an order nobody paid for. The balance check and
the parent's daily spending cap are enforced by that same charge — a preorder
is a purchase like any other and shows up in the ledger as one.

Prices are snapshotted onto the order, so editing the menu afterwards can't
change what a child was charged.

### Cancelling refunds

A parent, the student at the kiosk, or an admin from the kitchen list can
cancel an order that hasn't been collected. That writes a `REFUND` row and puts
the money back, in one transaction, and only from `PENDING` — so two people
cancelling at once can't refund the same order twice, and an order already
handed over can't be cancelled for free money.

`REFUND` is a distinct transaction type rather than an `ADJUSTMENT` because it
**nets off the daily spending cap**. A cancelled order never became food, so it
shouldn't eat into the day's allowance. Admin adjustments stay excluded from
the cap, as before.

### Collecting

Scanning a card at the till surfaces any paid orders waiting, with a one-tap
**Handed over ✓**. No money moves — the banner says so in as many words,
because the failure mode worth designing against is an operator charging a
second time for food that's already paid for. It's only claimable from
`PENDING`, so a second tap can't mark someone else's order collected.

For the same reason, a preorder that's been paid for but *not* yet collected is
deliberately excluded from the "already served recently" warning: the child has
been charged, but the food is still behind the counter, and warning about it
would fire for every kiosk order.

**Admin → Orders** is what the kitchen works from: a tally of everything still
to be made, then the individual orders for packing, then what's already gone
out. The nav badge counts orders still waiting.

### Identification photos

Photos exist so canteen staff can confirm the card belongs to the student — the
photo appears next to the balance as soon as a card is scanned at the till.

Handling of this data:

- **Encrypted at rest** with AES-256-GCM under `PHOTO_ENCRYPTION_KEY`, stored
  in Postgres. A stolen database dump or backup contains no viewable images.
- **Never public.** The only way to fetch one is `/api/photo/...`, which
  authorises every request: admins and till operators can see any student, a
  parent only children linked to their account, a student only themselves.
  Responses are `no-store`, so nothing is cached by a browser or CDN.
- **Metadata stripped.** Every upload is re-encoded and resized to 512×512,
  which discards EXIF — including the GPS coordinates phone cameras embed.
- **Validated by content**, not by the browser-supplied type: files that
  aren't a real JPEG/PNG/WebP are rejected, and uploads are capped at 8MB.
- **Deletable.** Declining a request deletes the photo immediately. An admin
  can remove a student's photo from their page; the bytes are deleted, not
  just unlinked.

If you rotate `PHOTO_ENCRYPTION_KEY`, existing photos become unreadable and
must be re-uploaded — everything else in the app keeps working.

## Stripe setup (online top-ups)

1. Get live keys at dashboard.stripe.com → set `STRIPE_SECRET_KEY`.
2. Add a webhook endpoint: `https://<your-domain>/api/stripe/webhook`,
   subscribed to `checkout.session.completed`; copy its signing secret into
   `STRIPE_WEBHOOK_SECRET`.
3. The success page also credits idempotently, so payments clear even if a
   webhook is delayed — but keep the webhook: it covers users who close the
   tab before returning.

## Operating notes

- **Print labels**: Students → Print labels (filter by class). Prints 50 × 30 mm
  thermal labels on a Rongta R22 over Bluetooth, to stick onto the NFC cards.
  Needs Chrome or Edge (Web Bluetooth); see *Label printer* below.
- **Lost card**: student page → *Issue replacement card* — old QR stops
  working instantly, print the new one.
- **Insufficient balance** is refused at the till with the shortfall shown.
- **Refunds/corrections**: use *Balance adjustment* with a reason; it's kept
  in the ledger forever.
- **Reports**: Transactions → filter by type/date → Export CSV.

## Accounts & roles

- **Admin** — full access. Change your own password via the *Password* link.
- **Operator** — till only. Create/disable operators under Admin → Staff.
- **Student** — created under Admin → Students (individually or bulk import).
- **Parent** — created/linked from a student's page (Parents section), or
  self-registered at `/signup` when that setting is on. One parent can be
  linked to several children and tops up each child online.

## NFC cards

The till supports NFC alongside QR via Web NFC (Chrome on Android; the site
must be HTTPS). To register a tag: open the student's admin page **on an
Android phone**, Cards → *Scan tag with this device*, tap the tag. Any
NTAG/MIFARE sticker, card or wristband works — the tag's hardware serial is
what's registered, nothing is written to the tag. At the till, tapping a
registered tag on the phone charges exactly like a QR scan. Lost NFC tags are
blocked individually from the student's Cards list ("Replace QR card" doesn't
touch NFC tags).

## Label printer (Rongta R22)

Students → **Print labels** drives a Rongta R22 directly from the browser over
Web Bluetooth — no drivers, no vendor app. Chrome or Edge only, over HTTPS or
localhost. Driver lives in `src/lib/r22.ts`.

Things worth knowing before touching it:

- The R22 does **not** speak TSPL, CPCL or ESC/POS. It uses Rongta's
  proprietary **PN81** protocol, reverse-engineered from the vendor SDK. It
  acknowledges standard commands and then silently discards them, so "the
  printer accepted it" means nothing — only paper does.
- Its **Bluetooth Classic / SPP** channel (a COM port on Windows) is a dead
  end: it accepts data under real flow control but is not wired to the print
  engine. All printing goes over **BLE GATT** (`ff00`/`ff02`). This is why Web
  Bluetooth is the right API and Web Serial cannot work.
- The printer **starts printing ~8–10 mm into each label** — its gap sensor
  sits upstream of the head and this firmware never back-feeds. Every
  repositioning command (`LEARN_TAG_PAPER`, `SET_FEEDBACK_LENGTH`,
  `MOVE_PAPER`, page mode) is acknowledged and ignored. Labels therefore use
  the lower 20 mm of the 30 mm stock. `printLabels()` can do full-bleed 30 mm
  by chaining a batch into one job, at the cost of one blank label per job.
- `HEAD_OFFSET_DOTS` / `GAP_DOTS` in `src/lib/r22.ts` are **calibrated
  effective values for the current roll, not physical measurements**. A
  different roll will likely need retuning — use `public/printer-lab.html`
  (localhost), which exposes the raw protocol, notification logging and an
  alignment ruler.

## Tech

Next.js 16 (App Router, server actions) · Prisma 7 + PostgreSQL · Tailwind 4 ·
Stripe Checkout · html5-qrcode (browser camera scanning) · Cards are a separate
table with a `type` field, so NFC wristbands/cards can be attached to the same
accounts later.
