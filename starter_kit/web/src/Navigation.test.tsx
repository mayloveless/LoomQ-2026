import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AdvancedCapabilityScreen } from './AdvancedCapability'
import { GlobalNavigation } from './Navigation'

describe('Task 13G-2 global navigation', () => {
  it('always exposes the five-step capability navigation and highlights the current screen', () => {
    const markup = renderToStaticMarkup(<GlobalNavigation current="experiments" onNavigate={() => undefined} />)

    for (const [number, label] of [
      ['01', 'Learn'],
      ['02', 'Experiments'],
      ['03', 'Explorer'],
      ['04', 'Repair'],
      ['05', 'Backend'],
    ]) {
      expect(markup).toContain(`<span>${number}</span><strong>${label}</strong>`)
    }
    expect(markup.match(/>进阶<\/em>/g)).toHaveLength(2)
    expect(markup).toContain('class="active" aria-current="page"')
  })

  it('renders Repair and Backend as honest non-interactive placeholders', () => {
    const repair = renderToStaticMarkup(<AdvancedCapabilityScreen kind="repair" onNavigate={() => undefined} />)
    const backend = renderToStaticMarkup(<AdvancedCapabilityScreen kind="backend" onNavigate={() => undefined} />)

    expect(repair).toContain('检查和修复量子程序')
    expect(repair).toContain('进阶能力 · 即将接入 Web')
    expect(repair).toContain('AI 检查 / 修复')
    expect(backend).toContain('选择合适的运行平台')
    expect(backend).toContain('本地能力表筛选')
    expect(repair).not.toContain('<form')
    expect(backend).not.toContain('<form')
    expect(repair).not.toContain('<textarea')
    expect(backend).not.toContain('<textarea')
  })
})
