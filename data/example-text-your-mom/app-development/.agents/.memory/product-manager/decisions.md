

## 2026-04-17T06:05:09.730Z
Feature-flag OB-1 for rollback safety instead of waiting for OB-7 A/B harness. Reason: kill switch costs ~1h; A/B harness is not ready yet; we need a revert path before we have measurement.