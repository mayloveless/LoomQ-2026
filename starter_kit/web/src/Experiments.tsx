import { SCENARIOS, type Scenario } from './scenarios'
import { GlobalNavigation, type AppScreen } from './Navigation'

type ExperimentsScreenProps = {
  onNavigate: (screen: AppScreen) => void
  onSelect: (scenario: Scenario) => void
  onFreeExplore: () => void
}

export const EXPERIMENT_SCENARIO_IDS = ['bell', 'search', 'phase'] as const

const EXPERIMENTS = [
  {
    id: 'bell',
    number: '01',
    category: '关联',
    name: 'Bell 关联实验',
    english: 'Bell State',
    description: '让两个量子比特分别测量，却只看到 00 或 11。看看这种关联是怎样一步步建立起来的。',
    concepts: ['叠加', '纠缠', '测量'],
  },
  {
    id: 'search',
    number: '02',
    category: '计算',
    name: 'Grover 搜索实验',
    english: 'Grover Search',
    description: '在 4 个候选结果中，把目标 |11⟩ 被测到的概率逐步放大。',
    concepts: ['均匀叠加', '标记目标', '概率放大', '测量'],
  },
  {
    id: 'phase',
    number: '03',
    category: '状态',
    name: '相位实验',
    english: 'Phase',
    description: '两个状态看起来都有相同的测量概率，但内部的相位信息已经不同。',
    concepts: ['概率', '相位', '状态差异'],
  },
] as const

function BellVisualization() {
  return (
    <div className="experiment-visual bell-visual" aria-label="Bell 结果只出现 00 和 11，各占一半">
      {[
        ['00', '50%', 'full'],
        ['11', '50%', 'full'],
        ['01', '0%', 'empty'],
        ['10', '0%', 'empty'],
      ].map(([basis, value, state]) => (
        <div className={state} key={basis}>
          <code>{basis}</code><i><b /></i><span>{value}</span>
        </div>
      ))}
      <p><span>00</span><i>↔</i><span>11</span><small>只留下关联结果</small></p>
    </div>
  )
}

function GroverVisualization() {
  return (
    <div className="experiment-visual grover-visual" aria-label="四个候选中，目标 11 的概率被放大">
      <div className="grover-caption"><span>4 个候选</span><i>目标被放大</i></div>
      <div className="grover-grid">
        {['00', '01', '10', '11'].map((basis) => (
          <div className={basis === '11' ? 'target' : ''} key={basis}>
            <code>|{basis}⟩</code>
            <i><b /></i>
            <small>{basis === '11' ? 'TARGET' : 'candidate'}</small>
          </div>
        ))}
      </div>
    </div>
  )
}

function PhaseVisualization() {
  return (
    <div className="experiment-visual phase-visual" aria-label="两个状态概率相同，但相位正负不同">
      {[
        ['状态 A', '+'],
        ['状态 B', '−'],
      ].map(([label, phase]) => (
        <div key={label}>
          <span>{label}</span>
          <p><code>0</code><i><b /></i><small>50%</small></p>
          <p><code>1</code><i><b /></i><small>50%</small></p>
          <strong>phase <em>{phase}</em></strong>
        </div>
      ))}
      <small className="phase-same">概率相同 · 状态不同</small>
    </div>
  )
}

function ExperimentVisualization({ id }: { id: string }) {
  if (id === 'bell') return <BellVisualization />
  if (id === 'search') return <GroverVisualization />
  return <PhaseVisualization />
}

export function ExperimentsScreen({ onNavigate, onSelect, onFreeExplore }: ExperimentsScreenProps) {
  return (
    <main className="experiments-shell">
      <GlobalNavigation current="experiments" onNavigate={onNavigate} />

      <section className="experiments-hero">
        <span>QUANTUM EXPERIMENTS · 03</span>
        <h1>选择一个量子实验</h1>
        <p>不用先理解算法。从一个现象开始，在 Explorer 里一步步看量子程序怎样改变状态。</p>
      </section>

      <section className="experiments-catalog" aria-label="选择量子实验">
        {/* 动机说明只连接“为什么值得看”与实验入口，不扩展成应用场景科普。 */}
        <div className="experiments-motivation" aria-labelledby="experiments-motivation-heading">
          <div>
            <h2 id="experiments-motivation-heading">量子计算不是“更快的普通电脑”</h2>
            <small>密码学 · 搜索与组合 · 量子系统模拟</small>
          </div>
          <div>
            <p>它不适合大多数普通程序，却可能在少数特殊问题上提供完全不同的求解方式。</p>
            <strong>先从三个小实验，看看这种“不同”到底发生在哪里。</strong>
          </div>
        </div>

        <div className="experiments-free">
          <div>
            <span>已经有自己的想法？</span>
            <p>直接描述你想探索的量子程序。不限于下面三个示例，Explorer 支持直接输入自然语言实验需求。</p>
          </div>
          <button onClick={onFreeExplore}>自由探索 <span>→</span></button>
        </div>

        <div className="experiments-grid" aria-label="正式量子实验">
          {EXPERIMENTS.map((experiment) => {
            const scenario = SCENARIOS.find((item) => item.id === experiment.id)
            if (!scenario) return null
            return (
              <article className={`experiment-card experiment-${experiment.id}`} key={experiment.id}>
                <div className="experiment-meta">
                  <span>{experiment.number} · {experiment.category}</span>
                  {experiment.id === 'bell' && <em>推荐从这里开始</em>}
                </div>
                <div className="experiment-name"><strong>{experiment.name}</strong><small>{experiment.english}</small></div>
                <h2>{scenario.title}</h2>
                <p className="experiment-description">{experiment.description}</p>
                <ExperimentVisualization id={experiment.id} />
                <div className="experiment-concepts"><span>你会看到</span><p>{experiment.concepts.map((concept) => <code key={concept}>{concept}</code>)}</p></div>
                <button className="experiment-open" onClick={() => onSelect(scenario)}>在 Explorer 中打开 <span>→</span></button>
              </article>
            )
          })}
        </div>
      </section>

    </main>
  )
}
