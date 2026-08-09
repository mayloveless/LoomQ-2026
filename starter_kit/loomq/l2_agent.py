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

from .backend_selector import BackendConstraints, select_backends
from .parser import parse_qasm
from .qasm_tools import QASMValidationError, extract_qasm, validate_qasm
from .semantic_verifier import (
    SemanticVerificationError,
    TargetSpecification,
    parse_target_specification,
    verify_semantics,
)


SYSTEM_PROMPT = """你是 LoomQ 的量子任务约束提取与 OpenQASM 2.0 助手。
只返回一个 JSON 对象，不要返回 JSON 之外的散文。生成或修复 QASM 时返回：
{"task_type":"generate_qasm 或 repair_qasm","qasm":"OPENQASM 2.0; ...","explanation":"简短说明"}
请判断用户是在生成还是修复 QASM，并设置对应 task_type。
qasm 必须是完整的 OpenQASM 2.0 程序，包含 include 和 qreg；用户明确要求测量时还必须包含 creg 和测量语句。
只可使用当前项目支持的门：h、x、s、sdg、t、tdg、ry、rz、cx、cu1、swap、ccx。
修复时必须保持用户明确声明的目标态、目标功能和测量语义，不能只修正语法而改变电路目标。
请根据用户的实际要求生成电路，不要硬编码公开 GHZ 示例的固定答案。
选择后端时只提取用户约束，不要推荐或输出 backend ID，并返回：
{"task_type":"select_backend","qasm":null,"backend_constraints":{"min_qubits":null,"require_qpu":null,"require_no_queue":false,"cost_policy":"free_only 或 free_or_quota 或 paid_allowed 或 unspecified","allow_account_required":null},"explanation":"简短说明"}
未声明的约束使用 null、false 或 unspecified，不要擅自收紧。
"""

TARGET_JUDGE_SYSTEM_PROMPT = """你是独立的量子目标态规格提取器，只能依据用户原始请求判断目标，不能查看或猜测候选 QASM。
只返回一个 JSON 对象，不返回额外散文，也绝对不要返回 QASM。
如果目标可以可靠表示为纯态，返回：
{"verification_mode":"statevector","qubit_count":2,"amplitudes":[{"basis":"00","real":0.7071067811865476,"imag":0.0},{"basis":"11","real":0.7071067811865476,"imag":0.0}],"explanation":"简短目标说明"}
basis 按 q[0] 到 q[n-1] 的顺序书写；未列出的 basis amplitude 视为 0。必须给出归一化、有限数值的复振幅，并保留用户要求的相对相位。
如果原始请求无法可靠转换为纯态目标，返回：
{"verification_mode":"unsupported","explanation":"无法可靠进行纯态验证的原因"}
"""

