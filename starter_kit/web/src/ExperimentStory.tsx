import type { CSSProperties } from 'react'
import type { ExperimentStoryModel, ExperimentStoryStage, StorySnapshot, StoryValue } from './storyModel'

function formatStoryPercent(probability: number): string {
  const value = probability * 100
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}%`
}

function phaseDegrees(value: StoryValue): number {
  return ((value.phase ?? 0) * 180) / Math.PI
}

function effectLabel(
  model: ExperimentStoryModel,
  stage: ExperimentStoryStage,
  value: StoryValue,
  position: 'before' | 'after',
): string | null {
  if (position !== 'after') return null
  if (model.scenarioId === 'search' && stage.id === 'oracle' && value.basis === '11') return '方向翻转'
  if (model.scenarioId === 'search' && stage.id === 'diffusion') {
    if (value.basis === '11') return '建设性增强'
    if (value.basis === '00') return '其他分支部分抵消'
  }
  if (model.scenarioId === 'bell' && stage.id === 'correlate') return '关联分支'
  if (model.scenarioId === 'phase' && stage.id === 'turn' && Math.abs(value.phase ?? 0) > 0.1) return '方向已改变'
  return null
}

function StorySnapshotView({
  model,
  stage,
  snapshot,
  bases,
  position,
}: {
  model: ExperimentStoryModel
  stage: ExperimentStoryStage
  snapshot: StorySnapshot
  bases: string[]
  position: 'before' | 'after'
}) {
  return (
    <div className={`story-snapshot story-${snapshot.mode}`}>
      {bases.map((basis) => {
        const value = snapshot.values.find((entry) => entry.basis === basis) ?? {
          basis,
          magnitude: snapshot.mode === 'wave' ? 0 : null,
          phase: snapshot.mode === 'wave' ? 0 : null,
          probability: 0,
        }
        const magnitude = value.magnitude ?? Math.sqrt(Math.max(0, value.probability))
        const effect = effectLabel(model, stage, value, position)
        return (
          <div className={`story-branch${value.probability <= 1e-8 ? ' is-quiet' : ''}`} key={basis}>
            <code>|{basis}⟩</code>
            {snapshot.mode === 'probability' ? (
              <div className="story-probability-track" aria-label={`${basis} 的概率 ${formatStoryPercent(value.probability)}`}>
                <i style={{ width: `${Math.min(100, Math.max(0, value.probability * 100))}%` }} />
              </div>
            ) : (
              <div className="story-wave-path" aria-label={`${basis} 的振幅方向 ${Math.round(phaseDegrees(value))} 度`}>
                <i />
                <span
                  className="story-wave"
                  style={{
                    '--story-wave-scale': String(Math.max(0.08, magnitude)),
                    opacity: magnitude <= 1e-8 ? 0 : Math.max(0.35, Math.min(1, magnitude + 0.25)),
                  } as CSSProperties}
                >∿∿∿</span>
                <b style={{ transform: `rotate(${phaseDegrees(value)}deg)` }}>→</b>
              </div>
            )}
            <small>{formatStoryPercent(value.probability)}</small>
            {effect && <em>{effect}</em>}
          </div>
        )
      })}
    </div>
  )
}

export function ExperimentStory({
  model,
  activeStageIndex,
  onSelect,
}: {
  model: ExperimentStoryModel
  activeStageIndex: number
  onSelect: (stageIndex: number) => void
}) {
  const safeIndex = Math.min(model.stages.length - 1, Math.max(0, activeStageIndex))
  const stage = model.stages[safeIndex]
  const bases = [...new Set([...stage.before.values, ...stage.after.values].map((entry) => entry.basis))].sort()

  return (
    <section className={`experiment-story story-${model.scenarioId}`} aria-label={`${model.scenarioId} 实验故事模式`}>
      <nav className="story-stage-nav" aria-label="实验语义阶段">
        {model.stages.map((item, index) => (
          <button
            className={index === safeIndex ? 'active' : ''}
            key={item.id}
            onClick={() => onSelect(index)}
          >
            <span>{item.number}</span>
            <strong>{item.label}</strong>
          </button>
        ))}
      </nav>

      <header className="story-stage-heading">
        <span>当前阶段要做什么</span>
        <h2>{stage.label}</h2>
        <p>{stage.purpose}</p>
      </header>

      <div className="story-visual-key" aria-label="教学示意图例">
        <span>路径 = 分支</span>
        <span>波形方向 = 相对相位</span>
        <span>波形强弱 = 振幅</span>
      </div>

      <div className="story-change-frame">
        <section>
          <span>执行前</span>
          <StorySnapshotView model={model} stage={stage} snapshot={stage.before} bases={bases} position="before" />
        </section>
        <div className="story-operation">
          <span>做了什么</span>
          <i>→</i>
          <p>{stage.action}</p>
          <i>→</i>
        </div>
        <section>
          <span>执行后</span>
          <StorySnapshotView model={model} stage={stage} snapshot={stage.after} bases={bases} position="after" />
        </section>
      </div>

      <footer className="story-importance">
        <span>为什么重要</span>
        <strong>{stage.importance}</strong>
        {stage.terminology && <p>{stage.terminology}</p>}
      </footer>
      <p className="story-schematic-note">路径和波形只用于解释量子分支、振幅与相对相位，不代表真实光子沿这些路径运动。</p>
    </section>
  )
}
