---
title: PM Updates
created: '2026-04-17T00:00:00Z'
modified: '2026-04-17T00:00:00Z'
tags:
  - product
  - pm
  - updates
order: 3
---
# PM Updates

Product Manager decisions and direction for Text Your Mom app development.

---

## April 17, 2026 — Sprint Apr 14 post-mortem and decisions for Apr 21 sprint

I reviewed the DevOps scorecard ([[backlog/sprint-2026-04-14]]) and the CTO assessment ([[cto-updates]]). I own the call on what we scope and I own the fact that the sprint shipped nothing. The plan was clear, the PRDs were ready, and velocity did not happen. We do not need another plan. We need named owners, a shorter list, and a working pipeline by Tuesday.

### What I am deciding now

#### 1. OB-7 A/B assignment approach — **ratified**

**Decision:** Device ID bucketing with server-side persistence on first API call. CTO's recommendation from the Apr 13 assessment. Approved.

**Why:** Simple, reliable, no new infrastructure. Client-side assignment leaks on reinstall — acceptable for now because reinstall-rate bias is smaller than the risk of delaying OB-7 another sprint. If we later need pre-install assignment (for marketing-channel experiments), we revisit.

**Acceptance criteria for OB-7 updated:**
- Bucket assigned client-side from a hash of device ID
- First authenticated API call persists the bucket server-side
- Server-side bucket is authoritative if client and server disagree (reinstall case)
- 20% holdback on current onboarding flow, 80% on v2

#### 2. OB-3 resized M → L

**Decision:** Accept CTO's sizing correction. OB-3 (Delayed permission requests) is L, not M.

**Why:** The permission state machine is a separate concern from onboarding state. iOS one-prompt-per-session rate limit means a naive re-prompt silently fails, and we need graceful degradation paths for notifications and contacts independently. Treating it as M is how we ship broken permission flows.

**Action:** Backlog updated. OB-3 is deferred out of the next sprint — it is not scoped until OB-1 lands and the permission state machine design is written.

#### 3. Next sprint (Apr 21 – Apr 25) scope — shorter on purpose

| # | Story | Size | Named owner | Notes |
| --- | --- | --- | --- | --- |
| 1 | **OB-2: Emotional copy rewrite** | S | **DevOps + 1 engineer** (pair, Monday AM) | This is the pipeline dry run. Merges Monday. Ships staged by Tuesday EOD. Everything else gates on this working. |
| 2 | **OB-6: Onboarding analytics events** | S | Engineer A (TBD by CTO Monday 9am) | Schema locked before any OB-1 work begins. |
| 3 | **OB-5: Nickname display fix** | S | Engineer B (TBD by CTO Monday 9am) | Ships in the OB-2 release train if ready. |
| 4 | **PC-3: Paywall dismiss button fix** | S | Engineer B (same, after OB-5) | Trust + App Store risk. Quick win. |
| 5 | **OB-1: Pick Your People flow** | M | Engineer A (after OB-6) | Starts Wednesday. Target: merged but feature-flagged by end of sprint. Rollout flipped next sprint once OB-7 A/B is live. |
| 6 | **RT-4 findings memo** | — | CTO (already owned) | Written answer: is this a local-scheduling fix or a server-side-push migration? Due Friday Apr 24 EOD. Ratifies whether P2 is one sprint or a quarter. |

**Deliberately out of scope next sprint:** OB-3 (resized L, unscoped), OB-4 (depends on OB-1 shipped), OB-7 (builds after OB-1 flag is live), everything in P2/P3/P4.

**Sprint gating rule (enforced):** If OB-2 has not shipped through the pipeline by Tuesday Apr 22 EOD, no other feature story merges. We fix the pipeline first. This is non-negotiable.

#### 4. Feature flag for OB-1 — **approved**

DevOps recommended it. I agree. OB-1 ships behind a flag. Kill switch before measurement. Cost: one hour. Benefit: we do not need OB-7 to be live before we can revert.

#### 5. What I am saying no to

- **No P2 work next sprint.** Blocked on RT-4 findings. The CTO memo is the prerequisite; scoping P2 before it lands is rework.
- **No streak work next sprint.** P3 is two initiatives away. Anyone pushing streak stories into the sprint is distracting from activation.
- **No new paywall experiments beyond PC-3.** We are not shipping paid-conversion features before activation is fixed. A better paywall in front of users who churn in onboarding is a rounding error.
- **No new PRDs this week.** Four groomed PRDs sit unshipped. We write the fifth when the first one lands in prod.

---

### Risk I am watching

**Engineering headcount is the silent bottleneck.** DevOps' retro called this out: "engineering team" is not an owner. I have scoped the sprint above to two named engineers (A, B) plus DevOps. If CTO cannot put two names on those slots by Monday 9am, the sprint does not start and we escalate to CEO the same day. I would rather raise the flag early than ship another scorecard that says zero.

### What the team can expect from me

- PRD questions get answered within 4 working hours during the sprint
- OB-1 UX copy and edge-case decisions are mine; do not block on design for those
- I will run a Wednesday mid-sprint check on OB-2 ship status and OB-1 progress; if Tier 1 has not moved by Wednesday I escalate the same day

---
