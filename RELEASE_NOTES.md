# Release Notes

Version v1.40.4 — March 3, 2026

## Log queue status normalization
- A new normalizeQueuedLogStatus function is added and wired into the log queue (useLogQueue). The queue now shows consistent status labels, making it easier to understand what’s happening at a glance.
- This helps when you review or filter by status, so you’re not chasing mismatched labels.

## Web assets updated
- dist-web assets were rebuilt to include the latest changes. Expect the UI to reflect the new status handling automatically when you load the app.

## Tests
- Added unit tests for status normalization to prevent regressions and keep the behavior predictable.
