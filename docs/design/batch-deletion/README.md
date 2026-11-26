# Batch deletion review

Synthetic staff and batch fixtures; no real buyer or supplier data. Reviewed at 360, 768 and 1280 pixels.

- `delete-*.png`: red destructive action, required reason, exact batch-code confirmation, 30-day restore explanation and visible close control.
- `deleted-*.png`: Deleted tab and red status badge, Restore action and expiry notice. Intake/edit/receive controls are hidden for deleted batches.

Browser checks cover delete/restore and absence of deletion on received batches. Existing tokens, form controls, dialog focus handling and responsive table scrolling are retained. Silent detail/list refresh runs after a successful change.
