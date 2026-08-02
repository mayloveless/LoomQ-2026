"""SpinQ Runner 的 native gate、位序、SDK 边界和集成测试。"""

import importlib.util
import unittest
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import adapter
from evaluator import calculate_hellinger_fidelity, validate_schema
from loomq.ir import Circuit, GateOperation, QubitRef
from loomq.parser import parse_qasm
from loomq.runners.spinq import (
    SpinQSDK,
    _build_spinq_circuit,
    _load_spinq_sdk,
    normalize_spinq_counts,
    run_spinq,
)


STARTER_KIT = Path(__file__).resolve().parents[1]
SPINQ_INSTALLED = importlib.util.find_spec("spinqit") is not None


def qasm(body: str, qreg: str = "qreg q[2];", creg: str = "creg c[2];") -> str:
    return 'OPENQASM 2.0; include "qelib1.inc"; %s %s %s' % (
        qreg,
        creg,
        body,
    )


class FakeNativeCircuit:
    def __init__(self) -> None:
        self.operations = []
        self.qubits = []

    def allocateQubits(self, count):  # type: ignore[no-untyped-def]
        self.qubits = ["q%d" % index for index in range(count)]
        return self.qubits

    def __lshift__(self, operation):  # type: ignore[no-untyped-def]
        self.operations.append(operation)
        return self


def fake_sdk() -> SpinQSDK:
    return SpinQSDK(
        config_class=mock.Mock,
        circuit_class=FakeNativeCircuit,
        cx_gate="CX",
        h_gate="H",
        simulator_factory=mock.Mock,
        compiler_factory=mock.Mock,
    )


class SpinQNormalizationTests(unittest.TestCase):
    def test_standard_mapping_reorders_raw_key(self) -> None:
        circuit = parse_qasm(qasm("measure q -> c;"))

        counts = normalize_spinq_counts(circuit, [0, 1], {"10": 3}, 3)

        self.assertEqual({"01": 3}, counts)

    def test_crossed_mapping_uses_classical_targets(self) -> None:
        circuit = parse_qasm(
            qasm("measure q[0] -> c[1]; measure q[1] -> c[0];")
        )

        counts = normalize_spinq_counts(circuit, [0, 1], {"10": 2}, 2)

        self.assertEqual({"10": 2}, counts)

    def test_unmeasured_classical_bits_default_to_zero(self) -> None:
        circuit = parse_qasm(qasm("measure q[1] -> c[0];"))

        counts = normalize_spinq_counts(circuit, [1], {"1": 1}, 1)

        self.assertEqual({"01": 1}, counts)

    def test_invalid_raw_key_width_is_rejected(self) -> None:
        circuit = parse_qasm(qasm("measure q -> c;"))

        with self.assertRaisesRegex(ValueError, "width"):
            normalize_spinq_counts(circuit, [0, 1], {"1": 1}, 1)

    def test_non_binary_key_is_rejected(self) -> None:
        circuit = parse_qasm(qasm("measure q -> c;"))

        with self.assertRaisesRegex(ValueError, "binary"):
            normalize_spinq_counts(circuit, [0, 1], {"20": 1}, 1)

    def test_invalid_count_is_rejected(self) -> None:
        circuit = parse_qasm(qasm("measure q -> c;"))

        with self.assertRaisesRegex(ValueError, "non-negative integers"):
            normalize_spinq_counts(circuit, [0, 1], {"00": True}, 1)

    def test_counts_total_must_match_shots(self) -> None:
        circuit = parse_qasm(qasm("measure q -> c;"))

        with self.assertRaisesRegex(ValueError, "total must equal shots"):
            normalize_spinq_counts(circuit, [0, 1], {"00": 1}, 2)


class SpinQNativeCircuitTests(unittest.TestCase):
    def test_h_and_cx_are_mapped_to_native_gates(self) -> None:
        circuit = parse_qasm(
            qasm("h q[0]; cx q[0], q[1]; measure q -> c;")
        )

        native = _build_spinq_circuit(circuit, fake_sdk())

        self.assertEqual([("H", "q0"), ("CX", ("q0", "q1"))], native.operations)

    def test_multiple_quantum_registers_use_global_order(self) -> None:
        circuit = parse_qasm(
            qasm(
                "h right[0]; cx left[1], right[0]; measure right[0] -> c[0];",
                qreg="qreg left[2]; qreg right[1];",
            )
        )

        native = _build_spinq_circuit(circuit, fake_sdk())

        self.assertEqual([("H", "q2"), ("CX", ("q1", "q2"))], native.operations)

    def test_unsupported_gate_is_rejected(self) -> None:
        circuit = parse_qasm(qasm("measure q -> c;"))
        unsupported = replace(
            circuit,
            operations=(GateOperation("x", (QubitRef("q", 0),)),)
            + circuit.operations,
        )

        with self.assertRaisesRegex(ValueError, "does not support gate 'x'"):
            _build_spinq_circuit(unsupported, fake_sdk())


