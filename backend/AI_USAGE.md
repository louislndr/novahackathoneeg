# AI-use disclosure and understanding checklist

This backend was generated and iteratively tested with OpenAI Codex. AI was used for
repository setup, API and signal-processing implementation, TypeScript integration
examples, test cases, documentation, and inspection/evaluation of supplied EEG data.
Automated code execution was used to run tests and calculate the recorded-data result.

No live ANT cap was available during this implementation. Synthetic EEG used in tests
is test input, not a participant measurement. The supplied-data result is calculated
from recordings and is not an estimate of website-confusion accuracy.

The backend was subsequently generalized from a single booking-form usability experiment
into the free-browsing FrictionFix contract described in this repository (session model,
strict browser-event/gaze schemas, the friction-scoring engine, and the Vertex AI Gemini
suggestion service) using Claude Code. The EEG signal-processing and calibration-fitting
algorithms were carried over unchanged from the original implementation; only what
labels/triggers feed them changed. The team should be ready to explain this refactor's
design choices (the friction-episode/evidence model, the fixed evidence weights, and the
Vertex AI error-handling/caching behaviour) alongside the original signal-processing work.

Before submission, the team should replace the placeholders in Python headers with
its actual team number and member names, review the code, correct this disclosure
to reflect subsequent human/AI contributions, and be ready to explain:

- Why volts versus microvolts matters and why ANT DC offsets are removed.
- What sample rate, channel order, EOG and unconnected mastoid channels mean.
- How non-overlapping windows, quality checks, bandpass filtering and Welch power work.
- What each of the six features measures, and why none directly measures confusion.
- How researcher/participant-labelled calibration intervals (`low_friction`/
  `high_friction`/`invalid`) supply targets, and why windows after the label ends must
  not be used.
- Why independent trials and held-out sessions matter for leakage and validation.
- What scaling, logistic regression, regularization and class balancing do.
- Why majority-baseline and balanced accuracy matter with unequal class counts.
- How the friction score is a transparent, fixed-weight sum of which evidence types
  crossed a configurable threshold — not a validated probability of confusion — and why
  EEG evidence alone can still be enough to clear the default reporting threshold.
- Why behaviour/gaze timestamps (frontend-relative) and EEG timestamps (backend-relative)
  are different clocks that are only approximately aligned, and why that's disclosed
  rather than hidden.
- Why repeated attempts, task difficulty, movement and order can confound improvement.
- What is implemented versus still unverified: vendor hardware, fNIRS, actual website
  calibration, EEG/gaze's incremental benefit, a real Vertex AI call, and commercial usefulness.

Primary implementation references:

- https://mne.tools/stable/generated/mne.io.read_raw_ant.html
- https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.welch.html
- https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html
- https://labstreaminglayer.readthedocs.io/

The challenge handout requires an explanation of AI use and understanding of the
generated code; this document supports that explanation but does not replace it.
