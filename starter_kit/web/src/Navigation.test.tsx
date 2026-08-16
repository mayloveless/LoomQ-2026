import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AdvancedCapabilityScreen, RepairEvidence, type RepairResponse } from './AdvancedCapability'
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

  it('renders Repair as a real workspace while Backend remains an honest placeholder', () => {
    const repair = renderToStaticMarkup(<AdvancedCapabilityScreen kind="repair" onNavigate={() => undefined} />)
    const backend = renderToStaticMarkup(<AdvancedCapabilityScreen kind="backend" onNavigate={() => undefined} />)

    expect(repair).toContain('检查和修复已有量子程序')
    expect(repair).not.toContain('进阶能力 · 即将接入 Web')
    expect(repair).toContain('你希望这段程序做什么？')
    expect(repair).toContain('原始 OpenQASM 2.0')
    expect(repair).toContain('检查并修复')
    expect(backend).toContain('选择合适的运行平台')
    expect(backend).toContain('进阶能力 · 即将接入 Web')
    expect(backend).toContain('本地能力表筛选')
    expect(repair).toContain('<form')
    expect(backend).not.toContain('<form')
    expect(repair).toContain('<textarea')
    expect(backend).not.toContain('<textarea')
  })

  it('derives parser and semantic claims only from real trace events', () => {
    const response: RepairResponse = {
      input_validation: { status: 'error', diagnostic: 'ParseError: missing semicolon' },
      reply: 'model explanation',
      repaired_qasm: 'OPENQASM 2.0;\nqreg q[1];',
      events: [
        { seq: 1, layer: 'agent', stage: 'parser_validation', executor: 'local', status: 'ok', summary: 'ok', data: {} },
        { seq: 2, layer: 'agent', stage: 'agent_result', executor: 'local', status: 'ok', summary: 'done', data: { qasm: 'OPENQASM 2.0;\nqreg q[1];', repaired: false } },
      ],
    }
    const markup = renderToStaticMarkup(<RepairEvidence response={response} />)

    expect(markup).toContain('原始程序没有通过本地检查')
    expect(markup).toContain('ParseError: missing semicolon')
    expect(markup).toContain('OpenQASM 语法与结构校验通过')
    expect(markup).toContain('未进行确定性纯态语义验证')
    expect(markup).not.toContain('目标语义验证通过')
    expect(markup).not.toContain('无需修复')
  })

  it('shows real semantic fidelity only for a successful semantic event', () => {
    const response: RepairResponse = {
      input_validation: { status: 'ok', diagnostic: null },
      reply: 'ok',
      repaired_qasm: 'OPENQASM 2.0;\nqreg q[1];',
      events: [
        { seq: 1, layer: 'agent', stage: 'parser_validation', executor: 'local', status: 'ok', summary: 'ok', data: {} },
        { seq: 2, layer: 'agent', stage: 'semantic_verification', executor: 'local', status: 'ok', summary: 'ok', data: { mode: 'statevector', fidelity: 0.998, threshold: 0.97 } },
        { seq: 3, layer: 'agent', stage: 'agent_result', executor: 'local', status: 'ok', summary: 'done', data: { qasm: 'OPENQASM 2.0;\nqreg q[1];' } },
      ],
    }
    const markup = renderToStaticMarkup(<RepairEvidence response={response} />)

    expect(markup).toContain('目标语义验证通过')
    expect(markup).toContain('Fidelity 0.998 · threshold 0.970')
    expect(markup).toContain('原始程序语法可解析')
    expect(markup).not.toContain('程序正确')
  })

  it('does not call an unsupported semantic mode verified', () => {
    const response: RepairResponse = {
      input_validation: { status: 'ok', diagnostic: null },
      reply: 'ok',
      repaired_qasm: 'OPENQASM 2.0;\nqreg q[1];',
      events: [
        { seq: 1, layer: 'agent', stage: 'parser_validation', executor: 'local', status: 'ok', summary: 'ok', data: {} },
        { seq: 2, layer: 'agent', stage: 'semantic_verification', executor: 'local', status: 'ok', summary: 'unsupported', data: { mode: 'unsupported', fidelity: null } },
        { seq: 3, layer: 'agent', stage: 'agent_result', executor: 'local', status: 'ok', summary: 'done', data: { qasm: 'OPENQASM 2.0;\nqreg q[1];' } },
      ],
    }
    const markup = renderToStaticMarkup(<RepairEvidence response={response} />)

    expect(markup).toContain('未进行确定性纯态语义验证')
    expect(markup).not.toContain('目标语义验证通过')
  })
})
