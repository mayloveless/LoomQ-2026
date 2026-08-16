"""Thin local HTTP API for the LoomQ debug trace UI."""

from __future__ import annotations

import argparse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from typing import Any, Callable, Sequence

from .debug_cli import build_debug_trace
from .qasm_tools import QASMValidationError, validate_qasm
from .teaching_explainer import TeachingExplanation, explain_validated_circuit


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
MAX_REQUEST_BYTES = 64 * 1024
DebugBuilder = Callable[[str], tuple[str, Sequence[Any]]]
TeachingExplainer = Callable[
    [str, str, Sequence[Any]], TeachingExplanation | None
]


def build_debug_payload(
    prompt: str,
    *,
    debug_builder: DebugBuilder = build_debug_trace,
    teaching_explainer: TeachingExplainer = explain_validated_circuit,
) -> dict[str, Any]:
    """复用共享 Trace 入口，并把事件转换成稳定的 JSON 数据。"""
    reply, events = debug_builder(prompt)
    final_qasm = next(
        (
            event.data["qasm"]
            for event in reversed(events)
            if event.layer == "agent"
            and event.stage == "agent_result"
            and isinstance(event.data.get("qasm"), str)
        ),
        None,
    )
    teaching = None
    if final_qasm is not None:
        circuit_events = tuple(event for event in events if event.layer == "circuit")
        # Explainer 只在 Web payload 组装阶段运行；失败不影响 reply/events。
        try:
            teaching = teaching_explainer(prompt, final_qasm, circuit_events)
        except Exception:
            teaching = None
    return {
        "reply": reply,
        "events": [event.as_dict() for event in events],
        "teaching": teaching.as_dict() if teaching is not None else None,
    }


def _repair_request_prompt(goal: str, qasm: str) -> str:
    """集中构造 repair_qasm 用户请求，保持目标与原始程序原样参与判断。"""
    return (
        "请检查并修复下面的 OpenQASM 2.0 程序。\n"
        "保持用户明确声明的目标功能和测量语义不变。\n\n"
        "用户期望：%s\n\n"
        "原始程序：\n%s" % (goal, qasm)
    )


def build_repair_payload(
    goal: str,
    qasm: str,
    *,
    debug_builder: DebugBuilder = build_debug_trace,
) -> dict[str, Any]:
    """检查原始输入，并复用 production L2 Trace 取得真实修复提案。"""
    try:
        validate_qasm(qasm)
    except QASMValidationError as exc:
        input_validation = {
            "status": "error",
            "diagnostic": exc.diagnostic,
        }
    else:
        input_validation = {"status": "ok", "diagnostic": None}

    reply, events = debug_builder(_repair_request_prompt(goal, qasm))
    final_event = next(
        (
            event
            for event in reversed(events)
            if event.layer == "agent" and event.stage == "agent_result"
        ),
        None,
    )
    repaired_qasm = None
    if final_event is not None and final_event.status == "ok":
        candidate = final_event.data.get("qasm")
        if isinstance(candidate, str) and candidate.strip():
            repaired_qasm = candidate

    return {
        "input_validation": input_validation,
        "reply": reply,
        "repaired_qasm": repaired_qasm,
        "events": [event.as_dict() for event in events],
    }


def _json_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


class DebugRequestHandler(BaseHTTPRequestHandler):
    """Serve only the two endpoints needed by the local MVP."""

    server_version = "LoomQDebug/1.0"

    def _send_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = _json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        if self.path == "/api/health":
            self._send_json(HTTPStatus.OK, {"status": "ok"})
            return
        self._send_json(HTTPStatus.NOT_FOUND, {"error": "接口不存在。"})

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        if self.path not in ("/api/debug", "/api/repair"):
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "接口不存在。"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0 or content_length > MAX_REQUEST_BYTES:
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "请输入有效的调试请求。"},
            )
            return

        try:
            raw_body = self.rfile.read(content_length)
            request = json.loads(raw_body.decode("utf-8"))
            if not isinstance(request, dict):
                raise ValueError("invalid request")
            if self.path == "/api/debug":
                prompt = request.get("prompt")
                if not isinstance(prompt, str) or not prompt.strip():
                    raise ValueError("invalid prompt")
                request_args = (prompt.strip(),)
            else:
                goal = request.get("goal")
                qasm = request.get("qasm")
                if (
                    not isinstance(goal, str)
                    or not goal.strip()
                    or not isinstance(qasm, str)
                    or not qasm.strip()
                ):
                    raise ValueError("invalid repair request")
                request_args = (goal.strip(), qasm.strip())
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {
                    "error": (
                        "请输入有效的调试请求。"
                        if self.path == "/api/debug"
                        else "请输入有效的修复目标和 OpenQASM。"
                    )
                },
            )
            return

        try:
            payload = (
                build_debug_payload(*request_args)
                if self.path == "/api/debug"
                else build_repair_payload(*request_args)
            )
        except Exception:
            # 浏览器只接收固定安全文案，不暴露模型响应、凭证、路径或 traceback。
            self._send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {
                    "error": (
                        "这次调试没有完成，请检查模型配置后重试。"
                        if self.path == "/api/debug"
                        else "这次检查没有完成，请检查模型配置后重试。"
                    )
                },
            )
            return
        self._send_json(HTTPStatus.OK, payload)

    def log_message(self, format: str, *args: Any) -> None:
        # 保留简洁请求日志，不记录请求正文和模型信息。
        super().log_message(format, *args)


def create_server(
    host: str = DEFAULT_HOST, port: int = DEFAULT_PORT
) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), DebugRequestHandler)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="LoomQ 本地 Quantum DevTools API")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args(argv)
    server = create_server(args.host, args.port)
    print("LoomQ debug API: http://%s:%d" % server.server_address)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = ["build_debug_payload", "build_repair_payload", "create_server", "main"]
