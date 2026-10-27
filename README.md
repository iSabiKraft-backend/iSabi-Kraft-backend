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
Backend/
├── config/        # database (Mongoose/MongoDB), env validation, Paystack client
├── controllers/   # request handlers
├── middleware/    # auth, roles, terms gate, validation, error handling
├── models/        # Mongoose models (index.js)
├── routes/        # API routes, mounted under /api (routes/index.js)
├── services/      # business logic (auth, users, artisans, terms, Paystack, escrow)
├── validators/    # express-validator rules
└── utils/         # token, password hashing, NIN/BVN hashing

Tech stack
Node.js (18+), Express 5, MongoDB via Mongoose, JWT auth, Paystack (payments/transfers).

Getting started
1. npm install
2. Copy .env.example to .env and fill it in (needs a running MongoDB, local or Atlas)
3. npm run dev   (or npm start)

Collections and indexes are created automatically on start. Paystack webhook URL: POST /api/payments/paystack/webhook

Onboarding & authentication API (matches the Figma "Customer" screens)
All routes are under /api. Success responses are { success, message?, data }; errors are { success: false, message, ...extra }.

Create account (step 1 of 2)  ->  Verify Your Account  ->  Account Verified  ->  Complete Your Profile (step 2 of 2)
- POST /auth/register          { fullName, phone?, email?, verificationMethod: "email"|"sms", password, confirmPassword, acceptTerms: true, role?: "customer"|"artisan" }
                               -> 201 { verificationRequired, channel, destination, expiresInSeconds, resendAvailableInSeconds }. No token yet.
- POST /auth/verify            { identifier (email or phone), code (6 digits) } -> { user, token }
- POST /auth/resend-verification { identifier } -> new code; 429 { resendAvailableInSeconds } during the cooldown
- GET  /locations/states, GET /locations/states/:state/lgas   (fill the State / LGA dropdowns)
- PUT  /users/me/profile       { fullName?, state, lga, dateOfBirth: "YYYY-MM-DD", address? }  (auth) -> user with profileCompleted: true
- POST /users/me/avatar        multipart/form-data, field "avatar" (JPEG/PNG/WebP, max 2 MB)   (auth)

Sign in ("Welcome Back")
- POST /auth/login             { identifier (email or phone), password, role?: "customer"|"artisan" (the tab), rememberMe? } -> { user, token }
                               403 { code: "ACCOUNT_NOT_VERIFIED", requiresVerification: true } -> send the user to the verify screen (a fresh code is sent)
                               403 { code: "ROLE_MISMATCH", accountRole } -> wrong tab
                               Use user.profileCompleted to decide between "Complete Your Profile" and Home.
- POST /auth/social            { provider: "google"|"apple", idToken, role?, fullName? } -> { user, token, isNewUser }

Forgot password -> Check your Email/SMS -> Enter 6-digit code -> Create New Password -> Password Reset
- POST /auth/forgot-password   { identifier } -> { channel: "email"|"sms", destination, resendAvailableInSeconds }  (same answer whether or not the account exists)
- POST /auth/reset-password    { identifier, code, password, confirmPassword } -> signs out all existing sessions

Password rules: at least 8 characters, one uppercase letter, one number, one special character.

Providers (see .env.example): email via any SMTP server, SMS via Termii, Google/Apple via your OAuth client IDs.
With none configured and EXPOSE_DEV_OTP=true (development only), codes/links are printed to the console and returned in the response as devCode / devResetLink.

Live selfie verification (all routes need a logged-in user; admin routes need role "admin")
How it works: the app asks the user to do a few RANDOM actions on camera (blink, turn head left/right, smile, look up) and
uploads one camera frame per action, in order, within a short time window. An admin then reviews the frames before approving.
The frames are stored privately (never served statically) and deleted after review/retention.
- POST /verification/selfie/sessions                 { consent: true } -> { sessionId, challenges: [{ id, instruction }], expiresAt, expiresInSeconds, minFrameGapMs }
- POST /verification/selfie/sessions/:id/frames      multipart: challenge (the id being performed) + frame (JPEG/PNG/WebP, max 3 MB)
                                                     -> { captured, nextChallenge, remaining }. 409 + expectedChallenge if out of order, 429 if too fast, 410 if the session expired.
- POST /verification/selfie/sessions/:id/submit      -> 202, goes to the admin queue
- GET  /verification/selfie/status                   -> { selfieStatus: not_started|pending_review|approved|rejected, selfieVerified, latestSession }
- Admin: GET /verification/selfie/queue, GET /verification/selfie/:id/frames/:index (the image), PATCH /verification/selfie/:id { decision, rejectionReason? }
Artisans: an admin cannot approve an artisan (PATCH /artisans/:id/verification) until that artisan's selfie is approved (409 code SELFIE_REQUIRED).
Limits: this proves a live, human-paced, challenge-response capture reviewed by a person. It does not do automated face matching or
deep-fake/spoof detection — for that, a provider will be integrated to handle this, such as Smile ID, Dojah or Youverify into submitSession().

Cookie-based login
`verify`, `login` and `social` also set an **HttpOnly** session cookie (`isk_session`; `Secure` in production, `SameSite=Lax` by default). Browsers just call the API with `credentials: "include"` (fetch) / `withCredentials: true` (axios) — no token handling in JavaScript. "Remember me" makes it a 30-day persistent cookie; otherwise it is a session cookie. `POST /api/auth/logout` clears it.
