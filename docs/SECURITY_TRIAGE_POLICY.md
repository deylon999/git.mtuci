# Security Triage Policy

## Sources
- `pip-audit` (Python dependencies)
- `npm audit` (Node dependencies)
- `bandit` (SAST)
- `trivy` (filesystem/container critical/high)

## SLA
- Critical: fix or mitigate within 24 hours
- High: within 3 business days
- Medium: next sprint
- Low: planned backlog

## Process
1. Validate finding and confirm impact scope.
2. Assign owner and target fix date.
3. Track remediation in issue with evidence.
4. Re-run scan and attach clean result.
