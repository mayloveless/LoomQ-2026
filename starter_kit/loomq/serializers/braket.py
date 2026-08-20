"""Serialize Circuit IR as Braket-compatible OpenQASM 3.0."""

from typing import List

from ..ir import (
    Circuit,
    ClassicalBitRef,
    GateOperation,
    MeasureOperation,
    QubitRef,
)


# pinned Braket LocalSimulator 直接识别这些 vendor-native 门名；公开 artifact
# 不依赖运行目录中不存在的 stdgates.inc 文件。
_GATE_NAMES = {
    "sdg": "si",
    "tdg": "ti",
    "cx": "cnot",
    "cu1": "cphaseshift",
    "ccx": "ccnot",
}


def _qubit(reference: QubitRef) -> str:
    return "%s[%d]" % (reference.register, reference.index)


def _classical_bit(reference: ClassicalBitRef) -> str:
    return "%s[%d]" % (reference.register, reference.index)


def _gate_lines(operation: GateOperation, *, execution_mode: bool) -> List[str]:
    """序列化一个门；本地执行模式只使用 braket_sv 可识别的门。"""
    qubits = ", ".join(_qubit(qubit) for qubit in operation.qubits)
    parameters = ""
    if operation.parameters:
        parameters = "(%s)" % ", ".join(
            format(value, ".17g") for value in operation.parameters
        )

    if not execution_mode:
        gate_name = _GATE_NAMES.get(operation.name, operation.name)
        return ["%s%s %s;" % (gate_name, parameters, qubits)]

    # braket_sv 的无 include 执行程序没有 sdg、tdg、cp 与 ccx 定义。
    if operation.name == "sdg":
        return ["s %s;" % qubits] * 3
    if operation.name == "tdg":
        return ["t %s;" % qubits] * 7
    if operation.name == "cu1":
        return ["cphaseshift%s %s;" % (parameters, qubits)]
    if operation.name == "ccx":
        control_a, control_b, target = (_qubit(qubit) for qubit in operation.qubits)
        # 严格采用 gate_identities.md 中的 qelib1 Toffoli 分解。
        return [
            "h %s;" % target,
            "cnot %s, %s;" % (control_b, target),
            *("t %s;" % target for _ in range(7)),
            "cnot %s, %s;" % (control_a, target),
            "t %s;" % target,
            "cnot %s, %s;" % (control_b, target),
            *("t %s;" % target for _ in range(7)),
            "cnot %s, %s;" % (control_a, target),
            "t %s;" % control_b,
            "t %s;" % target,
            "h %s;" % target,
            "cnot %s, %s;" % (control_a, control_b),
            "t %s;" % control_a,
            *("t %s;" % control_b for _ in range(7)),
            "cnot %s, %s;" % (control_a, control_b),
        ]

    gate_name = _GATE_NAMES.get(operation.name, operation.name)
    return ["%s%s %s;" % (gate_name, parameters, qubits)]


def serialize_braket(
    circuit: Circuit, *, include_stdgates: bool = False, execution_mode: bool = False
) -> str:
    """Return a complete Braket OpenQASM 3 program.

    ``transpile()`` 默认输出可直接提交给 pinned Braket SDK 的完整程序。
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
            lines.extend(_gate_lines(operation, execution_mode=execution_mode))
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
