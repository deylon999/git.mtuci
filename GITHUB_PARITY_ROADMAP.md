# GitHub Parity Roadmap (Production Grade)

## Goal
Bring the platform to a production-grade level across PR/Code Review, Issues, Access Control, Repo Settings, Auth, Code Browsing, CI/CD, Search, Releases/Packages, and Reliability.

## Current Status Snapshot (2026-05-27)
- `DONE`: per-repo access model (roles/collaborators/teams/invites/audit), PAT+SSH auth layer, branch-protection baseline, PR review baseline, issues baseline, merge policy enforcement baseline, enforcement tests baseline.
- `REMAINING`: required reviewers (strict), CI checks/statuses with logs/retry in PR flow, full diff/code browsing parity (history/blame/compare), issue cross-links/events parity, releases/packages, full reliability hardening (CI/e2e/rate-limit/observability/restore/security scans).
- Target quality bar for each item: API + UI + tests (negative-path and integration) + docs.

## Delivery Model
- Phase 0: Baseline and architecture decisions
- Phase 1: Safety-critical platform capabilities
- Phase 2: Collaboration parity (PR/Issues/Search)
- Phase 3: Delivery parity (CI/CD/Releases/Packages)
- Phase 4: Hardening and scale readiness

---

## Phase 0: Baseline (1-2 weeks)

### 0.1 Gap audit and ownership
- [ ] Feature-by-feature gap matrix against requested capabilities
- [ ] API/UI/DB owner per domain
- [ ] SLO/SLA targets documented

### 0.2 Test and quality foundation
- [ ] Backend test harness (pytest + test DB fixtures)
- [ ] Frontend e2e baseline (Playwright/Cypress)
- [ ] CI pipeline running lint + tests on PR

Definition of done:
- Green CI for baseline suites
- Reproducible local and CI test runs

---

## Phase 1: Safety-Critical Platform (2-4 weeks)

### 1.1 Access model (GitHub-like)
- [ ] Per-repo roles: read/write/admin
- [ ] Collaborators CRUD
- [ ] Team access bindings CRUD
- [ ] Invitations flow (issue, accept, revoke, expire)
- [ ] Full audit trail for permission changes

### 1.2 Git auth layer
- [ ] PAT creation with scopes and expirations
- [ ] Token list/revoke/rotate UI + API
- [ ] SSH keys in profile (add/list/delete)
- [ ] Private/public clone and push scenarios verified

### 1.3 Repository settings (real, not placeholders)
- [ ] Branch protection policies
- [ ] Required reviewers
- [ ] Required status checks
- [ ] Webhook UI: create/test/redelivery/history
- [ ] Deploy keys lifecycle
- [ ] Secrets management (encrypted at rest + scoped access)

Definition of done:
- Policy enforcement proven via integration tests
- Audit events visible and queryable
- Negative-path tests (unauthorized attempts) passing

---

## Phase 2: Collaboration Parity (3-6 weeks)

### 2.1 PR and Code Review to production level
- [ ] Inline comments on diff
- [ ] Review threads with resolve/reopen
- [ ] Review states: approve/request changes/comment
- [ ] Merge checks gate in UI
- [ ] Merge methods: merge commit/squash/rebase
- [ ] Conflict-state surfaced in UI and API

### 2.2 Issues full lifecycle
- [ ] CRUD for issues
- [ ] Labels
- [ ] Assignees
- [ ] Milestones
- [ ] Filters + search
- [ ] Reactions
- [ ] Cross-links with PR/commit

### 2.3 Diff and code browsing parity
- [ ] File history
- [ ] Blame view
- [ ] Compare branches/tags
- [ ] Better handling for binary and large files
- [ ] Markdown preview parity
- [ ] Commit details by file

Definition of done:
- End-to-end user journeys passing (create PR -> review -> merge)
- Issue linking and cross-reference events functional

---

## Phase 3: Delivery Parity (2-4 weeks)

### 3.1 CI/CD integration in repo UI
- [ ] Checks/statuses shown in PR UI
- [ ] Required checks block merge
- [ ] Build logs view in UI
- [ ] Retry/re-run from UI
- [ ] Integration path: Gitea Actions or Jenkins or GitHub Actions mirror

### 3.2 Releases/Tags/Packages
- [ ] Releases page
- [ ] Attach release assets
- [ ] Changelog generation
- [ ] Package registry integrations (npm/pypi/docker)

Definition of done:
- Protected branch merge blocked by failing checks
- Successful release published with assets and changelog

---

## Phase 4: Scale Readiness (2-4 weeks, overlapping)

### 4.1 Reliability and quality (mandatory)
- [ ] API integration tests (critical paths)
- [ ] e2e tests (PR + Issues + Auth + Repo Settings)
- [ ] Rate limiting on sensitive and expensive endpoints
- [ ] Observability: metrics + tracing + dashboards
- [ ] Backup restore drills on schedule
- [ ] Security scans (deps + container + SAST)

Definition of done:
- Restore drill documented and repeatable
- Alerting and dashboards in place
- Security scan baseline and triage process established

---

## Architectural Notes
- Keep Git operations authoritative in Gitea; platform stores policy and metadata.
- Prefer event-driven sync (webhooks + reconciliation jobs) for PR/Issue/check state.
- Use idempotent sync workers and dead-letter handling for webhook failures.
- Keep permission checks centralized in backend service layer.

---

## Suggested Implementation Order (highest ROI first)
1. Access model + auth layer + repo settings enforcement
2. PR review workflows + merge gating
3. Issues lifecycle + search
4. CI/CD checks integration
5. Releases/packages
6. Reliability hardening and scale drills

---

## Immediate Next Sprint (proposed)
- [ ] Add CI workflow (backend tests + frontend build)
- [ ] Add backend test skeleton and first auth/permissions integration tests
- [ ] Add PAT + SSH key domain models and migration draft
- [ ] Add branch protection/read-write-admin policy enforcement points
