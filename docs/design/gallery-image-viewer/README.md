# Item gallery image viewer

The square detail image now fills its frame with a cover crop; the View larger overlay is removed. Click/tap the image or focus it and press Enter to open the complete photo in a wide modal. The top-right close icon and Escape dismiss it and restore focus to the image.

Previews: [phone card](gallery-360.png), [tablet card](gallery-768.png), [desktop card](gallery-1280.png), [phone popup](enlarged-360.png), [tablet popup](enlarged-768.png), [desktop popup](enlarged-1280.png).

Targeted checks passed at 360, 768 and 1280 px: image bounds fill the frame, cover sizing, no View larger text, image activation, full-photo contain sizing in the popup, close icon on the right, Enter/Escape, focus return, no horizontal overflow and no browser errors. UI/web type checks, changed-file lint/format checks and buyer-web production build passed. No unrelated site or financial suites were run.

Reproduce with the local Docker demo running: `node scripts/check-gallery-ui.mjs`. Photo assets remain unchanged; the card crop may trim edges, while the popup preserves the whole photo for inspection. Overall T13 acceptance remains open.
