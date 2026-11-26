# Inventory batch navigation

Selecting a row or its batch-code button reveals the detail section, then moves
keyboard focus to its heading once loaded. Loading errors are revealed with
their Retry action. Re-selecting the same batch works as well. The initial
automatic list selection and silent refreshes do not move the page. Direct batch
links reveal their selected content.

Viewport captures after selection: `selected-360.png`, `selected-768.png` and
`selected-1280.png`. These use synthetic, read-only warehouse fixtures. Short
panels stop at the document's natural bottom rather than adding empty space
after the footer. The summary is fully visible at all three sizes. Navigation
uses an immediate scroll, with no animated scroll effect.
