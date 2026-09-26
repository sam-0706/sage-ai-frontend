# SAGE AI — Desktop

Electron + React + TypeScript desktop client for **SAGE AI**. It talks to the SAGE backend
(`https://sage-ai-backend-hazel.vercel.app`) and runs a **local auto-apply agent** (forked from AutA) on the user's machine.

| Area | What it does |
|---|---|
| **Sign-in** | Device flow: the app shows a code, opens the browser for Clerk sign-in + approval, then stores a revocable SAGE session in the OS keychain. Invite-only: waitlisted emails only. |
| **Onboarding** | 5-step wizard pre-filled from the waitlist (name, phone, mode, segment). Mode-specific context, goals/interests, AI-call consent. |
| **Home** | Today's priority (rules + AI, with evidence and missing info), AI check-in call with consent, editable plans. |
| **Exam prep** | Type a topic (optionally paste notes) → AI cue-card deck → spaced-repetition study (keyboard: space, 1–4) → spoken quiz call by the SAGE exam-coach agent → "Where you stand": score, readiness, concept mastery, misconceptions, question-by-question feedback and a study plan. Weak concepts return to the study queue. |
| **Ask SAGE** | RAG assistant over the college knowledge base and faculty directory, with citations (demo sources labelled). |
| **Auto apply** | Resume → structured career profile → paste job links → a Playwright agent fills applications in a visible browser, pausing at CAPTCHA, sign-in, OTP and **final submit** checkpoints. Models are SAGE-hosted (OpenRouter behind the metered SAGE proxy) — no API key on the device. Bring-your-own provider keys remain available under Agent settings. |
| **Settings** | Profile, plan usage (voice, AI, chat, auto-apply steps), demo scenarios, signed-in devices, sign out. |

## Architecture

```
src/main/            Electron main process (Node)
  sage/client.ts     SAGE API client + device sign-in; token in OS keychain, never exposed to the renderer
  sage/ipc.ts        `sage:*` IPC (renderer may only call /v1 paths)
  providers/         LLM provider layer; `sage` provider → {API}/v1/autoapply/llm (OpenAI-compatible, metered)
  engine/            AutA Playwright agent (observe → plan → act → verify, checkpoints, submission proof)
  orchestrator/      one-at-a-time run queue, checkpoints, receipts
  store/             local SQLite (jobs, applications, events) — auto-apply data stays on the device
src/preload/         contextBridge: window.sage (SAGE) and window.auta (auto-apply)
src/renderer/        React UI (Workbench design system in tokens.css / design.md)
  sage/              API helpers + auth/profile state
  routes/            SignIn, SageOnboarding, Home, ExamPrep, Ask, AutoApply (+ AutA Dashboard/Live/Onboarding/Settings), Account
  components/        CallPanel (consented calls + status), CheckpointModal, UI kit
```

## Run

```bash
npm install                  # also rebuilds better-sqlite3 for Electron
npm run dev                  # hot reload against production API
npm run typecheck && npm run build
npm run pkg:mac              # → release/SAGE AI-1.0.0-arm64.dmg (unsigned)
npm run pkg:win              # Windows NSIS installer
```

The agent uses Playwright's Chromium when installed (`npx playwright install chromium`), otherwise the user's Google
Chrome or Microsoft Edge.

### Local development against a local backend

```bash
SAGE_API_URL=http://localhost:8787 SAGE_DEV_EMAIL=<waitlisted email> npm run dev
```

`SAGE_DEV_EMAIL` works only in unpackaged builds and only when the backend runs with `DEV_AUTH_BYPASS=true`.
`SAGE_USER_DATA_DIR` isolates local app data for tests.

## Distribution notes

- The DMG is **unsigned**. macOS will warn on first open (right-click → Open). Code signing + notarization need an
  Apple Developer ID (`CSC_LINK`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`).
- Auto-apply data (resume, profile, job queue, browser session, site credentials) never leaves the device. Only
  model prompts (page observations with passwords redacted) go through the SAGE proxy.

Auto-apply engine derived from AutA (AGPL-3.0).
