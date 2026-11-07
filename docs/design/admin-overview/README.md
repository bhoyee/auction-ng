# Overview visual update

The screenshots use synthetic staff fixtures, not real business results, at 360, 768, 1280 and 1440px. The current menu structure and yellow Check in a buyer heading action are retained.

The new Overview uses six compact summary cards, a two-thirds paid-sales chart beside Live right now, followed by Inventory pipeline and Work queues. Card values fit to one line, numbers are tabular and dates/times use WAT. Recharts is pinned to 3.10.1 with React/React DOM 19.2.0, chart load animation disabled, exact tooltip values, a table alternative and CSV export in integer kobo.

The existing API's fourteen-day paid-sales and refund measures are labelled explicitly. These are not net revenue or GMV. No comparative deltas, category sales, expenses or activity history are fabricated. Those analytics remain open in T15c/T15d.

Targeted checks cover all four responsive widths, long Naira totals, chart/table switching, CSV download, no-data states and five-second silent refresh retaining the selected table view. The initial Windows development-server/browser run failed due to paging-file memory pressure; validation then runs against the Docker production build without a second development server.

Final validation passed: six targeted Playwright cases, changed-file ESLint/Prettier, UI type checking and the Docker admin production build (including admin TypeScript). Screenshots were recaptured after correcting long-total wrapping and native progress colours. The local admin responds successfully on port 3301. No unrelated test suites or Docker image builds were run.
