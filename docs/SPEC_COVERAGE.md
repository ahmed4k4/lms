# Specification coverage (audited against the original spec)

Legend: ✅ implemented and covered by a test or direct verification · ◐ partially / by design differently · ⛔ not built (stated honestly) · ☁ needs a live Supabase/R2 project to verify.

## 3. Roles

| Requirement | Status | Evidence / note |
|---|---|---|
| Super Admin: create / activate / suspend instructors | ✅ | Admin → Instructors; suspension ends `can_manage_course` immediately (DB test) |
| Manage administrators and granular permissions | ◐ | Role assignment (Admin → Users) and an editable permission matrix for the `admin` role (Admin → Roles). Per-user custom permission sets are not built |
| Review / approve / reject / suspend / archive courses | ✅ | Admin → Courses; status-transition trigger tested |
| Manage users, categories, policies, settings, reports | ◐ | Users, categories, settings (limits, MFA, streams, quotas) ✅; "reports" = overview counters only |
| Audit logs and security events | ✅ | Admin → Audit; append-only; sharing alerts logged |
| Future commissions / payment settings | ◐ | `commission_percent` setting + `instructor_earnings` table reserved for phase 2 |
| Content moderation and **support workflows** | ◐ | Review hiding and Q&A deletion ✅. A support-ticket system is ⛔ |
| Instructor: profile, courses, uploads, drafts → review → publish | ✅ | |
| Instructor: students, progress, quiz results, reviews, analytics | ◐ | Students/progress/analytics ✅, Q&A inbox ✅; quiz results are an average (no per-attempt report), no instructor replies to reviews |
| Instructor: pricing, announcements, quizzes, assignments, resources | ✅ | Pricing UI offers free / one-time (+ access days); other models are schema-only |
| Instructor never sees another instructor's private data | ✅ | RLS tests (courses, videos, quiz keys, Q&A, notes, students) |
| Student: register, recover, profile, sessions | ✅ ☁ | Includes "sign out other devices" |
| Student: browse, search, filter, preview | ✅ | Sidebar filters, sort, rating, level, language, price |
| Student: protected video, progress, resume | ✅ ☁ | |
| Student: quizzes, assignments, **ask questions**, reviews | ✅ | Q&A added in migration 0006 (RLS-tested) |
| Student: certificates, learning history | ◐ | Certificates ✅ (public verification); history = dashboard progress and grades |
| Student: future subscriptions | ⛔ | Phase 2 |

## 4–5. Monetisation architecture and entities

| Requirement | Status | Note |
|---|---|---|
| Products, plans, plan items, orders, items, subscriptions, entitlements, enrollments modelled separately | ✅ | All 31 entities from the spec exist, plus helpers (migrations 0001–0006) |
| Entitlement has source, status, course, start, expiry, revocation | ✅ | Time-based evaluation in SQL |
| Price/model change never revokes purchased access | ✅ | Test |
| Cancellation paid-through date; refunds / chargebacks / expiry / admin revocation modelled | ✅ | Fields + admin revoke + expiry sweep; provider flows are phase 2 |
| No simulated payments; checkout placeholder | ✅ | `/checkout/[slug]` grants nothing; webhook returns 501 |
| Coupons, bundles, instructor/platform memberships | ◐ | Schema supports them (`plan_items`, `product_type`, sources `coupon`/`promo`/`bundle`/`membership`); no UI |
| Migrations committed, RLS on every sensitive table | ✅ | 6 migrations; every table has RLS enabled; DB tests |

## 6. Video security (R2 instead of Stream, as requested)

| Requirement | Status | Note |
|---|---|---|
| Private videos, signed playback | ◐ | Private bucket + short-lived presigned GET (default 15 min), re-issued and re-authorized. A signed URL is a bearer link for its lifetime; not DRM |
| Store video keys/state in Postgres; secrets server-only | ✅ | `lesson_videos`; `server-only` guard |
| Short-lived signed uploads; validate ownership, status, limits, duration | ✅ ◐ | Duration is client-reported (R2 cannot probe media); size/type/magic bytes/quota are verified server-side |
| Direct browser upload; no proxying through Next.js | ✅ ☁ | Presign signs content-type and length (unit-tested) |
| Verify processing via trusted checks | ◐ | `HeadObject` + magic-byte sniff; there is no transcoding on R2 |
| Playback token only after entitlement check; no public caching | ✅ | `can_access_lesson` in Postgres, `no-store` |
| Origin restriction as an extra control | ◐ | R2 CORS limits browser fetches; `<video src>` hotlinking cannot be blocked by CORS alone (add a Cloudflare WAF/referer rule if needed) |
| Recheck on revocation; log grants without tokens | ✅ | Heartbeat 403 stops playback; grants audited |
| Concurrent-session limit, sharing detection, dynamic watermark | ✅ | Settings-driven; watermark `ID-xxxxxxxxxx` resolvable via script |
| No direct download URLs for premium; private attachments with expiring links | ✅ | 60-second attachment links |
| No claim of anti-recording | ✅ | Stated in README / SECURITY |

