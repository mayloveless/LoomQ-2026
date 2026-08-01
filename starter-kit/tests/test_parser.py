"""Tests for OpenQASM parsing and semantic validation."""

import unittest
from pathlib import Path

from loomq.errors import QASMSemanticError, UnsupportedGateError
from loomq.ir import GateOperation, MeasureOperation, QubitRef
from loomq.parser import parse_qasm


STARTER_KIT = Path(__file__).resolve().parents[1]


class ParserTests(unittest.TestCase):
    def read_circuit(self, name: str) -> str:
        return (STARTER_KIT / "circuits" / name).read_text(encoding="utf-8")

    def test_bell_registers_and_operation_order(self) -> None:
        circuit = parse_qasm(self.read_circuit("bell.qasm"))

        self.assertEqual([("q", 2)], [(item.name, item.size) for item in circuit.quantum_registers])
        self.assertEqual([("c", 2)], [(item.name, item.size) for item in circuit.classical_registers])
        self.assertEqual(3, len(circuit.operations))
        self.assertEqual(["h", "cx"], [operation.name for operation in circuit.operations[:2]])
        self.assertIsInstance(circuit.operations[2], MeasureOperation)

    def test_ghz3_parses(self) -> None:
        circuit = parse_qasm(self.read_circuit("ghz3.qasm"))

        gates = [operation for operation in circuit.operations if isinstance(operation, GateOperation)]
        self.assertEqual(["h", "cx", "cx"], [gate.name for gate in gates])
        self.assertEqual((QubitRef("q", 1), QubitRef("q", 2)), gates[-1].qubits)

    def test_register_measurement(self) -> None:
        circuit = parse_qasm(
            'OPENQASM 2.0; include "qelib1.inc"; qreg data[2]; '
            "creg result[2]; measure data -> result;"
        )

        measurement = circuit.operations[0]
        self.assertIsInstance(measurement, MeasureOperation)
        self.assertEqual("data", measurement.quantum.register)
        self.assertEqual("result", measurement.classical.register)

    def test_single_qubit_measurement(self) -> None:
        circuit = parse_qasm(
            "OPENQASM 2.0; qreg data[2]; creg result[2]; "
            "measure data[1] -> result[0];"
        )

        measurement = circuit.operations[0]
        self.assertEqual(QubitRef("data", 1), measurement.quantum)
        self.assertEqual(0, measurement.classical.index)

    def test_comments_whitespace_and_multiple_statements_per_line(self) -> None:
        circuit = parse_qasm(
            "  // heading\n"
            " OPENQASM 2.0; include \"qelib1.inc\";\n"
            "qreg data [ 2 ]; creg out[2]; // declarations\n"
            " h data[0] ; cx data[0] ,data[1] ; measure data -> out; // done\n"
        )

        self.assertEqual(["h", "cx"], [operation.name for operation in circuit.operations[:2]])
        self.assertEqual("data", circuit.quantum_registers[0].name)

    def test_undeclared_register_is_rejected_with_line(self) -> None:
        with self.assertRaisesRegex(QASMSemanticError, r"line 3:.*missing.*not declared"):
            parse_qasm("OPENQASM 2.0;\nqreg q[1];\nh missing[0];")

    def test_qubit_index_out_of_range_is_rejected(self) -> None:
        with self.assertRaisesRegex(QASMSemanticError, r"index 2 is out of range"):
            parse_qasm("OPENQASM 2.0; qreg q[2]; h q[2];")

    def test_register_measurement_size_mismatch_is_rejected(self) -> None:
        with self.assertRaisesRegex(QASMSemanticError, "size mismatch"):
            parse_qasm(
                "OPENQASM 2.0; qreg q[2]; creg c[1]; measure q -> c;"
            )

    def test_unsupported_gate_is_rejected(self) -> None:
        with self.assertRaisesRegex(UnsupportedGateError, "unsupported quantum gate 'x'"):
            parse_qasm("OPENQASM 2.0; qreg q[1]; x q[0];")


if __name__ == "__main__":
    unittest.main()
