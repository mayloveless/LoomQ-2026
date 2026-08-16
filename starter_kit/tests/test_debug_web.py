"""Task 13B tests for the thin local debug HTTP boundary."""

from http import HTTPStatus
import io
import json
import unittest
from unittest import mock

from loomq.debug_trace import TraceRecorder
from loomq.debug_web import (
    DebugRequestHandler,
    build_debug_payload,
    build_repair_payload,
)
from loomq.teaching_explainer import TeachingExplanation, TeachingStep


class DebugWebSerializationTests(unittest.TestCase):
    def test_payload_reuses_shared_builder_and_serializes_events(self):
        recorder = TraceRecorder()
        event = recorder.emit(
            layer="agent",
            stage="intent",
            executor="llm",
            status="ok",
            summary="模型已识别任务。",
            data={"task_type": "generate_qasm"},
        )
        builder = mock.Mock(return_value=("reply", (event,)))

        explainer = mock.Mock(return_value=None)
        payload = build_debug_payload(
            "Bell", debug_builder=builder, teaching_explainer=explainer
        )

        builder.assert_called_once_with("Bell")
        self.assertEqual(payload["reply"], "reply")
        self.assertEqual(payload["events"][0], event.as_dict())
        self.assertIsNone(payload["teaching"])
        explainer.assert_not_called()
        json.dumps(payload, ensure_ascii=False)

    def test_repair_payload_keeps_invalid_input_diagnostic_and_still_runs_agent(self):
        recorder = TraceRecorder()
        recorder.emit(
            layer="agent",
            stage="parser_validation",
            executor="local",
            status="ok",
            summary="final parser ok",
        )
        recorder.emit(
            layer="agent",
            stage="agent_result",
            executor="local",
            status="ok",
            summary="final",
            data={"qasm": "OPENQASM 2.0;\nqreg q[1];", "repaired": False},
        )
        builder = mock.Mock(return_value=("reply with unrelated code", recorder.events))

        payload = build_repair_payload(
            "生成一个单量子比特程序",
            "OPENQASM 2.0;\nqreg q[1]",
            debug_builder=builder,
        )

        self.assertEqual(payload["input_validation"]["status"], "error")
        self.assertIn("Parse", payload["input_validation"]["diagnostic"])
        builder.assert_called_once()
        repair_prompt = builder.call_args.args[0]
        self.assertIn("用户期望：生成一个单量子比特程序", repair_prompt)
        self.assertIn("OPENQASM 2.0;\nqreg q[1]", repair_prompt)
        self.assertEqual(payload["repaired_qasm"], "OPENQASM 2.0;\nqreg q[1];")
        self.assertNotIn("teaching", payload)

    def test_repair_payload_reports_only_syntax_for_valid_original_input(self):
        recorder = TraceRecorder()
        recorder.emit(
            layer="agent",
            stage="agent_result",
            executor="local",
            status="ok",
            summary="final",
            data={"qasm": "OPENQASM 2.0;\nqreg q[1];"},
        )
        payload = build_repair_payload(
            "保持零态",
            "OPENQASM 2.0;\nqreg q[1];",
            debug_builder=mock.Mock(return_value=("reply", recorder.events)),
        )

        self.assertEqual(
            payload["input_validation"], {"status": "ok", "diagnostic": None}
        )
        self.assertNotIn("semantic", payload["input_validation"])

    def test_explainer_receives_only_final_validated_qasm_and_real_circuit(self):
        recorder = TraceRecorder()
        recorder.emit(
            layer="agent",
            stage="qasm_candidate",
            executor="llm",
            status="ok",
            summary="candidate",
            data={"qasm": "UNVALIDATED"},
        )
        recorder.emit(
            layer="agent",
            stage="agent_result",
            executor="local",
            status="ok",
            summary="final",
            data={"qasm": "OPENQASM 2.0;\nqreg q[1];"},
        )
        circuit_event = recorder.emit(
            layer="circuit",
            stage="gate_step",
            executor="local",
            status="ok",
            summary="H",
            data={"operation_index": 0, "gate": "h"},
        )
        builder = mock.Mock(return_value=("verified reply", recorder.events))
        explanation = TeachingExplanation(
            circuit_goal="目标",
            steps=(TeachingStep(0, "目的", None, None),),
        )
        explainer = mock.Mock(return_value=explanation)

        payload = build_debug_payload(
            "prompt", debug_builder=builder, teaching_explainer=explainer
        )

        explainer.assert_called_once_with(
            "prompt", "OPENQASM 2.0;\nqreg q[1];", (circuit_event,)
        )
        self.assertEqual(payload["reply"], "verified reply")
        self.assertEqual(payload["teaching"]["steps"][0]["purpose"], "目的")

    def test_explainer_failure_does_not_change_verified_reply_or_events(self):
        recorder = TraceRecorder()
        recorder.emit(
            layer="agent",
            stage="agent_result",
            executor="local",
            status="ok",
            summary="final",
            data={"qasm": "OPENQASM 2.0; // FINAL"},
        )
        expected_events = [event.as_dict() for event in recorder.events]

        payload = build_debug_payload(
            "prompt",
            debug_builder=mock.Mock(return_value=("verified reply", recorder.events)),
            teaching_explainer=mock.Mock(side_effect=RuntimeError("failed")),
        )

        self.assertEqual(payload["reply"], "verified reply")
        self.assertEqual(payload["events"], expected_events)
        self.assertIsNone(payload["teaching"])


