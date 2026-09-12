# AI-use disclosure and understanding checklist

This backend was generated and iteratively tested with OpenAI Codex. AI was used for
repository setup, API and signal-processing implementation, TypeScript integration
examples, test cases, documentation, and inspection/evaluation of supplied EEG data.
Automated code execution was used to run tests and calculate the recorded-data result.

No live ANT cap was available during this implementation. Synthetic EEG used in tests
is test input, not a participant measurement. The supplied-data result is calculated
from recordings and is not an estimate of website-confusion accuracy.

Before submission, the team should replace the placeholders in Python headers with
its actual team number and member names, review the code, correct this disclosure
to reflect subsequent human/AI contributions, and be ready to explain:

- Why volts versus microvolts matters and why ANT DC offsets are removed.
- What sample rate, channel order, EOG and unconnected mastoid channels mean.
- How non-overlapping windows, quality checks, bandpass filtering and Welch power work.
- What each of the six features measures, and why none directly measures confusion.
- How form outcomes supply labels and why windows after submission must not be used.
- Why independent trials and held-out sessions matter for leakage and validation.
- What scaling, logistic regression, regularization and class balancing do.
- Why majority-baseline and balanced accuracy matter with unequal class counts.
- Why EEG alone does not request a switch under the combined policy.
- How the frontend acknowledges a real change, and how errors/times are measured.
- Why repeated attempts, task difficulty, movement and order can confound improvement.
- What is implemented versus still unverified: vendor hardware, fNIRS, actual website
  task calibration, EEG's incremental benefit and commercial usefulness.

Primary implementation references:

- https://mne.tools/stable/generated/mne.io.read_raw_ant.html
- https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.welch.html
- https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html
- https://labstreaminglayer.readthedocs.io/

The challenge handout requires an explanation of AI use and understanding of the
generated code; this document supports that explanation but does not replace it.
