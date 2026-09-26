# SAGE web

React + Vite single-page application for SAGE. It uses a custom Google OAuth entry through Clerk, then routes new accounts to profile onboarding and returning accounts to the workspace.

## Local development

The app reads `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` or `VITE_CLERK_PUBLISHABLE_KEY` from the parent frontend `.env` and defaults to the hosted SAGE API.

```bash
npm install
npm run dev
```

Production build and checks:

```bash
npm run lint
npm run build
```

The opportunity search calls `POST /v1/campus/jobs/discover`. The backend uses the authenticated profile, OpenAI Responses web search, structured validation, plan entitlements and usage metering. Results are limited to source-backed current openings with outbound source links.
