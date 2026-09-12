"""Team: TO FILL | Members: TO FILL. Small, explainable per-participant model."""

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import balanced_accuracy_score, accuracy_score, confusion_matrix


def make_model():
    return make_pipeline(StandardScaler(), LogisticRegression(
        C=0.3, class_weight="balanced", max_iter=1000, random_state=42))


def fit_calibration(trials):
    """One observation per independent trial; preprocessing stays inside CV folds.

The target is failure OR reported errors OR elapsed time beyond the configured
threshold. It is a behavioural proxy, not a neurological ground truth label.
Cross-validation here is a development diagnostic on very small same-person data.
"""
    if len(trials) < 8:
        raise ValueError("Need at least eight independent usable trials, four per outcome")
    x = np.array([t["features"] for t in trials])
    y = np.array([t["label"] for t in trials])
    counts = np.bincount(y, minlength=2)
    if counts.min() < 4:
        raise ValueError("Need at least four fluent and four failure/error/slow trials")
    cv = StratifiedKFold(n_splits=4, shuffle=True, random_state=42)
    predicted = cross_val_predict(make_model(), x, y, cv=cv)
    model = make_model().fit(x, y)
    return model, {
        "target": "failure_or_error_or_slow", "trial_count": len(y),
        "fluent_trials": int(counts[0]), "difficulty_proxy_trials": int(counts[1]),
        "cv_accuracy": float(accuracy_score(y, predicted)),
        "cv_balanced_accuracy": float(balanced_accuracy_score(y, predicted)),
        "majority_baseline_accuracy": float(counts.max() / counts.sum()),
        "confusion_matrix_actual_rows_predicted_columns": confusion_matrix(y, predicted).tolist(),
        "validation": "four-fold trial-level development CV; not independent product validation",
        "warning": "Risk score is model output, not a validated probability of confusion.",
    }
