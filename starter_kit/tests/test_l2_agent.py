"""Task 11A tests for the one-shot L2 QASM generation pipeline."""

import json
import unittest
from unittest import mock

import adapter
from loomq.l2_agent import agent_chat, parse_generation_response
from loomq.parser import parse_qasm
from loomq.qasm_tools import extract_qasm, validate_qasm


GHZ_QASM = """OPENQASM 2.0;
include "qelib1.inc";
qreg q[3];
creg c[3];
h q[0];
cx q[0],q[1];
cx q[1],q[2];
measure q -> c;"""


def completion(content):
    return {"choices": [{"message": {"content": content}}]}


def generation_json(qasm=GHZ_QASM, explanation="已生成三比特电路。"):
    return json.dumps(
        {
            "task_type": "generate_qasm",
            "qasm": qasm,
            "explanation": explanation,
        },
        ensure_ascii=False,
    )


class L2AgentTests(unittest.TestCase):
    @mock.patch("loomq.l2_agent.llm_client.chat_completion")
    def test_adapter_returns_parser_valid_qasm_and_calls_model_once(self, chat):
        chat.return_value = completion(generation_json())

        reply = adapter.agent_chat("生成一个三比特纠缠电路并测量")

        extracted = extract_qasm(reply.split("```qasm\n", 1)[1].rsplit("\n```", 1)[0])
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
        for task_type in (None, "repair_qasm"):
            payload = {"qasm": GHZ_QASM}
            if task_type is not None:
                payload["task_type"] = task_type
            with self.subTest(task_type=task_type):
                with self.assertRaisesRegex(RuntimeError, "task_type"):
                    parse_generation_response(completion(json.dumps(payload)))

    def test_invalid_qasm_fails_without_second_model_call(self):
        invalid = GHZ_QASM.replace("h q[0];", "invalid q[0];")
        with mock.patch(
            "loomq.l2_agent.llm_client.chat_completion",
            return_value=completion(generation_json(qasm=invalid)),
        ) as chat:
            with self.assertRaisesRegex(RuntimeError, "failed OpenQASM"):
                agent_chat("生成电路")
        chat.assert_called_once()

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


if __name__ == "__main__":
    unittest.main()
