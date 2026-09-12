# Backend validation

These are development checks, not clinical or commercial validation.

## Automated tests

`python -m pytest -q`: **15 passed** on Python 3.12 / Linux.

The tests cover spectral features, raw artifact rejection, ANT DC-offset handling,
source units, chunk gaps/reordering, event retries, correctness invalidation after
edits, completion rules, real accumulated timings, calibration minimums, poor/stale
signal suppression, EEG-plus-behaviour triggering, acknowledged layout changes,
same-participant model reuse, HTTP error responses, JSON export, persistence after
restart, layout comparison, WebSocket state and CORS.

Synthetic alpha/theta signals intentionally create separable classes in the model
test. Its perfect synthetic CV result is **not a participant accuracy claim**.

The TypeScript adapter passed:

```bash
npm exec --yes --package typescript -- tsc --noEmit --strict --target ES2020 --lib ES2020,DOM examples/frictionfix-client.ts
```

## End-to-end transport

`examples/verify_transport.py` starts a temporary local HTTP server and verifies:

1. Six seconds of the supplied eyes-open/closed recording, replayed at original
   speed through the command-line bridge, produces three EEG windows tagged `replay`.
2. A **synthetic** local LSL outlet, with explicit channel metadata and sample units,
   reaches the Python LSL bridge and then the HTTP backend with usable features.

Both checks passed. Local LSL emitted restricted-network-interface discovery
warnings in the development environment, but resolved the synthetic stream and
successfully transported samples. This is not a test with ANT hardware.

Reproduce with:

```bash
python examples/verify_transport.py --replay-file "path/to/eyes-open-closed.cnt"
```

Omit `--replay-file` for only the synthetic LSL transport check.

## Supplied flip-cup recordings

Four supplied `.cnt` files loaded successfully: eyes-open/closed, frequency recording,
flip-cup session 01 and session 02. The loader reports 64 channels at 512 Hz in each.
The model uses an explicit 12-channel subset present in the recordings, excluding
EOG and the unconnected mastoid channels.

The first pass incorrectly treated large electrode DC offsets as artifacts. That
engineering issue was corrected by centering each channel before quality checks,
and a regression test verifies invariance to those offsets. The held-out performance
below was not used to tune feature selection, model parameters or decision thresholds.

Protocol:

- Verified the EEG marker outcomes against both behavioural CSVs: all 100 align.
- Use the four seconds **before** each cue; exclude outcome-entry/movement-period EEG.
- Extract the same features used by the live pipeline, one mean vector per trial.
- Train only on session 01; evaluate on session 02.
- Fit normalization only on training data. Do not split overlapping windows across sets.

| Measurement | Result |
|---|---:|
| Training trials | 50 total; 48 usable; 2 rejected for quality |
| Training outcomes after rejection | 34 failures; 14 successes |
| Test trials | 50 total; 50 usable |
| Test outcomes | 24 failures; 26 successes |
| EEG model accuracy | 56.0% (28/50) |
| EEG model balanced accuracy | 54.8% |
| EEG model ROC AUC | 0.566 |
| Training-majority baseline accuracy | 48.0% |
| Training-majority baseline balanced accuracy | 50.0% |

The confusion matrix (rows actual success/failure, columns predicted success/failure)
is `[[22, 4], [18, 6]]`. The classifier missed many failures. This is weak evidence of
useful prediction, even though its raw accuracy exceeds the training-majority baseline.
No statistical-significance or cross-person-generalization claim is made.

Aggregate output: [validation/flipcup-holdout.json](validation/flipcup-holdout.json).
Raw participant recordings and behavioural files are not included in Git.

Reproduce by supplying matching paths:

```bash
python -m frictionfix.evaluate --train-cnt session-01.cnt --train-trg session-01.trg --test-cnt session-02.cnt --test-trg session-02.trg --train-csv Session-01.csv --test-csv Session-02.csv --output reports/flipcup-holdout.json
```

## Not verified

- ANT cap acquisition, vendor SDK access, Windows device drivers, or the live electrode setup.
- Actual participant calibration and prediction on the teammate's booking form.
- Frontend rendering, form validation correctness and final UI/backend integration.
- fNIRS acquisition or processing.
- Better usability outcomes caused by EEG beyond a behaviour-only policy.
- Larger-scale, independent-participant performance or paid-customer usefulness.

Those need hardware, the teammate's UI, and real supervised experiments. Do not
present replay, synthetic signals, or these flip-cup results as a judge's mental state.
