"""Quantum RISC-V Bonus 的编码、模拟器与完整链路测试。"""

import unittest

try:
    from starter_kit.bonus.quantum_riscv import (
        QuantumInstruction,
        QuantumInstructionError,
        QuantumRISCVEmulator,
        QuantumTranslationError,
        TraceCoprocessor,
        decode_quantum_instruction,
        encode_qcx,
        encode_qh,
        encode_qmeas,
        encode_qx,
        quantum_ops_to_words,
    )
    from starter_kit.loomq.l3 import compile_hybrid_source
    from starter_kit.riscv_emulator import TinyRISCVEmulator
except ModuleNotFoundError as error:
    # Starter Kit 的既有 full-test 命令以 starter_kit/ 为模块根。
    if error.name != "starter_kit":
        raise
    from bonus.quantum_riscv import (
        QuantumInstruction,
        QuantumInstructionError,
        QuantumRISCVEmulator,
        QuantumTranslationError,
        TraceCoprocessor,
        decode_quantum_instruction,
        encode_qcx,
        encode_qh,
        encode_qmeas,
        encode_qx,
        quantum_ops_to_words,
    )
    from loomq.l3 import compile_hybrid_source
    from riscv_emulator import TinyRISCVEmulator


def word_lines(words):
    return "\n".join(".word 0x%08X" % word for word in words)


class QuantumEncodingTests(unittest.TestCase):
    def test_bit_exact_examples(self):
        self.assertEqual(0x0000000B, encode_qh(0))
        self.assertEqual(0x000F900B, encode_qx(31))
        self.assertEqual(0x0010200B, encode_qcx(0, 1))
        self.assertEqual(0x0000350B, encode_qmeas(0, 10))

    def test_all_instructions_round_trip_at_boundaries(self):
        cases = (
            (encode_qh(0), QuantumInstruction("QH", 0)),
            (encode_qh(31), QuantumInstruction("QH", 31)),
            (encode_qx(0), QuantumInstruction("QX", 0)),
            (encode_qx(31), QuantumInstruction("QX", 31)),
            (encode_qcx(0, 31), QuantumInstruction("QCX", 0, q1=31)),
            (encode_qcx(31, 0), QuantumInstruction("QCX", 31, q1=0)),
            (encode_qmeas(0, 1), QuantumInstruction("QMEAS", 0, rd=1)),
            (encode_qmeas(31, 31), QuantumInstruction("QMEAS", 31, rd=31)),
        )
        for word, expected in cases:
            with self.subTest(word="0x%08x" % word):
                self.assertEqual(expected, decode_quantum_instruction(word))
                self.assertGreaterEqual(word, 0)
                self.assertLessEqual(word, 0xFFFFFFFF)

    def test_encoder_rejects_invalid_operands(self):
        for value in (-1, 32):
            with self.subTest(qubit=value):
                with self.assertRaises(QuantumInstructionError):
                    encode_qh(value)
        with self.assertRaises(TypeError):
            encode_qx(True)
        with self.assertRaises(QuantumInstructionError):
            encode_qcx(4, 4)
        with self.assertRaises(QuantumInstructionError):
            encode_qmeas(0, 0)
        with self.assertRaises(QuantumInstructionError):
            encode_qmeas(0, 32)

    def test_decoder_rejects_invalid_opcode_funct_and_word_range(self):
        with self.assertRaisesRegex(QuantumInstructionError, "opcode"):
            decode_quantum_instruction(encode_qh(0) ^ 0x01)
        with self.assertRaisesRegex(QuantumInstructionError, "funct3"):
            decode_quantum_instruction((4 << 12) | 0x0B)
        with self.assertRaisesRegex(QuantumInstructionError, "funct7"):
            decode_quantum_instruction((1 << 25) | encode_qh(0))
        for word in (-1, 1 << 32):
            with self.assertRaises(QuantumInstructionError):
                decode_quantum_instruction(word)

    def test_decoder_rejects_nonzero_reserved_fields(self):
        invalid_words = (
            encode_qh(0) | (1 << 20),
            encode_qx(0) | (1 << 7),
            encode_qcx(0, 1) | (1 << 7),
            encode_qmeas(0, 1) | (1 << 20),
            0x0B | (2 << 15) | (2 << 20) | (2 << 12),
            0x0B | (3 << 12),
        )
        for word in invalid_words:
            with self.subTest(word="0x%08x" % word):
                with self.assertRaises(QuantumInstructionError):
                    decode_quantum_instruction(word)


