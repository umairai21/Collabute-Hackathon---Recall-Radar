# Recall Radar

Voice-driven product recall detection for small retail shops. Staff talk to a
voice agent (or use a manual form) to check whether a product is under an
active US safety recall, see a live dashboard of flagged items, and trigger
an email alert automatically.

Stack: **Convex** (backend/db/realtime), **Next.js** (frontend),
**ElevenLabs Conversational AI** (voice agent), **Context.dev** (enrichment
scraping only), **Resend** (email notifications).

## Setup

### 1. Install and start Convex

```bash
npm install
npx convex dev
```

The first run prompts you to log in / create a Convex project and writes
`CONVEX_DEPLOYMENT` + `NEXT_PUBLIC_CONVEX_URL` into `.env.local`. Leave this
running in a terminal — it pushes `convex/` on every save.

### 2. Seed demo data

```bash
npm run seed
```

Parses `data/recalls_seed.csv` (415-row CPSC export) with the same logic
`refreshRecalls` uses live, and upserts into the `recalls` table. Safe to
re-run — it skips recall numbers already present.

### 3. Set Convex environment variables (server-side secrets)

These are read inside Convex actions, which run in Convex's cloud, so they
must be set via the Convex CLI — **not** `.env.local`:

```bash
npx convex env set CONTEXT_DEV_API_KEY ctxt_secret_...
npx convex env set RESEND_API_KEY re_...
npx convex env set RECALL_RADAR_ADMIN_EMAIL you@example.com
npx convex env set RECALL_RADAR_FROM_EMAIL "Recall Radar <onboarding@resend.dev>"
npx convex env set RECALL_RADAR_APP_URL http://localhost:3000
```

Both `enrichFlag` and `notifyTeam` fail soft (log + skip) if their API key
isn't set, so the rest of the app keeps working without them.

### 4. Configure the ElevenLabs agent

Create a Conversational AI agent at [elevenlabs.io](https://elevenlabs.io/app/conversational-ai),
then in its config:

**System prompt** (paste as-is, adjust tone if you like):

> You are the voice intake agent for Recall Radar, helping retail shop staff
> check whether a product on their shelf is under an active US safety
> recall. Collect the product name and brand from the speaker in natural
> conversation. If they don't mention a model number, ask once — "do you see
> a model number on the tag or label?" — and move on with whatever they say
> (including "no" or "I don't see one"); never ask a second time. Once you
> have a product name and brand (model number optional), call
> `matchProduct`. If it returns a match, tell the caller the confidence
> level and a one-sentence summary of the recall (product name and hazard),
> then ask them to confirm before flagging. If they confirm, call
> `confirmFlag` with the same recallId, confidence, productName, brand, and
> modelNumber. If `matchProduct` returns "no_match", tell the caller you
> didn't find a confident match and it's being logged for manual review,
> then call `logNeedsReview`. Keep responses brief — this is a busy retail
> floor, not a chat interface.

**Tools** (Client Tools — Tool type "Client", not "Webhook" — parameter
schemas below):

| Tool name | Parameters | Description |
|---|---|---|
| `matchProduct` | `productName` (string, required), `brand` (string, required), `modelNumber` (string, optional) | Looks up candidate recalls for a product. Returns JSON with the top match (recallId, confidence, matchedProductName, hazard, remedy) or `"no_match"`. |
| `confirmFlag` | `recallId` (string, required), `confidence` (string enum: high/medium/needs_review, required), `productName` (string, required), `brand` (string, required), `modelNumber` (string, optional) | Records the confirmed match on the dashboard. |
| `logNeedsReview` | `productName` (string, required), `brand` (string, required), `modelNumber` (string, optional) | Logs a product with no confident recall match for manual review. |

Set `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` in `.env.local` to the agent's ID.

### 5. Run the app

```bash
npm run dev
```

Visit `http://localhost:3000` — **Voice Agent**, **Manual Add**, and
**Dashboard** views are in the nav bar.

## Project structure

- `convex/schema.ts` — `recalls`, `products`, `flaggedProducts` tables.
- `convex/lib/parseRecalls.ts` — shared CPSC CSV parsing (seed script +
  `refreshRecalls` both use this).
- `convex/lib/match.ts` — product/recall matching + scoring (Dice
  coefficient fallback; see comment for the search-index upgrade path).
- `convex/recalls.ts` / `convex/recallsActions.ts` / `convex/crons.ts` —
  upsert + live CSV fetch (daily cron, plus manual "Refresh Now" on the
  dashboard).
- `convex/products.ts`, `convex/match.ts`, `convex/flags.ts` — the core
  `addProduct` / `matchProduct` / `flagProduct` / `getDashboard` functions.
- `convex/enrich.ts`, `convex/notify.ts` — Context.dev enrichment and Resend
  notification actions, scheduled from `flagProduct`.
- `scripts/seed.ts` — one-time local CSV → Convex loader.
- `app/page.tsx` — Voice Agent view. `app/add/page.tsx` — Manual Add.
  `app/dashboard/page.tsx` — Live Dashboard.

## Notes

- This project's `.git` repository root turned out to be the whole
  `C:\Users\DEII` home directory, not this project folder — it was left
  untouched. Worth sorting out separately (either `git init` a proper repo
  here, or fix the home-directory one) before committing this project.
