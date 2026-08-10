import { createContext, type ReactNode, useContext, useEffect, useId, useMemo, useState } from 'react'

export type GlossaryTerm =
  | 'circuit'
  | 'qubit'
  | 'state'
  | 'gate'
  | 'measurement'
  | 'superposition'
  | 'shots'

type GlossaryEntry = {
  label: string
  english: string
  description: string
}

// 术语内容集中维护，后续实验可以继续复用同一套 Term 交互。
export const GLOSSARY: Record<GlossaryTerm, GlossaryEntry> = {
  circuit: {
    label: '量子电路',
    english: 'quantum circuit',
    description: '一组按顺序执行的量子操作。对开发者来说，可以先把它理解成一段会逐步改变量子状态的程序。',
  },
  qubit: {
    label: '量子比特',
    english: 'qubit',
    description: '量子程序操作的数据单位。它最终可以被测量成 0 或 1，但在测量前可以处于更丰富的量子状态。',
  },
  state: {
    label: '量子状态',
    english: 'quantum state',
    description: '程序当前的量子数据状态。它不仅包含哪些结果可能出现，还包含之后会影响干涉的量子信息。',
  },
  gate: {
    label: '量子门',
    english: 'quantum gate',
    description: '改变量子状态的一次操作。可以类比为对程序状态执行一个变换，例如当前例子里的 H。',
  },
  measurement: {
    label: '测量',
    english: 'measurement',
    description: '把量子状态读取成经典结果。一次测量得到一个确定的 0 或 1，多次重复运行后才形成统计分布。',
  },
  superposition: {
    label: '叠加',
    english: 'superposition',
    description: '一个量子状态同时保留多个可能性。在当前例子里，执行 H 后，|0⟩ 和 |1⟩ 两种可能性都被保留下来。它不是结果已经随机选好，只是我们还不知道。',
  },
  shots: {
    label: '重复运行次数',
    english: 'shots',
    description: '同一个量子电路重复准备、执行和测量的次数。多次 shots 用来观察结果的统计分布。',
  },
}

type GlossaryContextValue = {
  activeId: string | null
  toggle: (id: string) => void
}

const GlossaryContext = createContext<GlossaryContextValue | null>(null)

export function GlossaryProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (!activeId) return

    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-term-root]')) return
      setActiveId(null)
    }
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveId(null)
    }

    document.addEventListener('pointerdown', closeFromOutside)
    document.addEventListener('keydown', closeFromKeyboard)
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside)
      document.removeEventListener('keydown', closeFromKeyboard)
    }
  }, [activeId])

  const value = useMemo<GlossaryContextValue>(() => ({
    activeId,
    toggle: (id) => setActiveId((current) => current === id ? null : id),
  }), [activeId])

  return <GlossaryContext.Provider value={value}>{children}</GlossaryContext.Provider>
}

type TermProps = {
  term: GlossaryTerm
  children: ReactNode
  marker?: boolean
}

export function Term({ term, children, marker = false }: TermProps) {
  const glossary = useContext(GlossaryContext)
  const reactId = useId()
  const triggerId = `term-trigger-${reactId}`
  const popoverId = `term-popover-${reactId}`
  const open = glossary?.activeId === triggerId
  const entry = GLOSSARY[term]

  if (!glossary) {
    throw new Error('Term 必须在 GlossaryProvider 内使用')
  }

  return (
    <span className={`term-root${marker ? ' term-marker' : ''}`} data-term-root>
      <button
        id={triggerId}
        type="button"
        className="term-trigger"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => glossary.toggle(triggerId)}
      >
        {children}
      </button>
      {open && (
        <span className="term-popover" id={popoverId} role="definition" aria-labelledby={triggerId}>
          <span className="term-popover-heading"><strong>{entry.label}</strong><em>{entry.english}</em></span>
          <span className="term-popover-copy">{entry.description}</span>
        </span>
      )}
    </span>
  )
}
