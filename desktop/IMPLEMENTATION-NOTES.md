# SAGE desktop: BITSoM 2026 demo and AutA import

The local desktop imports the real AutA profile, resume, 11 jobs, 3 applications, 100 activity events, screenshots, provider preferences, one site credential record and four OS-encrypted credentials. Source records remain in AutA. A SQLite backup and an import report live in the SAGE user-data folder. Interrupted application runs are marked interrupted rather than restarted.

AutA's persistent browser profile was copied while its browser was closed. Validation on 26 September 2026 found Google and LinkedIn session cookies and reached the account/feed pages without a sign-in redirect. Cookie expiry and server-side session revocation can still require future login. Google OAuth client credentials serve the Gmail API flow; they do not create website login cookies.

The Clerk button opens the existing device authorization flow. The separate BITSoM demo entry works without a backend session and does not impersonate a Clerk user. Authentication, consent, CAPTCHA and final submission remain user-controlled.

Academic data:
- The published two-year course catalogue is recorded in `src/shared/bitsom-catalogue.json`, with its source and retrieval date. The official BITSoM site returned 403, so current official verification remains outstanding.
- 36 authored demo questions and answers cover 18 first-year core subjects. This is a starter study library, not official teaching material or full syllabus coverage. Questions and answers appear together; Quiz uses self-assessment and supports filtering review cards.
- Attendance and the weekly timetable are synthetic. They are not a portal integration. Attendance updates persist locally per SAGE user (or the separate demo identity), and recovery calculations use the selected target, not an asserted institution policy.

Loading changes: GET requests time out after 20 seconds; concurrent identical reads are deduplicated; the startup account response is briefly reused; account-load failures show retry/sign-in actions; local setup cannot leave the entire desktop spinning indefinitely; Google API code loads only for Gmail operations. Demo study content loads from the app bundle.

Verification: `npm run typecheck`, `node scripts/test-attendance.cjs`, `node scripts/verify-desktop.cjs`, and `SAGE_TEST_PACKAGED=1 node scripts/verify-desktop.cjs`. Run desktop checks sequentially because the app uses a single-instance lock. Browser validation is `node scripts/verify-browser.cjs` and navigates only to account/feed pages. No application or email was submitted and no outbound phone call was placed.

macOS packaging: `npm run pkg:mac`. Developer signing is configured locally; notarization is not configured. The build is local, not a backend deployment.

Final packaged verification: all interaction checks passed; Google client configuration readable and browser identity ready. Gmail API consent has not been completed (independent of the imported browser sessions). Final warm launch reached sign-in in 1.46 seconds; earlier cold packaged launch was 4.45 seconds. These are individual measurements, not a latency guarantee. Credential transfer must target the packaged app identity via `scripts/migrate-credentials.cjs`.

## Campus workspace and pricing — 26 September 2026

- Plus ₹499, Pro ₹1,499, Ultra ₹3,499 per 30 days. Exact allowances and cost assumptions in PRICING.md. Non-renewing Razorpay TEST checkout opens externally with a one-order, 30-minute capability; server checks signature and payment state. Fee payments never grant subscriptions.
- Student onboarding v2 collects the published MBA specialisations, selected courses, goals, desired salary, daily minutes, experience, resume context and separate deadline-call consent. Catalogue contains 80 published course/workplace entries across six terms. Source is secondary; current official availability remains unverified.
- Nested placement, attendance, planner, assignments, fees, exam prep and exposure navigation. Real AutA data/session import retained. OpenAI + pgvector ranking uses explicit 70/20/10 semantic/salary/specialisation components. Recommendations are discovery scores, never hiring eligibility or probabilities.
- OpenAI semester/activity/class-priority outputs persist with user-owned tasks. Progress marks and estimated remaining study days use actual saved tasks. Calendar class slots and attendance remain explicitly synthetic; task/deadline dates are saved data.
- Interview agent 258828 created and configured in production. Interview decks use resume/JD context; Study AI has its own agent. Actual post-call scores appear only after a completed provider call and analysis; no scores are fabricated.
- Deadlines seeded on student onboarding; automatic follow-ups require explicit opt-in, Pro/Ultra (or existing tester access), voice allowance and saved own number. 09:00–18:00 IST, max one call/user/24h, one request/deadline. Desktop checks every minute while signed in; Vercel Hobby background cron runs daily at 09:30 IST. This is not continuous closed-app monitoring.
- Backend deployed from commits 2fd0f17 and 06b8e45 to sage-ai-backend-hazel.vercel.app. Six migrations applied, ready endpoint healthy. RLS enabled and client grants revoked on all four new campus tables.
- Verification: 53 backend tests; desktop TypeScript checks; actual embedding retrieval (8 jobs/internships); actual structured plan (14 tasks) and persistence; actual interview deck (8 cards) and voice preflight; real Razorpay TEST order created but deliberately unpaid. Deadline integration used a stubbed telephone provider and proved one dispatch across repeated checks. No live phone call was placed.
- Browser UI checks used explicitly synthetic isolated fixtures: pricing amounts/allowances, job ranking display, Study AI, planner, attendance scenario, interview setup, fees, research, and onboarding elective names with commas. No renderer errors observed. Test fixture files were removed afterward.
- macOS package signed but not notarized. Clerk sign-in and the final Razorpay Success step remain user actions. Automatic calls were not exercised on a real phone.
