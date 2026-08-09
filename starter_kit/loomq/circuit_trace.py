"""Per-gate statevector trace generation for explicit debug sessions."""

from __future__ import annotations

from typing import Any, Sequence

from .debug_trace import TraceEvent, TraceRecorder
from .ir import (
    Circuit,
    ClassicalBitRef,
    GateOperation,
    MeasureOperation,
    QubitRef,
)
from .semantic_verifier import simulate_statevector


DEFAULT_MAX_TRACE_QUBITS = 8
STATE_AMPLITUDE_EPSILON = 1e-10

_GATE_DESCRIPTIONS = {
    "h": "H redistributes amplitudes so computational states can superpose and interfere.",
    "x": "X swaps the amplitudes of the |0> and |1> states for this qubit.",
    "s": "S adds a quarter-turn phase without changing basis probabilities.",
    "sdg": "Sdg removes a quarter-turn phase without changing basis probabilities.",
    "t": "T adds an eighth-turn phase without changing basis probabilities.",
    "tdg": "Tdg removes an eighth-turn phase without changing basis probabilities.",
    "ry": "RY rotates amplitudes between |0> and |1> around the Y axis.",
    "rz": "RZ changes relative phase around the Z axis without directly changing probabilities.",
    "cx": "CX flips the target when the control is 1, changing correlations between qubits.",
    "cu1": "CU1 adds phase when both control and target are 1.",
    "swap": "SWAP exchanges the quantum states carried by two qubits.",
    "ccx": "CCX flips the target when both controls are 1.",
}


def _qubit_count(circuit: Circuit) -> int:
    return sum(register.size for register in circuit.quantum_registers)


def _state_entries(
    statevector: Sequence[complex], qubit_count: int
) -> list[dict[str, Any]]:
    entries = []
    for index, raw_amplitude in enumerate(statevector):
        amplitude = complex(raw_amplitude)
        probability = abs(amplitude) ** 2
        if abs(amplitude) < STATE_AMPLITUDE_EPSILON:
            continue
        entries.append(
            {
                "basis": format(index, "0%db" % qubit_count),
                "real": float(amplitude.real),
                "imag": float(amplitude.imag),
                "probability": float(probability),
            }
        )
    return entries


def _probabilities(state: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {"basis": item["basis"], "probability": item["probability"]}
        for item in state
    ]


def _qubit_label(qubit: QubitRef) -> str:
    return "%s[%d]" % (qubit.register, qubit.index)


def _measurement_mappings(
    circuit: Circuit, operation: MeasureOperation
) -> list[dict[str, str]]:
    if isinstance(operation.quantum, QubitRef) and isinstance(
        operation.classical, ClassicalBitRef
    ):
        return [
            {
                "qubit": _qubit_label(operation.quantum),
                "classical_bit": "%s[%d]"
                % (operation.classical.register, operation.classical.index),
            }
        ]

    quantum_register = next(
        register
        for register in circuit.quantum_registers
        if register.name == operation.quantum.register
    )
    return [
        {
            "qubit": "%s[%d]" % (operation.quantum.register, index),
            "classical_bit": "%s[%d]" % (operation.classical.register, index),
        }
        for index in range(quantum_register.size)
    ]


def trace_circuit(
    circuit: Circuit,
    trace_sink: TraceRecorder,
    *,
    max_qubits: int = DEFAULT_MAX_TRACE_QUBITS,
) -> tuple[TraceEvent, ...]:
    """Append deterministic gate and measurement events to a shared recorder."""
    start_seq = len(trace_sink.events)
    qubit_count = _qubit_count(circuit)
    if qubit_count > max_qubits:
        trace_sink.emit(
            layer="circuit",
            stage="statevector_skipped",
            executor="local",
            status="warning",
            summary="Circuit state visualization skipped because it exceeds the debug limit.",
            data={"qubit_count": qubit_count, "max_qubits": max_qubits},
        )
        return trace_sink.events[start_seq:]

    prefix_operations: list[GateOperation] = []
    prefix = Circuit(
        openqasm_version=circuit.openqasm_version,
        quantum_registers=circuit.quantum_registers,
        classical_registers=circuit.classical_registers,
        operations=(),
    )
    current_statevector = simulate_statevector(prefix)

    for operation_index, operation in enumerate(circuit.operations):
        if isinstance(operation, GateOperation):
            state_before = _state_entries(current_statevector, qubit_count)
            prefix_operations.append(operation)
            prefix = Circuit(
                openqasm_version=circuit.openqasm_version,
                quantum_registers=circuit.quantum_registers,
                classical_registers=circuit.classical_registers,
                operations=tuple(prefix_operations),
            )
            current_statevector = simulate_statevector(prefix)
            state_after = _state_entries(current_statevector, qubit_count)
            trace_sink.emit(
                layer="circuit",
                stage="gate_step",
                executor="local",
                status="ok",
                summary="Applied %s to %s."
                % (operation.name, ", ".join(map(_qubit_label, operation.qubits))),
                data={
                    "operation_index": operation_index,
                    "gate": operation.name,
                    "qubits": [_qubit_label(qubit) for qubit in operation.qubits],
                    "parameters": list(operation.parameters),
                    "state_before": state_before,
                    "state_after": state_after,
                    "probabilities_after": _probabilities(state_after),
                    "gate_description": _GATE_DESCRIPTIONS.get(
                        operation.name, "This gate updates the quantum state."
                    ),
                },
            )
        elif isinstance(operation, MeasureOperation):
            state_before = _state_entries(current_statevector, qubit_count)
            trace_sink.emit(
                layer="circuit",
                stage="measurement",
                executor="local",
                status="ok",
                summary="Measurement maps quantum bits to classical bits.",
                data={
                    "operation_index": operation_index,
                    "mappings": _measurement_mappings(circuit, operation),
                    "probabilities_before": _probabilities(state_before),
                    "gate_description": (
                        "Measure reads a classical result from the current probability "
                        "distribution; this trace does not fabricate an outcome."
                    ),
                },
            )
    return trace_sink.events[start_seq:]


__all__ = [
    "DEFAULT_MAX_TRACE_QUBITS",
    "STATE_AMPLITUDE_EPSILON",
    "trace_circuit",
]
