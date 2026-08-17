import json
import random
import unittest

from app import app
from predictor import predictor


class TestAIEngine(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        # Every assertion below describes the analytic baseline, which is what an
        # untrained engine must answer. A model left on disk by a previous run
        # would otherwise silently change these numbers.
        predictor.reset()

    def test_health(self):
        response = self.app.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.data)["status"], "ok")

    def test_predict_standard_new_input(self):
        payload = {
            "queue_position": 4,
            "average_service_time_mins": 5,
            "active_staff": 2,
            "service_type": "consultation"
        }

        response = self.app.post(
            "/predict",
            data=json.dumps(payload),
            content_type="application/json"
        )

        data = json.loads(response.data)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["estimated_wait_time_mins"], 10)
        self.assertEqual(data["queue_status"], "Medium")
        self.assertEqual(data["available"], True)
        self.assertEqual(data["service_type"], "consultation")

    def test_predict_supports_old_backend_input(self):
        payload = {
            "people_waiting": 4,
            "counters_open": 2
        }

        response = self.app.post(
            "/predict",
            data=json.dumps(payload),
            content_type="application/json"
        )

        data = json.loads(response.data)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["estimated_wait_time_mins"], 10)
        self.assertEqual(data["predicted_wait_time"], 10)
        self.assertEqual(data["queue_status"], "Medium")

    def test_predict_empty_queue(self):
        payload = {
            "queue_position": 0,
            "average_service_time_mins": 5,
            "active_staff": 2
        }

        response = self.app.post(
            "/predict",
            data=json.dumps(payload),
            content_type="application/json"
        )

        data = json.loads(response.data)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["estimated_wait_time_mins"], 0)
        self.assertEqual(data["queue_status"], "Low")
        self.assertEqual(data["available"], True)

    def test_predict_zero_active_staff(self):
        payload = {
            "queue_position": 4,
            "average_service_time_mins": 5,
            "active_staff": 0
        }

        response = self.app.post(
            "/predict",
            data=json.dumps(payload),
            content_type="application/json"
        )

        data = json.loads(response.data)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["estimated_wait_time_mins"], None)
        self.assertEqual(data["queue_status"], "Unavailable")
        self.assertEqual(data["available"], False)

    def test_queue_status_low(self):
        payload = {
            "queue_position": 1,
            "average_service_time_mins": 5,
            "active_staff": 1
        }

        response = self.app.post(
            "/predict",
            data=json.dumps(payload),
            content_type="application/json"
        )

        data = json.loads(response.data)

        self.assertEqual(data["estimated_wait_time_mins"], 5)
        self.assertEqual(data["queue_status"], "Low")

    def test_queue_status_busy(self):
        payload = {
            "queue_position": 5,
            "average_service_time_mins": 5,
            "active_staff": 1
        }

        response = self.app.post(
            "/predict",
            data=json.dumps(payload),
            content_type="application/json"
        )

        data = json.loads(response.data)

        self.assertEqual(data["estimated_wait_time_mins"], 25)
        self.assertEqual(data["queue_status"], "Busy")

    def test_predict_batch(self):
        payload = {
            "queue_positions": [0, 1, 4],
            "average_service_time_mins": 5,
            "active_staff": 2
        }

        response = self.app.post(
            "/predict_batch",
            data=json.dumps(payload),
            content_type="application/json"
        )

        data = json.loads(response.data)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["estimated_wait_time_mins_list"], [0, 2, 10])
        self.assertEqual(data["queue_status_list"], ["Low", "Low", "Medium"])
        self.assertEqual(data["predicted_wait_times"], [0, 2, 10])

    def test_predict_empty_payload(self):
        response = self.app.post(
            "/predict",
            data=json.dumps({}),
            content_type="application/json"
        )

        data = json.loads(response.data)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["estimated_wait_time_mins"], 0)
        self.assertEqual(data["queue_status"], "Low")

    def test_untrained_predictions_are_marked_analytic(self):
        response = self.app.post(
            "/predict",
            data=json.dumps({"queue_position": 3, "average_service_time_mins": 5, "active_staff": 1}),
            content_type="application/json"
        )
        self.assertEqual(json.loads(response.data)["source"], "analytic")


class TestModelTraining(unittest.TestCase):
    """The learned path: it must refuse bad data and only adopt a model that helps."""

    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        predictor.reset()

    def tearDown(self):
        predictor.reset()

    def test_train_rejects_non_list(self):
        response = self.app.post(
            "/train",
            data=json.dumps({"samples": "nope"}),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(json.loads(response.data)["trained"])

    def test_train_needs_enough_history(self):
        samples = [{
            "queue_position": 2, "active_staff": 1, "average_service_time_mins": 5,
            "hour": 10, "weekday": 2, "service_type": "General Inquiry",
            "actual_wait_mins": 9
        } for _ in range(5)]

        response = self.app.post(
            "/train", data=json.dumps({"samples": samples}), content_type="application/json"
        )

        body = json.loads(response.data)
        self.assertEqual(response.status_code, 202)
        self.assertFalse(body["trained"])
        self.assertEqual(body["reason"], "not enough samples")

    def test_train_learns_a_systematic_bias_and_beats_the_baseline(self):
        """The centre where every session runs at double the recorded average.

        The formula is systematically half of reality here, so a fitted model has
        a real edge to find — exactly the case a learned estimator should handle.
        """
        random.seed(7)
        samples = []
        for _ in range(240):
            position = random.randint(1, 8)
            staff = random.randint(1, 3)
            service_time = 5
            true_wait = (position * service_time * 2) / staff + random.uniform(-1, 1)
            samples.append({
                "queue_position": position,
                "active_staff": staff,
                "average_service_time_mins": service_time,
                "hour": random.randint(8, 16),
                "weekday": random.randint(0, 4),
                "service_type": "General Inquiry",
                "actual_wait_mins": round(max(0.5, true_wait), 2),
            })

        response = self.app.post(
            "/train", data=json.dumps({"samples": samples}), content_type="application/json"
        )
        report = json.loads(response.data)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(report["trained"], report)
        self.assertLess(report["model_mae_mins"], report["baseline_mae_mins"])

        prediction = self.app.post(
            "/predict",
            data=json.dumps({
                "queue_position": 4, "average_service_time_mins": 5, "active_staff": 2,
                "service_type": "General Inquiry", "hour": 10, "weekday": 2
            }),
            content_type="application/json"
        )
        body = json.loads(prediction.data)
        self.assertEqual(body["source"], "model")
        # The baseline would say 10; the learned answer should sit near the truth of 20.
        self.assertGreater(body["estimated_wait_time_mins"], 13)

    def test_model_endpoint_reports_state(self):
        body = json.loads(self.app.get("/model").data)
        self.assertIn("trained", body)
        self.assertFalse(body["trained"])


if __name__ == "__main__":
    unittest.main()
