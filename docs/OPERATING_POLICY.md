Add the following operating instructions to the CURRENT StormRoute goal. Do not restart the goal, redo completed work, or discard verified progress. Apply these instructions from this point forward and continue toward the existing acceptance criteria.

SUBAGENT / MODEL-EFFICIENCY POLICY

Use subagents whenever parallelizing genuinely independent work would save time or materially improve quality. You are the root orchestrator and remain responsible for architecture, integration, repository state, final verification, and STORMROUTE_STATE.md.

Use the cheapest/fastest available model and reasoning effort that is reliably capable of each delegated task. Do not automatically give subagents the same model or reasoning effort as the root agent.

Route work approximately as follows, adapting to the actual models available in this environment:

1. CHEAP / FAST MODEL, LOW REASONING
Use for bounded, easy-to-verify work such as:
- repository/file scanning
- locating implementations
- documentation lookup
- API documentation research
- dependency inspection
- repetitive validation
- simple formatting
- running mechanical checks
- identifying relevant files
- basic test execution
- other low-risk research tasks

2. MID-TIER CODING MODEL, MEDIUM REASONING
Use for normal isolated implementation work such as:
- provider adapters
- Open-Meteo integration
- NWS integration
- Valhalla/routing adapters
- MapLibre components
- ordinary frontend/backend implementation
- route sampling implementation
- caching
- error handling
- unit tests
- routine debugging

3. STRONG REASONING MODEL, HIGH REASONING
Reserve for work where deeper reasoning materially matters, such as:
- final risk-model design/calibration
- hazard interaction mathematics
- route-level risk aggregation
- alternate-route utility/recommendation logic
- difficult cross-system integration failures
- consequential architecture decisions
- security-sensitive review
- ambiguous difficult bugs
- final architecture/risk-engine audit

Do not use an expensive/high-reasoning model when a cheaper worker can reliably perform the task.

If the exact model names described above are unavailable, select the closest available model according to capability and cost. Do not block progress merely because a preferred model is unavailable.

Escalate a delegated task to a stronger model if the cheaper worker fails, produces uncertain results, discovers unexpected architectural complexity, or determines that deeper reasoning is genuinely required.

Do not repeatedly retry an incapable cheap model simply to save usage.

PARALLELISM

Parallelize independent workstreams when useful, especially:
- routing/geospatial
- weather/NWS
- road metadata/events
- frontend/map UX
- tests/audit

Do NOT parallelize work that depends on unsettled shared interfaces.

Before allowing coding subagents to work concurrently, establish stable interfaces and clear file ownership where necessary to prevent conflicting edits.

Prefer parallel read-only research/audit work when architecture is still unsettled.

Do not spawn agents merely for the sake of using subagents. If delegation overhead exceeds the expected benefit, perform the task directly.

CONTEXT EFFICIENCY

Give each subagent only the repository context and instructions necessary for its bounded task when the environment permits this.

Do not make every subagent independently rediscover the entire StormRoute repository.

Use STORMROUTE_STATE.md and concise task-specific context to communicate established architecture and decisions.

Each subagent should return a concise handoff containing:
- task performed
- important findings
- files inspected
- files changed
- implementation decisions
- tests/checks performed and results
- unresolved issues
- integration requirements

ROOT AGENT RESPONSIBILITIES

Subagent completion does not mean the feature is automatically accepted.

You must review and integrate delegated work, resolve inconsistencies, and run appropriate cross-system verification before considering a milestone complete.

You remain the authoritative owner of STORMROUTE_STATE.md. Update it after meaningful integrated milestones rather than allowing parallel workers to create conflicting project-state records.

CONTINUITY

Continue working incrementally and keep the repository runnable/valid after each major milestone.

Complete, test, and verify each milestone before treating it as finished.

After meaningful milestones, update STORMROUTE_STATE.md with:
- completed work
- verification performed
- known issues
- current project state
- exact next task

If execution is interrupted, another session must be able to read the repository and STORMROUTE_STATE.md and immediately continue from the next unfinished task without repeating verified work.

Do not restart or reimplement already verified portions of StormRoute unless inspection reveals a concrete defect or incompatibility.

Now incorporate these instructions into your execution strategy and CONTINUE the existing StormRoute goal from its current state. Do not restart from the beginning.