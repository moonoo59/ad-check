---
name: ad-check architecture patterns
description: Key architectural patterns, conventions, and known anti-patterns in the ad-check codebase
type: project
---

## Authentication & Authorization
- Session-based auth with express-session MemoryStore (no Redis)
- Role-based: ad_team, tech_team, admin
- Middleware guard pattern: `router.use(requireAuth, requireRole('admin'))` at router top
- KNOWN ISSUE: ad_team data isolation NOT enforced in requests.service.ts (getRequests/getRequestDetail accept but ignore _currentUserRole/_currentUserId)

**Why:** Single PC internal network, but horizontal privilege escalation still possible between ad_team users.

## Timestamp Strategy
- KNOWN INCONSISTENCY: DB DEFAULT uses `datetime('now', 'localtime')` (KST), application code uses `new Date().toISOString()` (UTC), audit_logs use `datetime('now', 'localtime')` (KST)
- stats.router.ts applies `+9 hours` conversion assuming UTC, which double-converts localtime rows

**How to apply:** Any new migration or code touching timestamps should use UTC consistently.

## Async Patterns
- bcrypt.hash (async) used in database.ts seed, but bcrypt.hashSync (sync) used in users.service.ts and auth.service.ts
- fs.appendFileSync used in logger.ts (blocks event loop)
- seedDefaultUsers() called without await at module load time

## Module Structure Convention
- `modules/{feature}/{feature}.service.ts` + `{feature}.router.ts`
- Standard response via `common/response.ts` (sendSuccess/sendError)
- All comments in Korean per project convention

## File Matching
- Score 0-100, but RequestDetailPage.tsx hardcodes `match_score === 100` for copy eligibility
- file-matcher.ts claims "pure functions only" but calls fs.statSync

## Infrastructure
- create-app.sh runs `pnpm dev` (dev mode) in production .app bundle
- Electron packaging properly uses `pnpm build` + static serving
- Project path hardcoded in .app launcher via sed replacement
