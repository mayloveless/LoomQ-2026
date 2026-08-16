import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ConceptCard, DEFAULT_RESULT_AUTOPLAY, EmptyWorkspace, ExplorerScreen, SCENARIOS, ScenarioContext } from './App'
import { ExperimentStory } from './ExperimentStory'
import type { ExperimentStoryModel } from './storyModel'

describe('Just-in-time concept card', () => {
  it('renders a concept only when both name and explanation exist', () => {
    const markup = renderToStaticMarkup(
      <ConceptCard
        step={{
          operation_index: 0,
          purpose: '准备两条路径。',
          concept: '叠加',
          concept_explanation: '多个基态共同描述当前状态。',
        }}
      />,
    )

    expect(markup).toContain('叠加')
    expect(markup).toContain('多个基态共同描述当前状态')
    expect(renderToStaticMarkup(
      <ConceptCard
        step={{
          operation_index: 1,
          purpose: '继续执行。',
          concept: null,
          concept_explanation: null,
        }}
      />,
    )).toBe('')
  })
})

describe('Task 13D scenario entry', () => {
  it('keeps stable prompts behind developer-friendly scenario titles', () => {
    expect(SCENARIOS.slice(0, 3).map((scenario) => scenario.prompt)).toEqual([
      '生成一个 Bell 态并测量',
      '生成一个 3 比特 GHZ 态并测量',
      '生成一个带相对相位的 Bell- 态，不要求测量',
    ])
    expect(SCENARIOS.slice(0, 3).map((scenario) => scenario.title)).toEqual([
      '两个结果为什么总是同步？',
      '三个量子位怎样变成一个整体？',
      '概率没变，量子状态真的没变吗？',
    ])
  })

  it('renders the lightweight comparison context from static metadata', () => {
    const markup = renderToStaticMarkup(<ScenarioContext scenario={SCENARIOS[0]} />)

    expect(markup).toContain('普通程序怎么理解？')
    expect(markup).toContain('量子版本有什么不同？')
    expect(markup).toContain('这次重点看什么？')
  })
})

describe('Task 13G Explorer entry', () => {
  it('prefills the selected stable prompt without rendering scenario pickers', () => {
    const markup = renderToStaticMarkup(
      <ExplorerScreen initialScenarioId="search" onNavigate={() => undefined} />,
    )

    expect(markup).toContain(
      SCENARIOS.find((scenario) => scenario.id === 'search')!.prompt.replaceAll('>', '&gt;'),
    )
    expect(markup).toContain('aria-current="page"')
    expect(markup).toContain('<strong>Explorer</strong>')
    expect(markup).not.toContain('Experiments · 选择实验')
    expect(markup).not.toContain('Learn · 基础概念')
    expect(markup).not.toContain('场景示例')
    expect(markup).not.toContain('切换示例')
    expect(markup).toContain('Grover 搜索实验已准备好')
    expect(markup).toContain('尚未运行 · 点击上方“运行量子程序”开始')
    expect(markup).not.toContain('class="loading-process"')
    expect(markup).not.toContain('skeleton-line')
  })

  it('opens free exploration with an empty prompt', () => {
    const markup = renderToStaticMarkup(
      <ExplorerScreen initialScenarioId={null} onNavigate={() => undefined} />,
    )

    expect(markup).toMatch(/<textarea[^>]*><\/textarea>/)
    expect(markup).toContain('描述你想探索的量子程序')
    expect(markup).toContain('在上方输入自然语言实验需求')
    expect(markup).not.toContain('class="loading-process"')
    expect(markup).not.toContain('skeleton-line')
  })

  it('shows staged preparation only while Explorer is loading', () => {
    const idleMarkup = renderToStaticMarkup(
      <EmptyWorkspace loading={false} scenario={SCENARIOS[0]} />,
    )
    const loadingMarkup = renderToStaticMarkup(
      <EmptyWorkspace loading scenario={SCENARIOS[0]} />,
    )

    expect(idleMarkup).not.toContain('class="loading-process"')
    expect(idleMarkup).not.toContain('skeleton-line')
    expect(loadingMarkup).toContain('class="loading-process"')
    expect(loadingMarkup).toContain('skeleton-line')
  })
})

describe('Task 13O curated experiment story frame', () => {
  const model: ExperimentStoryModel = {
    scenarioId: 'search',
    stages: [
      {
        id: 'oracle',
        number: '02',
        label: '翻转目标方向',
        purpose: '对每个候选执行同一个判断。',
        action: '目标分支的振幅方向被翻过来；Oracle ≈ isTarget(x)，但不会直接返回答案。',
        importance: '概率还没有变大，方向差异会留给后续干涉使用。',
        terminology: '这也叫相位翻转。',
        stepIndex: 8,
        gateIndices: [3, 4, 5, 6, 7, 8],
        before: { mode: 'wave', values: [
          { basis: '00', magnitude: 0.5, phase: 0, probability: 0.25 },
          { basis: '11', magnitude: 0.5, phase: 0, probability: 0.25 },
        ] },
        after: { mode: 'wave', values: [
          { basis: '00', magnitude: 0.5, phase: 0, probability: 0.25 },
          { basis: '11', magnitude: 0.5, phase: Math.PI, probability: 0.25 },
        ] },
      },
    ],
  }

  it('keeps a completed request stopped until the user advances it', () => {
    expect(DEFAULT_RESULT_AUTOPLAY).toBe(false)
  })

  it('renders the five-part frame and explains Oracle as a direction flip first', () => {
    const markup = renderToStaticMarkup(
      <ExperimentStory model={model} activeStageIndex={0} onSelect={() => undefined} />,
    )

    expect(markup).toContain('当前阶段要做什么')
    expect(markup).toContain('执行前')
    expect(markup).toContain('做了什么')
    expect(markup).toContain('执行后')
    expect(markup).toContain('为什么重要')
    expect(markup).toContain('振幅方向被翻过来')
    expect(markup).toContain('不会直接返回答案')
    expect(markup).toContain('方向翻转')
    expect(markup).toContain('不代表真实光子')
  })
})
