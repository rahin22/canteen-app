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
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_…`). Empty = online top-ups hidden |
| `STRIPE_WEBHOOK_SECRET` | From the Stripe webhook endpoint (`whsec_…`) |
| `APP_URL` | Public URL, used for Stripe redirects |
| `NEXT_PUBLIC_SCHOOL_NAME` | Branding shown across the app and on printed cards |
| `NEXT_PUBLIC_CURRENCY` | ISO code, e.g. `AUD` — also the Stripe charge currency |
| `NEXT_PUBLIC_LOCALE` | e.g. `en-AU`, controls money formatting |
| `TZ` | Server timezone, e.g. `Australia/Sydney` — affects "today" reports |

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

## Stripe setup (online top-ups)

1. Get live keys at dashboard.stripe.com → set `STRIPE_SECRET_KEY`.
2. Add a webhook endpoint: `https://<your-domain>/api/stripe/webhook`,
   subscribed to `checkout.session.completed`; copy its signing secret into
   `STRIPE_WEBHOOK_SECRET`.
3. The success page also credits idempotently, so payments clear even if a
   webhook is delayed — but keep the webhook: it covers users who close the
   tab before returning.

## Operating notes

- **Print cards**: Students → Print cards (filter by class), print on card
  stock or laminate. Standard credit-card size.
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
- **Parent** — created/linked from a student's page (Parents section). One
  parent can be linked to several children and tops up each child online.

## NFC cards

The till supports NFC alongside QR via Web NFC (Chrome on Android; the site
must be HTTPS). To register a tag: open the student's admin page **on an
Android phone**, Cards → *Scan tag with this device*, tap the tag. Any
NTAG/MIFARE sticker, card or wristband works — the tag's hardware serial is
what's registered, nothing is written to the tag. At the till, tapping a
registered tag on the phone charges exactly like a QR scan. Lost NFC tags are
blocked individually from the student's Cards list ("Replace QR card" doesn't
touch NFC tags).

## Tech

Next.js 16 (App Router, server actions) · Prisma 7 + PostgreSQL · Tailwind 4 ·
Stripe Checkout · html5-qrcode (browser camera scanning) · Cards are a separate
table with a `type` field, so NFC wristbands/cards can be attached to the same
accounts later.
