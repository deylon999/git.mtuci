# Backup Restore Protocol

## Goal

Validate that a fresh backup can be restored and data integrity is preserved within target RTO/RPO.

## Frequency

- Minimum: weekly drill in staging.
- Recommended: daily backup job + weekly restore verification.

## Procedure

1. Create a backup snapshot of the current database.
2. Restore the snapshot into an isolated database file/instance.
3. Run integrity checks (schema + sentinel data checks).
4. Measure elapsed restore time and compare against RTO target.
5. Record results in `docs/BACKUP_RESTORE_DRILL_REPORT.md`.

## Automation command

```powershell
pwsh -File scripts/backup_restore_drill.ps1 -WorkDir . -ReportPath docs/BACKUP_RESTORE_DRILL_REPORT.md
```

## Pass criteria

- Restored dataset contains expected sentinel rows.
- Restore completed below target RTO.
- Backup snapshot age is within target RPO.

## Recovery escalation

1. If restore fails, mark drill as `FAIL`.
2. Open incident ticket with drill logs and exact failing step.
3. Freeze destructive maintenance until backup path is healthy.
4. Re-run drill after fix and attach successful report.
