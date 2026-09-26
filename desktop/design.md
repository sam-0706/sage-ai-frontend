# Design — SAGE AI

A locked design system for the SAGE AI desktop application. Every route reads this
system through `tokens.css`; page-specific styling may extend it but must not
replace its colour, type, spacing, motion, or interaction language.

## Genre

Modern editorial utility. The app should feel like an ambitious student's
personal operating system: calm, decisive, optimistic, and dense with useful
context without looking like an admin template.

## Macrostructure family

- Marketing pages: not currently in scope.
- App pages: Command center. Use a dark navigation rail, a warm reading canvas,
  one dominant action or insight, and supporting editorial panels with varied
  density. Avoid uniform grids of interchangeable cards.
- Content pages: not currently in scope.

## Theme

Warm daylight is the default presentation. A midnight companion theme is
available; both share a vivid violet anchor, an ink navigation rail, and
semantic mint, amber, and coral signals.

- `--color-paper`: `oklch(14% 0.020 278)`
- `--color-paper-2`: `oklch(18% 0.024 278)`
- `--color-paper-3`: `oklch(22% 0.028 278)`
- `--color-ink`: `oklch(96% 0.010 275)`
- `--color-ink-2`: `oklch(78% 0.014 275)`
- `--color-rule`: `oklch(29% 0.026 278)`
- `--color-accent`: `oklch(70% 0.180 295)`
- `--color-focus`: `oklch(78% 0.150 295)`

## Typography

- Display: Manrope Variable, weight 750, roman.
- Body: Manrope Variable, weight 450, roman.
- Mono: JetBrains Mono Variable, weight 500; reserved for URLs, timestamps,
  run status, and build/privacy colophon.
- Display tracking: `-0.035em`.
- Type scale anchor: `--text-display = clamp(2rem, 3vw, 3.25rem)`.

## Spacing

Four-point named scale. Values live in `tokens.css`; production components use
semantic tokens or the matching Tailwind scale.

## Motion

- Fade and subtle transform only.
- Primary easing: `cubic-bezier(0.16, 1, 0.3, 1)`.
- No spring or bounce for state changes.
- Reduced motion falls back to opacity-only at 120 ms or less.

## Microinteractions stance

- Silent success for normal saves and connections.
- Errors stay beside the action that caused them.
- Focus rings appear instantly and never animate.
- Destructive actions require a deliberate second action.
- CAPTCHA and authentication checkpoints interrupt visually and preserve the
  live browser session until the user resumes or skips.

## CTA voice

- Primary: ink-to-violet fill, compact rounded rectangle, verb-first label.
- Secondary: crisp paper surface with a visible rule.
- Destructive: red tint plus explicit noun (`Delete application`, `Wipe data`).

## Per-page allowances

- App pages use no decorative enrichment; live screenshots and state are proof.
- The Dashboard may use one restrained ambient canvas bloom.
- Live and checkpoint surfaces must prioritise current action over decoration.

## What pages MUST share

- SAGE AI wordmark and droplet mark.
- Ink navigation rail and luminous active-view indicator.
- Violet anchor colour and semantic checkpoint status system.
- Manrope + JetBrains Mono pairing.
- Button/input geometry, focus rings, and 4-point rhythm.
- Direct action language: `Start practice`, `Build my plan`, `Review`, `Continue`.

## What pages MAY differ on

- Canvas density and column split.
- Whether the contextual inspector is persistent or empty-state content.
- Route-specific status summaries and controls.

## Exports

### tokens.css

The source of truth is [`tokens.css`](tokens.css).

### Tailwind mapping

`tailwind.config.js` maps shadcn-compatible OKLCH channel variables with
`oklch(var(--token) / <alpha-value>)` and exposes the named display, body, and
mono families.

### DTCG

The portable DTCG export is [`tokens.json`](tokens.json).

### shadcn/ui variables

`tokens.css` publishes `--background`, `--foreground`, `--card`, `--primary`,
`--secondary`, `--muted`, `--border`, `--input`, and `--ring` as space-separated
OKLCH channels for Tailwind/shadcn composition.

## Safety contract

- CAPTCHA challenges are detected, surfaced, and handed to the user. They are
  never solved or bypassed by the agent.
- Gmail authorization is read-only and separate from browser identity.
- A reusable browser profile may preserve a Google/job-site session only after
  the user signs in themselves.
- Final submission is reviewed by default. Auto-submit is an explicit setting
  and never overrides CAPTCHA, password, SSO consent, or account-creation gates.
