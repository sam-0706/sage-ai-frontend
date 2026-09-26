# SAGE AI demo pricing

Proposed prices in INR, per 30 days. These are product prices, not a claim of validated willingness to pay or guaranteed margins. Razorpay runs in TEST mode; there is no automatic renewal.

| Access / allowance | Plus | Pro | Ultra |
|---|---:|---:|---:|
| Price | ₹499 | ₹1,499 | ₹3,499 |
| AI generations / recommendation requests | 30 | 100 | 250 |
| Knowledge chat messages | 100 | 400 | 1,000 |
| AI voice minutes, shared across call types | 10 | 40 | 120 |
| Auto-apply AI agent steps | 100 | 400 | 1,000 |
| Dashboard, catalogue, timetable, attendance, deadlines | Yes | Yes | Yes |
| Quick Notes, Study AI, semester planner | Yes | Yes | Yes |
| Browse demo jobs / exposure opportunities | Yes | Yes | Yes |
| Semantic job matching, Interview AI | — | Yes | Yes |
| Activity planner and class priorities | — | Yes | Yes |
| Opt-in overdue calls | — | Yes | Yes |

An agent step is one AI action, not one successful job application. Voice minutes are metered after provider reconciliation; concurrent calls are prevented. Included budgets reset with a new verified 30-day purchase. Upgrading begins a new period and does not prorate unused access. Existing tester subscriptions remain valid; old plans are no longer offered for purchase.

Academic and bus fees are separate demo orders. Their verification marks only the corresponding fee paid; it does not change subscription access. No payment goes to BITSoM.

## Cost assumptions

OpenAI GPT-5 mini published pricing: $0.25 / million input tokens and $2 / million output tokens. A hypothetical generation using 3,000 input and 2,000 output tokens costs about $0.00475 before any other infrastructure or retries. Actual prompt lengths and reasoning usage vary. [OpenAI model reference](https://developers.openai.com/api/docs/models/gpt-5-mini).

OmniDimension lists voice rates from $0.084/min (Starter) to $0.056/min (Growth), with monthly plan commitments; telephony, number rental and concurrency are separate. At $0.084/min, using every included minute is $0.84 / $3.36 / $10.08 respectively, before those extras and currency conversion. This is a cost scenario, not a quoted account bill. [OmniDimension pricing](https://docs.omnidim.io/docs/pricing).

Before real-money launch: validate total provider cost from actual invoices, payment fees, taxes, currency conversion, support costs, refunds and upgrade policy. This demo deliberately uses test payments only. [Razorpay integration and test flow](https://razorpay.com/docs/payments/server-integration/python/integration-steps).
