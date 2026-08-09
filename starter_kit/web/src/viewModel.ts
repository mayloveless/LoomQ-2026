import type { StateEntry, TraceEvent } from './types'

export const CIRCUIT_STEP_STAGES = new Set(['gate_step', 'measurement'])

export function circuitSteps(events: TraceEvent[]): TraceEvent[] {
  const rawSteps = events.filter(
    (event) => event.layer === 'circuit' && CIRCUIT_STEP_STAGES.has(event.stage),
  )
  const mergedSteps = rawSteps.reduce<TraceEvent[]>((steps, event) => {
    const previous = steps.at(-1)
    if (event.stage !== 'measurement' || previous?.stage !== 'measurement') {
      steps.push(event)
      return steps
    }
    // 模型可能生成逐位 measure；UI 将连续测量合并为一个易理解的读出步骤。
    const previousMappings = Array.isArray(previous.data.mappings)
      ? previous.data.mappings
      : []
    const currentMappings = Array.isArray(event.data.mappings)
      ? event.data.mappings
      : []
    steps[steps.length - 1] = {
      ...previous,
      data: {
        ...previous.data,
        mappings: [...previousMappings, ...currentMappings],
      },
    }
    return steps
  }, [])
  const firstGate = mergedSteps.find((event) => event.stage === 'gate_step')
  const firstAction = mergedSteps[0]
  const initialState = Array.isArray(firstGate?.data.state_before)
    ? firstGate.data.state_before
    : Array.isArray(firstAction?.data.probabilities_before)
      ? firstAction.data.probabilities_before
      : null
  if (!initialState) return mergedSteps
  // 初始化是 Web presentation step，不对应 Gate，也不修改底层 Circuit Trace。
  const initialStep: TraceEvent = {
    seq: 0,
    layer: 'circuit',
    stage: 'initial_state',
    executor: 'local',
    status: 'ok',
    summary: '所有量子位从 |0› 开始。',
    data: {
      presentation_only: true,
      state_after: initialState,
      probabilities_after: initialState.map((entry) => ({
        basis: (entry as StateEntry).basis,
        probability: (entry as StateEntry).probability,
      })),
      gate_description: '所有量子位从 |0› 开始，这是这段程序执行前的起点。',
    },
  }
  return [initialStep, ...mergedSteps]
}

export function circuitWarnings(events: TraceEvent[]): TraceEvent[] {
  return events.filter(
    (event) => event.layer === 'circuit' && event.status === 'warning',
  )
}

export function agentEvents(events: TraceEvent[]): TraceEvent[] {
  return events.filter((event) => event.layer === 'agent')
}

export function extractQasm(events: TraceEvent[]): string {
  const result = [...events]
    .reverse()
    .find((event) => typeof event.data.qasm === 'string')
  return (result?.data.qasm as string | undefined) ?? ''
}

export function stateForStep(event: TraceEvent): StateEntry[] {
  const value =
    event.stage === 'measurement'
      ? event.data.probabilities_before
      : event.data.state_after
  return Array.isArray(value) ? (value as StateEntry[]) : []
}

export function stepTitle(event: TraceEvent): string {
  if (event.stage === 'initial_state') return '初始状态'
  if (event.stage === 'measurement') return '测量'
  const gate = String(event.data.gate ?? '').toUpperCase()
  const qubits = Array.isArray(event.data.qubits)
    ? event.data.qubits.join(', ')
    : ''
  const parameters = Array.isArray(event.data.parameters)
    ? event.data.parameters.join(', ')
    : ''
  return `${gate}${parameters ? `(${parameters})` : ''}${qubits ? ` ${qubits}` : ''}`
}

export function isPhaseOnlyChange(event: TraceEvent): boolean {
  if (event.stage !== 'gate_step') return false
  const before = Array.isArray(event.data.state_before)
    ? (event.data.state_before as StateEntry[])
    : []
  const after = Array.isArray(event.data.state_after)
    ? (event.data.state_after as StateEntry[])
    : []
  const bases = [...new Set([...before, ...after].map((entry) => entry.basis))]
  const probabilityChanged = bases.some((basis) => {
    const previous = before.find((entry) => entry.basis === basis)?.probability ?? 0
    const current = after.find((entry) => entry.basis === basis)?.probability ?? 0
    return Math.abs(previous - current) > 1e-9
  })
  const amplitudeChanged = bases.some((basis) => {
    const previous = before.find((entry) => entry.basis === basis)
    const current = after.find((entry) => entry.basis === basis)
    return Math.abs((previous?.real ?? 0) - (current?.real ?? 0)) > 1e-9
      || Math.abs((previous?.imag ?? 0) - (current?.imag ?? 0)) > 1e-9
  })
  return !probabilityChanged && amplitudeChanged
}

export function executableLineIndex(qasm: string, operationIndex: number): number {
  const lines = qasm.split('\n')
  let currentOperation = -1
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    const isOperation =
      line.length > 0 &&
      !line.startsWith('//') &&
      !/^OPENQASM\b/i.test(line) &&
      !/^include\b/i.test(line) &&
      !/^(qreg|creg)\b/i.test(line)
    if (isOperation) {
      currentOperation += 1
      if (currentOperation === operationIndex) return index
    }
  }
  return -1
}

export function latestBackendIds(events: TraceEvent[]): string[] {
  const selected = [...events]
    .reverse()
    .find((event) => event.stage === 'backend_selected')
  return Array.isArray(selected?.data.backend_ids)
    ? (selected.data.backend_ids as string[])
    : []
}
