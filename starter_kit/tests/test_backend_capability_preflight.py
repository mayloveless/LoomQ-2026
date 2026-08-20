"""Backend capability snapshot release preflight tests."""

import unittest

from scripts.audit_backend_capability_snapshot import (
    CASE_SET_VERSION,
    PINNED_BACKEND_IDS,
    PINNED_CAPABILITY_SHA256,
    PINNED_CAPABILITY_VERSION,
    REGRESSION_CASES,
    build_report,
)


class BackendCapabilityPreflightTests(unittest.TestCase):
    def test_release_baseline_is_explicit_and_versioned(self):
        self.assertEqual(
            CASE_SET_VERSION,
            "backend-capability-preflight-2026-08-20-v1",
        )
        self.assertEqual(PINNED_CAPABILITY_VERSION, "2026-07")
        self.assertEqual(
            PINNED_CAPABILITY_SHA256,
            "1d1c2511e01c58c951f0ba9a1a59d8465b37007ae8259280c008caeac1f5cd7b",
        )
        self.assertEqual(len(PINNED_BACKEND_IDS), 6)
        self.assertEqual(len(REGRESSION_CASES), 8)

    def test_snapshot_contract_and_git_drift_checks_pass(self):
        report = build_report()

        self.assertEqual(report["status"], "PASS")
        self.assertEqual(report["capability"]["version"], "2026-07")
        self.assertEqual(report["capability"]["backend_count"], 6)
        self.assertEqual(
            report["capability"]["content_sha256"],
            PINNED_CAPABILITY_SHA256,
        )
        self.assertTrue(report["git_drift"]["working_tree_matches_head"])
        self.assertTrue(report["git_drift"]["working_tree_matches_upstream"])
        self.assertTrue(report["git_drift"]["head_matches_upstream"])
        self.assertTrue(all(check["passed"] for check in report["contract_checks"]))

    def test_selector_regressions_are_exact_ordered_and_never_invent_ids(self):
        report = build_report()

        self.assertEqual(report["regression_summary"]["failed"], 0)
        self.assertEqual(report["regression_summary"]["total"], 8)
        known_ids = set(PINNED_BACKEND_IDS)
        for entry in report["selector_regressions"]:
            with self.subTest(case_id=entry["case_id"]):
                self.assertEqual(entry["status"], "PASS")
                self.assertEqual(entry["selector_result"], entry["expected_result"])
                self.assertEqual(entry["invented_backend_ids"], [])
                self.assertTrue(set(entry["selector_result"]).issubset(known_ids))
                self.assertEqual(entry["no_match"], not bool(entry["selector_result"]))


if __name__ == "__main__":
    unittest.main()
