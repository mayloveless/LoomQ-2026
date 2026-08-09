import type { StateEntry, TraceEvent } from './types'

export const CIRCUIT_STEP_STAGES = new Set(['gate_step', 'measurement'])

export function circuitSteps(events: TraceEvent[]): TraceEvent[] {
  const rawSteps = events.filter(
    (event) => event.layer === 'circuit' && CIRCUIT_STEP_STAGES.has(event.stage),
  )
  return rawSteps.reduce<TraceEvent[]>((steps, event) => {
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
    if (isOperation) currentOperation += 1
    if (currentOperation === operationIndex) return index
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
