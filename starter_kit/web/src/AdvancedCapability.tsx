import { useState, type FormEvent } from 'react'
import { GlobalNavigation, type AppScreen } from './Navigation'
import type { TraceEvent } from './types'

type AdvancedCapabilityProps = {
  kind: 'repair' | 'backend'
  onNavigate: (screen: AppScreen) => void
}

export type RepairResponse = {
  input_validation: { status: 'ok' | 'error'; diagnostic: string | null }
  reply: string
  repaired_qasm: string | null
  events: TraceEvent[]
}

const BROKEN_BELL_QASM = `OPENQASM 2.0;
include "qelib1.inc";
qreg q[2]
creg c[2];
h q[0];
cx q[0],q[1];
measure q[0] -> c[0];
measure q[1] -> c[1];`

const BACKEND_CONTENT = {
  eyebrow: '05 · SELECT & RUN',
  title: '选择合适的运行平台',
  description: '不需要先熟悉每家量子平台。告诉 LoomQ 你的 qubit、真机、排队和成本要求，它会提取约束并推荐合适后端。',
  steps: ['描述运行要求', 'AI 提取约束', '本地能力表筛选', '给出推荐与原因'],
  note: '这里将解释推荐依据；当前不会展示虚构的平台状态、队列时间或价格。',
} as const

function latestEvent(events: TraceEvent[], stage: string): TraceEvent | undefined {
  return [...events].reverse().find((event) => event.layer === 'agent' && event.stage === stage)
}

export function RepairEvidence({ response }: { response: RepairResponse }) {
  const parser = latestEvent(response.events, 'parser_validation')
  const semantic = latestEvent(response.events, 'semantic_verification')
  const agentResult = latestEvent(response.events, 'agent_result')
  const semanticSupported = semantic?.data.mode === 'statevector'
  const semanticPassed = semantic?.status === 'ok' && semanticSupported
  const semanticFailed = semantic?.status === 'error'
  const reliableAgentResult = agentResult?.status === 'ok' && Boolean(response.repaired_qasm)
  const fidelity = typeof semantic?.data.fidelity === 'number' ? semantic.data.fidelity : null
  const threshold = typeof semantic?.data.threshold === 'number' ? semantic.data.threshold : null

  return (
    <div className="repair-evidence">
      <section className={`repair-check ${response.input_validation.status}`}>
        <span>原始程序检查</span>
        {response.input_validation.status === 'ok' ? (
          <><strong>原始程序语法可解析</strong><p>LoomQ 会继续根据你描述的目标检查并生成修复提案。</p></>
        ) : (
          <><strong>原始程序没有通过本地检查</strong><code>{response.input_validation.diagnostic}</code></>
        )}
      </section>

      <section className="repair-verification">
        <span>验证结果</span>
        <div className={parser?.status === 'ok' ? 'ok' : parser?.status === 'error' ? 'error' : 'neutral'}>
          <b>{parser?.status === 'ok' ? '✓' : parser?.status === 'error' ? '×' : '—'}</b>
          <div>
            <strong>{parser?.status === 'ok'
              ? 'OpenQASM 语法与结构校验通过'
              : parser?.status === 'error'
                ? 'OpenQASM 语法与结构校验失败'
                : '未记录 OpenQASM 语法与结构校验'}</strong>
            {parser?.status === 'error' && parser.data.diagnostic != null && <code>{String(parser.data.diagnostic)}</code>}
          </div>
        </div>
        <div className={semanticPassed ? 'ok' : semanticFailed ? 'error' : 'neutral'}>
          <b>{semanticPassed ? '✓' : semanticFailed ? '×' : '—'}</b>
          <div>
            <strong>{semanticPassed
              ? '目标语义验证通过'
              : semanticFailed
                ? '目标语义验证失败'
                : '未进行确定性纯态语义验证'}</strong>
            {semanticPassed && fidelity != null && (
              <small>Fidelity {fidelity.toFixed(3)}{threshold != null ? ` · threshold ${threshold.toFixed(3)}` : ''}</small>
            )}
            {semanticFailed && semantic.data.diagnostic != null && <code>{String(semantic.data.diagnostic)}</code>}
          </div>
        </div>
        <div className={reliableAgentResult ? 'ok' : 'neutral'}>
          <b>{reliableAgentResult ? '✓' : '—'}</b>
          <div><strong>{reliableAgentResult ? '最终候选已通过 production pipeline' : '未取得可靠的最终候选'}</strong></div>
        </div>
      </section>
    </div>
  )
}

