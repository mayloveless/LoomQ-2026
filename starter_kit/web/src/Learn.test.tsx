import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './App'
import { LearnScreen } from './Learn'

describe('Task 13F developer onboarding', () => {
  it('opens on an independent Learn screen with five developer concepts', () => {
    const markup = renderToStaticMarkup(<App />)

    expect(markup).toContain('先用开发者的方式')
    expect(markup).not.toContain('CIRCUIT STEPS')
    for (const concept of ['量子比特', '量子状态', '量子门', '量子电路', '测量']) {
      expect(markup).toContain(concept)
    }
  })

  it('keeps the technical explanation collapsed by default', () => {
    const markup = renderToStaticMarkup(<LearnScreen onStart={() => undefined} />)

    expect(markup).toContain('想看更技术一点？')
    expect(markup).toContain('<details class="learn-technical">')
    expect(markup).not.toContain('<details class="learn-technical" open="">')
  })
})
