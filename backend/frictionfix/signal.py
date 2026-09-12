"""Team: TO FILL | Members: TO FILL. EEG quality and feature extraction.

Non-overlapping 2-second windows. Units are microvolts. Quality is checked BEFORE
filtering; bad channels are excluded and at least 80% (minimum two) must survive.
Thresholds are prototype heuristics, not clinical quality certification.
"""

from dataclasses import dataclass
import numpy as np
from scipy.signal import butter, sosfiltfilt, welch

FEATURE_NAMES = ("log_theta", "log_alpha", "log_beta", "theta_fraction",
                 "alpha_fraction", "theta_beta_log_ratio")
WINDOW_SECONDS = 2


@dataclass
class WindowResult:
    quality: str
    reasons: list[str]
    good_channels: int
    total_channels: int
    features: list[float] | None


def extract_features(samples_uv: np.ndarray, sample_rate: float) -> WindowResult:
    """Return six across-channel median features; reject nonfinite/artifact windows.

Shape is (samples, channels). Filtering is limited to this already-received
window; no samples after a prediction or trial outcome enter the calculation.
Relative powers and band ratios are candidates for task prediction, not direct
measurements of confusion, stress or attention.
"""
    x = np.asarray(samples_uv, dtype=float)
    if x.ndim != 2 or x.shape[0] != int(sample_rate * WINDOW_SECONDS):
        raise ValueError("Expected exactly two seconds of samples × channels")
    total = x.shape[1]
    finite = np.isfinite(x).all(axis=0)
    safe = np.where(np.isfinite(x), x, 0)
    # ANT recordings can contain large electrode DC offsets. Centre each channel
    # before amplitude checks; the offset alone is not an oscillatory artifact.
    safe = safe - np.median(safe, axis=0)
    flat = np.std(safe, axis=0) < 0.1
    amplitude = np.ptp(safe, axis=0) > 250
    jumps = np.max(np.abs(np.diff(safe, axis=0)), axis=0) > 100
    good = finite & ~flat & ~amplitude & ~jumps
    reasons = []
    for mask, name in [(~finite, "nonfinite"), (flat, "flatline"),
                       (amplitude, "large_amplitude"), (jumps, "abrupt_jump")]:
        if mask.any():
            reasons.append(name)
    n_good = int(good.sum())
    if n_good < max(2, int(np.ceil(0.8 * total))):
        return WindowResult("poor", reasons, n_good, total, None)
    sos = butter(4, [1, 40], btype="bandpass", fs=sample_rate, output="sos")
    clean = sosfiltfilt(sos, safe[:, good], axis=0)
    freq, power = welch(clean, fs=sample_rate, nperseg=int(sample_rate), axis=0)
    def band(low, high):
        return np.sum(power[(freq >= low) & (freq < high)], axis=0) * (freq[1] - freq[0])
    theta, alpha, beta, total_power = band(4, 8), band(8, 13), band(13, 30), band(1, 40)
    eps = 1e-12
    features = np.median(np.column_stack([
        np.log10(theta + eps), np.log10(alpha + eps), np.log10(beta + eps),
        theta / (total_power + eps), alpha / (total_power + eps),
        np.log10((theta + eps) / (beta + eps)),
    ]), axis=0).tolist()
    return WindowResult("usable", reasons, n_good, total, features)


class WindowBuffer:
    """Assemble continuous chunks; missing/out-of-order data must never be spliced."""

    def __init__(self, sample_rate: float, n_channels: int):
        self.sample_rate = sample_rate
        self.n_channels = n_channels
        self.size = int(sample_rate * WINDOW_SECONDS)
        self.samples = np.empty((0, n_channels))
        self.next_time = None
        self.last_sequence = -1

    def clear_samples(self):
        self.samples = np.empty((0, self.n_channels))

    def push(self, samples, sequence: int, start_time: float):
        x = np.asarray(samples, dtype=float)
        if x.ndim != 2 or x.shape[1] != self.n_channels:
            raise ValueError(f"samples must be samples × {self.n_channels} channels")
        if len(x) > self.size:
            raise ValueError("Send at most two seconds per chunk")
        if not np.isfinite(x).all():
            raise ValueError("EEG samples must be finite")
        if sequence <= self.last_sequence:
            raise ValueError("Chunk sequence must strictly increase; duplicate/reordered chunk")
        if self.next_time is not None and start_time < self.next_time - 1.5 / self.sample_rate:
            raise ValueError("Source timestamps overlap or run backwards")
        gap = self.next_time is not None and (
            abs(start_time - self.next_time) > 1.5 / self.sample_rate
            or sequence != self.last_sequence + 1
        )
        if gap:
            self.clear_samples()
        self.last_sequence = sequence
        self.next_time = start_time + len(x) / self.sample_rate
        self.samples = np.concatenate([self.samples, x])
        windows = []
        while len(self.samples) >= self.size:
            windows.append(self.samples[:self.size].copy())
            self.samples = self.samples[self.size:]
        return windows, gap
