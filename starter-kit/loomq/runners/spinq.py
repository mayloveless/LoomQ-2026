"""SpinQit 基础模拟器 Runner 与 counts 归一化。"""

import importlib
from collections import Counter
from typing import Any, Dict, Mapping, NamedTuple, Sequence, Tuple, Type
from uuid import uuid4

from ..ir import Circuit, GateOperation, MeasureOperation
from ..measurements import (
    build_classical_key,
    measurement_mapping,
    quantum_bit_indices,
)
from ..results import create_result, validate_shots


class SpinQSDK(NamedTuple):
    config_class: Type[Any]
    circuit_class: Type[Any]
    cx_gate: Any
    h_gate: Any
    simulator_factory: Any
    compiler_factory: Any


def _load_spinq_sdk() -> SpinQSDK:
    """延迟导入 SpinQit，保证其他后端不受本地 wheel 可用性影响。"""
    try:
        spinqit = importlib.import_module("spinqit")
    except (ImportError, ModuleNotFoundError) as exc:
        raise RuntimeError(
            "SpinQit SDK is not installed; install starter-kit/requirements.txt"
        ) from exc
    return SpinQSDK(
        config_class=spinqit.BasicSimulatorConfig,
        circuit_class=spinqit.Circuit,
        cx_gate=spinqit.CX,
        h_gate=spinqit.H,
        simulator_factory=spinqit.get_basic_simulator,
        compiler_factory=spinqit.get_compiler,
    )


def _validate_final_measurements(circuit: Circuit) -> Tuple[Tuple[int, int], ...]:
    measurement_seen = False
    for operation in circuit.operations:
        if isinstance(operation, MeasureOperation):
            measurement_seen = True
        elif isinstance(operation, GateOperation) and measurement_seen:
            raise ValueError("SpinQ runner supports final measurements only")

    mapping = tuple(measurement_mapping(circuit))
    if not mapping:
        raise ValueError("SpinQ runner requires at least one measurement")
    return mapping


def _build_spinq_circuit(circuit: Circuit, sdk: SpinQSDK) -> Any:
    native_circuit = sdk.circuit_class()
    qubit_count = sum(register.size for register in circuit.quantum_registers)
    native_qubits = list(native_circuit.allocateQubits(qubit_count))
    if len(native_qubits) != qubit_count:
        raise RuntimeError("SpinQit allocated an unexpected number of qubits")
    global_indices = quantum_bit_indices(circuit)

    for operation in circuit.operations:
        if not isinstance(operation, GateOperation):
            continue
        operands = tuple(native_qubits[global_indices[item]] for item in operation.qubits)
        if operation.name == "h" and len(operands) == 1:
            native_circuit << (sdk.h_gate, operands[0])
        elif operation.name == "cx" and len(operands) == 2:
            native_circuit << (sdk.cx_gate, (operands[0], operands[1]))
        else:
            raise ValueError("SpinQ runner does not support gate %r" % operation.name)
    return native_circuit


def normalize_spinq_counts(
    circuit: Circuit,
    measured_qubits: Sequence[int],
    raw_counts: Mapping[str, int],
    shots: int,
) -> Dict[str, int]:
    """将 SpinQ 首字符对应首量子位的 key 转为 LoomQ 位序。"""
    validate_shots(shots)
    if not isinstance(raw_counts, dict) or not raw_counts:
        raise ValueError("SpinQ counts must be a non-empty dict")

    normalized_qubits = [int(qubit) for qubit in measured_qubits]
    if len(set(normalized_qubits)) != len(normalized_qubits):
        raise ValueError("SpinQ measured_qubits contains duplicates")
    mapping = measurement_mapping(circuit)
    normalized: Counter[str] = Counter()
    raw_total = 0

    for key, count in raw_counts.items():
        if not isinstance(key, str) or set(key) - {"0", "1"}:
            raise ValueError("SpinQ count keys must be binary strings")
        if len(key) != len(normalized_qubits):
            raise ValueError("SpinQ count key width does not match measured_qubits")
        if not isinstance(count, int) or isinstance(count, bool) or count < 0:
            raise ValueError("SpinQ count values must be non-negative integers")

        # SpinQ key 从左到右依次对应 configure_measure_qubits 的量子位。
        quantum_values = {
            qubit: int(value) for qubit, value in zip(normalized_qubits, key)
        }
        normalized_key = build_classical_key(circuit, mapping, quantum_values)
        normalized[normalized_key] += count
        raw_total += count

    if raw_total != shots:
        raise ValueError("SpinQ counts total must equal shots exactly")
    return dict(normalized)


def run_spinq(circuit: Circuit, shots: int) -> Dict[str, Any]:
    """在 SpinQit native compiler 与 Basic Simulator 上执行 Circuit。"""
    validate_shots(shots)
    mapping = _validate_final_measurements(circuit)
    measured_qubits = sorted({quantum for quantum, _ in mapping})
    sdk = _load_spinq_sdk()
    native_circuit = _build_spinq_circuit(circuit, sdk)

    compiler = sdk.compiler_factory("native")
    executable = compiler.compile(native_circuit, 0)
    config = sdk.config_class()
    config.configure_shots(shots)
    # SpinQit 0.2.4 的 BasicSimulatorConfig 接收量子位全局索引。
    config.configure_measure_qubits(measured_qubits)
    raw_result = sdk.simulator_factory().execute(executable, config)
    raw_counts = getattr(raw_result, "counts", None)
    if raw_counts is None:
        raise RuntimeError("SpinQ result does not expose counts")
    counts = normalize_spinq_counts(circuit, measured_qubits, raw_counts, shots)

    return create_result(
        backend="spinq_basic_simulator",
        job_id="spinq-local-%s" % uuid4(),
        shots=shots,
        counts=counts,
        meta={
            "simulator": "basic",
            "compiler": "native",
            "optimization_level": 0,
        },
    )
