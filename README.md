# iSabi-Kraft-backend
REST API for iSabiKraft, a trusted artisan marketplace for Nigeria. Handles auth, job posting, quotes, Paystack escrow payments, reviews, disputes and admin verification.
iSabiKraft Backend
The backend API for iSabiKraft, a two-sided service marketplace that helps customers in Nigeria find, assess, and hire reliable artisans, while giving skilled artisans access to serious customers, clearer job requirements, and protected payment.

Most customers already find artisans through referrals and WhatsApp. The real problem starts after the connection, uncertainty about reliability, pricing, and accountability on one side, and unclear scope, delayed payment, and no show customers on the other.
What this API does
Auth and users: registration and login for customers, artisans, and admins, with role-based access and terms acceptance
Artisan profiles: professional profiles with portfolios and verification.
Jobs and quotes: structured job requests with photos, location, and scope; artisans submit quotes, customers compare and accept
Payments and escrow: Paystack-powered payments with funds held in escrow until the customer confirms the job is done.
Job tracking: status flow from request through quote, booking, in progress, and completion
Reviews: ratings and reviews from completed platform jobs only, building each artisan's verified reputation
Disputes and admin: dispute handling, artisan approval, and marketplace monitoring
MVP scope
Built for a 6-week buildathon, launching in one Lagos corridor with three trade categories: electrical, carpentry, and cleaning services.
Project structure
src/
├── config/        # database, env, Paystack setup
├── controllers/   # request handlers
├── models/        # data models
├── routes/        # API routes
├── services/      # business logic (payment, escrow, terms, notifications)
├── middleware/    # auth, roles, error handling
└── utils/         # constants, reference generation, document hashing
Tech stack
Node.js, Express, Paystack (payments), Database ().

## Live selfie verification

Authenticated users can start a selfie session after consenting, upload the requested camera frames in order, and submit them for admin review. Admins can review pending sessions and view frames through protected routes. Selfie frames are stored under `private/` (or `PRIVATE_DIR`) and are not served from the public uploads path; rejected and expired frames are removed, and approved frames are removed after the retention period.

The API is mounted at `/api/verification/selfie`:

- `POST /sessions` with `{ "consent": true }` starts a session.
- `POST /sessions/:id/frames` accepts multipart fields `challenge` and `frame`.
- `POST /sessions/:id/submit` submits completed steps for review.
- `GET /status` returns the current user's verification status.
- Admins use `GET /queue`, `GET /:id/frames/:index`, and `PATCH /:id` to review.

Optional settings: `PRIVATE_DIR`, `SELFIE_SESSION_TTL_SECONDS`, `SELFIE_CHALLENGE_COUNT`, `SELFIE_MIN_FRAME_GAP_MS`, `SELFIE_MAX_SESSIONS_PER_DAY`, and `SELFIE_RETENTION_DAYS`. Use a persistent private volume for `PRIVATE_DIR` in production.
