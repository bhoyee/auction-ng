# Overview pickup desk shortcut

Open pickup desk now sits in the Overview heading actions, above the metrics. The old quick-action card is removed; remaining shortcuts fill the available row. Access still requires pickup.manage.

Targeted browser checks passed at 360, 768 and 1280px: visible heading action, successful pickup navigation, minimum 44px target, no page overflow and no duplicate shortcut. A separate permission-negative check confirms the action is hidden without pickup access. Screenshots use synthetic API fixtures, not real customer records.

- [Mobile](overview-360.png)
- [Tablet](overview-768.png)
- [Desktop](overview-1280.png)

Affected ESLint, admin/UI type checks and admin production build passed. Local Docker admin was updated. No backend or money rules changed.
