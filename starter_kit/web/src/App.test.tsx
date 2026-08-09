import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ConceptCard, SCENARIOS, ScenarioContext } from './App'

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