_JSON_FENCE_RE = re.compile(
    r"^```json\s*\n(?P<body>.*?)\n```$", re.IGNORECASE | re.DOTALL
)
_NEGATED_MEASUREMENT_RE = re.compile(
    r"(?:不(?:需要|要求|要|进行)?|无需(?:进行)?|省略|移除|删除)"
    r"(?:添加|进行|保留)?(?:任何)?(?:测量|测定|读出|采样)"
    r"|(?:without|no)\s+(?:any\s+)?(?:measurements?|measurement|measuring|readouts?|sampling)"
    r"|(?:do\s+not|don't|omit|remove)\s+(?:add\s+|include\s+|perform\s+)?"
    r"(?:any\s+)?(?:measurements?|measurement|measuring|readouts?|sampling)"
    r"|measurement[- ]free|unmeasured",
    re.IGNORECASE,
)
_MEASUREMENT_REQUEST_RE = re.compile(
    r"测量|测定|读出|采样|measure(?:ment|ments|d|s|ing)?|read[ -]?outs?|"
    r"sampl(?:e|es|ed|ing)|shots?|counts?",
    re.IGNORECASE,
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


class _CandidateVerificationError(RuntimeError):
    """Bounded candidate failure suitable for the one repair prompt."""

    def __init__(self, diagnostic: str, fidelity: float | None = None) -> None:
        super().__init__("candidate QASM failed local verification")
        self.diagnostic = diagnostic
        self.fidelity = fidelity


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


def _parse_response_payload(response: Any) -> dict[str, Any]:
    """Parse the shared JSON envelope without interpreting the task payload."""
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
    return payload


def _parse_explanation(payload: Mapping[str, Any]) -> str:
    explanation = payload.get("explanation", "")
    if not isinstance(explanation, str):
        raise RuntimeError("L2 model response explanation must be a string")
    if "OPENQASM 2.0;" in explanation or "```" in explanation:
        raise RuntimeError("L2 model response explanation must not contain code")
    return explanation.strip()


def _parse_candidate_payload(payload: Mapping[str, Any]) -> _CandidateResponse:
    """Parse QASM fields without treating broken QASM as broken JSON."""
    task_type = payload.get("task_type")
    if task_type not in ("generate_qasm", "repair_qasm"):
        raise RuntimeError(
            "L2 model response task_type must be 'generate_qasm', 'repair_qasm', or 'select_backend'"
        )

    qasm_text = payload.get("qasm")
    if not isinstance(qasm_text, str) or not qasm_text.strip():
        raise RuntimeError("L2 model response qasm must be a non-empty string")
    return _CandidateResponse(
        task_type=task_type,
        qasm=qasm_text,
        explanation=_parse_explanation(payload),
    )


def _parse_candidate_response(response: Any) -> _CandidateResponse:
    return _parse_candidate_payload(_parse_response_payload(response))


def _parse_backend_constraints(payload: Mapping[str, Any]) -> BackendConstraints:
    if payload.get("task_type") != "select_backend":
        raise RuntimeError("L2 model response task_type must be 'select_backend'")
    if "qasm" not in payload or payload["qasm"] is not None:
        raise RuntimeError("L2 backend-selection response qasm must be null")
    raw_constraints = payload.get("backend_constraints")
    if not isinstance(raw_constraints, Mapping):
        raise RuntimeError(
            "L2 backend-selection response backend_constraints must be an object"
        )
    required_fields = {
        "min_qubits",
        "require_qpu",
        "require_no_queue",
        "cost_policy",
        "allow_account_required",
    }
    missing = sorted(required_fields.difference(raw_constraints))
    if missing:
        raise RuntimeError(
            "L2 backend-selection constraints are missing field(s): %s"
            % ", ".join(missing)
        )
    try:
        return BackendConstraints(
            min_qubits=raw_constraints["min_qubits"],
            require_qpu=raw_constraints["require_qpu"],
            require_no_queue=raw_constraints["require_no_queue"],
            cost_policy=raw_constraints["cost_policy"],
            allow_account_required=raw_constraints["allow_account_required"],
        )
    except ValueError as exc:
        raise RuntimeError(
            "L2 backend-selection response has invalid constraints: %s" % exc
        ) from None


def _validate_candidate(
    candidate: _CandidateResponse, *, require_measurement: bool = False
) -> GenerationResponse:
    qasm = extract_qasm(candidate.qasm)
    if qasm is None:
        raise QASMValidationError(
            "QASMExtractionError: response does not contain one unambiguous OpenQASM 2.0 program"
        )
    validate_qasm(qasm, require_measurement=require_measurement)
    return GenerationResponse(
        task_type=candidate.task_type,
        qasm=qasm,
        explanation=candidate.explanation,
    )


def parse_generation_response(
    response: Any, *, require_measurement: bool = False
) -> GenerationResponse:
    """Parse the structured protocol and validate its QASM candidate."""
    return _validate_candidate(
        _parse_candidate_response(response),
        require_measurement=require_measurement,
    )


def _parse_target_judge_response(response: Any) -> TargetSpecification:
    payload = _parse_response_payload(response)
    try:
        return parse_target_specification(payload)
    except RuntimeError as exc:
        raise RuntimeError("L2 target judge returned an invalid specification") from None


def _verify_candidate(
    candidate: _CandidateResponse,
    target: TargetSpecification,
    *,
    require_measurement: bool,
) -> GenerationResponse:
    try:
        generated = _validate_candidate(
            candidate,
            require_measurement=require_measurement,
        )
    except QASMValidationError as exc:
        raise _CandidateVerificationError(exc.diagnostic) from None

    circuit = parse_qasm(generated.qasm)
    try:
        verification = verify_semantics(circuit, target)
    except SemanticVerificationError:
        raise _CandidateVerificationError(
            "SemanticSimulationError: local statevector verification failed"
        ) from None
    if not verification.passed:
        fidelity = verification.fidelity
        if fidelity is None:
            diagnostic = "SemanticVerificationError: candidate does not match target"
        else:
            diagnostic = "SemanticFidelityError: fidelity %.6f is below 0.970000" % fidelity
        raise _CandidateVerificationError(diagnostic, fidelity=fidelity) from None
    return generated


def _format_backend_reply(constraints: BackendConstraints) -> str:
    """Select and format only IDs originating from the official local table."""
    matches = select_backends(constraints)
    if matches:
        backend_ids = "、".join("`%s`" % backend.id for backend in matches)
        reasons = []
        if constraints.min_qubits is not None:
            reasons.append("支持至少 %d 比特" % constraints.min_qubits)
        if constraints.require_qpu is True:
            reasons.append("类型为真实量子硬件")
        if constraints.require_no_queue:
            reasons.append("能力表标记为零排队")
        if constraints.cost_policy == "free_only":
            reasons.append("能力表标记为完全免费")
        elif constraints.cost_policy == "free_or_quota":
            reasons.append("费用为免费或免费额度")
        if constraints.allow_account_required is False:
            reasons.append("无需账号")
        reason = "，".join(reasons) or "满足已提取的全部约束"
        return "满足条件的后端：%s。\n理由：%s；结果按官方能力表顺序列出。" % (
            backend_ids,
            reason,
        )

    relaxations = []
    if constraints.min_qubits is not None:
        relaxations.append("比特数")
    if constraints.require_qpu is True:
        relaxations.append("真机")
    if constraints.require_no_queue:
        relaxations.append("零排队")
    if constraints.cost_policy in ("free_only", "free_or_quota"):
        relaxations.append("费用")
    if constraints.allow_account_required is False:
        relaxations.append("账号")
    categories = "、".join(relaxations) or "当前约束"
    return (
        "当前官方能力表中没有满足全部条件的后端。"
        "可考虑放宽的约束类别：%s。" % categories
    )


def _call_model(messages: list[dict[str, str]]) -> Any:
    try:
        return llm_client.chat_completion(messages)
    except Exception:
        # 传输层或测试替身的异常可能包含凭证，因此统一改写并断开异常链。
        raise RuntimeError("L2 model request failed") from None


def _requires_measurement(prompt: str) -> bool:
    """Conservatively detect an explicit measurement request, including QASM."""
    # 先移除明确的否定表达，再识别剩余的测量、采样或 counts/shots 要求。
    without_negations = _NEGATED_MEASUREMENT_RE.sub("", prompt)
    return _MEASUREMENT_REQUEST_RE.search(without_negations) is not None


def _repair_prompt(
    prompt: str,
    candidate: str,
    diagnostic: str,
    target: TargetSpecification,
    *,
    require_measurement: bool,
    fidelity: float | None,
) -> str:
    """Build a bounded, explicit repair request with the original goal intact."""
    if require_measurement:
        measurement_instruction = (
            "原始请求明确要求测量，因此必须包含 creg 和对应测量语句。"
        )
    else:
        measurement_instruction = (
            "原始请求未明确要求测量，不要仅因缺少 creg 或测量语句而改变目标态制备。"
        )
    payload = {
        "instruction": (
            "修复候选 QASM。返回完整、可独立运行的 OpenQASM 2.0，包含 include、"
            "qreg。%s必须保持原始用户请求中的目标态、目标功能和测量语义。"
            "独立 target spec 是固定裁判，不得修改。只返回约定 JSON，"
            "task_type 使用 repair_qasm。" % measurement_instruction
        ),
        "original_user_request": prompt,
        "candidate_qasm": candidate,
        "target_spec": target.as_prompt_payload(),
        "validation_error": diagnostic,
        "require_measurement": require_measurement,
        "response_schema": {
            "task_type": "repair_qasm",
            "qasm": "OPENQASM 2.0; ...",
            "explanation": "简短说明",
        },
    }
    if fidelity is not None:
        payload["fidelity"] = round(fidelity, 12)
    return json.dumps(payload, ensure_ascii=False)


def agent_chat(prompt: str) -> str:
    """Route one model response to deterministic selection or validated QASM."""
    if not isinstance(prompt, str) or not prompt.strip():
        raise RuntimeError("L2 prompt must be a non-empty string")
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    raw_response = _call_model(messages)
    payload = _parse_response_payload(raw_response)
    if payload.get("task_type") == "select_backend":
        constraints = _parse_backend_constraints(payload)
        _parse_explanation(payload)
        return _format_backend_reply(constraints)

    require_measurement = _requires_measurement(prompt)
    candidate = _parse_candidate_payload(payload)
    judge_messages = [
        {"role": "system", "content": TARGET_JUDGE_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    target = _parse_target_judge_response(_call_model(judge_messages))
    try:
        generated = _verify_candidate(
            candidate,
            target,
            require_measurement=require_measurement,
        )
    except _CandidateVerificationError as first_error:
        repair_messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": _repair_prompt(
                    prompt,
                    candidate.qasm,
                    first_error.diagnostic,
                    target,
                    require_measurement=require_measurement,
                    fidelity=first_error.fidelity,
                ),
            },
        ]
        repair_response = _call_model(repair_messages)
        repaired_candidate = _parse_candidate_response(repair_response)
        try:
            generated = _verify_candidate(
                repaired_candidate,
                target,
                require_measurement=require_measurement,
            )
        except _CandidateVerificationError:
            raise RuntimeError(
                "model repair failed QASM semantic verification; repair limit reached"
            ) from None

    explanation = generated.explanation or "已生成并通过 OpenQASM 2.0 校验。"
    return "%s\n\n```qasm\n%s\n```" % (explanation, generated.qasm)


__all__ = ["GenerationResponse", "agent_chat", "parse_generation_response"]