export function RepairWorkspace({ onNavigate }: { onNavigate: (screen: AppScreen) => void }) {
  const [goal, setGoal] = useState('')
  const [qasm, setQasm] = useState('')
  const [response, setResponse] = useState<RepairResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [applied, setApplied] = useState(false)

  function loadExample() {
    setGoal('生成 Bell 态并测量两个量子比特')
    setQasm(BROKEN_BELL_QASM)
    setResponse(null)
    setError('')
    setApplied(false)
  }

  async function submitRepair(event: FormEvent) {
    event.preventDefault()
    const requestGoal = goal.trim()
    const requestQasm = qasm.trim()
    if (!requestGoal || !requestQasm || loading) return
    setLoading(true)
    setError('')
    setResponse(null)
    setApplied(false)
    try {
      const result = await fetch('/api/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: requestGoal, qasm: requestQasm }),
      })
      const payload = await result.json() as RepairResponse & { error?: string }
      if (!result.ok) throw new Error(payload.error)
      setResponse(payload)
    } catch {
      setError('这次检查没有完成，请检查模型配置后重试。')
    } finally {
      setLoading(false)
    }
  }

  function applyRepair() {
    if (!response?.repaired_qasm) return
    // 修复提案只有在用户明确确认后才写回编辑区，不自动发起第二次请求。
    setQasm(response.repaired_qasm)
    setApplied(true)
  }

  return (
    <main className="repair-shell">
      <GlobalNavigation current="repair" onNavigate={onNavigate} />
      <header className="repair-heading">
        <div><span>04 · CHECK & REPAIR</span><h1>检查和修复已有量子程序</h1></div>
        <p>粘贴 OpenQASM 并说明原本目标。LoomQ 会给出经过真实 parser 与语义验证路径检查的修复提案，是否应用由你决定。</p>
      </header>

      <form className="repair-workspace" onSubmit={submitRepair}>
        <section className="repair-input-panel">
          <header><span>ORIGINAL</span><button type="button" onClick={loadExample} disabled={loading}>加载示例</button></header>
          <label htmlFor="repair-goal">你希望这段程序做什么？</label>
          <textarea id="repair-goal" className="repair-goal-input" placeholder="例如：生成 Bell 态并测量两个量子比特" value={goal} onChange={(event) => { setGoal(event.target.value); setApplied(false) }} disabled={loading} />
          <label htmlFor="repair-qasm">原始 OpenQASM 2.0</label>
          <textarea id="repair-qasm" className="repair-qasm-input" spellCheck={false} placeholder={'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];'} value={qasm} onChange={(event) => { setQasm(event.target.value); setApplied(false) }} disabled={loading} />
          <button className="repair-submit" type="submit" disabled={loading || !goal.trim() || !qasm.trim()}>{loading ? '正在检查…' : '检查并修复'}</button>
        </section>

        <section className="repair-result-panel" aria-live="polite">
          <header><span>REPAIR RESULT</span><strong>{loading ? '正在准备修复提案' : response ? '检查完成' : '等待输入'}</strong></header>
          {loading && <div className="repair-loading"><i aria-hidden="true" /><h2>正在检查并准备修复提案</h2><p>LoomQ 会先理解目标，再让修复后的程序经过本地验证。</p></div>}
          {!loading && error && <div className="repair-error"><b>!</b><p>{error}</p></div>}
          {!loading && !error && !response && <div className="repair-empty"><span>粘贴已有程序</span><i>→</i><span>查看修复提案</span><i>→</i><span>确认后应用</span></div>}
          {!loading && response && (
            <div className="repair-result-content">
              <RepairEvidence response={response} />
              <section className="repair-proposal">
                <div><span>LoomQ 的修复提案</span>{response.repaired_qasm && <small>来自真实 agent_result</small>}</div>
                {response.repaired_qasm ? <pre><code>{response.repaired_qasm}</code></pre> : <p>本次没有取得可靠的最终 OpenQASM，因此不提供可应用的修复提案。</p>}
                {response.repaired_qasm && <div className="repair-apply-row"><button type="button" onClick={applyRepair}>应用修复到编辑区</button>{applied && <span>✓ 已应用到编辑区</span>}</div>}
              </section>
            </div>
          )}
        </section>
      </form>
    </main>
  )
}

function BackendPlaceholder({ onNavigate }: { onNavigate: (screen: AppScreen) => void }) {
  return (
    <main className="advanced-shell">
      <GlobalNavigation current="backend" onNavigate={onNavigate} />
      <section className="advanced-hero">
        <div className="advanced-copy"><span>{BACKEND_CONTENT.eyebrow}</span><div className="advanced-status">进阶能力 · 即将接入 Web</div><h1>{BACKEND_CONTENT.title}</h1><p>{BACKEND_CONTENT.description}</p></div>
        <div className="advanced-flow" aria-label={`${BACKEND_CONTENT.title}未来流程`}>
          <span>PLANNED FLOW</span>
          <ol>{BACKEND_CONTENT.steps.map((step, index) => <li key={step}><em>{String(index + 1).padStart(2, '0')}</em><strong>{step}</strong>{index < BACKEND_CONTENT.steps.length - 1 && <i>→</i>}</li>)}</ol>
          <p>{BACKEND_CONTENT.note}</p>
        </div>
      </section>
    </main>
  )
}

export function AdvancedCapabilityScreen({ kind, onNavigate }: AdvancedCapabilityProps) {
  if (kind === 'repair') return <RepairWorkspace onNavigate={onNavigate} />
  return <BackendPlaceholder onNavigate={onNavigate} />
}
