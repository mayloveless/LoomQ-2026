"""Extremely thin interactive consumer for LoomQ agent and circuit traces."""

from __future__ import annotations

import argparse
import json
from typing import Callable, Sequence

from .circuit_trace import trace_circuit
from .debug_trace import TraceEvent, TraceRecorder
from .l2_agent import _run_agent
from .parser import parse_qasm
from .qasm_tools import extract_qasm


def build_debug_trace(prompt: str) -> tuple[str, tuple[TraceEvent, ...]]:
    """Run the production agent once, then trace its validated final circuit."""
    recorder = TraceRecorder()
    reply = _run_agent(prompt, trace_sink=recorder)
    qasm = extract_qasm(reply)
    if qasm is not None:
        trace_circuit(parse_qasm(qasm), recorder)
    return reply, recorder.events


def _state_text(entries: Sequence[dict[str, object]]) -> str:
    parts = []
    for item in entries:
        probability = 100.0 * float(item["probability"])
        real = float(item.get("real", 0.0))
        imag = float(item.get("imag", 0.0))
        amplitude = "%+.6f%+.6fi" % (real, imag)
        parts.append("|%s> %.2f%% (%s)" % (item["basis"], probability, amplitude))
    return " · ".join(parts) if parts else "no visible amplitudes"


def render_event(event: TraceEvent) -> str:
    """Render one event without making terminal text part of the protocol."""
    header = "[%d] %s · %s · %s · %s" % (
        event.seq,
        event.layer.upper(),
        event.executor.upper(),
        event.stage,
        event.status,
    )
    lines = [header, "    " + event.summary]
    if event.stage == "gate_step":
        lines.extend(
            [
                "    gate  : %s %s"
                % (event.data["gate"], ", ".join(event.data["qubits"])),
                "    before: " + _state_text(event.data["state_before"]),
                "    after : " + _state_text(event.data["state_after"]),
                "    " + str(event.data["gate_description"]),
            ]
        )
    elif event.stage == "measurement":
        mappings = " · ".join(
            "%s → %s" % (item["qubit"], item["classical_bit"])
            for item in event.data["mappings"]
        )
        lines.extend(
            [
                "    mapping: " + mappings,
                "    probabilities: "
                + " · ".join(
                    "|%s> %.2f%%"
                    % (item["basis"], 100.0 * float(item["probability"]))
                    for item in event.data["probabilities_before"]
                ),
                "    " + str(event.data["gate_description"]),
            ]
        )
    elif event.data:
        lines.append("    data: " + json.dumps(event.data, ensure_ascii=False))
    return "\n".join(lines)


def consume_events(
    events: Sequence[TraceEvent],
    *,
    input_fn: Callable[[str], str] = input,
    output_fn: Callable[[str], None] = print,
) -> bool:
    """Step through events; return False only when the user quits early."""
    continuing = False
    for index, event in enumerate(events):
        output_fn(render_event(event))
        if continuing or index == len(events) - 1:
            continue
        while True:
            command = input_fn("[Enter/n] next · [c] continue · [q] quit: ").strip().lower()
            if command in ("", "n"):
                break
            if command == "c":
                continuing = True
                break
            if command == "q":
                return False
    return True


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="LoomQ debug trace CLI")
    parser.add_argument("prompt", help="natural-language L2 request")
    args = parser.parse_args(argv)
    try:
        _, events = build_debug_trace(args.prompt)
    except Exception as exc:
        print("debug session failed: %s" % type(exc).__name__)
        return 1
    consume_events(events)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "build_debug_trace",
    "consume_events",
    "main",
    "render_event",
]
