import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DebugResponse,
  MeasurementMapping,
  StateEntry,
  TeachingStep,
  TraceEvent,
} from './types'
import {
  agentEvents,
  circuitSteps,
  circuitWarnings,
  executableLineIndex,
  extractQasm,
  latestBackendIds,
  isPhaseOnlyChange,
  stateForStep,
  stepTitle,
} from './viewModel'
import { ExperimentStory } from './ExperimentStory'
import { buildExperimentStory, type ExperimentStoryModel } from './storyModel'
import { LearnScreen } from './Learn'
import { ExperimentsScreen } from './Experiments'
import { AdvancedCapabilityScreen } from './AdvancedCapability'
import { GlobalNavigation, type AppScreen } from './Navigation'
import { SCENARIOS, type Scenario } from './scenarios'

export { SCENARIOS } from './scenarios'

const LOADING_STAGES = [
  '理解需求',
  '生成并校验程序',
  '准备可视化解释',
]

export const DEFAULT_RESULT_AUTOPLAY = false
const CURATED_GUIDE_STORAGE_KEY = 'loomq.curated-story-guide-dismissed'

function shouldShowCuratedGuide(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(CURATED_GUIDE_STORAGE_KEY) !== '1'
  } catch {
    return true
  }
}

const AGENT_LABELS: Record<string, string> = {
  intent: '理解需求',
  qasm_candidate: '生成电路',
  target_spec: '提取目标态',
  parser_validation: '本地校验',
  semantic_verification: '语义验证',
  repair_started: '自动修复',
  repair_candidate: '生成修复电路',
  backend_constraints: '提取后端约束',
  backend_selected: '筛选可用后端',
  agent_result: '完成验证',
}