## 7. Application security

| Requirement | Status | Note |
|---|---|---|
| Secure sessions, recovery | ✅ ☁ | Supabase Auth; generic responses; sessions revoked on password change |
| MFA for privileged accounts | ✅ ☁ | Enforced in UI **and** in SQL (`admin_mfa_ok`) |
| Server-side authorization everywhere + RLS | ✅ | Tests incl. direct API calls |
| Cookies, CSRF, CORS | ✅ | `SameSite=Lax` + Origin check; no CORS grants |
| Validation / output encoding / safe queries | ✅ | zod; PostgREST filter sanitising; query-column guard test |
| Rate limiting (auth, uploads, quiz, playback…) | ✅ | Postgres-backed; also Q&A, notes, downloads, progress |
| CSP and security headers | ✅ | Nonce + `strict-dynamic`; verified in a real browser with zero console errors on the production build |
| Secrets management | ✅ | Env only; lazy validation |
| Webhook signatures / replay / idempotency | ◐ | Constraint + contract ready; endpoint disabled until phase 2 |
| Audit of admin changes | ✅ | |
| Dependency scanning, lockfile | ◐ | CI `npm audit` (fails on critical); one PostCSS advisory inside Next remains (build-time) |
| Backups, restore testing | ◐ | Procedure documented; restore not executed here |
| Error monitoring, spend alerts | ⛔ | Documented as setup steps; not wired to a provider |

## 8–9. Frontend and backend

| Requirement | Status | Note |
|---|---|---|
| Arabic + English, RTL/LTR | ✅ | Screens verified in both directions |
| Accessibility | ✅ ◐ | axe-core (WCAG 2.0/2.1 A + AA + best practices): 0 violations on home (EN/AR), catalog, course, login, register (AR), dashboard, learning page, instructor editor, certificate. Manual screen-reader testing not done |
| Loading / empty / error states | ✅ | |
| Required areas (home, catalog, details, profiles, auth, admin, instructor, learner, quizzes, assignments, certificates, reviews, notifications, security, pricing placeholder) | ✅ | |
| Core Web Vitals | ◐ | Self-hosted fonts, no client data fetching on public pages; not measured with Lighthouse here |
| Modular services, typed schemas, pagination, transactions | ✅ ◐ | Multi-step admin writes use sequential calls rather than DB transactions |

## 11. Acceptance criteria

| Criterion | Status | Verified by |
|---|---|---|
| Super Admin can securely create/manage instructors | ✅ ☁ | Admin UI + MFA; logic covered by DB tests |
| Instructors cannot read/modify each other's private records | ✅ | RLS tests |
| Students cannot access unpublished or unauthorized lessons | ✅ | RLS tests |
| Changing IDs / calling APIs directly doesn't bypass authorization | ✅ | HTTP tests + RLS tests |
| Expired / revoked / canceled access follows policy | ✅ | RLS tests |
| Private videos can't be played with a key alone | ✅ | Private bucket; only server signs |
| No tokens/secrets in client source or logs | ✅ | HTML-leak test, `server-only`, audit never stores URLs |
| Duplicate webhooks handled | ✅ | Unique `(provider, event_id)` test |
| Arabic RTL and English LTR on mobile and desktop | ✅ ◐ | Desktop screenshots both ways; mobile layout built responsive but only spot-checked |
| Automated tests for authz, authn, media, course workflows | ✅ | 89 Vitest + 22 HTTP tests |
| Docs for migrations, env, deployment, backup, recovery, security | ✅ | `README`, `docs/*` |
| Builds, type-checks, lints, tests pass | ✅ | |
| **Live end-to-end on real Supabase + R2** | ☁ | Not possible in the build sandbox. Run the checklist in `docs/TESTING.md` |