class DebugWebHTTPTests(unittest.TestCase):
    def make_handler(self, *, path, body=b""):
        # 绕开真实监听端口，只验证 HTTP handler 的输入与安全输出边界。
        handler = DebugRequestHandler.__new__(DebugRequestHandler)
        handler.path = path
        handler.headers = {"Content-Length": str(len(body))}
        handler.rfile = io.BytesIO(body)
        handler.wfile = io.BytesIO()
        handler.send_response = mock.Mock()
        handler.send_header = mock.Mock()
        handler.end_headers = mock.Mock()
        return handler

    def test_health_endpoint(self):
        handler = self.make_handler(path="/api/health")

        handler.do_GET()

        handler.send_response.assert_called_once_with(HTTPStatus.OK)
        self.assertEqual(json.loads(handler.wfile.getvalue()), {"status": "ok"})

    @mock.patch("loomq.debug_web.build_debug_payload")
    def test_debug_endpoint_returns_serialized_payload(self, build_payload):
        build_payload.return_value = {"reply": "ok", "events": []}
        body = json.dumps({"prompt": "生成 Bell 态"}).encode("utf-8")
        handler = self.make_handler(path="/api/debug", body=body)

        handler.do_POST()

        handler.send_response.assert_called_once_with(HTTPStatus.OK)
        self.assertEqual(json.loads(handler.wfile.getvalue()), {"reply": "ok", "events": []})
        build_payload.assert_called_once_with("生成 Bell 态")

    @mock.patch("loomq.debug_web.build_repair_payload")
    def test_repair_endpoint_requires_goal_and_qasm(self, build_payload):
        body = json.dumps({"goal": "生成 Bell 态"}).encode("utf-8")
        handler = self.make_handler(path="/api/repair", body=body)

        handler.do_POST()

        handler.send_response.assert_called_once_with(HTTPStatus.BAD_REQUEST)
        self.assertEqual(
            json.loads(handler.wfile.getvalue()),
            {"error": "请输入有效的修复目标和 OpenQASM。"},
        )
        build_payload.assert_not_called()

    @mock.patch("loomq.debug_web.build_repair_payload")
    def test_repair_endpoint_returns_real_repair_payload(self, build_payload):
        build_payload.return_value = {
            "input_validation": {"status": "error", "diagnostic": "ParseError"},
            "reply": "ok",
            "repaired_qasm": "OPENQASM 2.0;\nqreg q[1];",
            "events": [],
        }
        body = json.dumps(
            {"goal": "保持零态", "qasm": "OPENQASM 2.0;\nqreg q[1]"}
        ).encode("utf-8")
        handler = self.make_handler(path="/api/repair", body=body)

        handler.do_POST()

        handler.send_response.assert_called_once_with(HTTPStatus.OK)
        build_payload.assert_called_once_with(
            "保持零态", "OPENQASM 2.0;\nqreg q[1]"
        )

    @mock.patch("loomq.debug_web.build_debug_payload")
    def test_errors_return_only_fixed_safe_message(self, build_payload):
        build_payload.side_effect = RuntimeError(
            "secret-key at /Users/private/project and raw model response"
        )
        body = json.dumps({"prompt": "Bell"}).encode("utf-8")
        handler = self.make_handler(path="/api/debug", body=body)

        handler.do_POST()
        serialized = handler.wfile.getvalue().decode("utf-8")

        handler.send_response.assert_called_once_with(HTTPStatus.INTERNAL_SERVER_ERROR)
        self.assertIn("这次调试没有完成", serialized)
        self.assertNotIn("secret-key", serialized)
        self.assertNotIn("/Users/", serialized)
        self.assertNotIn("Traceback", serialized)


if __name__ == "__main__":
    unittest.main()
