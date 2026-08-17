"""Wait-time prediction model.

Previously, the code was "one division: people waiting
x average service time / staff on duty". That division is still here — it is a
sound queueing baseline and it is what answers before any history exists — but it
is now the *floor*, not the whole story.

Once enough tickets have been served, a scikit-learn regressor is fitted on what
actually happened: how long each ticket really waited, given the queue depth, the
staffing and the time of day when it was issued. The model is only adopted if it
beats the baseline on held-out data, so a bad fit can never make predictions worse
than the formula it replaces.
"""
from __future__ import annotations

import json
import math
import os
import threading
from collections import Counter, defaultdict
from datetime import datetime, timezone

DEFAULT_AVERAGE_SERVICE_TIME_MINS = 5
MAX_WAIT_MINS = 240
MIN_TRAINING_SAMPLES = 30
# Mirrors ACTIVE_STAFF_STATUSES in the backend: what "on duty" means, once.
ACTIVE_STAFF_STATUSES = ("online", "busy", "serving", "active")

MODEL_DIR = os.environ.get(
    "AI_MODEL_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "model")
)
MODEL_PATH = os.path.join(MODEL_DIR, "wait_model.joblib")
METADATA_PATH = os.path.join(MODEL_DIR, "wait_model.json")

try:  # scikit-learn is optional: without it the service still answers, analytically.
    import numpy as np
    from joblib import dump, load
    from sklearn.ensemble import GradientBoostingRegressor
    from sklearn.metrics import mean_absolute_error
    from sklearn.model_selection import train_test_split

    SKLEARN_AVAILABLE = True
    SKLEARN_ERROR = None
except Exception as exc:  # pragma: no cover - exercised only on a broken install
    SKLEARN_AVAILABLE = False
    SKLEARN_ERROR = str(exc)


def to_number(value, default=0):
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def classify_queue_status(eta_mins):
    if eta_mins < 10:
        return "Low"
    if eta_mins <= 20:
        return "Medium"
    return "Busy"


def baseline_eta(queue_position, average_service_time_mins, active_staff):
    """The queueing formula. Returns None when nobody is on duty to serve."""
    position = max(0, to_number(queue_position, 0))
    service_time = max(
        0, to_number(average_service_time_mins, DEFAULT_AVERAGE_SERVICE_TIME_MINS)
    )
    staff = int(max(0, to_number(active_staff, 0)))

    # Staff is checked before position: being first in line at a counter nobody
    # is sitting at is an unknown wait, not a zero-minute one.
    if staff <= 0:
        return None
    if position == 0:
        return 0.0

    return (position * service_time) / staff