function formatPercent(probability: number): string {
  const value = probability * 100
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)}%`
}

function statusIcon(event: TraceEvent): string {
  if (event.status === 'error') return '×'
  if (event.status === 'warning' || event.stage === 'repair_started') return '!'
  if (event.status === 'running') return '…'
  return '✓'
}

function ProbabilityRows({ entries }: { entries: StateEntry[] }) {
  if (!entries.length) {
    return <p className="muted empty-copy">当前步骤没有可展示的概率。</p>
  }
  return (
    <div className="probability-list">
      {entries.map((entry) => (
        <div className="probability-row" key={entry.basis}>
          <code className="basis">|{entry.basis}›</code>
          <div className="probability-track" aria-hidden="true">
            <div
              className="probability-fill"
              style={{ width: `${Math.min(100, Math.max(0, entry.probability * 100))}%` }}
            />
          </div>
          <span className="probability-value">{formatPercent(entry.probability)}</span>
        </div>
      ))}
    </div>
  )
}

function ProbabilityComparison({ event }: { event: TraceEvent }) {
  const after = stateForStep(event)
  const before = Array.isArray(event.data.state_before)
    ? (event.data.state_before as StateEntry[])
    : []
  const allBasis = [...new Set([...before, ...after].map((entry) => entry.basis))]
  const changes = allBasis.flatMap((basis) => {
    const previous = before.find((entry) => entry.basis === basis)?.probability ?? 0
    const current = after.find((entry) => entry.basis === basis)?.probability ?? 0
    return Math.abs(previous - current) > 0.0001
      ? [{ basis, previous, current }]
      : []
  })

  if (event.stage === 'initial_state') {
    return (
      <div className="initial-probability">
        <span className="comparison-label">程序执行前</span>
        <ProbabilityRows entries={after} />
      </div>
    )
  }

  if (event.stage === 'measurement') {
    return (
      <>
        <ProbabilityRows entries={after} />
        <p className="measurement-probability-note">测量读取这个概率分布；这里不伪造一次随机坍缩结果。</p>
      </>
    )
  }

  return (
    <div className="probability-comparison">
      <div className="probability-state before-state">
        <span className="comparison-label">执行前</span>
        <ProbabilityRows entries={before} />
      </div>
      <span className="comparison-arrow">→</span>
      <div className="probability-state after-state">
        <span className="comparison-label">执行后</span>
        <ProbabilityRows entries={after} />
      </div>
      <div className="probability-changes">
        <span>本步变化</span>
        {changes.length ? changes.map((change) => (
          <code key={change.basis}>
            |{change.basis}› {formatPercent(change.previous)} → {formatPercent(change.current)}
          </code>
        )) : <code>{isPhaseOnlyChange(event) ? '概率未变 · 相位已变化' : '状态概率没有变化'}</code>}
      </div>
    </div>
  )
}

function eventQubits(event: TraceEvent): string[] {
  if (Array.isArray(event.data.qubits)) return event.data.qubits as string[]
  if (Array.isArray(event.data.mappings)) {
    return (event.data.mappings as MeasurementMapping[]).map((item) => item.qubit)
  }
  return []
}

export function CircuitDiagram({
  steps,
  activeStep,
  highlightedSteps = [],
  onSelect,
}: {
  steps: TraceEvent[]
  activeStep: number
  highlightedSteps?: number[]
  onSelect: (index: number) => void
}) {
  const qubits = [...new Set(steps.flatMap(eventQubits))]
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeOperationRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const container = scrollRef.current
    const target = activeOperationRef.current
    if (!container || !target) return
    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const nextLeft = container.scrollLeft
      + targetRect.left
      - containerRect.left
      - (container.clientWidth - targetRect.width) / 2
      + 24
    // 自动将当前 Gate 移到可视区域中央，用户无需寻找横向滚动条。
    container.scrollTo({ left: Math.max(0, nextLeft), behavior: 'smooth' })
  }, [activeStep, steps.length])

  if (!qubits.length) return null

  return (
    <div className="circuit-diagram">
      <div className="circuit-diagram-heading">
        <span>电路回放</span>
        <small>点击 Gate 跳转</small>
      </div>
      <div className="circuit-scroll" ref={scrollRef}>
        <div className="circuit-labels">
          {qubits.map((qubit) => <code key={qubit}>{qubit}</code>)}
        </div>
        <div className="circuit-operations">
          {steps.map((step, stepIndex) => {
            const involved = eventQubits(step)
            const involvedRows = involved.map((qubit) => qubits.indexOf(qubit)).filter((index) => index >= 0)
            const firstRow = Math.min(...involvedRows)
            const lastRow = Math.max(...involvedRows)
            const gate = String(step.data.gate ?? '').toUpperCase()
            const inStoryStage = highlightedSteps.includes(stepIndex)
            return (
              <button
                className={`circuit-operation${inStoryStage ? ' stage-highlighted' : ''}${stepIndex === activeStep ? ' active' : ''}`}
                key={step.seq}
                ref={stepIndex === activeStep ? activeOperationRef : undefined}
                onClick={() => onSelect(stepIndex)}
                aria-label={`跳转到第 ${stepIndex + 1} 步 ${stepTitle(step)}`}
              >
                {involvedRows.length > 1 && (
                  <i
                    className="gate-connector"
                    style={{ top: `${firstRow * 34 + 17}px`, height: `${(lastRow - firstRow) * 34}px` }}
                  />
                )}
                {qubits.map((qubit, rowIndex) => {
                  const operandIndex = involved.indexOf(qubit)
                  let marker = ''
                  let markerClass = 'gate-box'
                  if (step.stage === 'measurement' && operandIndex >= 0) marker = '测'
                  else if (gate === 'CX' && operandIndex === 0) {
                    marker = '●'
                    markerClass = 'control-dot'
                  } else if (gate === 'CX' && operandIndex === 1) {
                    marker = '⊕'
                    markerClass = 'target-plus'
                  } else if (gate === 'CCX' && operandIndex >= 0 && operandIndex < 2) {
                    marker = '●'
                    markerClass = 'control-dot'
                  } else if (gate === 'CCX' && operandIndex === 2) {
                    marker = '⊕'
                    markerClass = 'target-plus'
                  } else if (gate === 'SWAP' && operandIndex >= 0) {
                    marker = '×'
                    markerClass = 'swap-mark'
                  } else if (operandIndex >= 0) marker = gate || 'G'
                  return (
                    <span className="circuit-wire" key={`${step.seq}-${qubit}`}>
                      {marker && <b className={markerClass}>{marker}</b>}
                      {rowIndex === 0 && <em>{stepIndex + 1}</em>}
                    </span>
                  )
                })}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TechnicalDetails({ event, state }: { event: TraceEvent; state: StateEntry[] }) {
  const stateBefore = Array.isArray(event.data.state_before)
    ? (event.data.state_before as StateEntry[])
    : []
  const allBasis = [...new Set([...stateBefore, ...state].map((entry) => entry.basis))]

  function amplitude(entry?: StateEntry): string {
    const real = Number(entry?.real ?? 0)
    const imag = Number(entry?.imag ?? 0)
    return `${real >= 0 ? '+' : ''}${real.toFixed(6)}${imag >= 0 ? '+' : ''}${imag.toFixed(6)}i`
  }

  return (
    <details className="technical-details">
      <summary>
        <span>展开技术细节</span>
        <small>{event.stage === 'gate_step' ? `${allBasis.length} 个活跃基态` : '测量事件信息'}</small>
      </summary>
      <div className="detail-content">
        <div className="detail-grid">
          <div className="detail-meta">
            <span>执行器</span>
            <code>LOCAL STATEVECTOR</code>
          </div>
          <div className="detail-meta">
            <span>Operation index</span>
            <code>{String(event.data.operation_index ?? '—')}</code>
          </div>
          <div className="detail-meta">
            <span>事件类型</span>
            <code>{event.stage.toUpperCase()}</code>
          </div>
          <div className="detail-meta">
            <span>状态</span>
            <code>{event.status.toUpperCase()}</code>
          </div>
        </div>
        {event.stage === 'gate_step' && (
          <div className="gate-metadata">
            <div><span>Gate</span><code>{String(event.data.gate ?? '').toUpperCase()}</code></div>
            <div><span>Qubits</span><code>{Array.isArray(event.data.qubits) ? event.data.qubits.join(', ') : '—'}</code></div>
            <div><span>Parameters</span><code>{Array.isArray(event.data.parameters) && event.data.parameters.length ? event.data.parameters.join(', ') : 'none'}</code></div>
          </div>
        )}
        {event.stage === 'gate_step' && (
          <>
            <div className="state-delta">
              <span className="detail-label">PROBABILITY CHANGE</span>
              <div className="delta-header"><span>基态</span><span>执行前</span><span>执行后</span><span>变化</span></div>
              {allBasis.map((basis) => {
                const before = stateBefore.find((entry) => entry.basis === basis)?.probability ?? 0
                const after = state.find((entry) => entry.basis === basis)?.probability ?? 0
                const delta = after - before
                return (
                  <div className="delta-row" key={basis}>
                    <code>|{basis}›</code>
                    <code>{formatPercent(before)}</code>
                    <code>{formatPercent(after)}</code>
                    <code className={delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : ''}>
                      {delta > 0 ? '+' : ''}{(delta * 100).toFixed(1)}%
                    </code>
                  </div>
                )
              })}
            </div>
            <div className="amplitude-comparison">
              <div className="amplitudes">
                <span className="detail-label">COMPLEX AMPLITUDE · 执行前</span>
                {allBasis.map((basis) => (
                  <div className="amplitude-row" key={basis}>
                    <code>|{basis}›</code>
                    <code>{amplitude(stateBefore.find((entry) => entry.basis === basis))}</code>
                  </div>
                ))}
              </div>
              <div className="amplitudes amplitudes-after">
                <span className="detail-label">COMPLEX AMPLITUDE · 执行后</span>
                {allBasis.map((basis) => (
                  <div className="amplitude-row" key={basis}>
                    <code>|{basis}›</code>
                    <code>{amplitude(state.find((entry) => entry.basis === basis))}</code>
                  </div>
                ))}
              </div>
            </div>
            <p className="phase-note">概率只反映测量可能性；复振幅中的正负号和虚部保留了相对相位。</p>
          </>
        )}
        {event.stage === 'measurement' && (
          <div className="measurement-detail">
            <span className="detail-label">MEASUREMENT SEMANTICS</span>
            <p>{event.summary}</p>
            {(event.data.mappings as MeasurementMapping[] | undefined)?.map((mapping) => (
              <div className="amplitude-row" key={`${mapping.qubit}-${mapping.classical_bit}`}>
                <code>{mapping.qubit}</code>
                <code>→ {mapping.classical_bit}</code>
              </div>
            ))}
            <p className="phase-note">这里展示测量前的确定性概率分布，不伪造单次随机测量结果。</p>
          </div>
        )}
      </div>
    </details>
  )
}

export function ConceptCard({ step }: { step?: TeachingStep }) {
  if (!step?.concept || !step.concept_explanation) return null
  return (
    <div className="concept-card">
      <span>💡 当前概念</span>
      <strong>{step.concept}</strong>
      <p>{step.concept_explanation}</p>
    </div>
  )
}

function StateDetailContent({
  current,
  currentState,
  phaseOnly,
  teachingStep,
  hasTeaching,
}: {
  current: TraceEvent
  currentState: StateEntry[]
  phaseOnly: boolean
  teachingStep?: TeachingStep
  hasTeaching: boolean
}) {
  return (
    <>
      <div className="state-change-copy">
        <span>发生了什么？</span>
        <p>{String(current.data.gate_description ?? current.summary)}</p>
      </div>
      <div className="probability-section">
        <div className="subheading">
          <div><h3>{current.stage === 'measurement' ? '测量前概率' : '概率分布'}</h3><p>每个基态在测量时出现的可能性</p></div>
          <span>{currentState.length} STATES</span>
        </div>
        <ProbabilityComparison event={current} />
      </div>
      {phaseOnly && (
        <div className="phase-only-alert">
          <strong>概率没有变化，但相位发生了变化。</strong>
          <p>相位不会总是立刻体现在测量概率里，但会影响后续干涉。</p>
        </div>
      )}
      <ConceptCard step={teachingStep} />
      {current.stage === 'measurement' && (
        <div className="measurement-card">
          <span className="detail-label">QUANTUM → CLASSICAL</span>
          {(current.data.mappings as MeasurementMapping[] | undefined)?.map((mapping) => (
            <div className="mapping-row" key={`${mapping.qubit}-${mapping.classical_bit}`}>
              <code>{mapping.qubit}</code><span>→</span><code>{mapping.classical_bit}</code>
            </div>
          ))}
        </div>
      )}
      {current.stage !== 'initial_state' && (
        <>
          <TechnicalDetails event={current} state={currentState} />
          {hasTeaching && (
            <p className="teaching-disclaimer">教学解释由模型根据已验证电路生成，不参与正确性判断。</p>
          )}
        </>
      )}
    </>
  )
}

function SidebarProcess({ events }: { events: TraceEvent[] }) {
  return (
    <details className="sidebar-process" open>
      <summary>
        <span>生成与验证过程</span>
        <em>已完成</em>
      </summary>
      <div className="sidebar-process-list">
        {events.map((event) => (
          <div className={`process-row status-${event.status}`} key={event.seq}>
            <span className="summary-icon">{statusIcon(event)}</span>
            <div>
              <strong>{AGENT_LABELS[event.stage] ?? event.stage}</strong>
              <small>{event.executor === 'llm' ? '模型' : '本地'}</small>
              {typeof event.data.fidelity === 'number' && (
                <code>F {event.data.fidelity.toFixed(3)}</code>
              )}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}

function BackendResult({ events, reply }: { events: TraceEvent[]; reply: string }) {
  const ids = latestBackendIds(events)
  const constraintEvent = events.find((event) => event.stage === 'backend_constraints')
  return (
    <section className="backend-result panel">
      <div className="panel-heading">
        <span className="eyebrow">BACKEND SELECTION</span>
        <h2>本地能力表筛选结果</h2>
        <p>模型只负责提取约束；canonical backend ID 由 LoomQ 在本地决定。</p>
      </div>
      <div className="backend-body">
        <div className="constraint-card">
          <span>模型提取的约束</span>
          <div className="constraint-chips">
            {constraintEvent?.data.min_qubits != null && (
              <code>至少 {String(constraintEvent.data.min_qubits)} qubits</code>
            )}
            {constraintEvent?.data.require_no_queue === true && <code>零排队</code>}
            {constraintEvent?.data.require_qpu === true && <code>真实量子硬件</code>}
            {constraintEvent?.data.cost_policy !== 'unspecified' &&
              constraintEvent?.data.cost_policy != null && (
                <code>{String(constraintEvent.data.cost_policy)}</code>
              )}
          </div>
        </div>
        <div className="backend-list">
          {ids.length ? ids.map((id) => (
            <div className="backend-row" key={id}>
              <span className="backend-status">✓</span>
              <code>{id}</code>
              <span>满足全部约束</span>
            </div>
          )) : <p className="warning-callout">当前没有同时满足全部约束的后端。</p>}
        </div>
        <p className="backend-reply">{reply}</p>
      </div>
    </section>
  )
}

export function ScenarioContext({ scenario }: { scenario: Scenario }) {
  return (
    <section className="scenario-context" aria-label="示例背景">
      <div className="context-heading">
        <span>你正在理解什么？</span>
        <strong>{scenario.title}</strong>
        <em>{scenario.tag}</em>
      </div>
      <div className="context-item">
        <span>普通程序怎么理解？</span>
        <p>{scenario.ordinary}</p>
      </div>
      <div className="context-item">
        <span>量子版本有什么不同？</span>
        <p>{scenario.quantum}</p>
      </div>
      <div className="context-item focus-item">
        <span>这次重点看什么？</span>
        <p>{scenario.focus}</p>
      </div>
    </section>
  )
}

export function LoadingProcess() {
  return (
    <div className="loading-process" aria-label="LoomQ 正在准备量子程序">
      <div className="loading-process-heading">
        <span className="loading-orbit" aria-hidden="true">⌁</span>
        <div>
          <h2>正在准备你的量子实验</h2>
          <p>LoomQ 正在把自然语言需求变成一个经过验证、可以逐步解释的量子程序。</p>
        </div>
      </div>
      <ol>
        {LOADING_STAGES.map((stage) => (
          <li key={stage}>
            <i aria-hidden="true" />
            <span>{stage}</span>
          </li>
        ))}
      </ol>
      <small>请求完成后会一次性展示真实结果。</small>
    </div>
  )
}

export function EmptyWorkspace({ loading = false, scenario }: { loading?: boolean; scenario?: Scenario }) {
  if (loading) {
    return (
      <div className="workspace empty-workspace loading-workspace">
        <div className="empty-main panel"><LoadingProcess /></div>
      </div>
    )
  }

  return (
    <div className="workspace idle-workspace">
      <div className="empty-main panel">
        {scenario ? (
          <>
            <div className="idle-status ready">
              <span>{scenario.tag} · READY</span>
              <h2>{scenario.id === 'bell' ? 'Bell 实验已准备好' : scenario.id === 'search' ? 'Grover 搜索实验已准备好' : scenario.id === 'phase' ? '相位实验已准备好' : '实验已准备好'}</h2>
              <p>LoomQ 会先生成并验证量子程序，再带你逐步查看状态变化。</p>
              <strong>尚未运行 · 点击上方“运行量子程序”开始</strong>
            </div>
          </>
        ) : (
          <div className="idle-status free">
            <div className="empty-icon">⌁</div>
            <h2>描述你想探索的量子程序</h2>
            <p>例如：让两个量子比特形成 Bell 态并测量。</p>
            <strong>在上方输入自然语言实验需求，再点击“运行量子程序”。</strong>
          </div>
        )}
      </div>
    </div>
  )
}

export function CuratedWorkspace({
  story,
  steps,
  qasm,
  circuitGoal,
  activeStoryStage,
  activeStep,
  qasmOpen,
  guideOpen,
  onSelectStoryStage,
  onSelectStep,
  onQasmOpenChange,
  onDismissGuide,
  onOpenGuide,
}: {
  story: ExperimentStoryModel
  steps: TraceEvent[]
  qasm: string
  circuitGoal: string
  activeStoryStage: number
  activeStep: number
  qasmOpen: boolean
  guideOpen: boolean
  onSelectStoryStage: (index: number) => void
  onSelectStep: (index: number) => void
  onQasmOpenChange: (open: boolean) => void
  onDismissGuide: () => void
  onOpenGuide: () => void
}) {
  const stage = story.stages[Math.min(story.stages.length - 1, Math.max(0, activeStoryStage))]
  const activeLine = steps[activeStep]
    ? executableLineIndex(qasm, Number(steps[activeStep].data.operation_index ?? -1))
    : -1
  const stageLines = new Set(stage.gateIndices.flatMap((stepIndex) => {
    const step = steps[stepIndex]
    if (!step) return []
    const line = executableLineIndex(qasm, Number(step.data.operation_index ?? -1))
    return line >= 0 ? [line] : []
  }))
  const firstStageLine = stageLines.size ? Math.min(...stageLines) : -1
  const curatedCodeViewRef = useRef<HTMLDivElement>(null)
  const firstStageLineRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = curatedCodeViewRef.current
    const target = firstStageLineRef.current
    if (!qasmOpen || !container || !target) return
    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const nextTop = container.scrollTop
      + targetRect.top
      - containerRect.top
      - (container.clientHeight - targetRect.height) / 2
    // Story 切换时只滚动到真实映射出的第一行，不猜测缺失的 QASM 范围。
    container.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
  }, [activeStoryStage, firstStageLine, qasmOpen])

  return (
    <section className="workspace result-workspace curated-workspace" data-layout="curated-two-column">
      <section className="curated-program panel" aria-label="Program · Circuit 与 QASM">
        <header className="curated-program-heading">
          <div><span>PROGRAM</span><strong>电路与源码</strong></div>
          <p><i>✓</i> 已生成并通过 LoomQ 验证</p>
        </header>
        <div className="curated-program-goal"><span>实验目标</span><p>{circuitGoal}</p></div>
        <CircuitDiagram
          steps={steps}
          activeStep={activeStep}
          highlightedSteps={stage.gateIndices}
          onSelect={onSelectStep}
        />
        <details
          className="qasm-disclosure curated-qasm"
          open={qasmOpen}
          onToggle={(event) => onQasmOpenChange(event.currentTarget.open)}
        >
          <summary>
            <span><b className="qasm-icon">Q</b>{qasmOpen ? 'OpenQASM · 收起代码' : 'OpenQASM · 展开代码'}</span>
            <small>当前阶段范围已标出</small>
          </summary>
          <div className="code-view" ref={curatedCodeViewRef} role="region" aria-label="完整 OpenQASM 程序">
            {qasm.split('\n').map((line, index) => {
              const inStoryStage = stageLines.has(index)
              const isActive = index === activeLine
              return (
                <div
                  className={`code-line${inStoryStage ? ' stage-highlighted' : ''}${isActive ? ' highlighted' : ''}`}
                  key={`${index}-${line}`}
                  ref={index === firstStageLine ? firstStageLineRef : undefined}
                >
                  <span className="line-number">{index + 1}</span>
                  <code>{line || ' '}</code>
                  {isActive && <span className="execution-marker">▶</span>}
                </div>
              )
            })}
          </div>
        </details>
      </section>

      <section className="curated-story-panel panel" aria-label="Story · 实验解释">
        <header className="curated-story-heading">
          <div><span>STORY</span><strong>理解这段程序</strong></div>
          <button onClick={onOpenGuide}>如何阅读这个页面？</button>
        </header>
        {guideOpen && (
          <aside className="curated-guide" aria-label="Story Mode 新手引导">
            <ol>
              <li><b>1</b><span>先看右边：一次只解释一个阶段</span></li>
              <li><b>2</b><span>看懂后点“下一阶段”继续</span></li>
              <li><b>3</b><span>想看实现时，左边 Circuit 与 QASM 会同步标出当前阶段</span></li>
            </ol>
            <button onClick={onDismissGuide}>知道了</button>
          </aside>
        )}
        <ExperimentStory
          model={story}
          activeStageIndex={activeStoryStage}
          onSelect={onSelectStoryStage}
        />
      </section>
    </section>
  )
}

export function ExplorerScreen({
  initialScenarioId,
  onNavigate,
}: {
  initialScenarioId: string | null
  onNavigate: (screen: AppScreen) => void
}) {
  const initialScenario = SCENARIOS.find((scenario) => scenario.id === initialScenarioId)
  const [prompt, setPrompt] = useState(initialScenario?.prompt ?? '')
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(initialScenario?.id ?? null)
  const [result, setResult] = useState<DebugResponse | null>(null)
  const [activeStep, setActiveStep] = useState(0)
  const [activeStoryStage, setActiveStoryStage] = useState(0)
  const [autoPlaying, setAutoPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resultPrompt, setResultPrompt] = useState('')
  const [qasmOpen, setQasmOpen] = useState(false)
  const [curatedQasmOpen, setCuratedQasmOpen] = useState(true)
  const [curatedGuideOpen, setCuratedGuideOpen] = useState(shouldShowCuratedGuide)
  const codeViewRef = useRef<HTMLDivElement>(null)
  const highlightedCodeRef = useRef<HTMLDivElement>(null)

  const steps = useMemo(() => circuitSteps(result?.events ?? []), [result])
  const warnings = useMemo(() => circuitWarnings(result?.events ?? []), [result])
  const agents = useMemo(() => agentEvents(result?.events ?? []), [result])
  const qasm = useMemo(() => extractQasm(result?.events ?? []), [result])
  const current = steps[activeStep]
  const currentState = current ? stateForStep(current) : []
  const backendMode = result != null && steps.length === 0 && agents.some(
    (event) => event.stage === 'backend_selected',
  )
  const selectedScenario = SCENARIOS.find((scenario) => scenario.id === selectedScenarioId)
  const experimentStory = useMemo(
    () => buildExperimentStory(selectedScenarioId, steps),
    [selectedScenarioId, steps],
  )
  const currentStoryStage = experimentStory?.stages[activeStoryStage] ?? null

  useEffect(() => {
    if (!experimentStory) return
    // 正式实验完成后停在第一个可解释阶段，不自动逐 Gate 播放。
    setActiveStoryStage(0)
    setActiveStep(experimentStory.stages[0].stepIndex)
    setAutoPlaying(false)
  }, [experimentStory])

  useEffect(() => {
    if (!autoPlaying || steps.length < 2) return
    if (activeStep >= steps.length - 1) {
      setAutoPlaying(false)
      return
    }
    // Trace 已完整返回；这里仅用慢速定时器自动回放现有步骤。
    const timer = window.setTimeout(() => {
      setActiveStep((step) => Math.min(steps.length - 1, step + 1))
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [activeStep, autoPlaying, steps.length])

  async function runDebug(event?: FormEvent) {
    event?.preventDefault()
    const requestPrompt = prompt.trim()
    if (!requestPrompt || loading) return
    // 新请求必须先退出上一轮会话，失败时也不能继续展示旧电路的结果。
    setResult(null)
    setResultPrompt('')
    setActiveStep(0)
    setActiveStoryStage(0)
    setAutoPlaying(false)
    setQasmOpen(false)
    setCuratedQasmOpen(true)
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: requestPrompt }),
      })
      const payload = (await response.json()) as DebugResponse & { error?: string }
      if (!response.ok) throw new Error(payload.error)
      setResult(payload)
      setResultPrompt(requestPrompt)
      setActiveStep(0)
      setActiveStoryStage(0)
      setAutoPlaying(DEFAULT_RESULT_AUTOPLAY)
    } catch {
      setError('这次运行没有完成，请检查模型配置后重试。')
    } finally {
      setLoading(false)
    }
  }

  function keyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void runDebug()
    }
  }

  function selectStep(index: number) {
    setAutoPlaying(false)
    setActiveStep(index)
  }

  function dismissCuratedGuide() {
    setCuratedGuideOpen(false)
    if (typeof window === 'undefined') return
    try {
      // 只保存纯 UI 引导状态，不记录实验数据或用户输入。
      window.localStorage.setItem(CURATED_GUIDE_STORAGE_KEY, '1')
    } catch {
      // 存储不可用时仍允许本次会话正常关闭引导。
    }
  }

  function selectStoryStage(index: number) {
    if (!experimentStory) return
    const nextIndex = Math.min(experimentStory.stages.length - 1, Math.max(0, index))
    setAutoPlaying(false)
    setActiveStoryStage(nextIndex)
    setActiveStep(experimentStory.stages[nextIndex].stepIndex)
  }

  function toggleAutoPlayback() {
    if (autoPlaying) {
      setAutoPlaying(false)
      return
    }
    if (activeStep >= steps.length - 1) setActiveStep(0)
    setAutoPlaying(true)
  }

  const highlightedLine = current
    ? executableLineIndex(qasm, Number(current.data.operation_index ?? -1))
    : -1
  const currentStatement = highlightedLine >= 0
    ? qasm.split('\n')[highlightedLine]?.trim() ?? ''
    : ''
  const teachingStep = current && typeof current.data.operation_index === 'number'
    ? result?.teaching?.steps.find(
      (step) => step.operation_index === current.data.operation_index,
    )
    : undefined
  const currentPurpose = current?.stage === 'initial_state'
    ? '先确认程序的共同起点，后续每个 Gate 的变化都会与这个初始状态比较。'
    : teachingStep?.purpose ?? String(current?.data.gate_description ?? current?.summary ?? '')
  const circuitGoal = result?.teaching?.circuit_goal || resultPrompt
  const phaseOnly = current ? isPhaseOnlyChange(current) : false

  useEffect(() => {
    const container = codeViewRef.current
    const target = highlightedCodeRef.current
    if (!qasmOpen || !container || !target) return
    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const nextTop = container.scrollTop
      + targetRect.top
      - containerRect.top
      - (container.clientHeight - targetRect.height) / 2
    container.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
  }, [activeStep, highlightedLine, qasmOpen])

  return (
    <main className="app-shell">
      <GlobalNavigation current="explorer" onNavigate={onNavigate} />
      <header className="topbar">
        <div className="brand-copy">
          <div><strong>Quantum Explorer</strong><em>MVP</em></div>
          <p>像阅读代码一样，理解量子程序每一步如何改变状态</p>
        </div>
        <div className={`connection ${loading ? 'loading' : ''}`}>
          <i /> {loading ? '正在生成并验证量子程序…' : 'LOCAL EXPLORATION'}
        </div>
      </header>

      <section className={`request-section ${result ? 'result-mode' : loading ? 'loading-mode' : ''}`}>
        <form className="prompt-form" onSubmit={runDebug}>
          <span className="prompt-glyph">›_</span>
          <textarea
            aria-label="描述你想探索的量子程序"
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value)
              setSelectedScenarioId(null)
            }}
            onKeyDown={keyDown}
            rows={1}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !prompt.trim()}>
            <span>{loading ? '运行中' : '运行量子程序'}</span>
            {!loading && <kbd>⌘ ↵</kbd>}
          </button>
        </form>
        {error && <div className="error-banner"><span>!</span>{error}</div>}
      </section>

      {!result && <EmptyWorkspace loading={loading} scenario={selectedScenario} />}

      {result && backendMode && (
        <div className="backend-layout">
          <aside className="sidebar panel">
            <SidebarProcess events={agents} />
          </aside>
          <BackendResult events={agents} reply={result.reply} />
        </div>
      )}

      {result && !backendMode && experimentStory && currentStoryStage && current && (
        <CuratedWorkspace
          story={experimentStory}
          steps={steps}
          qasm={qasm}
          circuitGoal={circuitGoal}
          activeStoryStage={activeStoryStage}
          activeStep={activeStep}
          qasmOpen={curatedQasmOpen}
          guideOpen={curatedGuideOpen}
          onSelectStoryStage={selectStoryStage}
          onSelectStep={selectStep}
          onQasmOpenChange={setCuratedQasmOpen}
          onDismissGuide={dismissCuratedGuide}
          onOpenGuide={() => setCuratedGuideOpen(true)}
        />
      )}

      {result && !backendMode && (!experimentStory || !currentStoryStage || !current) && (
        <>
          <section className="workspace result-workspace">
            <aside className="sidebar panel">
              <div className="section-title"><span>CIRCUIT STEPS</span><em>{steps.length}</em></div>
              <div className="verified-summary"><span>✓</span><p>已生成并通过 LoomQ 验证</p></div>
              <nav className="step-list" aria-label="电路步骤">
                {steps.map((step, index) => (
                  <button
                    className={index === activeStep ? 'active' : ''}
                    key={step.seq}
                    onClick={() => selectStep(index)}
                  >
                    <span className="step-number">{String(index).padStart(2, '0')}</span>
                    <span className="step-copy">
                      <strong>{stepTitle(step)}</strong>
                      <small>{step.stage === 'initial_state' ? '程序执行前' : step.stage === 'measurement' ? '读出量子状态' : '量子门操作'}</small>
                    </span>
                    <span className="step-check">{index <= activeStep ? '✓' : ''}</span>
                  </button>
                ))}
                {warnings.map((warning) => (
                  <div className="warning-step" key={warning.seq}>
                    <span>!</span><p>{warning.stage === 'statevector_skipped'
                      ? '电路规模较大，当前探索视图不展开 statevector；程序生成与验证结果仍然有效。'
                      : warning.summary}</p>
                  </div>
                ))}
              </nav>
            </aside>

            <section className={`code-panel panel ${qasmOpen ? 'qasm-open' : ''}`}>
              {current ? (
                <>
                  <div className="current-operation">
                    <div className="circuit-goal"><span>目标</span>{circuitGoal}</div>
                    <div className="operation-copy">
                      <div>
                        <span className="eyebrow">执行步骤 · 第 {activeStep} / {Math.max(0, steps.length - 1)} 步</span>
                        <h2>{stepTitle(current)}</h2>
                        {current.stage !== 'initial_state' && currentStatement && (
                          <code className="current-statement">{currentStatement}</code>
                        )}
                      </div>
                      <div className="purpose-copy">
                        <span>为什么这里需要它？</span>
                        <p>{currentPurpose}</p>
                      </div>
                    </div>
                    <div className="operation-navigation" aria-label="电路执行控制">
                      <button
                        aria-label="上一步"
                        onClick={() => selectStep(Math.max(0, activeStep - 1))}
                        disabled={activeStep === 0}
                      >
                        <span>←</span> 上一步
                      </button>
                      <span className="operation-position">{activeStep} / {Math.max(0, steps.length - 1)}</span>
                      <button
                        className="primary-step"
                        aria-label="下一步"
                        onClick={() => selectStep(Math.min(steps.length - 1, activeStep + 1))}
                        disabled={activeStep >= steps.length - 1}
                      >
                        下一步 <span>→</span>
                      </button>
                      <button
                        className={`auto-step ${autoPlaying ? 'playing' : ''}`}
                        aria-label={autoPlaying ? '暂停自动回放' : '开始自动回放'}
                        onClick={toggleAutoPlayback}
                      >
                        {autoPlaying ? 'Ⅱ 暂停' : activeStep >= steps.length - 1 ? '↺ 重播' : '▶ 自动'}
                      </button>
                    </div>
                  </div>
                  <CircuitDiagram steps={steps} activeStep={activeStep} onSelect={selectStep} />
                  <details
                    className="qasm-disclosure"
                    open={qasmOpen}
                    onToggle={(event) => setQasmOpen(event.currentTarget.open)}
                  >
                    <summary>
                      <span><b className="qasm-icon">Q</b>{qasmOpen ? '收起完整 QASM' : '查看完整 QASM'}</span>
                      <small>OPENQASM 2.0 · 只读</small>
                    </summary>
                    <div className="code-view" ref={codeViewRef} role="region" aria-label="完整 OpenQASM 程序">
                      {qasm.split('\n').map((line, index) => (
                        <div
                          className={`code-line ${index === highlightedLine ? 'highlighted' : ''}`}
                          key={`${index}-${line}`}
                          ref={index === highlightedLine ? highlightedCodeRef : undefined}
                        >
                          <span className="line-number">{index + 1}</span>
                          <code>{line || ' '}</code>
                          {index === highlightedLine && <span className="execution-marker">▶</span>}
                        </div>
                      ))}
                    </div>
                  </details>
                </>
              ) : (
                <div className="panel-empty">没有可探索的电路步骤。</div>
              )}
            </section>

            <section className="state-panel panel">
              {current ? (
                <>
                  <div className="state-heading">
                    <span className="eyebrow">量子状态变化</span>
                    <span className="state-badge"><i /> {current.stage === 'initial_state' ? '初始化' : current.stage === 'measurement' ? '测量前' : '前后对比'}</span>
                  </div>
                  <StateDetailContent
                    current={current}
                    currentState={currentState}
                    phaseOnly={phaseOnly}
                    teachingStep={teachingStep}
                    hasTeaching={Boolean(result.teaching)}
                  />
                </>
              ) : (
                <div className="panel-empty">当前没有可展示的量子状态。</div>
              )}
            </section>

          </section>
        </>
      )}
    </main>
  )
}

function App() {
  const [screen, setScreen] = useState<AppScreen>('learn')
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null)

  function navigate(nextScreen: AppScreen) {
    setScreen(nextScreen)
  }

  // 页面选择只传递稳定 prompt，不会自动运行或触发后端请求。
  if (screen === 'learn') {
    return <LearnScreen onStart={() => navigate('experiments')} onNavigate={navigate} />
  }
  if (screen === 'experiments') {
    return (
      <ExperimentsScreen
        onNavigate={navigate}
        onSelect={(scenario) => {
          setSelectedExperimentId(scenario.id)
          navigate('explorer')
        }}
        onFreeExplore={() => {
          setSelectedExperimentId(null)
          navigate('explorer')
        }}
      />
    )
  }
  if (screen === 'repair' || screen === 'backend') {
    return <AdvancedCapabilityScreen kind={screen} onNavigate={navigate} />
  }
  return (
    <ExplorerScreen
      initialScenarioId={selectedExperimentId}
      onNavigate={navigate}
    />
  )
}

export default App
