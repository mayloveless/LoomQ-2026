"""公开 transpile artifact 的三平台厂商 parser/SDK 直测。"""

import importlib.util
import os
import unittest
from typing import Dict

import adapter
from evaluator import calculate_hellinger_fidelity
from scripts.l1_native import execute_native_artifact, normalized_native_counts
from tests.test_l1_hidden_like import (
    DETERMINISTIC_SHOTS,
    GateRecord,
    basis_preparation,
    build_qasm,
    grover_3_operations,
    inverse_operations,
    oracle_cases,
    qft_operations,
    random_identity_case,
)


NATIVE_SHOTS = 4096
SPINQ_CONFIGURED = bool(os.environ.get("LOOMQ_SPINQ_PYTHON"))
ORIGINQ_CONFIGURED = bool(os.environ.get("LOOMQ_ORIGINQ_PYTHON"))
BRAKET_INSTALLED = importlib.util.find_spec("braket") is not None


def probabilities(payload: Dict[str, object], shots: int) -> Dict[str, float]:
    counts = normalized_native_counts(payload, shots)
    return {str(key): int(value) / shots for key, value in counts.items()}


class NativeArtifactShapeTests(unittest.TestCase):
    def test_all_public_artifacts_are_complete_target_programs(self) -> None:
        source = build_qasm(
            3,
            (
                GateRecord("x", (0,)),
                GateRecord("h", (1,)),
                GateRecord("cu1", (0, 1), "pi/2"),
                GateRecord("ccx", (0, 1, 2)),
            ),
        )
        artifacts = {
            target: adapter.transpile(source, target)
            for target in ("spinq", "originq", "braket")
        }

        self.assertTrue(artifacts["spinq"].startswith("OPENQASM 2.0;"))
        self.assertIn("qreg q[3];", artifacts["spinq"])
        self.assertIn("measure q -> c;", artifacts["spinq"])
        self.assertTrue(artifacts["originq"].startswith("QINIT 3\nCREG 3\n"))
        self.assertIn("MEASURE q[2], c[2]", artifacts["originq"])
        self.assertTrue(artifacts["braket"].startswith("OPENQASM 3.0;"))
        self.assertIn("qubit[3] q;", artifacts["braket"])
        self.assertIn("c = measure q;", artifacts["braket"])

    def test_cu1_artifacts_keep_source_operand_order(self) -> None:
        source = build_qasm(
            2,
            (GateRecord("cu1", (0, 1), "pi/2"),),
        )
        for target in ("spinq", "originq", "braket"):
            with self.subTest(target=target):
                artifact = adapter.transpile(source, target)
                gate_line = next(
                    line
                    for line in artifact.splitlines()
                    if "q[0]" in line
                    and "q[1]" in line
                    and "measure" not in line.lower()
                )
                self.assertLess(gate_line.index("q[0]"), gate_line.index("q[1]"))
        # CU1/controlled-phase 的矩阵对两操作数对称，方向只能静态检查；
        # CX Oracle 负责对可观测的 control/target 方向做语义攻击。


class _NativeTargetMixin:
    TARGET = ""

    def run_native(
        self, source: str, shots: int = DETERMINISTIC_SHOTS
    ) -> Dict[str, float]:
        artifact = adapter.transpile(source, self.TARGET)
        payload = execute_native_artifact(self.TARGET, artifact, shots)
        return probabilities(payload, shots)

    def assert_deterministic(self, source: str, expected_key: str) -> None:
        observed = self.run_native(source)
        self.assertGreaterEqual(  # type: ignore[attr-defined]
            observed.get(expected_key, 0.0), 0.999
        )

    def test_direct_native_oracle_subset(self) -> None:
        for case in oracle_cases():
            if case.case_id == "multiple_classical_registers":
                # 厂商结果对象未统一暴露未测量经典位，映射由 adapter.run 覆盖。
                continue
            with self.subTest(case_id=case.case_id):  # type: ignore[attr-defined]
                self.assert_deterministic(case.source, case.expected_key)

    def test_direct_native_hidden_like_representatives(self) -> None:
        ghz_source = build_qasm(
            5,
            (GateRecord("h", (0,)),)
            + tuple(GateRecord("cx", (index, index + 1)) for index in range(4)),
        )
        ghz = self.run_native(ghz_source, NATIVE_SHOTS)
        self.assertGreaterEqual(  # type: ignore[attr-defined]
            calculate_hellinger_fidelity(
                ghz, {"00000": 0.5, "11111": 0.5}
            ),
            0.97,
        )

        qft = qft_operations(4)
        qft_source = build_qasm(
            4, basis_preparation("1010") + qft + inverse_operations(qft)
        )
        self.assert_deterministic(qft_source, "1010")

        grover = self.run_native(
            build_qasm(3, grover_3_operations()), NATIVE_SHOTS
        )
        self.assertEqual(  # type: ignore[attr-defined]
            "111", max(grover, key=grover.__getitem__)
        )
        self.assertGreaterEqual(grover.get("111", 0.0), 0.70)  # type: ignore[attr-defined]

        random_source, initial_key, _operations = random_identity_case(20260801)
        self.assert_deterministic(random_source, initial_key)


@unittest.skipUnless(SPINQ_CONFIGURED, "LOOMQ_SPINQ_PYTHON is not configured")
class SpinQNativeArtifactIntegrationTests(_NativeTargetMixin, unittest.TestCase):
    TARGET = "spinq"


@unittest.skipUnless(
    ORIGINQ_CONFIGURED, "LOOMQ_ORIGINQ_PYTHON is not configured"
)
class OriginQNativeArtifactIntegrationTests(_NativeTargetMixin, unittest.TestCase):
    TARGET = "originq"


@unittest.skipUnless(BRAKET_INSTALLED, "amazon-braket-sdk is not installed")
class BraketNativeArtifactIntegrationTests(_NativeTargetMixin, unittest.TestCase):
    TARGET = "braket"


if __name__ == "__main__":
    unittest.main()
