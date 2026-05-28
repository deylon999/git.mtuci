# Operations Runbook

## Observability
- Metrics JSON: `GET /observability/metrics`
- Prometheus scrape: `GET /observability/metrics/prometheus`
- Key SLO signals:
  - `app_http_p95_ms < 800`
  - `app_http_errors_hour / app_http_requests_hour < 2%`
  - no sustained `429` spikes from rate-limiter

## Alerts/Dashboards (baseline)
- Alert: `HighErrorRate` when error rate > 5% for 5m.
- Alert: `HighLatencyP95` when p95 > 1200ms for 10m.
- Alert: `RateLimitStorm` when 429 count > 200 in 5m.
- Dashboard widgets:
  - RPS
  - Error rate
  - p95 latency
  - top endpoints by count/errors

## Backup Restore Drills
- DB backup: daily snapshot + WAL/archive strategy.
- Drill cadence: weekly in staging, monthly in production.
- Drill steps:
  1. restore latest full backup into clean DB instance.
  2. replay incremental logs.
  3. run smoke checks (`/`, `/system/info`, auth, repositories list).
  4. verify RPO/RTO target and log results.
- Exit criteria:
  - restore completed under target RTO.
  - no schema/data consistency errors in smoke checks.

## Security Triage Policy
- Sources:
  - `pip-audit`, `npm audit`, `bandit`, `trivy`.
- Severity SLAs:
  - Critical: patch/mitigate within 24h.
  - High: within 3 business days.
  - Medium: next sprint.
  - Low: backlog with explicit owner.
- Triage workflow:
  1. validate finding (true/false positive).
  2. classify exploitability and exposure.
  3. create tracked issue with deadline.
  4. patch/mitigate and re-scan.
