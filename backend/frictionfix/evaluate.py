"""Team: TO FILL | Members: TO FILL. Holdout flip-cup success/failure evaluation.

Train on session 01 and test once on session 02. Extract two non-overlapping EEG
windows from the four seconds BEFORE the beep; response-period EEG is excluded.
Results describe this participant's flip-cup recordings only, not website UX.
"""

import argparse
from collections import Counter
import csv
import json
from pathlib import Path
import numpy as np
from sklearn.metrics import accuracy_score, balanced_accuracy_score, confusion_matrix, roc_auc_score
from .bridge import open_ant
from .calibration import make_model
from .signal import extract_features, FEATURE_NAMES

DEFAULT_CHANNELS = ["F3", "Fz", "F4", "FC1", "FC2", "C3", "Cz", "C4", "P3", "Pz", "P4", "Oz"]


def load_trials(cnt, trg, behavioral_csv=None):
    raw = open_ant(cnt, DEFAULT_CHANNELS)
    rate = raw.info["sfreq"]
    markers = []
    for line in Path(trg).read_text().splitlines()[1:]:
        parts = line.split()
        if len(parts) >= 3 and parts[2] in {"1", "2", "4", "8", "64", "128"}:
            markers.append((float(parts[0]), int(parts[2])))
    pairs = []
    trial_start = cue = None
    for timestamp, code in markers:
        if code == 1:
            trial_start, cue = timestamp, None
        elif code == 2 and trial_start is not None:
            cue = timestamp
        elif code in {4, 8} and cue is not None:
            pairs.append((trial_start, cue, int(code == 8)))  # 1 = failure
            trial_start = cue = None
    if behavioral_csv:
        with Path(behavioral_csv).open(encoding="utf-8-sig", newline="") as f:
            labels = [int(row["make_or_miss.keys"] == "n") for row in csv.DictReader(f)]
        if labels != [p[2] for p in pairs]:
            raise ValueError("Behavioural labels do not match ordered EEG outcomes; do not silently align")
    features, targets, rejected = [], [], Counter()
    for start, cue, label in pairs:
        if cue - start < 4:
            rejected["too_short_before_cue"] += 1
            continue
        end_sample = round(cue * rate)
        first = end_sample - int(4 * rate)
        if first < 0 or end_sample > raw.n_times:
            rejected["out_of_bounds"] += 1
            continue
        data = raw.get_data(start=first, stop=end_sample).T * 1e6
        n = int(2 * rate)
        windows = [extract_features(data[:n], rate), extract_features(data[n:], rate)]
        if any(w.features is None for w in windows):
            rejected["poor_signal"] += 1
            continue
        features.append(np.mean([w.features for w in windows], axis=0))
        targets.append(label)
    return np.asarray(features), np.asarray(targets), {
        "total_trials": len(pairs), "usable_trials": len(targets),
        "rejected": dict(rejected), "usable_outcomes": dict(Counter(map(int, targets))),
        "behavioral_labels_verified": behavioral_csv is not None,
    }


def evaluate(train_cnt, train_trg, test_cnt, test_trg, train_csv=None, test_csv=None):
    x_train, y_train, train_summary = load_trials(train_cnt, train_trg, train_csv)
    x_test, y_test, test_summary = load_trials(test_cnt, test_trg, test_csv)
    if len(y_train) < 8 or len(np.unique(y_train)) < 2 or len(np.unique(y_test)) < 2:
        raise ValueError("Insufficient usable trials in both classes; cannot produce a meaningful holdout report")
    model = make_model().fit(x_train, y_train)
    predicted = model.predict(x_test)
    scores = model.predict_proba(x_test)[:, 1]
    majority = int(np.bincount(y_train).argmax())
    baseline = np.full_like(y_test, majority)
    return {
        "task": "flip_cup", "label_1": "failure", "source": "provided_recordings",
        "design": "Train session 01, held-out session 02; one participant; no tuning on test results",
        "window": "four seconds before cue; mean of two 2-second windows",
        "channels": DEFAULT_CHANNELS, "feature_names": FEATURE_NAMES,
        "train": train_summary, "test": test_summary,
        "eeg_model": {"accuracy": float(accuracy_score(y_test, predicted)),
                      "balanced_accuracy": float(balanced_accuracy_score(y_test, predicted)),
                      "roc_auc": float(roc_auc_score(y_test, scores)),
                      "confusion_matrix_actual_rows_predicted_columns": confusion_matrix(y_test, predicted).tolist()},
        "training_majority_baseline": {"predicted_class": majority,
                      "accuracy": float(accuracy_score(y_test, baseline)),
                      "balanced_accuracy": float(balanced_accuracy_score(y_test, baseline))},
        "limitations": ["Single participant and two sessions; not population validation.",
                        "Flip-cup outcomes do not label website confusion.",
                        "This baseline does not measure EEG benefit beyond website behaviour.",
                        "Heuristic quality rejection may change the evaluated trial population."],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("train-cnt", "train-trg", "test-cnt", "test-trg"):
        parser.add_argument(f"--{name}", required=True)
    for name in ("train-csv", "test-csv", "output"):
        parser.add_argument(f"--{name}")
    args = parser.parse_args()
    try:
        report = evaluate(args.train_cnt, args.train_trg, args.test_cnt, args.test_trg,
                          args.train_csv, args.test_csv)
        serialized = json.dumps(report, indent=2)
        if args.output:
            output = Path(args.output)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(serialized + "\n")
        print(serialized)
    except (ValueError, OSError, ImportError) as exc:
        parser.exit(1, f"{exc}\n")


if __name__ == "__main__":
    main()
