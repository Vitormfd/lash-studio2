import Icon from './Icon'

/**
 * Barra fixa no rodapé do celular: as telas do dia a dia a um toque,
 * o botão de novo agendamento no meio e "Mais" abre o menu completo.
 * Some em telas largas (ver .es-bottom-nav em global.css).
 */
const ITEMS = [
  { id: 'dashboard', label: 'Início', icon: 'home' },
  { id: 'agenda', label: 'Agenda', icon: 'calendar' },
  { id: '__new', label: 'Novo', icon: 'plus' },
  { id: 'clients', label: 'Clientes', icon: 'users' },
  { id: '__more', label: 'Mais', icon: 'menu' },
]

const BottomNav = ({ active, onNavigate, onNew, onMore }) => (
  <nav className="es-bottom-nav" aria-label="Navegação principal">
    {ITEMS.map((item) => {
      if (item.id === '__new') {
        return (
          <button key={item.id} type="button" className="es-bottom-nav__new" onClick={onNew} aria-label="Novo agendamento">
            <Icon name="plus" size={22} color="#fff" />
          </button>
        )
      }
      const isActive = item.id === active
      return (
        <button
          key={item.id}
          type="button"
          className={`es-bottom-nav__item${isActive ? ' is-active' : ''}`}
          aria-current={isActive ? 'page' : undefined}
          onClick={() => (item.id === '__more' ? onMore() : onNavigate(item.id))}
        >
          <Icon name={item.icon} size={20} color={isActive ? 'var(--rose-deep)' : 'var(--text-light)'} />
          <span>{item.label}</span>
        </button>
      )
    })}
  </nav>
)

export default BottomNav
