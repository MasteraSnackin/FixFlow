# FixFlow

FixFlow is an AI-powered property maintenance agent for small landlords and property managers. A tenant submits a photo of an issue, FixFlow diagnoses it, finds contractors, builds a work order, and pushes the request into a landlord review flow.

## What the app does

- Tenant flow: submit a maintenance issue with a photo and optional description.
- AI diagnosis: classify category, severity, urgency, recommended action, and safety notes.
- Contractor discovery: search for nearby contractors and rank them by rating, distance, and availability.
- Vetting and work order generation: enrich the request with review summaries, red flags, and cost estimates.
- Notification pipeline: generate a voice update and quote-request outreach with Twilio, ElevenLabs, and Resend when configured.
- Landlord flow: review requests in a dashboard, inspect estimates, and approve dispatch.


<img width="1792" height="2012" alt="60814" src="https://github.com/user-attachments/assets/0aafa635-15f9-4c3e-ab32-3f6e71bfcafa" />
<img width="2024" height="2482" alt="37640" src="https://github.com/user-attachments/assets/6fa82e48-9b70-4073-9485-d71f996d36cc" />


## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Clerk for authentication and role-based entry
- Supabase for Postgres, storage, and realtime data access
- Vercel AI SDK with switchable Claude or Gemini providers for diagnosis and contractor intelligence
- Optional Bright Data Discover API for contractor retrieval, vetting research, and quote grounding
- `workflow` for multi-step orchestration

## Main product surfaces

- `/` routes users by role:
  - `tenant` -> `/submit`
  - `landlord` -> `/dashboard`
- `/submit` lets a tenant upload a photo and create a maintenance request.
- `/requests/[id]` shows request progress and generated outputs to the tenant.
- `/dashboard` is the landlord command center for active requests.
- `/dashboard/properties` manages properties, units, and tenant assignment data.

## Request lifecycle

1. A tenant submits a photo, unit, and optional description through `POST /api/requests`.
2. The app stores the request in Supabase and starts `POST /api/workflows/maintenance`.
3. The workflow runs diagnosis, contractor discovery, vetting, work-order generation, and notification steps.
4. The landlord dashboard reads the resulting diagnosis, contractor shortlist, cost range, and approval state.
5. Quote delivery can run in real mode or mock mode depending on which communication credentials are present.

## Prerequisites

- Node.js 20+ recommended
- An existing Supabase project
- A Clerk application
- An Anthropic API key for Claude, or a Google Generative AI API key for Gemini fallback
- Optional: ElevenLabs, Twilio, and Resend accounts for voice and quote outreach

## Environment setup

Copy `.env.example` to `.env.local` and fill in the values.

### Required for local development

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase browser key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase access |
| `FIXFLOW_AI_PROVIDER` | Set to `anthropic` or `google`; defaults to `anthropic` when an Anthropic key exists |
| `ANTHROPIC_API_KEY` | Claude diagnosis, contractor reasoning, vetting summaries, and quote-estimate generation |
| `ANTHROPIC_MODEL` | Optional Claude model override; defaults to `claude-sonnet-4-5` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend key |
| `CLERK_SECRET_KEY` | Clerk server key |
| `NEXT_PUBLIC_APP_URL` | Base URL for internal server-to-server fetches, usually `http://localhost:3000` |

### Optional integrations

| Variable | Purpose |
| --- | --- |
| `ELEVENLABS_API_KEY` | Generate spoken quote-request audio |
| `ELEVENLABS_VOICE_ID` | Override the default ElevenLabs voice |
| `ELEVENLABS_MODEL_ID` | Override the default ElevenLabs text-to-speech model |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | Place outbound quote-request calls |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Send quote-request emails |
| `LANDLORD_OVERRIDE_PHONE` | Override the default quote call target |
| `QUOTE_NOTIFY_EMAIL` | Override the default quote email target |
| `APP_URL` | Public `https://` origin for Twilio webhooks; use an `ngrok` URL during local development |
| `WORKFLOW_INTERNAL_FETCH_TIMEOUT_MS` | Increase if downstream workflow steps time out locally or in deployment |
| `GOOGLE_GENERATIVE_AI_API_KEY` / `GOOGLE_MODEL` | Optional fallback if you want to run the Google-backed path instead |
| `FIXFLOW_WEB_PROVIDER` | Set to `brightdata` to use Bright Data for contractor discovery, vetting, and quote grounding; otherwise the app uses model-native search tools |
| `BRIGHTDATA_API_KEY` | Bright Data API key for the Discover API |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET_TOKEN` / `TELEGRAM_BOT_USERNAME` | Enable the Telegram Chat SDK bot |
| `TELEGRAM_FIXFLOW_TENANT_ID` / `TELEGRAM_FIXFLOW_UNIT_ID` | Map Telegram submissions into a real FixFlow tenant/unit when you are not using local fallback mode |
| `TELEGRAM_FIXFLOW_REQUEST_LANGUAGE` | Optional default request language for Telegram submissions |

### Important local-dev notes

- If `APP_URL` is not a public `https://` URL, Twilio cannot post speech-capture webhooks back to your machine.
- If Twilio and Resend credentials are missing, the notification step still runs in mock mode so the rest of the pipeline remains testable.
- Clerk role routing depends on `user.publicMetadata.role` being set to `tenant` or `landlord`.
- Anthropic web search must be enabled in your Anthropic Console if you want Claude to power contractor discovery and vetting without Bright Data.
- If `FIXFLOW_WEB_PROVIDER=brightdata` and `BRIGHTDATA_API_KEY` is set, contractor discovery, vetting, and grounded quote estimation use Bright Data Discover API while Claude or Gemini still handle the reasoning and structured outputs.
- Telegram local development uses Chat SDK polling automatically when `TELEGRAM_BOT_TOKEN` is set and no webhook is registered yet.
- In real Supabase mode, Telegram needs `TELEGRAM_FIXFLOW_TENANT_ID` and `TELEGRAM_FIXFLOW_UNIT_ID` so the bot knows which FixFlow unit to submit into.

