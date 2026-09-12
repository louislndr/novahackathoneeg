# FrictionFix backend

A local Python service that helps a website owner discover where visitors likely get
confused while **naturally browsing** their site — no predefined task, form or "correct
answer" required. It combines browser-behaviour events, your teammate's already-computed
gaze observations, and optional experimental EEG evidence, attributes them to the exact
page/element involved, and (optionally) asks Gemini, via Vertex AI, how to improve that
element. Results are described as **likely friction, supported by evidence** — never as
proof of confusion or a validated diagnosis.

If you received `frictionfix-backend.zip`, extract it and copy the `backend` folder into
your existing repository root. It contains no frontend files to overwrite.

## Start on Windows (PowerShell)

Use Python 3.11+ (3.13 verified during this refactor; 3.12 also works). From the
repository root:

```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[eeg,test]"
.\.venv\Scripts\python.exe -m uvicorn frictionfix.app:app --host 127.0.0.1 --port 8000
```

Using the virtual environment's Python directly avoids PowerShell activation-policy
issues. For the exact versions verified during development, add
`-r requirements-tested.txt` to the install command. Omit `eeg` from the extras
(`.[test]` only) if you don't need the ANT/LSL bridge — the FastAPI service, friction
engine and tests all work without it.

macOS/Linux:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[eeg,test]'
.venv/bin/python -m uvicorn frictionfix.app:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000/docs** for the interactive API. Health is at `/health`:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Run with one process; do not use multiple workers or auto-reload during a recording.
Run the frontend and backend on the same laptop for the simplest demo.

## Upgrading from the previous (booking-form) backend

This backend's data model changed completely — sessions no longer have `task_key` or
`field_ids`, events are no longer `field_focus`/`task_complete`, etc. The SQLite file is
just an `(id, JSON document)` table, so no migration is possible or meaningful: **delete
your local dev database** before running this version, or point at a fresh one:

```powershell
Remove-Item .\data\sessions.sqlite3 -ErrorAction SilentlyContinue
# or: $env:FRICTIONFIX_DB = "C:\path\to\a\new\sessions.sqlite3"
```

`backend/data/` is gitignored, so nothing committed is at risk either way.

## What works

- HTTP API and a WebSocket state feed (twice per second) for a free-browsing session —
  no task, form or completion requirement anywhere in the contract.
- Explicit `manual`, `replay` and `live` sessions; `combined`, `behavior_only` and
  `observe` policies.
- Strictly validated, idempotent browser behaviour events (`element_enter/leave/click`,
  `repeated_click`, `rage_click`, `scroll`, `scroll_reversal`, `backtrack`,
  `input_error`, `navigation`, `inactivity`, `observation_end`) with per-type field
  validation, timestamp-ordering checks and per-session rate limiting.
- A contract for receiving your teammate's already-computed gaze observations — this
  service never implements eye tracking, webcam access or gaze estimation itself.
- ANT `.cnt` inspection and paced replay with selectable EEG channels; optional LSL
  bridge with channel/rate checks, explicit units and stale-data rejection.
- Non-overlapping EEG windows, quality checks and six spectral features (unchanged from
  the original signal pipeline).
- Per-participant calibration from researcher/participant-labelled intervals
  (`low_friction` / `high_friction` / `invalid`) — never derived from task correctness.
- A transparent, documented friction-scoring engine that merges evidence into episodes
  per page/element and produces friction events with an auditable score breakdown.
- Gemini improvement suggestions via **Vertex AI** (Application Default Credentials,
  never an API key), cached per friction event, with the rest of the API staying fully
  functional if Vertex AI is unreachable or not configured.
- Idempotent events/gaze observations, SQLite persistence and JSON export (event log,
  gaze log, EEG quality/evidence summary, friction events, cached suggestions — never raw
  EEG samples).

## Start with frontend integration

See [INTEGRATION.md](INTEGRATION.md). Your teammate can connect immediately using a
`manual` / `behavior_only` session — that tests the interface and event flow without
any EEG or gaze dependency. Test it without writing frontend code:

```powershell
$body = @{ participant_id = "smoke-test"; website_url = "https://example.test" } | ConvertTo-Json
$session = Invoke-RestMethod -Method Post http://127.0.0.1:8000/sessions -Body $body -ContentType "application/json"
Invoke-RestMethod -Method Post "http://127.0.0.1:8000/sessions/$($session.session_id)/start" -Body '{}' -ContentType "application/json"
```

## The friction-scoring algorithm, in plain language

1. Behaviour events and gaze observations arrive already timestamped and attributed to a
   `page_url`/`element_id` by the frontend (this service never inspects the DOM).
2. Each event/gaze type only becomes *evidence* once it crosses a configurable
   threshold — e.g. a `rage_click` only counts once `click_count` reaches
   `rage_click_min_count` (default 3), gaze only counts once `dwell_ms` and `confidence`
   both clear their thresholds. A single keystroke or click is never treated as evidence.
