import { NavLink } from 'react-router-dom'
import styles from './Sidebar.module.css'

const navItems = [
  { to: '/', label: 'Accueil', icon: '⌂' },
  { to: '/app', label: 'Dashboard', icon: '◉' },
  { to: '/app/estran', label: 'Estran', icon: '◇' },
  { to: '/app/finance', label: 'Finance', icon: '◈' },
  { to: '/app/achat', label: 'Achats', icon: '◆' },
  { to: '/app/copilot', label: 'Copilot', icon: '✦' },
]

interface SidebarProps {
  open: boolean
  onNavigate?: () => void
}

export default function Sidebar({ open, onNavigate }: SidebarProps) {
  return (
    <>
      {open && <div className={styles.backdrop} onClick={onNavigate} aria-hidden />}
      <aside className={`${styles.sidebar} ${open ? styles.open : styles.closed}`}>
        <nav className={styles.nav}>
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/' || to === '/app'}
              onClick={onNavigate}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.active : ''}`
              }
            >
            <span className={styles.navIcon} aria-hidden>{icon}</span>
            <span className={styles.navLabel}>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
    </>
  )
}
