# Observability Runbook

## What is included

- Prometheus-compatible metrics endpoint: `/observability/metrics/prometheus`
- JSON metrics endpoint for quick diagnostics: `/observability/metrics`
- Dashboard definition: `docs/observability/dashboard.json`
- Alert rules: `docs/observability/alerts.yml`

## Dashboard import

1. Open Grafana.
2. Go to **Dashboards -> Import**.
3. Upload `docs/observability/dashboard.json`.
4. Select Prometheus datasource.
5. Save as `MTUCI Reliability Dashboard`.

## Alert wiring

1. Load rules from `docs/observability/alerts.yml` into Prometheus (or Alertmanager pipeline).
2. Route `severity=critical` to pager/on-call.
3. Route `severity=warning` to team chat.

## SLO starter thresholds

- Error rate alert: > 5% for 5 minutes.
- P95 latency alert: > 1200ms for 10 minutes.
- Low traffic/outage alert: request rate < 0.01 rps for 10 minutes.

## Incident-first checks

1. Confirm current request/error rate in dashboard.
2. Check `x-request-id` and trace id for failing calls.
3. Verify rate-limit behavior (429 spikes) against expected load.
4. If needed, initiate backup/restore drill protocol.
