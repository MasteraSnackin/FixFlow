# Phase 3 Person 2 Local Test Checklist (WDK Path)

## Prerequisites

- `.env.local` contains valid values for:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GOOGLE_GENERATIVE_AI_API_KEY`
  - Clerk keys
  - `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- Supabase has seeded `units`, `properties`, and `maintenance_requests` tables.
- Tenant `units.tenant_id` matches signed-in Clerk `user.id`.

## Static checks

```bash
npx tsc --noEmit
npx next build
```

Both commands must succeed.

## Runtime checks (local)

1. Start app:

```bash
npm run dev
```

2. Submit a ticket from tenant UI:
   - Go to `/submit`
   - Upload photo + select unit + submit
   - Confirm response redirects to `/requests/<id>`

3. Verify workflow started:
   - In server logs, ensure no `Workflow trigger failed`.
   - Confirm `POST /api/workflows/maintenance` returns `202`.

4. Verify progressive pipeline updates in DB:
   - `maintenance_requests.status` transitions through:
     - `submitted`
     - `diagnosing`
     - `contractors`
     - `vetting`
     - `work_order`
     - `notifying`
     - `completed`
   - On failure, status becomes `error`.

5. Verify request detail page progression:
   - Diagnosis card populates.
   - Contractors list appears.
   - Voice update appears (`voice_update_url` set) or page shows error state (status `error`).

6. API smoke checks (optional):

```bash
curl -X POST http://localhost:3000/api/workflows/maintenance \
  -H "Content-Type: application/json" \
  -d '{"requestId":"<REQUEST_ID>"}'
```

Expected: `202` with `runId`.

## Regression checks

- `POST /api/requests` still returns `{ "requestId": "..." }`.
- Existing frontend submit route works with multipart form payload.
- Landlord/tenant access rules on `GET /api/requests/[id]` unchanged.

