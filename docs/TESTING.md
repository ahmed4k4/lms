# Testing

```bash
npm run check          # tsc + eslint + vitest (unit, component, DB/RLS)
npm run build && npm run start &    # then:
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

For e2e the server needs the env variables set (placeholder values are fine for the included tests).

## Automated suites

| Suite | Files | What it proves |
|---|---|---|
| **Database / RLS** (PGlite = real Postgres engine; applies all migrations) | `tests/db/rls.test.ts` (45) | Signup trigger; students can't escalate roles/status; BOLA: instructor B can't read/modify instructor A's courses, videos, quiz keys; publish workflow & MFA (aal2) enforcement; entitlement logic (free enrol, paid not self-enrollable, expired/revoked/future denied, lifetime survives price change, suspended users/courses, archived keeps access); progress writes need access; `object_key` and answer keys not selectable; server-side grading; submissions locking/grading; certificates; audit immutability; payment tables closed; webhook idempotency constraint; rate-limit function; internals invisible. |
| **Query guard** | `tests/db/queries.test.ts` (2) | Every `.from().select/insert/update` in `src/` references existing columns (the Supabase client is untyped) |
| **Unit** | `tests/unit/*` (42) | CSRF origin rules; watermark/IP hashing; video magic-byte sniffing, filename/key safety, type allow-lists; CSP builder; zod schemas (mass assignment, bounds); i18n parity (keys + placeholders); `safeNext`/slug; **R2 presign** (TTL, signed headers, no secret leakage, sanitised filename); route-handler wrapper (CSRF, uniform errors, no leakage). |
| **Component** | `tests/unit/quiz-taker.test.tsx` | Quiz UI gating, request payload, server-graded result display, Arabic rendering. |
| **HTTP security (Playwright request API)** | `tests/e2e/security.spec.ts` (22) | Direct API calls without a session are 401; malformed ids 404; cross-origin/origin-less mutations 403; cron needs a secret; webhook 501; protected pages redirect anonymous users (307); nonce CSP + hardening headers present; scripts carry the nonce; no secrets in HTML; public pages survive an unreachable database; Arabic cookie ⇒ `lang="ar" dir="rtl"`. |

These ran green in the delivery environment (89 Vitest tests + 22 Playwright tests, `tsc`, ESLint, `next build`). Additionally verified with a headless browser: the production build under its strict CSP loads with no console errors, and axe-core finds 0 violations on the audited pages (EN and AR). The authenticated screens were exercised against a stub backend with sample data, not a real Supabase project.

## Not covered by automation — run on staging before launch

Requires real Supabase + R2 credentials and a browser. Use two instructors (A, B), two students (S1, S2), one admin.

**Auth & admin**
- [ ] Register S1 → confirmation e-mail → sign in. Wrong password and unknown e-mail show the same message.
- [ ] Forgot-password link works once; "sign out other devices" kills a second browser.
- [ ] Admin first sign-in is forced to `/account/security`, enrols TOTP, then reaches `/admin`. Without MFA, direct URL `/admin/users` redirects.
- [ ] Admin creates instructor A and B; suspending B blocks B immediately (existing session too).

**Authoring & publishing**
- [ ] A creates a course, sections, a video lesson, a text lesson; uploads an MP4 (≈50 MB) with the progress bar; replacing the video works; uploading a renamed `.exe`/HTML as `.mp4` is refused (`NOT_A_VIDEO`).
- [ ] A submits for review; admin rejects with a reason (A sees it + notification); resubmit; approve → visible in catalog.
- [ ] B cannot open `/instructor/courses/<A's id>` (404) and `POST /api/uploads` for A's lesson id returns 403.

**Learning & access**
- [ ] S1 enrols (free), watches, leaves and returns (resumes position); lesson completion updates the dashboard.
- [ ] S2 (not enrolled): only previews open; `POST /api/lessons/<locked id>/playback` → 403; a copied signed URL stops working after its TTL.
- [ ] Open the same account on 3 browsers: the third playback is refused (`TOO_MANY_STREAMS`) with the configured limit of 2.
- [ ] Admin revokes S1's access mid-playback: within ≤ 20 s the player stops (heartbeat 403); a new playback request is refused.
- [ ] Watermark `ID-…` visible and moving, also in the custom fullscreen mode. (iOS Safari uses native fullscreen, which drops the overlay.)
- [ ] Quiz and assignment flows; instructor grading triggers a notification; certificate is issued only at 100 % and verifies at `/certificates/<code>`.
- [ ] Attachment download works for S1, 401/404 for S2, and the link expires within a minute.

**i18n / accessibility**
- [ ] Switch to Arabic: layout mirrors on mobile and desktop; forms, tables, player controls and dialogs remain usable.
- [ ] Keyboard-only pass through login, catalog, course page, player and instructor editor; `prefers-reduced-motion` honoured; run Lighthouse / axe on the main pages.

**Operations**
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/maintenance` returns counts.
- [ ] Restore a `pg_dump` into a scratch project (see OPERATIONS).
