export type AppScreen = 'learn' | 'experiments' | 'explorer' | 'repair' | 'backend'

type GlobalNavigationProps = {
  current: AppScreen
  onNavigate: (screen: AppScreen) => void
}

const NAV_ITEMS: Array<{ id: AppScreen; number: string; label: string; advanced?: boolean }> = [
  { id: 'learn', number: '01', label: 'Learn' },
  { id: 'experiments', number: '02', label: 'Experiments' },
  { id: 'explorer', number: '03', label: 'Explorer' },
  { id: 'repair', number: '04', label: 'Repair', advanced: true },
  { id: 'backend', number: '05', label: 'Backend', advanced: true },
]

export function GlobalNavigation({ current, onNavigate }: GlobalNavigationProps) {
  return (
    <header className="global-header">
      <button className="global-brand" onClick={() => onNavigate('learn')} aria-label="返回 LoomQ 首页">
        <span className="brand-mark"><i>L</i></span>
        <strong>LoomQ</strong>
      </button>
      <nav className="global-nav" aria-label="LoomQ 全局能力导航">
        {NAV_ITEMS.map((item) => (
          <button
            className={current === item.id ? 'active' : ''}
            aria-current={current === item.id ? 'page' : undefined}
            key={item.id}
            onClick={() => onNavigate(item.id)}
          >
            <span>{item.number}</span>
            <strong>{item.label}</strong>
            {item.advanced && <em>进阶</em>}
          </button>
        ))}
      </nav>
    </header>
  )
}