class WaitTimePredictor:
    """Holds the fitted model, its vocabulary and its quality metrics."""

    def __init__(self):
        self._lock = threading.Lock()
        self._model = None
        self._services = []
        self._metadata = {}
        self._load_from_disk()

    # ── feature engineering ────────────────────────────────────────────────
    def _service_index(self, service_type):
        name = (service_type or "").strip().lower()
        try:
            return self._services.index(name)
        except ValueError:
            return -1

    def _featurise(self, sample):
        """One row: the raw conditions plus the baseline the model is correcting.

        Handing the model the analytic estimate as a feature means it only has to
        learn the *residual* — how this centre deviates from textbook queueing —
        which is a far easier target on a few hundred tickets than the wait itself.
        """
        position = to_number(sample.get("queue_position"), 0)
        staff = max(1.0, to_number(sample.get("active_staff"), 1))
        service_time = to_number(
            sample.get("average_service_time_mins"), DEFAULT_AVERAGE_SERVICE_TIME_MINS
        )
        hour = to_number(sample.get("hour"), 12)
        weekday = to_number(sample.get("weekday"), 3)
        baseline = baseline_eta(position, service_time, staff) or 0.0

        row = [
            position,
            staff,
            service_time,
            baseline,
            position / staff,
            # Time of day is cyclical: 23:00 sits next to 00:00, not 23 units away.
            math.sin(2 * math.pi * hour / 24),
            math.cos(2 * math.pi * hour / 24),
            weekday,
        ]

        one_hot = [0.0] * len(self._services)
        index = self._service_index(sample.get("service_type"))
        if index >= 0:
            one_hot[index] = 1.0

        return row + one_hot

    # ── persistence ────────────────────────────────────────────────────────
    def _load_from_disk(self):
        if not SKLEARN_AVAILABLE:
            return
        try:
            if os.path.exists(MODEL_PATH) and os.path.exists(METADATA_PATH):
                with open(METADATA_PATH, "r", encoding="utf-8") as handle:
                    self._metadata = json.load(handle)
                self._services = list(self._metadata.get("services", []))
                self._model = load(MODEL_PATH)
        except Exception:
            # A corrupt or version-mismatched artefact must not stop the service;
            # the baseline still answers every request.
            self._model = None
            self._metadata = {}
            self._services = []

    def _save_to_disk(self):
        os.makedirs(MODEL_DIR, exist_ok=True)
        dump(self._model, MODEL_PATH)
        with open(METADATA_PATH, "w", encoding="utf-8") as handle:
            json.dump(self._metadata, handle, indent=2)

    def reset(self):
        """Drops the fitted model. Used by tests to assert baseline behaviour."""
        with self._lock:
            self._model = None
            self._services = []
            self._metadata = {}

    # ── inference ──────────────────────────────────────────────────────────
    @property
    def is_trained(self):
        return self._model is not None

    def status(self):
        return {
            "sklearn_available": SKLEARN_AVAILABLE,
            "sklearn_error": SKLEARN_ERROR,
            "trained": self.is_trained,
            "model": "GradientBoostingRegressor" if self.is_trained else "analytic-baseline",
            "min_training_samples": MIN_TRAINING_SAMPLES,
            **self._metadata,
        }

    def predict(self, queue_position, average_service_time_mins, active_staff, service_type=None, hour=None, weekday=None):
        """Estimates the wait for one place in the queue.

        Returns the same shape the backend has always consumed, plus `source` so
        the dashboard can tell a learned estimate from the fallback.
        """
        base = baseline_eta(queue_position, average_service_time_mins, active_staff)

        if base is None:
            return {
                "estimated_wait_time_mins": None,
                "queue_status": "Unavailable",
                "available": False,
                "source": "analytic",
            }

        if base == 0:
            return {
                "estimated_wait_time_mins": 0,
                "queue_status": "Low",
                "available": True,
                "source": "analytic",
            }

        eta = base
        source = "analytic"

        if self.is_trained:
            now = datetime.now(timezone.utc).astimezone()
            sample = {
                "queue_position": queue_position,
                "active_staff": active_staff,
                "average_service_time_mins": average_service_time_mins,
                "service_type": service_type,
                "hour": now.hour if hour is None else hour,
                "weekday": now.weekday() if weekday is None else weekday,
            }
            try:
                predicted = float(self._model.predict(np.array([self._featurise(sample)]))[0])
                if math.isfinite(predicted):
                    # Clamped to a sane band: a model is an estimator, not an oracle,
                    # and a wild value on the kiosk is worse than a plain formula.
                    eta = min(max(predicted, 0.0), MAX_WAIT_MINS)
                    source = "model"
            except Exception:
                eta = base
                source = "analytic"

        rounded = int(round(eta))
        return {
            "estimated_wait_time_mins": rounded,
            "queue_status": classify_queue_status(rounded),
            "available": True,
            "source": source,
        }

    # ── training ───────────────────────────────────────────────────────────
    def train(self, samples):
        """Fits a new model and keeps it only if it beats the baseline.

        @param samples: rows of {queue_position, active_staff,
            average_service_time_mins, hour, weekday, service_type,
            actual_wait_mins}
        @returns: a report describing what happened, never raising on bad input.
        """
        if not SKLEARN_AVAILABLE:
            return {"trained": False, "reason": "scikit-learn is not installed", "error": SKLEARN_ERROR}

        usable = [
            sample for sample in samples
            if isinstance(sample, dict)
            and math.isfinite(to_number(sample.get("actual_wait_mins"), float("nan")))
            and 0 < to_number(sample.get("actual_wait_mins"), 0) <= MAX_WAIT_MINS
        ]

        if len(usable) < MIN_TRAINING_SAMPLES:
            return {
                "trained": False,
                "reason": "not enough samples",
                "samples": len(usable),
                "required": MIN_TRAINING_SAMPLES,
            }

        with self._lock:
            previous_services = self._services
            self._services = sorted({
                (sample.get("service_type") or "").strip().lower() for sample in usable
            })

            try:
                features = np.array([self._featurise(sample) for sample in usable], dtype=float)
                targets = np.array(
                    [to_number(sample.get("actual_wait_mins"), 0) for sample in usable], dtype=float
                )
                # Column 3 is the analytic estimate, which is the yardstick the
                # model has to beat before it is allowed to replace it.
                baselines = features[:, 3]

                x_train, x_test, y_train, y_test, _, base_test = train_test_split(
                    features, targets, baselines, test_size=0.25, random_state=42
                )

                model = GradientBoostingRegressor(
                    n_estimators=200,
                    learning_rate=0.05,
                    max_depth=3,
                    random_state=42,
                )
                model.fit(x_train, y_train)

                model_mae = float(mean_absolute_error(y_test, model.predict(x_test)))
                baseline_mae = float(mean_absolute_error(y_test, base_test))

                if model_mae >= baseline_mae:
                    self._services = previous_services
                    return {
                        "trained": False,
                        "reason": "model did not beat the analytic baseline",
                        "samples": len(usable),
                        "model_mae_mins": round(model_mae, 2),
                        "baseline_mae_mins": round(baseline_mae, 2),
                    }

                self._model = model
                self._metadata = {
                    "services": self._services,
                    "samples": len(usable),
                    "model_mae_mins": round(model_mae, 2),
                    "baseline_mae_mins": round(baseline_mae, 2),
                    "improvement_pct": round((1 - model_mae / baseline_mae) * 100, 1) if baseline_mae else 0,
                    "trained_at": datetime.now(timezone.utc).isoformat(),
                }
                self._save_to_disk()

                return {"trained": True, **self._metadata}
            except Exception as exc:
                self._services = previous_services
                return {"trained": False, "reason": "training failed", "error": str(exc)}


predictor = WaitTimePredictor()
