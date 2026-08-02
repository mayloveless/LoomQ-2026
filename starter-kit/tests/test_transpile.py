"""Tests for target serializers and adapter routing."""

import unittest

import adapter
from loomq.parser import parse_qasm
from loomq.serializers import serialize_braket, serialize_spinq


CUSTOM_QASM = """OPENQASM 2.0;
include "qelib1.inc";
qreg data[2];
creg result[2];
h data[0];
cx data[0], data[1];
measure data -> result;
"""


class SerializerTests(unittest.TestCase):
    def test_spinq_output_is_complete_and_semantically_parseable(self) -> None:
        output = serialize_spinq(parse_qasm(CUSTOM_QASM))

        self.assertIn("OPENQASM 2.0;", output)
        self.assertIn('include "qelib1.inc";', output)
        self.assertIn("qreg data[2];", output)
        self.assertIn("creg result[2];", output)
        self.assertIn("cx data[0], data[1];", output)
        reparsed = parse_qasm(output)
        self.assertEqual(parse_qasm(CUSTOM_QASM), reparsed)

    def test_braket_output_has_qasm3_declarations_and_operations(self) -> None:
        output = serialize_braket(parse_qasm(CUSTOM_QASM))

        expected_lines = {
            "OPENQASM 3.0;",
            'include "stdgates.inc";',
            "qubit[2] data;",
            "bit[2] result;",
            "h data[0];",
            "cnot data[0], data[1];",
            "result = measure data;",
        }
        self.assertTrue(expected_lines.issubset(set(output.splitlines())))

    def test_braket_can_omit_stdgates_without_changing_program_body(self) -> None:
        circuit = parse_qasm(CUSTOM_QASM)
        default_output = serialize_braket(circuit)
        local_simulator_output = serialize_braket(circuit, include_stdgates=False)

        self.assertIn('include "stdgates.inc";', default_output)
        self.assertNotIn('include "stdgates.inc";', local_simulator_output)
        # 除 include 外，寄存器、门和测量语句必须保持完全一致。
        self.assertEqual(
            [line for line in default_output.splitlines() if "stdgates.inc" not in line],
            local_simulator_output.splitlines(),
        )

    def test_braket_single_bit_measurement(self) -> None:
        circuit = parse_qasm(
            "OPENQASM 2.0; qreg q[1]; creg c[1]; measure q[0] -> c[0];"
        )

        self.assertIn("c[0] = measure q[0];", serialize_braket(circuit))


class AdapterTests(unittest.TestCase):
    def test_transpile_routes_spinq_and_braket(self) -> None:
        spinq = adapter.transpile(CUSTOM_QASM, "spinq")
        braket = adapter.transpile(CUSTOM_QASM, "braket")

        self.assertTrue(spinq.startswith("OPENQASM 2.0;"))
        self.assertTrue(braket.startswith("OPENQASM 3.0;"))
        self.assertIn('include "stdgates.inc";', braket)
        self.assertIn("cnot data[0], data[1];", braket)

    def test_unsupported_target_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported transpile target"):
            adapter.transpile(CUSTOM_QASM, "originq")

    def test_non_string_target_is_rejected_cleanly(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported transpile target"):
            adapter.transpile(CUSTOM_QASM, None)  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
