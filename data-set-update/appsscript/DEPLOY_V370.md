# Rejected Shipments Apps Script v370

This Apps Script update is required for the Rejected Shipments Dashboard v370.
It does not require any Host update.

## Deploy
1. Open the existing DataSets Apps Script project used by Agents / Rejected Shipments.
2. Replace its `Code.gs` with this folder's `Code.gs`.
3. In Apps Script choose **Deploy > Manage deployments**.
4. Edit the existing Web App deployment, choose **New version**, and deploy.
5. Keep the same `/exec` Web App URL. If Google creates a different URL, save the new URL in **Agents > Settings**.
6. Reopen Rejected Shipments Dashboard after Remote v370 is published.

## What changed
- `rejectedState` reads only the final ID cell instead of scanning the full ID column.
- `appendRejected` no longer reads the complete ID column for de-duplication.
- New `readRejectedDashboardDelta` endpoint reads only rows after the dashboard cursor.
- Dashboard automatic refresh uses small row deltas (80 rows per chunk, max 3 chunks per cycle).
- Synchronizer obtains its watermark from the lightweight Apps Script state endpoint rather than a full-column Sheet scan.
