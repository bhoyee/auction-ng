# Final Overview screenshots

Open `comparison.html` to compare the reference and implementation side by side at 1280, 1440 and 1920px. Additional 360 and 768px captures check narrow layouts. Desktop capture height allows the full sidebar to be reviewed; the sidebar remains independently scrollable on shorter actual screens.

Reviewed differences and decisions:

- LotVanta replaces the reference's old Auction NG wordmark.
- Full KPI monetary values follow ADMIN_DESIGN.md instead of copying abbreviated reference values. Long values fit without clipping.
- Demo notices and source chips remain visible. They are deliberate additions required by the approved fixture policy.
- The yellow, bold 56px Check in a buyer action remains available to authorised staff.
- Existing Bid review/archived records are retained; unbuilt destinations are visibly Later/disabled. The dedicated live-monitor action is disabled until that page exists. Stock review links to the existing inventory workflow rather than pretending a write-off workflow exists.
- Chart table and CSV alternatives add controls absent from the static mockup. All exports use the displayed data; fixture exports are named as demo exports.
- Each lot is described as running on its own countdown. No auction sessions or shared start times were introduced.

The complete source/readiness matrix and preview flags are in `docs/specs/admin-overview-redesign.md`. These screenshots contain synthetic data; they are not evidence of production revenue, sales or expenses. Production aggregates, dedicated report modules, phone lookup and one-year aggregate performance verification remain open; the T15 tasks are not marked complete.

Verification: 13 focused unit tests, 29 Overview/navigation/session/check-in browser checks and 3 bid-review action regression cases pass. The Overview palette now searches permitted existing records; dedicated report modules and phone lookup remain separate work. Changed-file lint/format, affected type checks and API/admin builds pass.
