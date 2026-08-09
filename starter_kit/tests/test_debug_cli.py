"""Task 13A tests for the thin trace CLI consumer."""

import unittest
from unittest import mock

from loomq.debug_cli import build_debug_trace, consume_events
from loomq.debug_trace import TraceRecorder


def events(count):
    recorder = TraceRecorder()
    for index in range(count):
        recorder.emit(
            layer="agent",
            stage="stage_%d" % index,
            executor="local",
            status="ok",
            summary="event %d" % index,
        )
    return recorder.events


class DebugCliTests(unittest.TestCase):
    @mock.patch("loomq.debug_cli.trace_circuit")
    @mock.patch("loomq.debug_cli._run_agent")
    def test_backend_reply_does_not_start_circuit_trace(self, run_agent, circuit_trace):
        run_agent.return_value = "满足条件的后端：`braket_local_simulator`。"

        reply, trace_events = build_debug_trace("选择后端")

        self.assertIn("braket_local_simulator", reply)
        self.assertEqual(trace_events, ())
        circuit_trace.assert_not_called()

    @mock.patch("loomq.debug_cli._run_agent")
    def test_large_circuit_warning_does_not_replace_agent_reply(self, run_agent):
        qasm_text = """OPENQASM 2.0;
include "qelib1.inc";
qreg q[9];
h q[0];"""
        run_agent.return_value = "ok\n\n```qasm\n%s\n```" % qasm_text

        reply, trace_events = build_debug_trace("生成九比特电路")

        self.assertIn(qasm_text, reply)
        self.assertEqual(len(trace_events), 1)
        self.assertEqual(trace_events[0].stage, "statevector_skipped")
        self.assertEqual(trace_events[0].status, "warning")

    def test_next_advances_one_event_at_a_time(self):
        commands = iter(["n", ""])
        output = []
        prompts = []

        completed = consume_events(
            events(3),
            input_fn=lambda prompt: prompts.append(prompt) or next(commands),
            output_fn=output.append,
        )

        self.assertTrue(completed)
        self.assertEqual(len(output), 3)
        self.assertEqual(len(prompts), 2)

    def test_continue_prints_remaining_events_without_pausing(self):
        output = []
        prompts = []

        completed = consume_events(
            events(4),
            input_fn=lambda prompt: prompts.append(prompt) or "c",
            output_fn=output.append,
        )

        self.assertTrue(completed)
        self.assertEqual(len(output), 4)
        self.assertEqual(len(prompts), 1)

    def test_quit_only_stops_the_debug_consumer(self):
        output = []

        completed = consume_events(
            events(4),
            input_fn=lambda prompt: "q",
            output_fn=output.append,
        )

        self.assertFalse(completed)
        self.assertEqual(len(output), 1)


if __name__ == "__main__":
    unittest.main()
