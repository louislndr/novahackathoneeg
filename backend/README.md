# FrictionFix backend

A local Python service for a supervised usability experiment. Your frontend owns
the booking form; this service handles EEG, calibration, metrics and adaptation.

## Start on Windows (PowerShell)

Use Python 3.12. From the repository root:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[eeg,test]"
.\.venv\Scripts\python.exe -m uvicorn frictionfix.app:app --host 127.0.0.1 --port 8000
```

Using the virtual environment's Python directly avoids PowerShell activation-policy
issues. For the exact versions verified during development, add
`-r requirements-tested.txt` to the install command.

macOS/Linux:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[eeg,test]'
.venv/bin/python -m uvicorn frictionfix.app:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000/docs** for the interactive API. Health is at `/health`.
Run with one process; do not use multiple workers or auto-reload during a recording.
Run the frontend and backend on the same laptop for the simplest demo.

## What works

- HTTP API and a WebSocket state feed (twice per second).
- Explicit `manual`, `replay` and `live` sessions.
- ANT `.cnt` inspection and paced replay with selectable EEG channels.
- Optional LSL bridge with channel/rate checks, explicit units and stale-data rejection.
- Non-overlapping EEG windows, quality checks and six spectral features.
- Per-participant calibration from actual form-trial outcomes.
- Combined EEG/behaviour adaptation, behaviour-only baseline, and observation mode.
- Actual field focus time, incorrect validations, total duration and completion status.
- Idempotent events, acknowledged layout changes, SQLite persistence and JSON export.
- Descriptive comparison of completed, comparable fixed-layout runs.
- Independent-session flip-cup evaluation with label verification and majority baseline.

## Start with frontend integration

See [INTEGRATION.md](INTEGRATION.md). Your teammate can connect immediately using a
`manual` / `behavior_only` session. That tests the interface and event flow without
claiming an EEG trigger. A combined session without a fitted model will record
behaviour, but will not automatically request a layout change.

## The EEG algorithm, in plain language

1. Accept samples in an explicitly configured channel order and sample rate. Convert
   volts to microvolts if necessary. Never guess units or channel identities.
2. Assemble non-overlapping two-second windows. Reject duplicate/backward chunks;
   reset partial windows across gaps. The bridge sends at most half a second per request.
3. Remove each channel's median DC offset. Flag nonfinite values, flatlines (standard
   deviation below 0.1 uV), peak-to-peak amplitude above 250 uV, and sample jumps
   above 100 uV. Require at least 80% of configured channels, with a minimum of two.
   These are transparent prototype heuristics; they do not guarantee artifact-free EEG.
4. Apply a 1–40 Hz fourth-order Butterworth filter within the received window. Compute
   a Welch power spectrum with one-second segments. Extract theta (4–8 Hz), alpha
   (8–13 Hz) and beta (13–30 Hz) powers, log powers, relative powers and theta/beta ratio.
   Aggregate each feature using the median across retained channels.
5. During calibration, take the mean feature vector of the last two consecutive usable
   windows before a trial outcome. One independent trial contributes one training row.
   The outcome is a **behavioural proxy**: failure, one or more reported errors, or a
   duration at/above the hesitation threshold (default 12 seconds).
6. Fit `StandardScaler → LogisticRegression`, with regularization and class balancing.
   Require at least four fluent and four difficulty-proxy trials. Four-fold trial-level
   cross-validation is a small development diagnostic, not product validation.
7. During a task, score the mean of the latest two usable windows. For `combined`, a
   score >= 0.7 for three successive window updates plus an incorrect validation in
   the past 15 seconds or focus lasting >= 12 seconds requests the guided layout.
   Starting from an empty buffer, this needs at least eight seconds of EEG.
8. Poor signal, gaps or no complete window for four seconds reset the EEG evidence.
   The backend requests a switch; the frontend acknowledges only after it changes
   layout. All manual and automatic changes are recorded separately.

The score is an unvalidated model output, **not a probability that someone is confused**.
We do not implement artifact removal with EOG/ICA, medical assessment, or fNIRS.

## Calibrating with the actual form

1. Create a `live` session with the participant's pseudonymous ID, actual EEG channel
   names and actual sample rate. Start the EEG bridge.
2. `POST /sessions/{id}/calibration/start`.
3. Present a short form task and `POST .../calibration/trials/start` when it begins.
4. When the participant submits, call `POST .../calibration/trials/end` with their
   actual `success` and `errors`. Trial duration is measured by the backend.
5. Each trial needs at least four seconds of consecutive usable EEG immediately
   before submission. If signal is bad, cancel that trial and repeat it; do not invent
   an outcome or wait after submission to collect more EEG for the same outcome.
6. Repeat with varied easy and harder tasks until at least four trials of each label
   exist. Keep the same electrode setup. Do not deliberately mislabel fluent trials.
7. `POST .../calibration/fit`; inspect the report. If labels or usable data are
   insufficient, fitting is refused. A weak CV score means weak evidence even if fit succeeds.
8. `POST .../start` begins a fresh timed task. Calibration time does not count.

Eight trials is a minimum demonstration floor; allow several minutes with cap setup
and retries. The model learns the participant/task conditions you actually record.
Hard tasks can induce different movements; quality checks do not eliminate that confound.

To reuse a model for another run **in the same server process**, create a new session
with `calibration_session_id` pointing to the fitted session. Participant, task key,
source, channel order, sample rate and hesitation threshold must match. Never reuse
a replay calibration as a live participant calibration. Recalibrate after a server
restart or electrode-placement change.

## Recorded-data development

Do not commit supplied raw EEG or participant files. Extract them outside the repo,
or into ignored `backend/data/`. Inspect a recording:

```bash
python -m frictionfix.bridge inspect "path/to/recording.cnt"
```

Create a session with `source: "replay"`, `sample_rate: 512`, and EEG channels present
in the recording. The default 12-channel selection exists in the supplied recordings.
Then run in a second terminal with the same virtual environment:

```bash
python -m frictionfix.bridge replay "path/to/recording.cnt" --session SESSION_ID
```

Optional: `--start-seconds 30 --seconds 60`. Replay runs at original speed and is
marked `replay` in every state, trigger and export. It is not related to the current
person's form performance, so it tests plumbing only. Use a new session when restarting
the replay bridge; sequence/timestamp checks deliberately reject rewinding a stream.

The supplied recordings load as **64 labelled channels at 512 Hz**, including EOG
and M1/M2. This differs from the notes' wording “64ch plus EOG.” The loader's channel
list is authoritative for array shape. Exclude unconnected M1/M2 and EOG from the
EEG feature input. The actual challenge hardware's channel selection still needs confirmation.

## Live EEG

Ask the ANT mentor which vendor program/SDK exposes the actual device. If it offers
LSL, confirm the exact stream name, sample rate, channel labels and units:

```bash
python -m frictionfix.bridge lsl --stream-name "EXACT_VENDOR_STREAM_NAME" --units uV --session SESSION_ID
```

Use `--units V` only if the source returns volts. The bridge verifies channel labels
and rate, chooses and orders the configured channels, and rejects old/discontinuous
chunks. `pylsl` may require a platform-specific liblsl installation; installation
errors are separate from whether the cap supports LSL.

If the vendor provides another SDK, adapt its samples to `POST /sessions/{id}/eeg`
using the documented contract. There is no invented ANT SDK connection here.
Actual cap acquisition and fNIRS are not verified or implemented in this repository.

## Compare layouts and test EEG's value

Keep the visible adaptive demo, but also run two **fixed-layout** tasks with `policy:
"observe"`: one conventional and one guided. Use equivalent task details, the same
field IDs and scoring, and counterbalance the order across participants. `/compare`
refuses a difference when a run is incomplete, mixed-layout, mismatched, or duplicated.
It reports observed differences, not causal claims or statistical significance.

To study EEG's incremental value, run a separate experiment comparing `combined`
against `behavior_only` with matched tasks, balanced order and enough participants.
The current comparison endpoint does not perform that causal analysis. The supplied
flip-cup evaluation compares EEG to a majority baseline, not to website behaviour.

## Data and operations

- Bind to loopback. This is a trusted local experiment tool, without authentication,
  encryption or a production multi-user deployment configuration.
- Frontend origins default to localhost/127.0.0.1 ports 5173 and 3000. Set the comma-
  separated `FRICTIONFIX_ORIGINS` environment variable if your frontend uses another.
- Reports/events are stored in `backend/data/sessions.sqlite3`; set `FRICTIONFIX_DB`
  to override. Active signal buffers and trained models remain in memory.
- Restarted sessions are archived/interrupted, not silently resumed. Completed
  reports survive restart. Start a new session and recalibrate when necessary.
- Only IDs, validation outcomes, feature vectors, timings and event metadata are
  persisted. Do not send typed names, emails, booking values or real identifiers.
- Timing is server-receipt wall-clock timing, suitable for this local prototype;
  do not change the system clock mid-session. Pausing/suspending the laptop is not supported.
- Frontend validation is the source of correctness. It must compare to the fictional
  task's expected values; this API cannot independently verify client claims.

## Verification and submission

```bash
python -m pytest -q
```

Read [VALIDATION.md](VALIDATION.md) for tested behaviour and supplied-data results.
Before submission fill in the team number and full member names in Python module
headers. Read [AI_USAGE.md](AI_USAGE.md) and be ready to explain every algorithm step.
The challenge also requires your pitch in PPTX and PDF; those are separate deliverables.
