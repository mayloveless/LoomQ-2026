import { GlobalNavigation, type AppScreen } from './Navigation'

type AdvancedCapabilityProps = {
  kind: 'repair' | 'backend'
  onNavigate: (screen: AppScreen) => void
}

const CONTENT = {
  repair: {
    eyebrow: '04 · CHECK & REPAIR',
    title: '检查和修复量子程序',
    description: '已经有 OpenQASM？LoomQ 将帮助你检查语法和目标是否一致，在保持原始意图的前提下修复问题，并重新验证。',
    steps: ['粘贴 QASM', '说明目标', 'AI 检查 / 修复', '本地验证'],
    note: '这里将承接已有量子程序的检查与修复，不会替代 Explorer 的生成和理解流程。',
  },
  backend: {
    eyebrow: '05 · SELECT & RUN',
    title: '选择合适的运行平台',
    description: '不需要先熟悉每家量子平台。告诉 LoomQ 你的 qubit、真机、排队和成本要求，它会提取约束并推荐合适后端。',
    steps: ['描述运行要求', 'AI 提取约束', '本地能力表筛选', '给出推荐与原因'],
    note: '这里将解释推荐依据；当前不会展示虚构的平台状态、队列时间或价格。',
  },
} as const

export function AdvancedCapabilityScreen({ kind, onNavigate }: AdvancedCapabilityProps) {
  const content = CONTENT[kind]
  return (
    <main className="advanced-shell">
      <GlobalNavigation current={kind} onNavigate={onNavigate} />
      <section className="advanced-hero">
        <div className="advanced-copy">
          <span>{content.eyebrow}</span>
          <div className="advanced-status">进阶能力 · 即将接入 Web</div>
          <h1>{content.title}</h1>
          <p>{content.description}</p>
        </div>
        <div className="advanced-flow" aria-label={`${content.title}未来流程`}>
          <span>PLANNED FLOW</span>
          <ol>
            {content.steps.map((step, index) => (
              <li key={step}><em>{String(index + 1).padStart(2, '0')}</em><strong>{step}</strong>{index < content.steps.length - 1 && <i>→</i>}</li>
            ))}
          </ol>
          <p>{content.note}</p>
        </div>
      </section>
    </main>
  )
}
