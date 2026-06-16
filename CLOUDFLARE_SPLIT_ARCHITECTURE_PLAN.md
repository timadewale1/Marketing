# Pamba Split Architecture Plan (No Cloudflare Plan Upgrade)

## Goal
- Keep the app stable on Vercel immediately.
- Reduce Vercel Fluid CPU / Edge pressure.
- Avoid Cloudflare Worker size limit by splitting backend responsibilities.
- Migrate in phases with rollback at every stage.

## Final Target
- Frontend: Next.js UI remains on Vercel (or static CDN later).
- Backend APIs: moved into smaller deploy units (Firebase Functions first).
- Cloudflare: DNS/CDN/proxy layer first, optional micro-workers later by domain.

---

## Phase 0 (Already Done)
- Stabilized auth/session verification on native `firebase-admin` path.
- Removed app runtime dependency on custom JWKS verification flow.
- Confirmed production build passes locally.

---

## Phase 1: Safe Boundary Layer (No Behavior Change)
### Objective
Create one API call boundary so backend location can change without touching pages/components repeatedly.

### Tasks
1. Add centralized server API client wrapper (`src/lib/server-api.ts`). ✅
2. Add envs:
   - `API_BASE_URL` (backend root, default current app origin)
   - `NEXT_PUBLIC_API_BASE_URL` (client-side base for future split)
   - `FUNCTIONS_API_BASE_URL` (optional backend runtime target for internal heavy routes)
   - `API_INTERNAL_SECRET` (for internal service-to-service routes)
3. Route all internal API calls through the wrapper.
4. Keep existing Next API routes as primary behavior for now.

### Success Criteria
- No user-visible behavior change.
- All routes still function as before.
- Build and smoke tests pass.

### Rollback
- Revert wrapper usage and keep direct local route calls.

---

## Phase 2: Move High-Load Payment and Recovery APIs to Firebase Functions
### Objective
Move the heaviest operational logic out of Next runtime first.

### Candidate endpoints (first batch)
1. Monnify webhook handlers
2. Recovery sweep
3. Pending payment retries
4. Activation funding reconciliation
5. Referral catch-up for successful activation events

### Tasks
1. Extract shared business logic into reusable service modules (no duplicate logic).
2. Implement Firebase HTTP functions that call the shared logic.
3. Add signed internal call verification (`API_INTERNAL_SECRET`).
4. Switch scheduler triggers to Firebase (not Vercel cron).
5. Keep Next route wrappers as compatibility proxies for existing frontend paths.

### Success Criteria
- Same outputs as existing flow for activation/funding/referral.
- No false credits / no false activations.
- Recovery still resolves paid transactions automatically.

### Rollback
- Flip proxy wrappers back to local Next handlers.

---

## Phase 3: Move Admin Operational APIs
### Objective
Reduce Next server workload from admin-heavy operations.

### Candidate endpoints
1. Admin recovery actions
2. Admin reconciliation endpoints
3. Admin payout/withdraw approval processing
4. Auto verify submission jobs
5. Submission cleanup jobs

### Tasks
1. Move only mutation-heavy routes first.
2. Keep read pages paginated and capped (already optimized work continues).
3. Add idempotency keys for critical admin actions.

### Success Criteria
- Admin flows remain unchanged from UI perspective.
- Error rates and latency stable.

### Rollback
- Route wrappers revert to existing Next handlers.

---

## Phase 4: Optional Cloudflare Micro-Workers
### Objective
Use Cloudflare on free tier only for small focused workers (each under script limit).

### Possible worker split
1. `payments-worker`
2. `admin-ops-worker`
3. `notifications-worker`

### Notes
- Do not deploy monolithic OpenNext worker on free tier.
- Each worker must remain below Cloudflare size limit.

---

## Safety Controls (Must-Have)
1. Idempotency keys on all money-moving/referral actions.
2. Firestore read-before-write transaction ordering.
3. Recovery actions verify paid status before crediting.
4. One ledger document per event ID to block duplicates.
5. Structured logs for:
   - activation
   - wallet funding
   - referral credit
   - withdrawal approval

---

## Monitoring Dashboard Metrics (Daily)
1. Activation success rate within 5 minutes
2. Wallet funding success rate within 5 minutes
3. Recovery auto-resolution rate
4. Duplicate-credit incident count
5. Referral pending-to-completed conversion count
6. Function invocation and Firestore read cost trend

---

## Recommended Execution Order (Low Risk)
1. Phase 1 (boundary wrapper)
2. Phase 2 payments + recovery
3. 48-hour monitoring
4. Phase 3 admin operations
5. Optional Phase 4 cloudflare micro-workers

---

## What We Should Not Do
- Do not cut over all routes at once.
- Do not reintroduce custom JWT/JWKS verification in runtime path.
- Do not remove current fallback handlers before monitoring confirms parity.
