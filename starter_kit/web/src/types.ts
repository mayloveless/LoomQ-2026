export type TraceStatus = 'running' | 'ok' | 'warning' | 'error'

export interface TraceEvent {
  seq: number
  layer: 'agent' | 'circuit'
  stage: string
  executor: 'llm' | 'local'
  status: TraceStatus
  summary: string
  data: Record<string, unknown>
}

export interface DebugResponse {
  reply: string
  events: TraceEvent[]
}

export interface StateEntry {
  basis: string
  probability: number
  real?: number
  imag?: number
}

export interface MeasurementMapping {
  qubit: string
  classical_bit: string
}
