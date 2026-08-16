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

  it('keeps the emphasized free exploration entry with the formal experiments', () => {
    const markup = renderToStaticMarkup(
      <ExperimentsScreen onNavigate={() => undefined} onSelect={() => undefined} onFreeExplore={() => undefined} />,
    )

    const freeEntryIndex = markup.indexOf('class="experiments-free"')
    const experimentGridIndex = markup.indexOf('class="experiments-grid"')

    expect(freeEntryIndex).toBeGreaterThan(markup.indexOf('class="experiments-catalog"'))
    expect(freeEntryIndex).toBeLessThan(experimentGridIndex)
    expect(markup.match(/class="experiments-free"/g)).toHaveLength(1)
    expect(markup).toContain('已经有自己的想法？')
    expect(markup).toContain('Explorer 支持直接输入自然语言实验需求')
  })

  it('places a lightweight Why Quantum motivation directly before the formal experiments', () => {
    const markup = renderToStaticMarkup(
      <ExperimentsScreen onNavigate={() => undefined} onSelect={() => undefined} onFreeExplore={() => undefined} />,
    )

    const motivationIndex = markup.indexOf('class="experiments-motivation"')
    const experimentGridIndex = markup.indexOf('class="experiments-grid"')

    expect(markup).toContain('量子计算不是“更快的普通电脑”')
    expect(markup).toContain('它不适合大多数普通程序，却可能在少数特殊问题上提供完全不同的求解方式。')
    expect(markup).toContain('密码学 · 搜索与组合 · 量子系统模拟')
    expect(markup).toContain('先从三个小实验，看看这种“不同”到底发生在哪里。')
    expect(motivationIndex).toBeLessThan(markup.indexOf('class="experiments-free"'))
    expect(motivationIndex).toBeLessThan(experimentGridIndex)
  })
})
