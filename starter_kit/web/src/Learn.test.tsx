import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './App'
import { GLOSSARY } from './Glossary'
import { LearnScreen } from './Learn'

const plainText = (markup: string) => markup.replace(/<[^>]*>/g, '')

describe('Task 13F-2 guided program onboarding', () => {
  it('opens on an independent Learn screen with a real three-step program', () => {
    const markup = renderToStaticMarkup(<App />)
    const text = plainText(markup)

    expect(text).toContain('跟着一个 qubit')
    expect(markup).not.toContain('CIRCUIT STEPS')
    expect(markup).toContain('qreg q[1];')
    expect(markup).toContain('h q[0];')
    expect(markup).toContain('measure q[0] -&gt; c[0];')
    expect(markup).not.toContain('mental-model.ts')
  })

  it('anchors circuit as an ordered program before the three guided steps', () => {
    const markup = renderToStaticMarkup(<LearnScreen onStart={() => undefined} />)
    const text = plainText(markup)

    expect(text).toContain('一个 quantum circuit，三步看完')
    expect(text).toContain('可以先理解成一段按顺序执行的程序')
    expect(text).toContain('准备状态')
    expect(text).toContain('gate 改变状态')
    expect(text).toContain('measurement 读取结果')
    expect(text.indexOf('可以先理解成一段按顺序执行的程序')).toBeLessThan(text.indexOf('准备一个 qubit'))
  })

  it('explains superposition from H state changes before recapping concepts', () => {
    const markup = renderToStaticMarkup(<LearnScreen onStart={() => undefined} />)
    const text = plainText(markup)

    expect(text).toContain('这就叫叠加')
    expect(text).toContain('它不等同于普通程序“已经随机选好了一个结果，只是你还不知道”。')
    expect(text).toContain('一次运行')
    expect(text).toContain('重复 1,000 shots')
    expect(text).toContain('你刚刚已经读完了第一个 quantum circuit')
    for (const term of ['qubit', 'state', 'gate', 'circuit', 'measurement']) {
      expect(markup).toContain(`>${term}</button>`)
    }
    expect(text).not.toContain('纠缠')
  })

  it('renders reusable keyboard-accessible glossary triggers for all Learn terms', () => {
    const markup = renderToStaticMarkup(<LearnScreen onStart={() => undefined} />)

    expect(markup).toContain('class="term-trigger"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('aria-controls="term-popover-')
    expect(markup).toContain('term-root term-marker')
    expect(markup).not.toContain('class="term-popover"')
    for (const term of ['circuit', 'qubit', 'state', 'gate', 'measurement', 'superposition', 'shots'] as const) {
      expect(GLOSSARY[term].description.length).toBeGreaterThan(20)
    }
  })

  it('keeps the technical explanation collapsed by default', () => {
    const markup = renderToStaticMarkup(<LearnScreen onStart={() => undefined} />)

    expect(markup).toContain('想看更技术一点？')
    expect(markup).toContain('<details class="learn-technical">')
    expect(markup).not.toContain('<details class="learn-technical" open="">')
  })
})
