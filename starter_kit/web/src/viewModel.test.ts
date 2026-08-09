import { describe, expect, it } from 'vitest'
import type { TraceEvent } from './types'
import { circuitSteps, executableLineIndex, isPhaseOnlyChange } from './viewModel'

function gateEvent(overrides: Partial<TraceEvent['data']> = {}): TraceEvent {
  return {
    seq: 1,
    layer: 'circuit',
    stage: 'gate_step',
    executor: 'local',
    status: 'ok',
    summary: 'gate',
    data: {
      operation_index: 0,
      gate: 'h',
      qubits: ['q[0]'],
      state_before: [{ basis: '0', real: 1, imag: 0, probability: 1 }],
      state_after: [
        { basis: '0', real: Math.SQRT1_2, imag: 0, probability: 0.5 },
        { basis: '1', real: Math.SQRT1_2, imag: 0, probability: 0.5 },
      ],
      ...overrides,
    },
  }
}

describe('Task 13C presentation model', () => {
  it('prepends an initialization step without inventing a QASM operation', () => {
    const steps = circuitSteps([gateEvent()])

    expect(steps.map((step) => step.stage)).toEqual(['initial_state', 'gate_step'])
    expect(steps[0].data.presentation_only).toBe(true)
    expect(steps[0].data.operation_index).toBeUndefined()
    expect(steps[0].data.state_after).toEqual([
      { basis: '0', real: 1, imag: 0, probability: 1 },
    ])
    expect(executableLineIndex('OPENQASM 2.0;\nqreg q[1];\nh q[0];', -1)).toBe(-1)
  })

  it('detects a phase-only change when probability stays equal', () => {
    const phaseEvent = gateEvent({
      gate: 's',
      state_before: [
        { basis: '0', real: Math.SQRT1_2, imag: 0, probability: 0.5 },
        { basis: '1', real: Math.SQRT1_2, imag: 0, probability: 0.5 },
      ],
      state_after: [
        { basis: '0', real: Math.SQRT1_2, imag: 0, probability: 0.5 },
        { basis: '1', real: 0, imag: Math.SQRT1_2, probability: 0.5 },
      ],
    })

    expect(isPhaseOnlyChange(phaseEvent)).toBe(true)
    expect(isPhaseOnlyChange(gateEvent())).toBe(false)
  })
})
