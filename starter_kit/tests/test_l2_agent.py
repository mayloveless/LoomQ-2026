"""Task 11A tests for the one-shot L2 QASM generation pipeline."""

import json
import unittest
from unittest import mock

import adapter
from loomq.l2_agent import agent_chat, parse_generation_response
from loomq.ir import (
    ClassicalRegisterRef,
    GateOperation,
    MeasureOperation,
    QuantumRegisterRef,
    QubitRef,
)
from loomq.parser import parse_qasm
from loomq.qasm_tools import QASMValidationError, extract_qasm, validate_qasm


GHZ_QASM = """OPENQASM 2.0;
include "qelib1.inc";
qreg q[3];
creg c[3];
h q[0];
cx q[0],q[1];
cx q[1],q[2];
measure q -> c;"""

BELL_QASM = """OPENQASM 2.0;
include "qelib1.inc";
qreg q[2];
creg c[2];
h q[0];
cx q[0],q[1];
measure q -> c;"""

STATE_ONLY_BELL_QASM = """OPENQASM 2.0;
include "qelib1.inc";
qreg q[2];
h q[0];
cx q[0],q[1];"""


def completion(content):
    return {"choices": [{"message": {"content": content}}]}


def generation_json(
    qasm=GHZ_QASM,
    explanation="已生成三比特电路。",
    task_type="generate_qasm",
):
    return json.dumps(
        {
            "task_type": task_type,
            "qasm": qasm,
            "explanation": explanation,
        },
        ensure_ascii=False,
    )


def reply_qasm(reply):
    return reply.split("```qasm\n", 1)[1].rsplit("\n```", 1)[0]


