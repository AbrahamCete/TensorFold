# Assistant inbox acceptance receipt

Date: 2026-10-26. Scope: the application renderer on the `app-improvements` branch.

The Assistant journey was exercised in a fresh Chromium profile against the running Vite app.
The screenshots use synthetic browser fixtures and are visibly labelled. They demonstrate the
actual application components and event handlers; they do not demonstrate a native connector,
account connection, outbound delivery, or GPU inference. The fixture provides a configured email
source identity so same-account draft continuity is tested without weakening account isolation.

## Acceptance matrix

| Journey | Result | Evidence exercised |
| --- | --- | --- |
| Find a conversation | Pass | Filter by source, search sender/subject/preview, recover from no matches, select with ArrowUp/ArrowDown. |
| Recover a failed refresh | Pass | The real snapshot hook retains the last inbox, selected conversation and exact draft text. Retry clears the failed-read state. |
| Receive live updates while writing | Pass | The unmodified 15-second hook reads a new fixture message; the same conversation, draft text and textarea focus remain. |
| Prepare assistant work | Pass | Cancelling a suggested replacement preserves the draft. Accepting selects Ask TensorFold intent and its task action, instead of a direct reply. |
| Review and retry an approval | Pass | The queue limits its initial rows and expands; the modal shows the exact account, recipient, subject and body. Opening it does not dispatch. Tab stays inside; Escape restores focus. A simulated failure retains the payload; explicit retry passes the exact review digest and records one fixture delivery. |
| Use a smaller dark window | Pass | At 1024×768, the conversation and draft remain actionable without horizontal document overflow. |
| Use the minimum window | Pass | At 720×520, with the sidebar both expanded and collapsed, compact source/conversation selectors and the reply action remain reachable. The reading area stays at least 160 pixels high; vertical scrolling handles constrained height. Draft text remains intact. |
| Recover an initial read | Pass | An unresolved read shows loading, a rejected read shows its diagnostic and Retry inbox, and retry restores the conversation. |
| Recover an empty inbox | Pass | A successful empty result is distinct from loading or error and opens the existing Connectors settings through Manage sources. |

The final run produced nine passing journeys and eleven labelled screenshots, with no browser page
errors. The evidence manifest records each viewport and state. The minimum-size check also verifies
that the send button is within the viewport and receives the pointer at its centre, after the
temporary theme-change notification has disappeared.

## Focused regression coverage

The following existing test entry points passed after the changes:

- `src/components/assistant/snapshot-refresh.test.ts`
- `src/components/assistant/useAssistantSnapshot.test.ts`
- `src/components/assistant/AssistantHeader.test.tsx`
- `src/components/assistant/Composer.test.mjs`
- `src/components/assistant/drafts.test.ts`
- `src/components/assistant/OutboundApprovalDialog.test.tsx`
- `src/components/assistant/message-delivery-status.test.ts`
- `src/components/preferences/language-grammar.test.tsx`

These checks cover coalescing and trailing reads, last-good retention, deadline/late-result fencing,
visible/focus/network reconciliation, unmount cleanup, draft/account boundaries, replacement
confirmation, explicit task-versus-reply keyboard dispatch, IME handling and exact-payload review.
Full TypeScript checking and the affected-files whitespace check also passed. The branch-wide
receipt reports the complete suite and production build separately.

## Reproducing the browser checks

Run `scripts/qa/assistant-journey.mjs` from `app`, with the evidence directory and running development
URL as arguments. The shared browser helper accepts `TENSORFOLD_QA_CHROMIUM` for a Chromium binary
and `TENSORFOLD_QA_PLAYWRIGHT` for a Playwright module path. Use a fresh profile; finish source and
language-pack writes first so Vite does not replace the page during an interaction.

The script installs fixture responses only in that browser page's in-memory API object. The normal
snapshot controller, polling, drafts, rendering, keyboard handlers and approval UI remain active.
No account is signed in and no message leaves the fixture. Generated screenshots and the
`acceptance.json` manifest belong in the operator-supplied evidence directory, outside the source
archive.

## Boundaries

A failed refresh retains an already-loaded conversation and its draft. An unconfigured or changed
account remains a different draft identity by design; the UI does not merge drafts across accounts
to make a continuity check pass. Browser drafts remain session-only, and their neutral notice does
not claim durable persistence. Native connector and host sandbox qualification must be performed
on their supported platforms.