class QuantumTranslatorTests(unittest.TestCase):
    def test_supported_quantum_ops_translate_in_order(self):
        words = quantum_ops_to_words(
            ["h q[0];", "x q[31];", "cx q[0], q[1];", "measure q[0] -> c[0];"]
        )
        self.assertEqual(
            [encode_qh(0), encode_qx(31), encode_qcx(0, 1), encode_qmeas(0, 10)],
            words,
        )

    def test_unsupported_gate_fails_without_silent_drop(self):
        with self.assertRaisesRegex(
            QuantumTranslationError, "unsupported by Quantum RISC-V Bonus ISA"
        ):
            quantum_ops_to_words(["h q[0];", "rz(pi / 2) q[0];"])

    def test_classical_mapping_range_is_enforced(self):
        self.assertEqual([encode_qmeas(31, 31)], quantum_ops_to_words(["measure q[31] -> c[21];"]))
        with self.assertRaises(QuantumInstructionError):
            quantum_ops_to_words(["measure q[0] -> c[22];"])


class QuantumEmulatorTests(unittest.TestCase):
    def test_trace_backend_requires_integer_bits(self):
        for invalid in (True, 1.0, -1, 2):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    TraceCoprocessor([invalid])

    def test_classical_program_matches_official_emulator(self):
        program = """
        li x1, 5
        li x2, 8
        add x3, x1, x2
        bne x1, x2, DIFFERENT
        li x4, 99
        DIFFERENT:
        sub x4, x2, x1
        addi x4, x4, 7
        beq x4, x2, END
        li x5, 99
        END:
        addi x6, x0, 1
        """
        official = TinyRISCVEmulator()
        official.load_program(program)
        extended = QuantumRISCVEmulator(TraceCoprocessor())
        extended.load_program(program)
        self.assertEqual(official.execute(), extended.execute())
        self.assertEqual([], extended.quantum_trace)

    def test_measurement_writeback_controls_beq_and_bne(self):
        measurement_word = encode_qmeas(3, 10)
        program = """
        .word 0x%08X
        beq x10, x0, ZERO_PATH
        bne x10, x0, ONE_PATH
        li x1, 999
        ZERO_PATH:
        li x1, 100
        j END
        ONE_PATH:
        li x1, 200
        END:
        addi x2, x1, 1
        """ % measurement_word

        for measurement, expected in ((0, 100), (1, 200)):
            with self.subTest(measurement=measurement):
                backend = TraceCoprocessor([measurement])
                emulator = QuantumRISCVEmulator(backend)
                emulator.load_program(program)
                state = emulator.execute()
                self.assertEqual(measurement, state.get("x10", 0))
                self.assertEqual(expected, state["x1"])
                self.assertEqual(expected + 1, state["x2"])
                expected_trace = [QuantumInstruction("QMEAS", 3, rd=10)]
                self.assertEqual(expected_trace, emulator.quantum_trace)
                self.assertEqual(expected_trace, backend.trace)

    def test_raw_word_must_decode_and_backend_result_must_be_bit(self):
        emulator = QuantumRISCVEmulator(TraceCoprocessor())
        emulator.load_program(".word 0x00000013")
        with self.assertRaises(QuantumInstructionError):
            emulator.execute()

        class InvalidMeasurementCoprocessor:
            def __init__(self, result):
                self.result = result

            def apply_gate(self, command):
                pass

            def measure(self, command):
                return self.result

        for invalid in (True, 1.0, 2):
            with self.subTest(invalid=invalid):
                emulator = QuantumRISCVEmulator(
                    InvalidMeasurementCoprocessor(invalid)
                )
                emulator.load_program(".word 0x%08X" % encode_qmeas(0, 10))
                with self.assertRaisesRegex(ValueError, "measurement"):
                    emulator.execute()


class QuantumRISCVE2ETests(unittest.TestCase):
    def test_quantum_ops_to_words_to_emulator_to_trace(self):
        source = """
        OPENQASM 2.0;
        include "qelib1.inc";
        qreg q[2];
        creg c[1];
        h q[0];
        cx q[0], q[1];
        measure q[0] -> c[0];
        classical {
          if (c[0] == 1) { r1 = 200; } else { r1 = 100; }
          r2 = r1 + 1;
        }
        """
        quantum_ops, classical_assembly = compile_hybrid_source(source)
        words = quantum_ops_to_words(quantum_ops)
        program = word_lines(words) + "\n" + classical_assembly
        backend = TraceCoprocessor([1])
        emulator = QuantumRISCVEmulator(backend)
        emulator.load_program(program)
        state = emulator.execute()

        self.assertEqual([0x0000000B, 0x0010200B, 0x0000350B], words)
        self.assertEqual(
            [
                QuantumInstruction("QH", 0),
                QuantumInstruction("QCX", 0, q1=1),
                QuantumInstruction("QMEAS", 0, rd=10),
            ],
            backend.trace,
        )
        self.assertEqual(1, state["x10"])
        self.assertEqual(200, state["x1"])
        self.assertEqual(201, state["x2"])


if __name__ == "__main__":
    unittest.main()
