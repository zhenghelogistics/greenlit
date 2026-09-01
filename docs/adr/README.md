# Architecture Decision Records

One file per decision that was not obvious at the time. Each records what was
decided, **why**, and what it costs — so the decision can be revisited
deliberately rather than reversed by accident.

Write one when a choice closes off alternatives, resolves an ambiguity in the
PRD, or would otherwise survive only in someone's memory.

Format: Context, Decision, Consequences, Status. Keep it short. Never edit a
decision after it is accepted — supersede it with a new record.

| # | Decision | Status |
|---|---|---|
| [0001](0001-storage-port-defer-database.md) | Storage port with an in-memory adapter; defer the database | Accepted |
| [0002](0002-cms-not-required-satisfies-gate.md) | CMS `NOT_REQUIRED` satisfies the empty collection gate | Accepted, needs operations confirmation |
| [0003](0003-replace-design-system.md) | Replace the design system rather than patch it | Accepted |
| [0004](0004-location-from-journey-order.md) | Derive location from journey order, not status rank | Accepted |
| [0005](0005-portnet-warns-never-blocks.md) | Portnet processing warns; it never blocks the laden gate | Accepted |
| [0006](0006-no-build-step-packages.md) | Packages run TypeScript with no build step | Accepted |
