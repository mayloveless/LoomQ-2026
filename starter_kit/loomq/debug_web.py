"""Thin local HTTP API for the LoomQ debug trace UI."""

from __future__ import annotations

import argparse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from typing import Any, Callable, Sequence

from .debug_cli import build_debug_trace


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
MAX_REQUEST_BYTES = 64 * 1024
DebugBuilder = Callable[[str], tuple[str, Sequence[Any]]]


def build_debug_payload(
    prompt: str, *, debug_builder: DebugBuilder = build_debug_trace
) -> dict[str, Any]:
    """复用共享 Trace 入口，并把事件转换成稳定的 JSON 数据。"""
    reply, events = debug_builder(prompt)
    return {
        "reply": reply,
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
        if self.path != "/api/debug":
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
            prompt = request.get("prompt") if isinstance(request, dict) else None
            if not isinstance(prompt, str) or not prompt.strip():
                raise ValueError("invalid prompt")
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "请输入有效的调试请求。"},
            )
            return

        try:
            payload = build_debug_payload(prompt.strip())
        except Exception:
            # 浏览器只接收固定安全文案，不暴露模型响应、凭证、路径或 traceback。
            self._send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "这次调试没有完成，请检查模型配置后重试。"},
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


__all__ = ["build_debug_payload", "create_server", "main"]