class SpinQRunnerTests(unittest.TestCase):
    def test_runner_configures_sdk_and_creates_schema(self) -> None:
        circuit = parse_qasm(
            qasm("h q[0]; cx q[0], q[1]; measure q -> c;")
        )

        class FakeConfig:
            last = None

            def __init__(self) -> None:
                self.shots = None
                self.measured_qubits = None
                FakeConfig.last = self

            def configure_shots(self, shots):  # type: ignore[no-untyped-def]
                self.shots = shots

            def configure_measure_qubits(self, qubits):  # type: ignore[no-untyped-def]
                self.measured_qubits = qubits

        compiler = mock.Mock()
        compiler.compile.return_value = "executable"
        simulator = mock.Mock()
        simulator.execute.return_value = SimpleNamespace(counts={"00": 1, "11": 1})
        sdk = SpinQSDK(
            config_class=FakeConfig,
            circuit_class=FakeNativeCircuit,
            cx_gate="CX",
            h_gate="H",
            simulator_factory=mock.Mock(return_value=simulator),
            compiler_factory=mock.Mock(return_value=compiler),
        )

        with mock.patch("loomq.runners.spinq._load_spinq_sdk", return_value=sdk):
            result = run_spinq(circuit, 2)

        self.assertEqual("spinq_basic_simulator", result["backend"])
        self.assertEqual({"00": 1, "11": 1}, result["counts"])
        self.assertTrue(result["job_id"].startswith("spinq-local-"))
        sdk.compiler_factory.assert_called_once_with("native")
        compiler.compile.assert_called_once_with(mock.ANY, 0)
        self.assertEqual(2, FakeConfig.last.shots)
        self.assertEqual([0, 1], FakeConfig.last.measured_qubits)
        simulator.execute.assert_called_once_with("executable", FakeConfig.last)

    def test_no_measurement_is_rejected_before_sdk_load(self) -> None:
        circuit = parse_qasm(qasm("h q[0];"))

        with self.assertRaisesRegex(ValueError, "at least one measurement"):
            run_spinq(circuit, 1)

    def test_mid_circuit_measurement_is_rejected(self) -> None:
        circuit = parse_qasm(qasm("measure q[0] -> c[0]; h q[1];"))

        with self.assertRaisesRegex(ValueError, "final measurements only"):
            run_spinq(circuit, 1)

    def test_missing_sdk_has_clear_message(self) -> None:
        with mock.patch(
            "loomq.runners.spinq.importlib.import_module",
            side_effect=ModuleNotFoundError("No module named 'spinqit'"),
        ):
            with self.assertRaisesRegex(RuntimeError, "install starter-kit/requirements.txt"):
                _load_spinq_sdk()


class AdapterSpinQTests(unittest.TestCase):
    def test_adapter_routes_parsed_circuit_to_spinq(self) -> None:
        source = qasm("measure q -> c;")
        expected = {"backend": "sentinel"}

        with mock.patch("adapter.run_spinq", return_value=expected) as runner:
            result = adapter.run(source, "spinq", 32)

        self.assertIs(expected, result)
        circuit, shots = runner.call_args.args
        self.assertIsInstance(circuit, Circuit)
        self.assertEqual(32, shots)


@unittest.skipUnless(SPINQ_INSTALLED, "spinqit is not installed on this platform")
class SpinQIntegrationTests(unittest.TestCase):
    def run_public_circuit(self, name: str, expected: dict) -> None:
        source = (STARTER_KIT / "circuits" / name).read_text(encoding="utf-8")
        result = adapter.run(source, "spinq", 512)
        valid, reason = validate_schema(result)

        self.assertTrue(valid, reason)
        self.assertEqual(512, sum(result["counts"].values()))
        self.assertTrue(set(result["counts"]).issubset(expected))
        observed = {
            key: value / result["shots"] for key, value in result["counts"].items()
        }
        self.assertGreaterEqual(calculate_hellinger_fidelity(observed, expected), 0.97)

    def test_bell_basic_simulator(self) -> None:
        self.run_public_circuit("bell.qasm", {"00": 0.5, "11": 0.5})

    def test_ghz3_basic_simulator(self) -> None:
        self.run_public_circuit("ghz3.qasm", {"000": 0.5, "111": 0.5})


if __name__ == "__main__":
    unittest.main()
