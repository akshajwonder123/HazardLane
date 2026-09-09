# StormRoute operating instructions

Read `STORMROUTE_STATE.md` before substantial resumed work. The current goal and acceptance criteria are preserved in `docs/GOAL_OBJECTIVE.md`; the user's model/delegation/continuity policy is in `docs/OPERATING_POLICY.md` and applies from 2026-09-09 forward.

Continue from the next unfinished milestone; do not restart or repeat verified work without a concrete defect. Finish and verify each major milestone before starting the next. Maintain a runnable repository, checkpoint integrated milestones in Git, and record tests, limitations and exact next task in the state file.

Root owns architecture, integration, final verification and STORMROUTE_STATE.md. Use independent subagents when beneficial, with stable interfaces and clear ownership before concurrent coding. Prefer read-only research while interfaces are unsettled. Use the cheapest reliably capable worker: currently gpt-5.6-luna/low for bounded research/mechanical checks, gpt-5.6-terra/medium for isolated implementation, and gpt-6-astra/high for consequential risk/math/security/audits. Adapt to available models and escalate uncertainty promptly. Give minimal task-specific context. Workers must return concise findings, files changed, decisions, checks, unresolved issues and integration requirements; root reviews and verifies before acceptance.

Never commit credentials. No required paid APIs. Preserve unknown provider data as unknown and never label a road guaranteed safe. Keep provider-specific payloads out of the risk engine.
