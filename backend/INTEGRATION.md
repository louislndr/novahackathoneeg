# Frontend handoff

The teammate owns the booking UI. Keep both layouts' fields, task details and
validation identical; preserve answers when switching. No frontend framework is required.

Copy `examples/frictionfix-client.ts` into your frontend if useful. It has no npm
dependencies and includes TypeScript types. Backend address: `http://127.0.0.1:8000`.

## First connection: no EEG required

```ts
import { FrictionFixClient } from "./frictionfix-client";
const api = new FrictionFixClient();
const session = await api.create({
  participant_id: "test-participant-01", // pseudonym, not their name
  task_key: "booking-v1",
  field_ids: ["full_name", "email", "arrival_date", "guests"], // your actual field IDs
  source: "manual",
  initial_layout: "conventional",
  policy: "behavior_only", // visibly label this as behaviour-only, not EEG
});
const id = session.session_id;
await api.start(id); // start button: not component mounting
const unsubscribe = api.subscribe(id, state => {
  // Update metrics, signal status and researcher panel from state.
  // Handle state.adaptation_request once per request_id; see below.
  console.log(state);
}, () => { /* show disconnected state; poll api.state(id) if needed */ });

await api.event(id, { type: "field_focus", field_id: "email" });
await api.event(id, { type: "field_changed", field_id: "email" });
await api.event(id, { type: "field_validation", field_id: "email", correct: false });
```

Call `unsubscribe()` when unmounting. Create one session per run; do not create twice
because React StrictMode repeats effects. Keep a reference to session ID and pending
acknowledgments. Do not start/end a timed task automatically from a lifecycle effect.

## Behaviour events

`POST /sessions/{id}/events` requires `event_id` (unique string) and `type`.
The adapter assigns a UUID and serializes event requests. Await validation requests
before completing the task. Reuse the same `event_id` when retrying after a network
failure; reusing it with different content is rejected.

| type | Additional fields | Send when |
|---|---|---|
| `field_focus` | `field_id` | Input gains focus |
| `field_blur` | `field_id` | Input loses focus |
| `field_changed` | `field_id` | A previously validated value is edited; invalidates prior success |
| `field_validation` | `field_id`, `correct` | User submits/checks a field against the task's expected value |
| `layout_changed` | `layout`, `reason`, optionally `request_id` | UI has actually changed layout |
| `task_complete` | none | All fields currently validate successfully |
| `task_abandon` | none | User explicitly stops without completing |

**Errors count incorrect validation attempts, not keystrokes.** Do not emit incorrect
validations on every keypress. Before final submission, validate every field against
the task and send its current correctness. The backend refuses completion if any
field lacks a current successful validation.

The backend records receipt times. Field time is accumulated focused time, not
eye-tracked dwell time. Total duration starts at `/start`, independent of EEG calibration.

## Apply an adaptation

Example state fragment:

```json
{
  "layout": "conventional",
  "adaptation_request": {
    "request_id": "a-generated-uuid",
    "layout": "guided",
    "policy": "combined",
    "reason": "eeg_plus_errors_or_hesitation",
    "source": "live",
    "risk_score": 0.78,
    "at_seconds": 18.4
  }
}
```

This fragment illustrates the schema; it is **not a measured result**.

1. Read `adaptation_request`, preserve current answers and render the guided layout.
2. After it is rendered, acknowledge the actual change:

```ts
await api.event(id, {
  type: "layout_changed",
  layout: "guided",
  reason: "adaptation",
  request_id: request.request_id,
}, request.request_id); // stable event ID makes retries idempotent
```

3. Guard against duplicate requests from the twice-per-second state feed. Track an
   in-flight/handled request ID. If the backend rejects an expired request, report the
   integration error and record the actual UI change as `reason: "manual"` if it
   already happened. Do not claim an acknowledged EEG change that wasn't recorded.
4. A researcher “switch layout” button uses `reason: "manual"` and no request ID.

