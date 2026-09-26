# SAGE AI — mobile

Flutter app for iOS and Android. It talks to the same FastAPI backend as the desktop and web apps and uses the same "Daylight" theme. Auto-apply is desktop-only by design.

## Run

```bash
flutter pub get
flutter run                                              # production API
flutter run --dart-define=SAGE_API_URL=http://localhost:8787
```

To skip Google sign-in against a local backend started with `DEV_AUTH_BYPASS=true`, run a debug build with `--dart-define=SAGE_DEV_EMAIL=you@example.com`. The header is only sent in debug builds.

## Sign-in

The app uses the device flow: `POST /v1/auth/device/start` → Google in an in-app browser → poll `/v1/auth/device/token`. The resulting `sds_` token is stored in the keychain or keystore.

## Layout

- `lib/core`: API client (stale-while-revalidate cache), session, workspace, attendance, theme
- `lib/screens`: Today, Career, Academics, Prep, Plan, Ask SAGE, Account, onboarding
- `lib/widgets`: shared UI kit

## Checks

```bash
flutter analyze
flutter test
```
