import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ConceptCard } from './App'

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
