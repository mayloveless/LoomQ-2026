#!/usr/bin/env python3
"""LoomQ submission adapter contract v1.0.

This file intentionally contains no scoring implementation. Teams may implement
the functions directly or delegate to another language/runtime with subprocess.
"""

from typing import Any, Dict, List, Tuple

from loomq.parser import parse_qasm
from loomq.serializers import serialize_braket, serialize_spinq


SUPPORTED_TARGETS = ("spinq", "originq", "braket")


def transpile(qasm_str: str, target: str) -> str:
    """Translate OpenQASM 2.0 into the target backend's native representation."""
    serializers = {
        "spinq": serialize_spinq,
        "braket": serialize_braket,
    }
    try:
        serializer = serializers[target]
    except KeyError as exc:
        raise ValueError(
            "unsupported transpile target %r; expected one of: %s"
            % (target, ", ".join(sorted(serializers)))
        ) from exc
    return serializer(parse_qasm(qasm_str))


def run(qasm_str: str, target: str, shots: int) -> Dict[str, Any]:
    """Execute a circuit and return the unified result schema from the rules."""
    raise NotImplementedError("Implement run(qasm_str, target, shots)")


def agent_chat(prompt: str) -> str:
    """Optional L2 entry point using the documented LOOMQ_LLM_* environment."""
    raise NotImplementedError("L2 is optional; implement agent_chat(prompt) to enter")


def compile_hybrid(hybrid_qasm_str: str) -> Tuple[List[str], str]:
    """Optional L3 entry point. Return quantum operations and RISC-V assembly."""
    raise NotImplementedError(
        "L3 is optional; implement compile_hybrid(hybrid_qasm_str) to enter"
    )
