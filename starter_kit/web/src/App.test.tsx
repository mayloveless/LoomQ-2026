import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ConceptCard, EmptyWorkspace, ExplorerScreen, GroverMechanism, SCENARIOS, ScenarioContext } from './App'
import type { GroverMechanismModel } from './viewModel'

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

describe('Task 13N Grover semantic visualization', () => {
  const model: GroverMechanismModel = {
    stages: [
      { id: 'uniform', stepIndex: 2, values: [
        { basis: '00', amplitude: 0.5, probability: 0.25 },
        { basis: '01', amplitude: 0.5, probability: 0.25 },
        { basis: '10', amplitude: 0.5, probability: 0.25 },
        { basis: '11', amplitude: 0.5, probability: 0.25 },
      ] },
      { id: 'oracle', stepIndex: 8, values: [
        { basis: '00', amplitude: 0.5, probability: 0.25 },
        { basis: '01', amplitude: 0.5, probability: 0.25 },
        { basis: '10', amplitude: 0.5, probability: 0.25 },
        { basis: '11', amplitude: -0.5, probability: 0.25 },
      ] },
      { id: 'diffusion', stepIndex: 15, values: [
        { basis: '00', amplitude: 0, probability: 0 },
        { basis: '01', amplitude: 0, probability: 0 },
        { basis: '10', amplitude: 0, probability: 0 },
        { basis: '11', amplitude: 1, probability: 1 },
      ] },
      { id: 'measurement', stepIndex: 16, values: [
        { basis: '00', amplitude: null, probability: 0 },
        { basis: '01', amplitude: null, probability: 0 },
        { basis: '10', amplitude: null, probability: 0 },
        { basis: '11', amplitude: null, probability: 1 },
      ] },
    ],
  }

  it('explains Oracle marking and Diffusion without inventing an outcome', () => {
    const oracleMarkup = renderToStaticMarkup(
      <GroverMechanism model={model} activeStep={8} onSelect={() => undefined} />,
    )
    const diffusionMarkup = renderToStaticMarkup(
      <GroverMechanism model={model} activeStep={15} onSelect={() => undefined} />,
    )

    expect(oracleMarkup).toContain('Oracle ≈ <code>isTarget(x)</code>')
    expect(oracleMarkup).toContain('Oracle 不直接返回答案')
    expect(oracleMarkup).toContain('测量概率仍相同')
    expect(diffusionMarkup).toContain('Diffusion 围绕平均振幅做反射')
    expect(diffusionMarkup).not.toContain('Oracle 是镜子')
    expect(diffusionMarkup).not.toContain('单次测量结果')
  })

  it('renders nothing when semantic recognition falls back', () => {
    expect(renderToStaticMarkup(
      <GroverMechanism model={null} activeStep={0} onSelect={() => undefined} />,
    )).toBe('')
  })
})
