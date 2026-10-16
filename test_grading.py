import unittest

from backend import grade_predictions


class GradePredictionsTests(unittest.TestCase):
    def test_zero_detections_are_ungraded_and_never_pass(self):
        result = grade_predictions([], confidence_percent=35)
        self.assertIsNone(result["qualityScore"])
        self.assertEqual(result["verdict"], "NO DETECTIONS")
        self.assertFalse(result["gradeAvailable"])

    def test_confidence_percent_filters_fractional_confidence_without_grading(self):
        result = grade_predictions(
            [
                {"class": "GoodSoldering", "confidence": 0.9},
                {"class": "Short", "confidence": 0.2},
            ],
            confidence_percent=35,
        )
        self.assertEqual(result["total"], 1)
        self.assertIsNone(result["qualityScore"])
        self.assertEqual(result["verdict"], "FINDINGS ONLY")
        self.assertFalse(result["gradeAvailable"])

    def test_even_all_good_class_detections_never_claim_board_grade(self):
        result = grade_predictions(
            [
                {"class": "GoodSoldering", "confidence": 0.95},
                {"class": "GoodSoldering", "confidence": 0.88},
                {"class": "Short", "confidence": 0.91},
            ],
            confidence_percent=35,
        )
        self.assertEqual((result["good"], result["defects"], result["total"]), (2, 1, 3))
        self.assertIsNone(result["qualityScore"])
        self.assertEqual(result["verdict"], "FINDINGS ONLY")
        self.assertFalse(result["gradeAvailable"])

    def test_known_defects_are_findings_and_unknown_classes_are_not_called_defects(self):
        result = grade_predictions(
            [{"class": "UnexpectedLabel", "confidence": 0.99}],
            confidence_percent=35,
        )
        self.assertEqual(result["defects"], 0)
        self.assertEqual(result["other"], 1)
        self.assertIsNone(result["qualityScore"])
        self.assertEqual(result["verdict"], "FINDINGS ONLY")
        self.assertFalse(result["gradeAvailable"])


if __name__ == "__main__":
    unittest.main()
