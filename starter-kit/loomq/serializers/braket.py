"""Serialize Circuit IR as Braket-compatible OpenQASM 3.0."""

from typing import List

from ..ir import (
    Circuit,
    ClassicalBitRef,
    GateOperation,
    MeasureOperation,
    QubitRef,
)


def _qubit(reference: QubitRef) -> str:
    return "%s[%d]" % (reference.register, reference.index)


def _classical_bit(reference: ClassicalBitRef) -> str:
    return "%s[%d]" % (reference.register, reference.index)


def serialize_braket(circuit: Circuit, *, include_stdgates: bool = True) -> str:
    """Return a complete Braket OpenQASM 3 program.

    ``transpile()`` 的目标 IR 默认保留 stdgates 声明；本地模拟器提交时可关闭。
    """
    lines: List[str] = ["OPENQASM 3.0;"]
    if include_stdgates:
        lines.append('include "stdgates.inc";')
    lines.extend(
        "qubit[%d] %s;" % (register.size, register.name)
        for register in circuit.quantum_registers
    )
    lines.extend(
        "bit[%d] %s;" % (register.size, register.name)
        for register in circuit.classical_registers
    )

    for operation in circuit.operations:
        if isinstance(operation, GateOperation):
            gate_name = "cnot" if operation.name == "cx" else operation.name
            parameters = ""
            if operation.parameters:
                parameters = "(%s)" % ", ".join(
                    format(value, ".17g") for value in operation.parameters
                )
            lines.append(
                "%s%s %s;"
                % (
                    gate_name,
                    parameters,
                    ", ".join(_qubit(qubit) for qubit in operation.qubits),
                )
            )
        elif isinstance(operation, MeasureOperation):
            if isinstance(operation.quantum, QubitRef) and isinstance(
                operation.classical, ClassicalBitRef
            ):
                lines.append(
                    "%s = measure %s;"
                    % (_classical_bit(operation.classical), _qubit(operation.quantum))
                )
            elif not isinstance(operation.quantum, QubitRef) and not isinstance(
                operation.classical, ClassicalBitRef
            ):
                lines.append(
                    "%s = measure %s;"
                    % (operation.classical.register, operation.quantum.register)
                )
            else:
                raise ValueError("invalid mixed-width measurement in Circuit IR")
        else:
            raise TypeError("unsupported operation in Circuit IR: %r" % (operation,))
    return "\n".join(lines) + "\n"