Do not render the layout solely from `state.layout` while acknowledging: the backend
retains the old layout until the frontend confirms the change. The acknowledgement
exists to distinguish an algorithm request from an actual interface change.

## Required researcher panel

Show source (`live`, `replay`, `manual`), EEG quality, calibration status, real errors,
time, and adaptation reason. When `risk_score` is null show “unavailable,” not zero.
Label it “experimental EEG risk score”; do not convert it to “78% confused.”
If a socket disconnects, the UI must display disconnected rather than freezing a
previous “usable” label. Reconnect or poll `GET /sessions/{id}` every 500 ms.

## Live/replay session configuration

```json
{
  "participant_id": "judge-01",
  "task_key": "booking-v1",
  "field_ids": ["full_name", "email", "arrival_date", "guests"],
  "source": "live",
  "policy": "combined",
  "sample_rate": 512,
  "channel_names": ["F3", "Fz", "F4", "FC1", "FC2", "C3", "Cz", "C4", "P3", "Pz", "P4", "Oz"]
}
```

These channels exist in the supplied recording; confirm actual hardware channels.
Use `source: "replay"` for file playback. The frontend doesn't need to post raw EEG
when using the Python bridge. `source` is configured/tagged input, not hardware attestation.

## EEG input contract (vendor bridge only)

`POST /sessions/{id}/eeg`:

```json
{
  "sequence": 0,
  "source": "live",
  "units": "uV",
  "start_time": 100.0,
  "samples": [[2.1, 3.2], [2.4, 3.1]]
}
```

This two-channel fragment is for a session configured with exactly two channels;
normal 12-channel samples must each contain 12 values. Rows are samples, columns
are the exact session channel order. `start_time` is the first sample's source-clock
timestamp in seconds. `sequence` must strictly increase; timestamps must not overlap
or rewind. Gaps reset signal evidence. Send <= 2 seconds per request, ideally 0.5 seconds.
Do not upload an entire recording as one request or stream old samples as live.

## Calibration endpoints

All are `POST`. Empty operations can send `{}`.

| Path suffix after `/sessions/{id}` | Body | Effect |
|---|---|---|
| `/calibration/start` | `{}` | Enter calibration before the timed run |
| `/calibration/trials/start` | `{}` | Begin an independent form trial; clear prior EEG windows |
| `/calibration/trials/end` | `{"success": true, "errors": 0}` | Label features preceding the actual outcome |
| `/calibration/trials/cancel` | `{}` | Discard a bad-signal/aborted trial |
| `/calibration/fit` | `{}` | Fit after at least four trials of each outcome class |
| `/start` | `{}` | Begin the measured booking task; clear calibration signal history |

Use the corresponding adapter methods. Read the README's calibration instructions:
the minimum is **trials**, not eight adjacent EEG windows. Replay-labelled outcomes
only test the code path and must not be interpreted as participant calibration.

## Results

- `GET /sessions/{id}` or WebSocket: current metrics/state.
- `GET /sessions/{id}/export`: downloadable JSON, including event log and calibration
  features/outcomes. The adapter exposes `exportUrl(id)`.
- `POST /compare` with `{"session_ids": ["first-uuid", "second-uuid"]}`: comparable
  fixed-layout results, or explicit reasons a difference cannot be calculated.

For fixed-layout comparison, use `policy: "observe"` and separate conventional/guided
sessions with equivalent tasks. Adaptive/mixed runs remain exportable but are excluded
from the simple layout difference. Do not claim that a faster second attempt proves
EEG helped. The provided model's incremental value needs a separate controlled test.

## Scope for your Claude prompt

Implement the booking UI and researcher/results panels using this contract. Reuse
the TypeScript adapter. Keep `backend/` unchanged unless coordinating an API fix.
Do not generate EEG scores, success metrics or improvement percentages. Support
the manual integration path first, then calibration and combined EEG input.
