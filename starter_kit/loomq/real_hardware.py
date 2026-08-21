"""SpinQ 真机 Web API 的独立服务层。"""

from __future__ import annotations

import os
from pathlib import Path
import re
from typing import Any

from scripts import submit_spinq_cloud


_TASK_ID = re.compile(r"^[A-Za-z0-9._-]+$")
# Learn 中的临时体验记录不能混入比赛提交使用的 evidence/files。
RUNTIME_OUTPUT = Path(__file__).resolve().parents[1] / "runtime" / "real-hardware"


class RealHardwareNotConfigured(RuntimeError):
    """表示真机凭据或真机后端尚未配置。"""


class RealHardwareOperationError(RuntimeError):
    """表示已配置真机，但本次云端操作没有完成。"""


def _backend() -> str:
    """默认使用已确认在线的 Gemini NMR 真机，也允许环境覆盖。"""
    backend = os.environ.get("SPINQ_BACKEND", "gemini_vp").strip()
    if not backend:
        raise RealHardwareNotConfigured("SpinQ real-hardware backend is not configured")
    return backend


def _configured() -> tuple[bool, str]:
    """只检查凭据存在性和私钥文件，不发出网络请求。"""
    try:
        submit_spinq_cloud._environment()
        _backend()
    except submit_spinq_cloud.SpinQCloudError:
        return False, "真实量子设备未配置"
    except RealHardwareNotConfigured:
        return False, "真实量子设备未配置"
    return True, ""


def capability_status() -> dict[str, Any]:
    """返回不含账号、私钥路径或令牌的能力状态。"""
    available, reason = _configured()
    return {"spinq": {"available": available, "reason": reason}}


def _require_configured() -> str:
    available, _reason = _configured()
    if not available:
        raise RealHardwareNotConfigured("SpinQ real hardware is not configured")
    return _backend()


def submit_bell(output_dir: Path = RUNTIME_OUTPUT) -> dict[str, str]:
    """提交固定 Bell 电路并立即返回云端任务 ID，不在 HTTP 请求内轮询。"""
    backend = _require_configured()
    try:
        source, submitted = submit_spinq_cloud.dry_run(submit_spinq_cloud.DEFAULT_INPUT)
        job_id = submit_spinq_cloud.submit_task(
            source,
            submitted,
            backend,
            1000,
            output_dir,
            "starter_kit/circuits/bell.qasm",
        )
    except submit_spinq_cloud.SpinQCloudError as exc:
        raise RealHardwareOperationError("SpinQ Cloud submit failed") from exc
    return {"job_id": job_id, "status": "submitted", "platform": "spinq"}


def get_job(job_id: str, output_dir: Path = RUNTIME_OUTPUT) -> dict[str, Any]:
    """查询单个 SpinQ 任务；完成时复用 evidence 落盘逻辑保存结果。"""
    if not isinstance(job_id, str) or not _TASK_ID.fullmatch(job_id):
        raise RealHardwareOperationError("invalid SpinQ task identifier")
    _require_configured()
    try:
        status, result = submit_spinq_cloud.query_task(job_id, output_dir)
    except submit_spinq_cloud.SpinQCloudError as exc:
        raise RealHardwareOperationError("SpinQ Cloud status query failed") from exc
    return {"job_id": job_id, "status": status, "result": result}


__all__ = [
    "RealHardwareNotConfigured",
    "RealHardwareOperationError",
    "RUNTIME_OUTPUT",
    "capability_status",
    "get_job",
    "submit_bell",
]
