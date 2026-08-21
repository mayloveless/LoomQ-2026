"""SpinQ 真机 Web 服务的离线边界测试。"""

import os
import unittest
from unittest import mock

from loomq import real_hardware


class RealHardwareServiceTests(unittest.TestCase):
    @mock.patch.dict(os.environ, {}, clear=True)
    def test_default_backend_is_online_spinq_hardware(self):
        self.assertEqual("gemini_vp", real_hardware._backend())

    @mock.patch.dict(os.environ, {"SPINQ_BACKEND": "triangulum_vp"})
    def test_vp_backend_code_is_allowed_when_the_cloud_marks_it_non_simulated(self):
        self.assertEqual("triangulum_vp", real_hardware._backend())

    @mock.patch.dict(
        os.environ,
        {
            "SPINQ_USERNAME": "",
            "SPINQCLOUDUSERNAME": "",
            "SPINQ_KEY_PATH": "",
            "PRIVATEKEYPATH": "",
        },
    )
    def test_missing_credentials_are_reported_without_sensitive_details(self):
        self.assertEqual(
            {"spinq": {"available": False, "reason": "真实量子设备未配置"}},
            real_hardware.capability_status(),
        )

    @mock.patch("loomq.real_hardware.submit_spinq_cloud.submit_task", return_value="task-123")
    @mock.patch("loomq.real_hardware.submit_spinq_cloud.dry_run", return_value=("source", "program"))
    @mock.patch("loomq.real_hardware._configured", return_value=(True, ""))
    @mock.patch("loomq.real_hardware._backend", return_value="gemini_vp")
    def test_submit_bell_reuses_script_submission(
        self, backend, configured, dry_run, submit_task
    ):
        payload = real_hardware.submit_bell()

        self.assertEqual(
            {"job_id": "task-123", "status": "submitted", "platform": "spinq"}, payload
        )
        dry_run.assert_called_once()
        self.assertEqual(real_hardware.RUNTIME_OUTPUT, submit_task.call_args.args[4])

    @mock.patch("loomq.real_hardware.submit_spinq_cloud.query_task", return_value=("completed", {"counts": {"00": 1}}))
    @mock.patch("loomq.real_hardware._require_configured", return_value="gemini_vp")
    def test_get_job_returns_normalized_status(self, configured, query_task):
        self.assertEqual(
            {"job_id": "task-123", "status": "completed", "result": {"counts": {"00": 1}}},
            real_hardware.get_job("task-123"),
        )
        query_task.assert_called_once_with("task-123", real_hardware.RUNTIME_OUTPUT)


if __name__ == "__main__":
    unittest.main()