class L2AgentTests(unittest.TestCase):
    @mock.patch("loomq.l2_agent.llm_client.chat_completion")
    def test_adapter_returns_parser_valid_qasm_and_calls_model_once(self, chat):
        chat.return_value = completion(generation_json())

        reply = adapter.agent_chat("生成一个三比特纠缠电路并测量")

        extracted = extract_qasm(reply_qasm(reply))
        self.assertIsNotNone(extracted)
        parse_qasm(extracted)
        chat.assert_called_once()
        messages = chat.call_args.args[0]
        self.assertEqual(messages[-1]["content"], "生成一个三比特纠缠电路并测量")
        self.assertIn("只返回一个 JSON 对象", messages[0]["content"])

    def test_plain_json_response_is_parsed(self):
        parsed = parse_generation_response(completion(generation_json()))
        self.assertEqual(parsed.qasm, GHZ_QASM)
        self.assertEqual(parsed.explanation, "已生成三比特电路。")

    def test_fenced_json_response_is_parsed(self):
        content = "```json\n%s\n```" % generation_json()
        self.assertEqual(parse_generation_response(completion(content)).qasm, GHZ_QASM)

    def test_plain_qasm_is_extracted(self):
        self.assertEqual(extract_qasm("\n" + GHZ_QASM + "\n"), GHZ_QASM)

    def test_fenced_qasm_is_extracted(self):
        fenced = "```openqasm\n%s\n```" % GHZ_QASM
        self.assertEqual(extract_qasm(fenced), GHZ_QASM)

    def test_missing_choices_fails_stably(self):
        with self.assertRaisesRegex(RuntimeError, "missing choices"):
            parse_generation_response({})

    def test_empty_content_fails_stably(self):
        with self.assertRaisesRegex(RuntimeError, "non-empty string"):
            parse_generation_response(completion("  "))

    def test_invalid_json_fails_stably(self):
        with self.assertRaisesRegex(RuntimeError, "not valid JSON"):
            parse_generation_response(completion("{broken"))

    def test_missing_or_invalid_task_type_fails_stably(self):
        for task_type in (None, "unsupported_task"):
            payload = {"qasm": GHZ_QASM}
            if task_type is not None:
                payload["task_type"] = task_type
            with self.subTest(task_type=task_type):
                with self.assertRaisesRegex(RuntimeError, "task_type"):
                    parse_generation_response(completion(json.dumps(payload)))

    def test_two_invalid_qasm_candidates_stop_after_one_repair(self):
        invalid = GHZ_QASM.replace("h q[0];", "invalid q[0];")
        with mock.patch(
            "loomq.l2_agent.llm_client.chat_completion",
            side_effect=[
                completion(generation_json(qasm=invalid)),
                completion(generation_json(qasm=invalid, task_type="repair_qasm")),
            ],
        ) as chat:
            with self.assertRaisesRegex(RuntimeError, "repair limit reached"):
                agent_chat("生成电路")
        self.assertEqual(chat.call_count, 2)

    def test_transport_exception_does_not_expose_key(self):
        test_key = "test-secret-api-key"
        with mock.patch(
            "loomq.l2_agent.llm_client.chat_completion",
            side_effect=RuntimeError("Authorization: Bearer " + test_key),
        ):
            with self.assertRaisesRegex(RuntimeError, "model request failed") as caught:
                agent_chat("生成电路")
        self.assertNotIn(test_key, str(caught.exception))
        self.assertNotIn("Authorization", str(caught.exception))

    def test_explanation_may_be_missing(self):
        content = json.dumps({"task_type": "generate_qasm", "qasm": GHZ_QASM})
        parsed = parse_generation_response(completion(content))
        self.assertEqual(parsed.explanation, "")

    def test_explanation_cannot_add_a_second_qasm_program(self):
        content = generation_json(explanation="另一个 OPENQASM 2.0; 程序")
        with self.assertRaisesRegex(RuntimeError, "must not contain code"):
            parse_generation_response(completion(content))

    def test_validate_qasm_uses_existing_parser_contract(self):
        self.assertIsNone(validate_qasm(GHZ_QASM))

    def test_state_preparation_does_not_require_classical_register_or_measurement(self):
        self.assertIsNone(validate_qasm(STATE_ONLY_BELL_QASM))
        with self.assertRaisesRegex(QASMValidationError, "failed OpenQASM"):
            validate_qasm(STATE_ONLY_BELL_QASM, require_measurement=True)

    def test_quantum_register_is_always_required(self):
        no_quantum_register = """OPENQASM 2.0;
include "qelib1.inc";
creg c[1];"""
        with self.assertRaisesRegex(QASMValidationError, "failed OpenQASM"):
            validate_qasm(no_quantum_register)

    @mock.patch("loomq.l2_agent.llm_client.chat_completion")
    def test_state_only_request_accepts_unmeasured_qasm_in_one_call(self, chat):
        chat.return_value = completion(generation_json(qasm=STATE_ONLY_BELL_QASM))

        reply = agent_chat("生成一个 2 比特 Bell 态，不要求测量。")

        chat.assert_called_once()
        circuit = parse_qasm(reply_qasm(reply))
        self.assertFalse(circuit.classical_registers)
        self.assertFalse(
            any(isinstance(operation, MeasureOperation) for operation in circuit.operations)
        )

    def test_repair_task_type_is_supported(self):
        parsed = parse_generation_response(
            completion(generation_json(qasm=BELL_QASM, task_type="repair_qasm"))
        )
        self.assertEqual(parsed.task_type, "repair_qasm")

    @mock.patch("loomq.l2_agent.llm_client.chat_completion")
    def test_bell_repair_calls_twice_and_preserves_target_structure(self, chat):
        broken_bell = BELL_QASM.replace("h q[0];", "h q[0]")
        chat.side_effect = [
            completion(
                generation_json(
                    qasm=broken_bell,
                    task_type="repair_qasm",
                    explanation="发现待修复电路。",
                )
            ),
            completion(
                generation_json(
                    qasm=BELL_QASM,
                    task_type="repair_qasm",
                    explanation="已修复 Bell 电路。",
                )
            ),
        ]

        reply = agent_chat("修复以下程序，保持 Bell 态并全测量")

        self.assertEqual(chat.call_count, 2)
        circuit = parse_qasm(reply_qasm(reply))
        self.assertEqual(
            circuit.operations,
            (
                GateOperation("h", (QubitRef("q", 0),)),
                GateOperation("cx", (QubitRef("q", 0), QubitRef("q", 1))),
                MeasureOperation(
                    QuantumRegisterRef("q"),
                    ClassicalRegisterRef("c"),
                ),
            ),
        )

        repair_context = json.loads(chat.call_args_list[1].args[0][-1]["content"])
        self.assertEqual(
            repair_context["original_user_request"],
            "修复以下程序，保持 Bell 态并全测量",
        )
        self.assertEqual(repair_context["candidate_qasm"], broken_bell)
        self.assertIn("保持原始用户请求", repair_context["instruction"])
        self.assertEqual(
            repair_context["response_schema"]["task_type"], "repair_qasm"
        )
        self.assertTrue(repair_context["require_measurement"])

    @mock.patch("loomq.l2_agent.llm_client.chat_completion")
    def test_generated_qasm_without_measurement_is_repaired(self, chat):
        no_measurement = GHZ_QASM.replace("measure q -> c;", "")
        chat.side_effect = [
            completion(generation_json(qasm=no_measurement)),
            completion(generation_json(qasm=GHZ_QASM, task_type="repair_qasm")),
        ]

        reply = agent_chat("生成三比特 GHZ 态并全测量")

        self.assertEqual(chat.call_count, 2)
        circuit = parse_qasm(reply_qasm(reply))
        self.assertIsInstance(circuit.operations[-1], MeasureOperation)
        context = json.loads(chat.call_args_list[1].args[0][-1]["content"])
        self.assertTrue(context["require_measurement"])

    @mock.patch("loomq.l2_agent.llm_client.chat_completion")
    def test_repair_prompt_uses_clean_bounded_parser_error(self, chat):
        broken = BELL_QASM.replace(
            'include "qelib1.inc";',
            'include "/Users/tester/private/secret.inc";',
        )
        chat.side_effect = [
            completion(generation_json(qasm=broken, task_type="repair_qasm")),
            completion(generation_json(qasm=BELL_QASM, task_type="repair_qasm")),
        ]

        agent_chat("修复 Bell 电路")

        context = json.loads(chat.call_args_list[1].args[0][-1]["content"])
        self.assertIn("/Users/tester/private/secret.inc", context["candidate_qasm"])
        self.assertNotIn("/Users", context["parser_error"])
        self.assertNotIn("Traceback", context["parser_error"])
        self.assertNotIn("LOOMQ_", context["parser_error"])
        self.assertLessEqual(len(context["parser_error"]), 400)

    def test_fenced_qasm_with_surrounding_explanation_is_extracted(self):
        text = "这是修复结果：\n```\n%s\n```\n已保持测量语义。" % BELL_QASM
        self.assertEqual(extract_qasm(text), BELL_QASM)

    def test_conflicting_multiple_qasm_programs_are_rejected(self):
        text = "```qasm\n%s\n```\n```openqasm\n%s\n```" % (
            BELL_QASM,
            GHZ_QASM,
        )
        self.assertIsNone(extract_qasm(text))

    def test_final_double_failure_does_not_expose_test_key(self):
        test_key = "repair-test-secret-key"
        invalid = BELL_QASM.replace("h q[0];", "unknown_%s q[0];" % test_key)
        responses = [
            completion(generation_json(qasm=invalid)),
            completion(generation_json(qasm=invalid, task_type="repair_qasm")),
        ]
        with mock.patch(
            "loomq.l2_agent.llm_client.chat_completion", side_effect=responses
        ):
            with self.assertRaisesRegex(RuntimeError, "repair limit reached") as caught:
                agent_chat("生成 Bell 电路")
        self.assertNotIn(test_key, str(caught.exception))


if __name__ == "__main__":
    unittest.main()
