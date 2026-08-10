import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './App'
import { LearnScreen } from './Learn'

const plainText = (markup: string) => markup.replace(/<[^>]*>/g, '')

describe('Task 13F-5 quantum term visual language', () => {
  it('opens on an independent Learn screen with a real three-step program', () => {
    const markup = renderToStaticMarkup(<App />)
    const text = plainText(markup)

    expect(text).toContain('跟着一个量子比特，看懂量子程序怎么运行')
    expect(markup).not.toContain('CIRCUIT STEPS')
    expect(markup).toContain('qreg q[1];')
    expect(markup).toContain('h q[0];')
    expect(markup).toContain('measure q[0] -&gt; c[0];')
    expect(markup).not.toContain('mental-model.ts')
  })

  it('anchors circuit as an ordered program before the three guided steps', () => {
    const markup = renderToStaticMarkup(<LearnScreen onStart={() => undefined} />)
    const text = plainText(markup)

    expect(text).toContain('一个量子电路，三步看完')
    expect(text).toContain('量子电路（Quantum Circuit）可以先理解成一段按顺序执行的程序')
    expect(text).toContain('可以先理解成一段按顺序执行的程序')
    expect(text).toContain('准备量子状态')
    expect(text).toContain('量子门改变状态')
    expect(text).toContain('测量读取结果')
    expect(text.indexOf('可以先理解成一段按顺序执行的程序')).toBeLessThan(text.indexOf('准备一个量子比特'))
  })

  it('explains superposition from H state changes before recapping concepts', () => {
    const markup = renderToStaticMarkup(<LearnScreen onStart={() => undefined} />)
    const text = plainText(markup)

    expect(text).toContain('量子概念')
    expect(text).toContain('这就叫：叠加（Superposition）')
    expect(text).toContain('它不等同于普通程序“已经随机选好了一个结果，只是你还不知道”。')
    expect(text).toContain('一次运行')
    expect(text).toContain('重复运行 1,000 次（Shots）')
    expect(text).toContain('你刚刚已经读完了第一个量子电路')
    for (const term of ['量子比特', '量子状态', '量子门', '量子电路', '测量']) {
      expect(markup).toContain(`<strong>${term}</strong>`)
    }
    expect(markup).not.toMatch(/<dt><strong>[^<]+<\/strong><small>/)
    expect(text).not.toContain('纠缠')
  })

  it('uses static two-level term emphasis without glossary interactions', () => {
    const markup = renderToStaticMarkup(<LearnScreen onStart={() => undefined} />)

    expect(markup).toContain('class="quantum-term"')
    expect(markup).toContain('class="learn-concept-label"')
    expect(markup).toContain('class="quantum-concept-name"')
    expect(markup).not.toContain('quantum-concept-marker')
    expect(markup).not.toContain('term-trigger')
    expect(markup).not.toContain('term-popover')
    expect(markup).not.toContain('aria-expanded')
  })

  it('keeps the technical explanation collapsed by default', () => {
    const markup = renderToStaticMarkup(<LearnScreen onStart={() => undefined} />)

    expect(markup).toContain('想看更技术一点？')
    expect(markup).toContain('<details class="learn-technical">')
    expect(markup).not.toContain('<details class="learn-technical" open="">')
  })
})
