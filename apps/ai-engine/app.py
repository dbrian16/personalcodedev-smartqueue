from flask import Flask, request, jsonify
from flask_cors import CORS
import os

from predictor import (
    DEFAULT_AVERAGE_SERVICE_TIME_MINS,
    predictor,
)

app = Flask(__name__)

cors_origins_raw = os.environ.get("CORS_ORIGINS")
if cors_origins_raw:
    cors_origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()]
    if cors_origins:
        CORS(app, origins=cors_origins)
else:
    # The three front ends run on their own ports in development, so without this
    # every browser call to the engine is blocked by the same-origin policy.
    CORS(app)


def read_common(data):
    """Pulls the shared prediction inputs, accepting the older field names too."""
    return {
        "average_service_time_mins": data.get(
            "average_service_time_mins", DEFAULT_AVERAGE_SERVICE_TIME_MINS
        ),
        "active_staff": data.get("active_staff", data.get("counters_open", 1)),
        "service_type": data.get("service_type"),
        "hour": data.get("hour"),
        "weekday": data.get("weekday"),
    }


@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json(silent=True) or {}
    common = read_common(data)
    queue_position = data.get("queue_position", data.get("people_waiting", 0))

    result = predictor.predict(queue_position=queue_position, **common)

    return jsonify({
        **result,
        "service_type": common["service_type"],
        "predicted_wait_time": result["estimated_wait_time_mins"],
    })


@app.route("/predict_batch", methods=["POST"])
def predict_batch():
    data = request.get_json(silent=True) or {}
    common = read_common(data)

    queue_positions = data.get("queue_positions")
    if queue_positions is None:
        queue_positions = data.get("people_waiting_list", [])
    if not isinstance(queue_positions, list):
        queue_positions = []

    predictions = [
        predictor.predict(queue_position=position, **common)
        for position in queue_positions
    ]

    return jsonify({
        "predictions": predictions,
        "estimated_wait_time_mins_list": [item["estimated_wait_time_mins"] for item in predictions],
        "queue_status_list": [item["queue_status"] for item in predictions],
        "predicted_wait_times": [item["estimated_wait_time_mins"] for item in predictions],
        "service_type": common["service_type"],
        "source": predictions[0]["source"] if predictions else "analytic",
    })


@app.route("/train", methods=["POST"])
def train():
    """Refits the model from served tickets supplied by the backend."""
    data = request.get_json(silent=True) or {}
    samples = data.get("samples")

    if not isinstance(samples, list):
        return jsonify({"trained": False, "reason": "samples must be a list"}), 400

    report = predictor.train(samples)
    return jsonify(report), 200 if report.get("trained") else 202


@app.route("/model")
def model_status():
    return jsonify(predictor.status())


@app.route("/health")
def health():
    return jsonify({"status": "ok", "model_trained": predictor.is_trained})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    # Loopback only: the Node backend is the sole client and calls this on
    # 127.0.0.1. None of these routes authenticate, and /train writes to the
    # model, so the service must not be reachable from the network.
    host = os.environ.get("AI_ENGINE_HOST", "127.0.0.1")
    app.run(host=host, port=port, debug=False)

