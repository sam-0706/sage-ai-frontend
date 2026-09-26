# SAGE AI — Frontend

Client apps for **SAGE AI — Strategic Action and Growth Engine**.

| Path | Client | Status |
|---|---|---|
| [`desktop/`](desktop/) | Electron desktop app (macOS / Windows) | ✅ Onboarding, Home, Exam prep, Ask SAGE, Auto apply, Settings |
| [`web/`](web/) | React + Vite web app | ✅ Google sign-in, onboarding, dashboard, live job search, network graph, academics, planning and study |
| `mobile/` | Flutter app | After web |
| [`src/api/client.js`](src/api/client.js) | Shared JS API client for web | ✅ |

Backend API: `https://sage-ai-backend-hazel.vercel.app` · docs at `/docs`.

## Auth per client

- **Web**: Clerk session JWT → `Authorization: Bearer <jwt>`.
- **Desktop / mobile**: device sign-in (`POST /v1/auth/device/start` → browser approval → `POST /v1/auth/device/token`)
  → `Authorization: Bearer sds_…`.

Invite-only beta: only waitlisted emails can sign in (`403 not_on_waitlist` otherwise).
Never commit secrets — provider keys live only on the backend.