## Data model assumptions

This repository expects an existing Supabase schema and seed data. There are no migrations in the repo right now, so local setup is not fully self-bootstrapping.

At minimum, local testing assumes:

- `properties`, `units`, and `maintenance_requests` tables already exist
- the storage bucket used for request photos and voice updates exists
- tenant rows in `units` are linked to Clerk users through `units.tenant_id`

If a tenant can sign in but sees no selectable unit on `/submit`, their Clerk `user.id` likely does not match any `units.tenant_id` row yet.


##  System Architecture: FixFlow

<img width="2362" height="2308" alt="image" src="https://github.com/user-attachments/assets/cf79dd08-1038-4756-b6af-546d7c33a1d8" />

more information 

https://github.com/MasteraSnackin/FixFlow/blob/main/ARCHITECTURE.md



## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Telegram bot

FixFlow now includes a Telegram Track 3 surface using Chat SDK's official Telegram adapter.

What it can do today:

- accept a photo plus caption in Telegram
- create a FixFlow maintenance request through the existing `POST /api/requests` pipeline
- return a request card with `Refresh Status` and `Open in FixFlow`
- answer `/start`, `/help`, `/report`, and `/status <request_id>`

Setup:

1. Create a bot with `@BotFather` and capture the bot token.
2. Add these variables to the project root `.env.local`:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET_TOKEN`
   - `TELEGRAM_BOT_USERNAME`
3. For real Supabase mode, also set:
   - `TELEGRAM_FIXFLOW_TENANT_ID`
   - `TELEGRAM_FIXFLOW_UNIT_ID`
4. For local fallback mode, you can skip the tenant/unit mapping; the bot will auto-provision a local test tenant and unit.

Routes:

- Telegram webhook endpoint: `/api/webhooks/telegram`
- Bot implementation: [src/lib/chat/telegram-bot.ts](/Users/darkcomet/Downloads/FixFlow-main/src/lib/chat/telegram-bot.ts:1)

Webhook registration example:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/api/webhooks/telegram",
    "secret_token": "your-secret-token"
  }'
```

For localhost, Chat SDK will use polling mode automatically after `npm run dev` as long as `TELEGRAM_BOT_TOKEN` is present.

## Suggested local verification

```bash
npx tsc --noEmit
npm run build
npm run lint
```

Then test the happy path:

1. Sign in as a tenant user whose Clerk ID is present in `units.tenant_id`.
2. Submit a request from `/submit`.
3. Confirm the app redirects to `/requests/<id>`.
4. Check that `POST /api/workflows/maintenance` returns `202`.
5. Review the request in `/dashboard` as a landlord.

The repo also includes a more detailed checklist in [docs/phase3-person2-local-test-checklist.md](docs/phase3-person2-local-test-checklist.md).

## Key files

| Path | Purpose |
| --- | --- |
| `src/app/page.tsx` | Role-aware landing page and redirect entry |
| `src/app/(tenant)/submit/page.tsx` | Tenant submission UI |
| `src/app/(landlord)/dashboard/page.tsx` | Landlord overview dashboard |
| `src/app/api/requests/route.ts` | Request intake, upload handling, and workflow trigger |
| `src/app/api/workflows/maintenance/route.ts` | Workflow start endpoint |
| `src/workflows/maintenance.ts` | Multi-step orchestration logic |
| `src/lib/ai/diagnose.ts` | Provider-backed maintenance diagnosis |
| `src/lib/ai/contractors.ts` | Contractor discovery and ranking |
| `src/app/api/notify/route.ts` | Voice and quote notification logic |
| `docs/` | SRS and phase planning material |

## Project docs

- [docs/FixFlow_SRS(2).tex](docs/FixFlow_SRS(2).tex)
- [docs/FixFlow_Phase1_TaskBreakdown.tex](docs/FixFlow_Phase1_TaskBreakdown.tex)
- [docs/FixFlow_Phase2_TaskBreakdown.tex](docs/FixFlow_Phase2_TaskBreakdown.tex)
- [docs/FixFlow_Phase3_TaskBreakdown.tex](docs/FixFlow_Phase3_TaskBreakdown.tex)

## Current caveats

- Supabase schema creation is out-of-band and must be provisioned separately.
- Several features are designed to degrade gracefully in local mode when Twilio, Resend, or ElevenLabs are not configured.
- The package name in `package.json` is still the scaffold placeholder `app-temp`.
