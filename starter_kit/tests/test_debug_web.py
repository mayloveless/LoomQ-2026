"""Task 13B tests for the thin local debug HTTP boundary."""

from http import HTTPStatus
import io
import json
import unittest
from unittest import mock

from loomq.debug_trace import TraceRecorder
from loomq.debug_web import DebugRequestHandler, build_debug_payload


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

        payload = build_debug_payload("Bell", debug_builder=builder)

        builder.assert_called_once_with("Bell")
        self.assertEqual(payload["reply"], "reply")
        self.assertEqual(payload["events"][0], event.as_dict())
        json.dumps(payload, ensure_ascii=False)


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