3. Qualifying evidence for the same `(page_url, element_id)` within
   `episode_merge_window_seconds` (default 8s) of the last evidence merges into one open
   **episode**; repeats of the *same* evidence type within that window count once, not
   once per occurrence (no double-counting a click storm).
4. When an episode goes quiet, it closes into a **friction event** with a score:
   `min(1.0, sum of fixed weights for each distinct evidence type present)`. Weights
   (documented in `frictionfix/friction.py`, not configurable) are
   `elevated_eeg_risk=0.35, long_gaze_dwell=0.25, rage_clicks=0.30, repeated_clicks=0.15,
   scroll_reversals=0.10, backtrack=0.10, input_error=0.15, inactivity=0.15`. Severity is
   `high` (≥0.7), `medium` (≥0.4) or `low` otherwise. Episodes below `min_friction_score`
   (default 0.3) never become a friction event — the raw evidence is still stored.
5. `elevated_eeg_risk` only ever appears under `policy: "combined"`, and only once a
   participant-specific model is fitted and predicts risk above `risk_threshold` for
   `consecutive_windows` windows in a row. `behavior_only` excludes it entirely;
   `observe` disables friction scoring altogether (raw logging only).
6. The score is a transparent, documented sum of *which kinds* of evidence were present —
   **not a validated probability of confusion**, and not comparable across different
   `min_friction_score`/threshold configurations.

## The EEG algorithm (unchanged from the original signal pipeline)

1. Accept samples in an explicitly configured channel order and sample rate. Convert
   volts to microvolts if necessary. Never guess units or channel identities.
2. Assemble non-overlapping two-second windows. Reject duplicate/backward chunks; reset
   partial windows across gaps. The bridge sends at most half a second per request.
3. Remove each channel's median DC offset. Flag nonfinite values, flatlines (standard
   deviation below 0.1 uV), peak-to-peak amplitude above 250 uV, and sample jumps above
   100 uV. Require at least 80% of configured channels, with a minimum of two. These are
   transparent prototype heuristics; they do not guarantee artifact-free EEG.
4. Apply a 1–40 Hz fourth-order Butterworth filter within the received window. Compute a
   Welch power spectrum with one-second segments. Extract theta (4–8 Hz), alpha (8–13 Hz)
   and beta (13–30 Hz) powers, log powers, relative powers and theta/beta ratio.
   Aggregate each feature using the median across retained channels.
5. During calibration, take the mean feature vector of the last two consecutive usable
   windows before a labelled interval ends. One independent interval contributes one
   training row, labelled directly by the researcher/participant as `low_friction`,
   `high_friction`, or `invalid` (excluded from fitting) — never derived from task
   success or timing.
6. Fit `StandardScaler → LogisticRegression`, with regularization and class balancing.
   Require at least four `low_friction` and four `high_friction` intervals. Four-fold
   trial-level cross-validation is a small development diagnostic, not product validation.
7. During observation, score the mean of the latest two usable windows against the
   fitted model. This risk score feeds the friction engine as `elevated_eeg_risk`
   evidence (step 5 above) — it never triggers anything by itself outside that pipeline.
8. Poor signal, gaps, or no complete window for four seconds mark quality `stale`/`poor`
   and reset the running risk state.

The risk score is an unvalidated model output, **not a probability that someone is
confused**. We do not implement artifact removal with EOG/ICA, medical assessment, or
fNIRS.

## Calibrating on the actual website

1. Create a `live` session with the participant's pseudonymous ID, actual EEG channel
   names and actual sample rate. Start the EEG bridge.
2. `POST /sessions/{id}/calibration/start`.
3. `POST .../calibration/trials/start` at the beginning of an interval you want to label
   (e.g. "browse this straightforward page" vs. "find this specific hard-to-find setting").
4. `POST .../calibration/trials/end` with `{"label": "low_friction"}`,
   `{"label": "high_friction"}`, or `{"label": "invalid"}` if the signal or interval was
   contaminated. Each interval needs at least four seconds of consecutive usable EEG
   immediately before the label — if signal is bad, cancel and repeat; never invent a
   label or wait after submission to backfill EEG for the same interval.
