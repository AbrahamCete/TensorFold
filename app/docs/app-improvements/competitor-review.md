# App workflow research and implementation decisions

Reviewed on **2026-10-26** against TensorFold commit `c9d9f005c48ed9f88f5085d2e8df50a3a1ed5ea5`.
The sources below describe the products at retrieval time. They are product documentation, not independent performance or reliability measurements.

## Official sources

| Product | Source | Relevant documented behavior |
| --- | --- | --- |
| LM Studio | [Getting started](https://lmstudio.ai/docs/app/basics) | The onboarding path distinguishes finding/downloading a model, loading it into memory, and starting a chat. |
| LM Studio | [Loading local models](https://lmstudio.ai/docs/cli/local-models/load) | Load configuration and estimated memory requirements are explicit. Estimates depend on configuration and are not measured usage. |
| LM Studio | [User or Developer modes](https://lmstudio.ai/docs/app/user-interface/modes) | The interface can expose different levels of detail for different workflows. |
| T3 Code | [User keybindings](https://github.com/pingdotgg/t3code/blob/main/docs/user/keybindings.md) | Composer controls keep model, host, access, workspace and Git branch choices near the request. Workspace choices include the current checkout and worktrees. |
| T3 Code | [Appearance preferences](https://github.com/pingdotgg/t3code/blob/main/docs/user/appearance.md) | Composer context visibility and motion preferences make important context accessible without permanently exposing every control. |
| super.engineering | [Notifications and approvals](https://super.engineering/docs/notifications-and-approvals/) | The inbox separates ongoing work from work needing a response. Rows retain source context, and structured lifecycle signals drive approval/question/error state. |
| super.engineering | [Review changes](https://super.engineering/docs/review-changes/) | The review workflow keeps branch/target context, changed files and follow-up review work together. |
| super.engineering | [Git actions and pull requests](https://super.engineering/docs/pull-requests-and-review/) | Available Git actions depend on the current repository state. A workflow shortcut is not evidence that an implementation passed its checks. |

## What TensorFold already implements

The app already has model discovery, downloads, load configuration and preflight checks, local runtime supervision, chat/task layouts, worktrees, change review, a command centre, and a connected-source assistant. Adding parallel replacements would increase the navigation burden.

The implementation opportunities are the connections between those capabilities:

| Observation in TensorFold | User impact | Implemented response |
| --- | --- | --- |
| `Assistant.tsx` initially fetched its private snapshot on mount and after user actions. Existing subscriptions did not refresh that snapshot when new inbox data arrived. | A visible inbox could remain old until the user refreshed or left and returned. | Extract a read-only snapshot controller/hook, reconcile while visible and on return, retain usable data on failure, and show refresh freshness and retry state. |
| The compact work menu lived inside `ChatWorkspaceHeader.tsx`, while standard workspace navigation had no equivalent shared attention surface. Its generic status labels did not distinguish questions or uncertain run outcomes. | Attention was harder to find across layouts, and the user had less information about why to open an item. | Reuse one work activity component in both layouts and derive reasons from the existing store. |
| Model files, loaded state and engine health are available in existing model/runtime interfaces. | A user needs a clear next action when a model is downloaded but the runtime is unavailable or not ready. | Add a concise runtime summary to the existing model page; retain the existing detailed controls and measured/estimated distinctions. |
| Task worktree and review information already exists in thread and panel APIs. | Repository scope and the next review action can be less visible than the conversation itself. | Put relevant task context and review entry points next to the active task without changing repository or approval semantics. |
| Download recovery and runtime load cancellation were buried in detailed controls; starting a new chat could apply a different saved surface model. | Setup could strand a user or silently replace their explicit local-model selection. | Inline download/load recovery and an explicit-model chat transition, including the onboarding return path. |
| The empty task surface left project selection in overflow and gave optional starters more prominence than the working scope. | Starting a scoped task required exploring unrelated controls. | A focused New task surface with project/folder/branch beside the composer, readable model selection and recent-task continuity. |
| Transcript reading position and expanded history were lost when a view unmounted; approvals could force a scroll. | Users lost their place during long work. | Bounded session memory for position/ranges, anchored restoration, explicit Jump to latest and no forced approval scrolling. |
| Tool logs and diffs had weak failure/provenance context and awkward long-line handling. | Review required too much searching and horizontal scrolling. | Grounded terminal states, copy/wrap/expand tools, changed-file filtering, progressive diff rendering and retained-data retry. |

## Decisions for this branch

### Connected-source assistant freshness

`src/components/assistant/useAssistantSnapshot.ts` reads the existing `getAssistantSnapshot` API. It reconciles every 15 seconds after a settled read while the document is visible, and when visibility, focus or connectivity returns. It does not call connector synchronization APIs automatically.

`snapshot-refresh.ts` coalesces concurrent background reads. An explicit refresh after a mutation requests one trailing read, so an older in-flight snapshot cannot immediately overwrite the action's outcome. A failed read retains the last good snapshot and its timestamp. A 20-second logical deadline unlocks retry if the bridge does not settle; an eventual expired response is ignored. Unmounting removes timers and listeners and suppresses late updates.

The header distinguishes an update in progress, the last successful read and a delayed update. A separate error message explains when retained data is being shown. The existing sync and outbound approval controls retain their meanings.

### Inbox reading, drafting and review

The Assistant now makes its existing journey explicit: choose a source or search a conversation,
read the selected conversation, then prepare a reply or start assistant work. The conversation rail
supports keyboard selection and an actual pending-review filter. A compact native selector replaces
the rail at narrower widths. The reading header keeps the subject and contact visible even when
the latest event is an outgoing draft.

The composer has separate **Reply** and **Ask TensorFold** intents, with one corresponding submit
action. Preparing a briefing or suggested task selects assistant intent. Replacing an existing,
different draft requires confirmation; cancelling preserves the text and its current intent.
The existing account-scoped draft storage and external-send confirmation remain in force.
Browser session-only draft storage is presented as a capability note, while actual save failures
retain an error and retry action.

The pending approval queue initially shows two actions and can expand within a bounded scrolling
area. Outbound review still uses the exact host-sealed account, recipient, body and digest. Opening
review never sends; a failed attempt leaves the review available. The modal traps Tab, supports
Escape while idle, and restores focus to its trigger when that trigger still exists.

Loading, a failed initial read, a failed refresh with retained data, an empty inbox and an empty
search are separate states. Source synchronization is an explicit secondary action, with labels
that name the currently supported email/iMessage sync path. Refresh only checks the inbox snapshot.

### Shared work attention

`src/components/work-activity/WorkActivityMenu.tsx` uses the existing store and `src/lib/full-workspace-activity.ts`. It has two groups: **Needs you** and **In progress**. Rows explain whether the recorded cause is approval, a pending question, an outcome review, an error, a stalled job, a queue or a wait.

Rows retain task/chat/room/routine identity and project names where available. Duplicate thread/job or room/job projections merge without losing an actionable reason. A handed-off job routes to its current thread; room supervision issues route to the owning room. Approvals in a worker thread can open that specific thread. Archived projections are excluded.

The compact list initially limits each group to 12 rows and can expand in place. This preserves access to pending questions and outcome reviews that are not necessarily listed by the command centre. Opening a row only navigates. It does not grant approval, dismiss a request, stop work or manufacture a completion receipt.

### Context and model clarity

The branch uses the existing design tokens, navigation and APIs. Task context is grounded in the selected thread/workspace. Runtime state is grounded in the host snapshot. Action labels must describe what the existing handler actually does; an engine being online is distinct from a model being available for inference, and a completed run is distinct from verified correctness.

### Composer maintenance

The composer has been split by responsibility while retaining its send/approval guards. `Composer.tsx` retains acceptance, attachment, queue, quote and keyboard behavior. `useComposerWorkspace.tsx` owns workspace selection and stale-response fences, `useComposerModel.ts` owns model context and readiness, `useComposerInput.ts` owns insertion and input lifecycles, and `ComposerToolbar.tsx` presents secondary controls. Project selection is now visible beside a new task; secondary controls use progressive disclosure. Each module is below the repository's 600-line limit. Existing tests still execute the production send/queue/attachment callbacks; the model-fit integration test loads the extracted hooks and toolbar.

## Independent implementation and limits

The official documentation informed workflow questions and information hierarchy. No competitor source code, screenshots, icons, assets or page layouts were copied into TensorFold. The changes are original implementations using TensorFold's own components and data contracts.

This scope does not add a new notification persistence service, invent a completion history, ship unwired experiments, or replace the current provider, permission or worktree machinery. Native runtime qualification, model quality and signed packaging require their existing platform-specific gates.

Focused regression coverage exercises concurrent and failed snapshot reads, stale-response fencing, visible/focus/network reconciliation, cleanup, retained drafts, truthful freshness, attention grouping, deduplication and source navigation. The branch-level validation receipt records the broader build and test results separately.
