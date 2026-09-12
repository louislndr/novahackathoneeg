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
    """One observation per independent calibration interval; preprocessing stays inside CV folds.

The label (0 = low_friction, 1 = high_friction) is supplied directly by the
researcher/participant for each interval -- it is not derived from task success or
elapsed time. Cross-validation here is a development diagnostic on very small
same-person data, not product validation.
"""
    if len(trials) < 8:
        raise ValueError("Need at least eight independent usable calibration intervals, four per label")
    x = np.array([t["features"] for t in trials])
    y = np.array([t["label"] for t in trials])
    counts = np.bincount(y, minlength=2)
    if counts.min() < 4:
        raise ValueError("Need at least four low_friction and four high_friction intervals")
    cv = StratifiedKFold(n_splits=4, shuffle=True, random_state=42)
    predicted = cross_val_predict(make_model(), x, y, cv=cv)
    model = make_model().fit(x, y)
    return model, {
        "target": "researcher_labelled_low_or_high_friction", "trial_count": len(y),
        "low_friction_trials": int(counts[0]), "high_friction_trials": int(counts[1]),
        "cv_accuracy": float(accuracy_score(y, predicted)),
        "cv_balanced_accuracy": float(balanced_accuracy_score(y, predicted)),
        "majority_baseline_accuracy": float(counts.max() / counts.sum()),
        "confusion_matrix_actual_rows_predicted_columns": confusion_matrix(y, predicted).tolist(),
        "validation": "four-fold trial-level development CV; not independent product validation",
        "warning": "Risk score is model output, not a validated probability of confusion.",
    }
