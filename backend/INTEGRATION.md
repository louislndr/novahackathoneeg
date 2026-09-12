# Frontend integration

Your teammate owns the website, the eye-tracking implementation, webcam access, gaze
calculation and DOM-to-element mapping. This backend never inspects or controls the DOM;
it only receives already-computed gaze observations, browser behaviour events and EEG
chunks, attributes them to a page/element, and produces **friction events** describing a
likely difficulty location supported by experimental/behavioural evidence — not a
validated measurement of confusion.

Copy `examples/frictionfix-client.ts` into your frontend if useful. It has no npm
dependencies and includes TypeScript types matching every payload in this document.
Backend address: `http://127.0.0.1:8000`.

## 1. Create one browsing session

```ts
import { FrictionFixClient } from "./frictionfix-client";
const api = new FrictionFixClient();
const session = await api.create({
  participant_id: "test-participant-01",   // pseudonym, not their name
  website_url: "https://example-shop.test",
  website_name: "Example Shop",             // optional
  observation_label: "checkout flow, round 1", // optional
  source: "manual",
  policy: "behavior_only",                  // visibly label this as behaviour-only, not EEG
});
const id = session.session_id;
```

**No task, form or "correct answer" is required or supported.** The participant simply
browses. Create one session per browsing period; do not create twice because React
StrictMode repeats effects.

## 2. Start and end observation

```ts
await api.start(id);   // begin logging; anchors client timestamps (see §11)
// ... participant browses freely ...
await api.end(id, "completed");  // or "abandoned" / "navigated_away"
```

`end()` is safe to call more than once (e.g. from both a "done" button and a page-unload
handler) — ending an already-ended session is a no-op, not an error. Do not start/end a
session automatically from a component-mount lifecycle effect; tie it to an explicit
participant/researcher action ("begin browsing" / "finish").

## 3. Stable element IDs

Assign a short, stable `element_id` to every meaningful element, e.g.
`navigation-products`, `pricing-comparison-table`, `checkout-button`, `account-menu`,
`shipping-information`. The frontend decides and assigns these; the backend never
inspects the DOM to derive them. Optionally list the ones you expect up front in
`known_element_ids` at session creation — this is informational only (e.g. for pre-built
heatmap axes) and is never enforced against events.

## 4. Browser behaviour events

`POST /sessions/{id}/events`. Every event needs `event_id` (unique string, for retries),
`type`, `page_url` and `client_ts` (see §11). Each type accepts **only** its own extra
fields — the backend rejects unknown/missing fields for that type (HTTP 422).

| type | extra required | extra optional | send when |
|---|---|---|---|
| `element_enter` | `element_id` | `x`, `y` | pointer/focus enters a tracked element |
| `element_leave` | `element_id`, `duration_ms` | | it leaves |
| `element_click` | `element_id`, `x`, `y` | | a single click |
| `repeated_click` | `element_id`, `click_count`, `duration_ms` | | you've detected ≥2 clicks in a short window (non-frustrated) |
| `rage_click` | `element_id`, `click_count`, `duration_ms` | `x`, `y` | you've detected a frustrated click burst |
| `scroll` | `direction` (`up`\|`down`) | `element_id`, `scroll_y` | a scroll event |
| `scroll_reversal` | `reversal_count` | `element_id` | scroll direction flipped repeatedly |
| `backtrack` | `previous_page_url` | `element_id` | back-navigation / re-visiting prior content |
| `input_error` | `element_id` | `metadata` | a form/input validation failure — **not** every keystroke |
| `navigation` | | `previous_page_url` | page changed (`page_url` = destination) |
| `inactivity` | `duration_ms` | `element_id` | you've detected a hesitation/idle period |
| `observation_end` | | `reason`, `element_id` | best-effort signal (e.g. `beforeunload`) — logged only; call `api.end()` to actually end the session |

All types also accept `metadata`: up to 10 short key/value pairs (strings ≤200 chars) for
small safe context — never raw typed content, HTML, or free-text keystrokes.

Classification (is this a rage click vs. a normal click, a reversal vs. normal scrolling)
is the frontend's job — the backend only decides whether a reported event crosses a
configurable *evidence* threshold (§12), not whether it happened.

The backend rejects: an unknown `event_id` reused with different content (network retries
must resend the exact same payload), events before `start()`/after `end()`, timestamps
that rewind or run far ahead of elapsed time (§11), and bursts over roughly 40 events/sec
per session (HTTP 429 — batch/throttle high-frequency signals like `scroll` client-side).

## 5. Processed gaze observations (your teammate's eye-tracking pipeline)

`POST /sessions/{id}/gaze`. This backend does not implement eye tracking — only
validates, timestamps and stores what your pipeline already computed:

```json
{
  "observation_id": "gaze-104",
  "element_id": "pricing-comparison-table",
  "page_url": "/pricing",
  "timestamp": 125.72,
  "x": 742,
  "y": 418,
  "dwell_ms": 3200,
  "confidence": 0.91
}
```

`timestamp` uses the same seconds-since-`start()` convention as `client_ts` (§11).
`element_id`/`x`/`y`/`viewport_width`/`viewport_height` are optional. Observations below
the session's confidence/dwell thresholds are still stored (useful for a full gaze
heatmap) but contribute no friction evidence. If gaze timestamps are missing or clearly
invalid, the backend will not claim alignment with EEG or behaviour evidence for that
observation.

