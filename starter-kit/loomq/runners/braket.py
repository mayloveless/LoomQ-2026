"""Braket 本地模拟器 Runner 与测量结果归一化。"""

import importlib
from collections import Counter
from typing import Any, Dict, List, Sequence, Tuple, Type
from uuid import uuid4

from ..ir import (
    Circuit,
    ClassicalBitRef,
    ClassicalRegisterRef,
    MeasureOperation,
    QubitRef,
    QuantumRegisterRef,
)
from ..results import create_result, validate_shots
from ..serializers.braket import serialize_braket


def _load_braket_sdk() -> Tuple[Type[Any], Type[Any]]:
    """延迟导入 SDK，避免仅使用 transpile 时因缺少依赖而崩溃。"""
    try:
        devices = importlib.import_module("braket.devices")
        openqasm = importlib.import_module("braket.ir.openqasm")
    except (ImportError, ModuleNotFoundError) as exc:
        raise RuntimeError(
            "Braket SDK is not installed; install starter-kit/requirements.txt"
        ) from exc
    return devices.LocalSimulator, openqasm.Program


def _register_offsets(registers: Sequence[Any]) -> Dict[str, int]:
    offsets: Dict[str, int] = {}
    offset = 0
    for register in registers:
        offsets[register.name] = offset
        offset += register.size
    return offsets


def _measurement_mapping(circuit: Circuit) -> List[Tuple[int, int]]:
    quantum_offsets = _register_offsets(circuit.quantum_registers)
    classical_offsets = _register_offsets(circuit.classical_registers)
    quantum_sizes = {
        register.name: register.size for register in circuit.quantum_registers
    }
    mapping: List[Tuple[int, int]] = []
    written_classical_bits = set()

    for operation in circuit.operations:
        if not isinstance(operation, MeasureOperation):
            continue
        if isinstance(operation.quantum, QubitRef) and isinstance(
            operation.classical, ClassicalBitRef
        ):
            pairs = [(operation.quantum.index, operation.classical.index)]
            quantum_register = operation.quantum.register
            classical_register = operation.classical.register
        elif isinstance(operation.quantum, QuantumRegisterRef) and isinstance(
            operation.classical, ClassicalRegisterRef
        ):
            quantum_register = operation.quantum.register
            classical_register = operation.classical.register
            pairs = [(index, index) for index in range(quantum_sizes[quantum_register])]
        else:
            raise ValueError("invalid mixed-width measurement in Circuit IR")

        # 寄存器声明顺序决定全局索引，整寄存器测量在此展开为逐位映射。
        for quantum_index, classical_index in pairs:
            global_quantum = quantum_offsets[quantum_register] + quantum_index
            global_classical = classical_offsets[classical_register] + classical_index
            if global_classical in written_classical_bits:
                raise ValueError(
                    "classical bit %d is written by more than one measurement"
                    % global_classical
                )
            written_classical_bits.add(global_classical)
            mapping.append((global_quantum, global_classical))
    return mapping


def normalize_braket_measurements(
    circuit: Circuit,
    measured_qubits: Sequence[int],
    measurements: Sequence[Sequence[int]],
) -> Dict[str, int]:
    """按 Circuit 的经典位语义将 Braket 测量矩阵转换为 counts。"""
    columns: Dict[int, int] = {}
    for column, raw_qubit in enumerate(measured_qubits):
        qubit = int(raw_qubit)
        if qubit in columns:
            raise ValueError("Braket measured_qubits contains duplicate qubit %d" % qubit)
        columns[qubit] = column

    mapping = _measurement_mapping(circuit)
    classical_bit_count = sum(
        register.size for register in circuit.classical_registers
    )
    if classical_bit_count <= 0:
        raise ValueError("circuit must declare at least one classical bit")

    counts: Counter[str] = Counter()
    for row in measurements:
        if len(row) != len(measured_qubits):
            raise ValueError("Braket measurement row width does not match measured_qubits")
        classical_bits = [0] * classical_bit_count
        for quantum_index, classical_index in mapping:
            if quantum_index not in columns:
                raise ValueError(
                    "measured qubit %d is missing from Braket result" % quantum_index
                )
            value = int(row[columns[quantum_index]])
            if value not in (0, 1):
                raise ValueError("Braket measurement values must be binary")
            classical_bits[classical_index] = value

        # 官方 key 为 c[n-1]...c[0]，因此按经典位全局索引倒序拼接。
        key = "".join(str(classical_bits[index]) for index in reversed(range(classical_bit_count)))
        counts[key] += 1
    return dict(counts)


def run_braket(circuit: Circuit, shots: int) -> Dict[str, Any]:
    """在 Braket braket_sv 本地模拟器执行 Circuit。"""
    validate_shots(shots)
    LocalSimulator, Program = _load_braket_sdk()
    # 本地模拟器会将 stdgates.inc 视作本地文件，提交时不输出该声明。
    qasm3 = serialize_braket(circuit, include_stdgates=False)
    device = LocalSimulator("braket_sv")
    program = Program(source=qasm3)
    task = device.run(program, shots=shots)
    raw_result = task.result()

    measured_qubits = getattr(raw_result, "measured_qubits", None)
    measurements = getattr(raw_result, "measurements", None)
    if measured_qubits is None or measurements is None:
        raise RuntimeError("Braket result does not expose measured_qubits and measurements")
    counts = normalize_braket_measurements(circuit, measured_qubits, measurements)

    task_id = getattr(task, "id", None)
    job_id = str(task_id) if task_id else "braket-local-%s" % uuid4()
    return create_result(
        backend="braket_local_simulator",
        job_id=job_id,
        shots=shots,
        counts=counts,
        meta={"simulator": "braket_sv"},
    )