5. Repeat with varied easy/hard browsing intervals until at least four of each real label
   exist (an `invalid` interval doesn't count toward either total). Keep the same
   electrode setup throughout.
6. `POST .../calibration/fit`; inspect the report. If labels or usable data are
   insufficient, fitting is refused. A weak CV score means weak evidence even if fit
   succeeds.
7. `POST .../start` begins the actual observation. Calibration time does not count.

Eight intervals is a minimum demonstration floor; allow several minutes with cap setup
and retries. To reuse a fitted model for another run **in the same server process**,
create a new session with `calibration_session_id` pointing to the fitted session
(participant, source, channel order and sample rate must match). Recalibrate after a
server restart or electrode-placement change.

## Google Gemini suggestions (Vertex AI)

Uses the official **Google Gen AI SDK** (`google-genai`) in Vertex AI mode — never a
Google AI Studio `GEMINI_API_KEY`. Install the extra once you want this working:

```powershell
.\.venv\Scripts\python.exe -m pip install -e ".[gemini]"
```

The rest of the backend (sessions, events, EEG, friction events) works fully without
this extra installed or configured — only `POST .../suggestion` needs it, and it degrades
to a clear HTTP 503 rather than crashing anything if it's missing.

### Windows PowerShell setup

```powershell
# 1. Install/initialize the Google Cloud CLI if you haven't: https://cloud.google.com/sdk/docs/install
gcloud init

# 2. Authenticate Application Default Credentials (used by the Gen AI SDK, not an API key)
gcloud auth application-default login

# 3. Select your project (the one with your https://cloud.google.com/free credits)
gcloud config set project YOUR_PROJECT_ID

# 4. Enable the Vertex AI API on that project
gcloud services enable aiplatform.googleapis.com

# 5. Set the environment variables this backend reads (current PowerShell session)
$env:GOOGLE_CLOUD_PROJECT = "YOUR_PROJECT_ID"
$env:GOOGLE_CLOUD_LOCATION = "us-central1"      # any Vertex AI-supported region
$env:GEMINI_MODEL = "gemini-2.5-flash"           # optional; this is the default
```

`GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` are required for suggestions to work;
`GEMINI_MODEL` is optional (defaults to a fast, inexpensive Flash-tier model — check
[Vertex AI's current model list](https://cloud.google.com/vertex-ai/generative-ai/docs/models)
if you want a different one, since Google's lineup changes over time). Never hardcode a
project ID, model name or credential in code — everything comes from these environment
variables, read once per suggestion service instance.

### Running without Gemini

Just don't install the `gemini` extra and/or don't set the environment variables. Every
other endpoint works normally; `POST .../suggestion` returns
`503 {"detail": "Gemini suggestion unavailable: ..."}` with a clear reason. This is also
exactly how the test suite runs — no test requires Google Cloud credentials or makes a
real API call (see `tests/test_backend.py`'s mock/failing suggestion services).

## Recorded-data development (ANT replay)

Do not commit supplied raw EEG or participant files. Extract them outside the repo, or
into ignored `backend/data/`. Inspect a recording:

```bash
python -m frictionfix.bridge inspect "path/to/recording.cnt"
```

Create a session with `source: "replay"`, `sample_rate: 512`, and EEG channels present in
the recording, then run in a second terminal with the same virtual environment:

```bash
python -m frictionfix.bridge replay "path/to/recording.cnt" --session SESSION_ID
```

Optional: `--start-seconds 30 --seconds 60`. Replay runs at original speed and is marked
`replay` in every state and export — it is not related to any actual website browsing, so
it tests plumbing only. Use a new session when restarting the replay bridge;
sequence/timestamp checks deliberately reject rewinding a stream.

## Live EEG

Ask the ANT mentor which vendor program/SDK exposes the actual device. If it offers LSL,
confirm the exact stream name, sample rate, channel labels and units:

```bash
python -m frictionfix.bridge lsl --stream-name "EXACT_VENDOR_STREAM_NAME" --units uV --session SESSION_ID
```

The bridge verifies channel labels and rate, orders the configured channels, and rejects
old/discontinuous chunks. **The browser frontend must never POST to `/sessions/{id}/eeg`
directly when this bridge is in use** — that endpoint is for the Python bridge (or a
compatible vendor adapter) only. `pylsl` may require a platform-specific liblsl
installation; installation errors are separate from whether the cap supports LSL.

## Data and operations

- Bind to loopback. This is a trusted local tool, without authentication, encryption or a
  production multi-user deployment configuration.
- Frontend origins default to localhost/127.0.0.1 ports 5173 and 3000. Set the
  comma-separated `FRICTIONFIX_ORIGINS` environment variable if your frontend uses another.
- Sessions are stored in `backend/data/sessions.sqlite3`; set `FRICTIONFIX_DB` to
  override. Active signal buffers and trained models remain in memory only.
- Restarted sessions are archived/interrupted, not silently resumed — EEG quality shows
  `disconnected` and calibration shows not-ready after any restart. Start a new session
  and recalibrate when necessary.
- Only IDs, event/gaze metadata, feature vectors, timings and friction summaries are
  persisted — never raw EEG samples or arbitrary page content.
- Timing is server-receipt/relative-client timing, suitable for this local prototype; do
  not change the system clock mid-session. Pausing/suspending the laptop is not supported.

## Verification and submission

```bash
python -m pytest -q
```

Read [VALIDATION.md](VALIDATION.md) for tested behaviour and supplied-data results.
Before submission, fill in the team number and full member names in Python module
headers. Read [AI_USAGE.md](AI_USAGE.md) and be ready to explain every algorithm step.
The challenge also requires your pitch in PPTX and PDF; those are separate deliverables.