## 6. Subscribing to live state

```ts
const unsubscribe = api.subscribe(id, state => {
  // state.eeg.quality, state.friction.total/open_episodes/by_severity, state.context, ...
}, () => { /* show "disconnected"; poll api.state(id) as a fallback */ });
```

WebSocket at `/sessions/{id}/ws`, pushed twice per second. Call `unsubscribe()` on
unmount. If the socket errors or closes, show a disconnected state — never keep showing a
stale "usable"/"connected" label.

## 7. Retrieving friction events

```ts
const { friction_events } = await api.frictionEvents(id);
```

```json
{
  "friction_event_id": "generated-uuid",
  "page_url": "/pricing",
  "element_id": "pricing-comparison-table",
  "friction_score": 0.82,
  "severity": "high",
  "evidence": ["elevated_eeg_risk", "long_gaze_dwell", "repeated_clicks"],
  "started_at": 12.4,
  "ended_at": 18.7,
  "source_mode": "combined",
  "suggestion": null
}
```

`GET /sessions/{id}/export` includes the same list plus every raw event/gaze observation
and EEG quality/evidence summary (never raw EEG samples) — enough to build a page/element
friction heatmap client-side. A friction event only appears once its evidence clears the
session's `min_friction_score` (default 0.3); weaker signals are recorded in the raw
event/gaze log but never surfaced as a friction claim. **Display `friction_score` and
`severity` as "likely friction, supported by evidence" — never as a measured or validated
confusion percentage.**

## 8. Requesting and displaying a Gemini suggestion

```ts
const suggestion = await api.requestSuggestion(id, frictionEventId, {
  element_type: "comparison table",             // optional, short
  element_description: "3-column pricing grid", // optional, short
});
```

```json
{
  "problem": "Users appear to hesitate while comparing the pricing plans.",
  "suggestion": "Reduce the number of columns and visually highlight the differences.",
  "priority": "high",
  "rationale": "The element was associated with prolonged attention, repeated clicks and elevated experimental EEG risk."
}
```

This calls Gemini (via Vertex AI) once per friction event and caches the result — calling
it again for the same `friction_event_id` returns the cached suggestion without another
API call. If `SessionConfig.auto_suggest` was `true`, a high-severity friction event may
already have `suggestion` populated when you fetch it from §7. If Vertex AI is
unavailable (no credentials, quota, network, or malformed response), the endpoint returns
HTTP 503 with a clear reason — handle this as "suggestion unavailable," never fabricate
one client-side and present it as Gemini's.

## 9. Behaviour-only mode

Set `policy: "behavior_only"` (or simply never post to `/eeg`) to run without any EEG
requirement. Friction events are still produced from browser events and gaze alone;
`elevated_eeg_risk` is never included as evidence. Set `policy: "observe"` to disable
friction scoring entirely and just log raw data (useful for a pure baseline recording).

## 10. Disconnected / missing / poor-quality signals

Read `state.eeg.quality`: `disconnected` (no session/hardware), `waiting` (no window yet),
`usable`, `poor` (failed artifact checks — shown, but excluded from scoring), or `stale`
(no window in the last 4s — treat as temporarily unavailable). Show `risk_score` as
"unavailable," not zero, when `null`. A restarted/reloaded session is always archived
with `eeg.quality: "disconnected"` and `calibration.ready: false` — never presented as a
resumed live session.

## 11. Client timestamps

`client_ts` (events) and `timestamp` (gaze) are **seconds since this session's `start()`
call resolved, per the frontend's own clock** (`performance.now()`), not epoch time and
not the backend's clock. This sidesteps wall-clock synchronization entirely. The adapter
does this for you (`FrictionFixClient.start()` anchors it; `.event()`/`.gaze()` compute
it). The backend rejects a timestamp that rewinds more than ~5s behind the latest
accepted one, or runs more than ~5s ahead of its own elapsed-time estimate — send events
close to when they happen, don't batch-replay a long queue after a network outage.
EEG-derived evidence uses the *backend's* receipt-time elapsed clock (there is no hard
link between the EEG source clock and the browser clock); this is an approximation the
backend discloses rather than presenting as exact cross-signal alignment.

## 12. Shared configuration

Both sides must agree on, at session-creation time: `sample_rate` and `channel_names`
(only relevant if you're driving the Python EEG bridge — the browser never posts EEG
directly, see README.md), and whichever friction thresholds you want non-default
(`long_gaze_dwell_ms`, `min_gaze_confidence`, `rage_click_min_count`,
`repeated_click_min_count`, `scroll_reversal_min_count`, `inactivity_min_ms`,
`episode_merge_window_seconds`, `min_friction_score`, `risk_threshold`,
`consecutive_windows`). All have sane defaults (see `frictionfix/schemas.py`); only
override what your demo needs. The friction *scoring weights* themselves are fixed and
documented in `frictionfix/friction.py`, not configurable, so a score always means the
same thing across sessions.

## Scope for your Claude prompt

Implement the website, gaze pipeline and researcher/results panels using this contract.
Reuse the TypeScript adapter. Keep `backend/` unchanged unless coordinating an API fix.
Do not generate friction scores or suggestions client-side, and do not claim a percentage
"confused" or a validated diagnosis anywhere in the UI.
