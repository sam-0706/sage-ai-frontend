# SAGE AI — Frontend

Web client (React + Vite, JavaScript) for **SAGE AI — Strategic Action and Growth Engine**. The Electron desktop shell
reuses these web modules; the Flutter mobile app consumes the same backend API.

> Status: the backend is live first (PRD build sequence steps 1–6, 9). This repo holds the API client and integration
> contract; the responsive web MVP is the next work package.

## Configuration

```
cp .env.example .env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_BASE_URL=https://<sage-ai-backend-domain>
```

Never put secret keys (Clerk secret, OpenAI, Razorpay secret, Supabase service role) in this repo — they live only on the backend.

## Backend contract

- Base URL: `VITE_API_BASE_URL`; interactive docs at `<base>/docs`, schema at `<base>/openapi.json`.
- Auth: `Authorization: Bearer <Clerk session token>` (`await getToken()` from `@clerk/clerk-react`).
- Invite-only beta: waitlisted users sign in with the same email they used on the waitlist; other emails get
  `403 { error: { code: "not_on_waitlist" } }` — show a friendly "you're not on the beta list yet" screen.
- Errors are always `{ error: { code, message, details, correlation_id } }`.
- See `src/api/client.js` for every call used by the student journey.

## Student journey → API

1. **Sign in** (Clerk) → `GET /v1/me` (`needs_onboarding`, mode, plan allowances, flags)
2. **Choose mode / profile** → `PUT /v1/profile` or `POST /v1/profile/load-demo` (labelled synthetic profiles)
3. **Home** → `GET /v1/home`; **Find my priority** → `POST /v1/interventions/prioritize` (issue, evidence, confidence, missing info, next two items)
4. **Pre-call screen** → `GET /v1/calls/preflight` (purpose, number, duration, allowance, consent text) → `POST /v1/calls` with consent + idempotency key
5. **Call status** → poll `GET /v1/calls/{id}` (status, transcript_status, extraction_status are separate)
6. **Review plan** → `GET /v1/plans/{id}` → `PATCH` edits → `POST /accept`
7. **Human support** → `GET /v1/advisor-templates`; optional explicit `POST /v1/plans/{id}/share` (no message is sent automatically)
8. **Ask SAGE** (RAG assistant) → `POST /v1/chat/sessions` then stream `POST /v1/chat/sessions/{id}/messages`
9. **Plans (test mode)** → `POST /v1/billing/orders` → Razorpay Checkout → `POST /v1/billing/verify`. Always show the "TEST MODE — no real money is collected" label returned by the API.

Staff views use `/v1/staff/*`; superadmin views use `/v1/admin/*`.
