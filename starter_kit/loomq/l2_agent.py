"""Minimal L2 model-call pipeline with one bounded QASM repair attempt."""

from __future__ import annotations

from dataclasses import dataclass
import json
import re
from typing import Any, Mapping

try:
    # 支持从仓库根目录按 starter_kit 包导入。
    from starter_kit import llm_client
except ImportError:  # pragma: no cover - 由 starter_kit 评测根目录运行时使用
    import llm_client  # type: ignore[no-redef]

from .qasm_tools import QASMValidationError, extract_qasm, validate_qasm


SYSTEM_PROMPT = """你是 LoomQ 的 OpenQASM 2.0 电路生成与修复助手。
只返回一个 JSON 对象，不要返回 JSON 之外的散文。对象格式为：
{"task_type":"generate_qasm 或 repair_qasm","qasm":"OPENQASM 2.0; ...","explanation":"简短说明"}
请判断用户是在生成还是修复 QASM，并设置对应 task_type。
qasm 必须是完整的 OpenQASM 2.0 程序，包含 include、qreg 和 creg 声明，并按用户要求测量。
只可使用当前项目支持的门：h、x、s、sdg、t、tdg、ry、rz、cx、cu1、swap、ccx。
修复时必须保持用户明确声明的目标态、目标功能和测量语义，不能只修正语法而改变电路目标。
请根据用户的实际要求生成电路，不要硬编码公开 GHZ 示例的固定答案。
"""

_JSON_FENCE_RE = re.compile(
    r"^```json\s*\n(?P<body>.*?)\n```$", re.IGNORECASE | re.DOTALL
)


@dataclass(frozen=True)
class GenerationResponse:
    """Validated fields from the model's structured response."""

    task_type: str
    qasm: str
    explanation: str


@dataclass(frozen=True)
class _CandidateResponse:
    """Structurally valid model fields before local QASM validation."""

    task_type: str
    qasm: str
    explanation: str


def _response_content(response: Any) -> str:
    """Read choices[0].message.content without echoing the raw response."""
    if not isinstance(response, Mapping):
        raise RuntimeError("L2 model response must be an object")
    choices = response.get("choices")
    if not isinstance(choices, list) or not choices:
        raise RuntimeError("L2 model response is missing choices")
    first_choice = choices[0]
    if not isinstance(first_choice, Mapping):
        raise RuntimeError("L2 model response choice must be an object")
    message = first_choice.get("message")
    if not isinstance(message, Mapping):
        raise RuntimeError("L2 model response is missing message")
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("L2 model response content must be a non-empty string")
    return content.strip()


def _parse_candidate_response(response: Any) -> _CandidateResponse:
    """Parse the JSON protocol without treating broken QASM as broken JSON."""
    content = _response_content(response)
    fence_match = _JSON_FENCE_RE.fullmatch(content)
    if fence_match is not None:
        content = fence_match.group("body").strip()

    try:
        payload = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        raise RuntimeError("L2 model response content is not valid JSON") from None
    if not isinstance(payload, dict):
        raise RuntimeError("L2 model response JSON must be an object")
    task_type = payload.get("task_type")
    if task_type not in ("generate_qasm", "repair_qasm"):
        raise RuntimeError(
            "L2 model response task_type must be 'generate_qasm' or 'repair_qasm'"
        )

    qasm_text = payload.get("qasm")
    if not isinstance(qasm_text, str) or not qasm_text.strip():
        raise RuntimeError("L2 model response qasm must be a non-empty string")
    explanation = payload.get("explanation", "")
    if not isinstance(explanation, str):
        raise RuntimeError("L2 model response explanation must be a string")
    if "OPENQASM 2.0;" in explanation or "```" in explanation:
        raise RuntimeError("L2 model response explanation must not contain code")

    return _CandidateResponse(
        task_type=task_type,
        qasm=qasm_text,
        explanation=explanation.strip(),
    )


def _validate_candidate(candidate: _CandidateResponse) -> GenerationResponse:
    qasm = extract_qasm(candidate.qasm)
    if qasm is None:
        raise QASMValidationError(
            "QASMExtractionError: response does not contain one unambiguous OpenQASM 2.0 program"
        )
    validate_qasm(qasm)
    return GenerationResponse(
        task_type=candidate.task_type,
        qasm=qasm,
        explanation=candidate.explanation,
    )


def parse_generation_response(response: Any) -> GenerationResponse:
    """Parse the structured protocol and validate its QASM candidate."""
    return _validate_candidate(_parse_candidate_response(response))


def _call_model(messages: list[dict[str, str]]) -> Any:
    try:
        return llm_client.chat_completion(messages)
    except Exception:
        # 传输层或测试替身的异常可能包含凭证，因此统一改写并断开异常链。
        raise RuntimeError("L2 model request failed") from None


def _repair_prompt(prompt: str, candidate: str, diagnostic: str) -> str:
    """Build a bounded, explicit repair request with the original goal intact."""
    payload = {
        "instruction": (
            "修复候选 QASM。返回完整、可独立运行的 OpenQASM 2.0，包含 include、"
            "qreg、creg 和用户要求的测量。必须保持原始用户请求中的目标态、目标功能"
            "和测量语义。只返回约定 JSON，task_type 使用 repair_qasm。"
        ),
        "original_user_request": prompt,
        "candidate_qasm": candidate,
        "parser_error": diagnostic,
        "response_schema": {
            "task_type": "repair_qasm",
            "qasm": "OPENQASM 2.0; ...",
            "explanation": "简短说明",
        },
    }
    return json.dumps(payload, ensure_ascii=False)


def agent_chat(prompt: str) -> str:
    """Return valid QASM, allowing exactly one repair call after QASM failure."""
    if not isinstance(prompt, str) or not prompt.strip():
        raise RuntimeError("L2 prompt must be a non-empty string")
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    raw_response = _call_model(messages)
    candidate = _parse_candidate_response(raw_response)
    try:
        generated = _validate_candidate(candidate)
    except QASMValidationError as first_error:
        repair_messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": _repair_prompt(
                    prompt,
                    candidate.qasm,
                    first_error.diagnostic,
                ),
            },
        ]
        repair_response = _call_model(repair_messages)
        repaired_candidate = _parse_candidate_response(repair_response)
        try:
            generated = _validate_candidate(repaired_candidate)
        except QASMValidationError:
            raise RuntimeError(
                "model produced invalid QASM twice; repair limit reached"
            ) from None

    explanation = generated.explanation or "已生成并通过 OpenQASM 2.0 校验。"
    return "%s\n\n```qasm\n%s\n```" % (explanation, generated.qasm)


__all__ = ["GenerationResponse", "agent_chat", "parse_generation_response"]
