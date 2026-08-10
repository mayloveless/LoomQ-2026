import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './App'
import { LearnScreen } from './Learn'

describe('Task 13F-2 guided program onboarding', () => {
  it('opens on an independent Learn screen with a real three-step program', () => {
    const markup = renderToStaticMarkup(<App />)

    expect(markup).toContain('跟着一个 qubit')
    expect(markup).not.toContain('CIRCUIT STEPS')
    expect(markup).toContain('qreg q[1];')
    expect(markup).toContain('h q[0];')
    expect(markup).toContain('measure q[0] -&gt; c[0];')
    expect(markup).not.toContain('mental-model.ts')
  })

  it('anchors circuit as an ordered program before the three guided steps', () => {
    const markup = renderToStaticMarkup(<LearnScreen onStart={() => undefined} />)

    expect(markup).toContain('一个 quantum circuit，三步看完')
    expect(markup).toContain('可以先理解成一段按顺序执行的程序')
    expect(markup).toContain('准备状态')
    expect(markup).toContain('gate 改变状态')
    expect(markup).toContain('measurement 读取结果')
    expect(markup.indexOf('可以先理解成一段按顺序执行的程序')).toBeLessThan(markup.indexOf('准备一个 qubit'))
  })

  it('explains superposition from H state changes before recapping concepts', () => {
    const markup = renderToStaticMarkup(<LearnScreen onStart={() => undefined} />)

    expect(markup).toContain('这就叫叠加')
    expect(markup).toContain('它不等同于普通程序「已经随机选好了一个结果')
    expect(markup).toContain('一次运行')
    expect(markup).toContain('重复 1,000 shots')
    expect(markup).toContain('你刚刚已经读完了第一个 quantum circuit')
    for (const term of ['qubit', 'state', 'gate', 'circuit', 'measurement']) {
      expect(markup).toContain(`<dt>${term}</dt>`)
    }
    expect(markup).not.toContain('纠缠')
  })

  it('keeps the technical explanation collapsed by default', () => {
    const markup = renderToStaticMarkup(<LearnScreen onStart={() => undefined} />)

    expect(markup).toContain('想看更技术一点？')
    expect(markup).toContain('<details class="learn-technical">')
    expect(markup).not.toContain('<details class="learn-technical" open="">')
  })
})
