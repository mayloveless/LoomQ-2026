"""Utilities for extracting and validating generated OpenQASM 2.0."""

from __future__ import annotations

import re

from .parser import parse_qasm


_QASM_HEADER = "OPENQASM 2.0;"
_QASM_FENCE_RE = re.compile(
    r"^```(?:qasm|openqasm)\s*\n(?P<body>.*?)\n```$",
    re.IGNORECASE | re.DOTALL,
)


def extract_qasm(text: str) -> str | None:
    """Extract one complete plain or fenced OpenQASM 2.0 program."""
    if not isinstance(text, str):
        return None

    candidate = text.strip()
    fence_match = _QASM_FENCE_RE.fullmatch(candidate)
    if fence_match is not None:
        candidate = fence_match.group("body").strip()

    # 仅接受从标准头开始的完整程序，避免猜测或拼接模型的破损输出。
    if not candidate.startswith(_QASM_HEADER):
        return None
    return candidate


def validate_qasm(qasm: str) -> None:
    """Validate generated QASM with the existing project parser."""
    try:
        parse_qasm(qasm)
    except (TypeError, ValueError):
        # 不把完整模型输出带入异常，防止响应内容意外泄露。
        raise RuntimeError("generated QASM failed OpenQASM 2.0 validation") from None
