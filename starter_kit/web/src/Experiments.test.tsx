import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EXPERIMENT_SCENARIO_IDS, ExperimentsScreen } from './Experiments'
import { SCENARIOS } from './scenarios'

describe('Task 13G experiments screen', () => {
  it('shows only Bell, Grover, and Phase as three distinct formal experiments', () => {
    const markup = renderToStaticMarkup(
      <ExperimentsScreen onNavigate={() => undefined} onSelect={() => undefined} onFreeExplore={() => undefined} />,
    )

    expect(markup.match(/class="experiment-card /g)).toHaveLength(3)
    expect(markup).toContain('Bell 关联实验')
    expect(markup).toContain('Grover 搜索实验')
    expect(markup).toContain('相位实验')
    expect(markup).toContain('推荐从这里开始')
    expect(markup).not.toContain('GHZ')
    for (const visual of ['bell-visual', 'grover-visual', 'phase-visual']) {
      expect(markup).toContain(visual)
    }
  })

  it('reuses the existing stable prompts without rewriting them', () => {
    const prompts = EXPERIMENT_SCENARIO_IDS.map(
      (id) => SCENARIOS.find((scenario) => scenario.id === id)?.prompt,
    )

    expect(prompts).toEqual([
      '生成一个 Bell 态并测量',
      '设计一个 2 比特 Grover 搜索电路，搜索目标为 |11>。先创建均匀叠加，再实现标记 |11> 的 Oracle 和扩散算子，最后测量；请使用 OpenQASM 2.0 基础门展开，不定义自定义 gate。',
      '生成一个带相对相位的 Bell- 态，不要求测量',
    ])
  })

  it('keeps free exploration visually separate from formal experiments', () => {
    const markup = renderToStaticMarkup(
      <ExperimentsScreen onNavigate={() => undefined} onSelect={() => undefined} onFreeExplore={() => undefined} />,
    )

    expect(markup).toContain('class="experiments-free"')
    expect(markup).toContain('已经有自己的问题？')
  })
})
