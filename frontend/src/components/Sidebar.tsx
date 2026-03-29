import { NavLink, useNavigate } from 'react-router-dom'
import { clearAccessToken } from '../lib/authStorage'
import styles from './Sidebar.module.css'

const baseNavItems = [
  { to: '/', label: 'Accueil', icon: '⌂' },
  { to: '/app', label: 'Dashboard', icon: '◉' },
  { to: '/app/estran', label: 'Estran', icon: '◇' },
  { to: '/app/finance', label: 'Finance', icon: '◈' },
  { to: '/app/achat', label: 'Achats', icon: '◆' },
  { to: '/app/analyse', label: 'Analyse', icon: '🧠' },
  { to: '/app/copilot', label: 'Copilot', icon: '✦' },
] as const

const adminNavItem = { to: '/app/admin', label: 'Admin', icon: '⚙' } as const

function navItemsForRole(): readonly { to: string; label: string; icon: string }[] {
  try {
    if (localStorage.getItem('azura_user_role') === 'admin') {
      return [...baseNavItems, adminNavItem]
    }
  } catch {
    /* ignore */
  }
  return baseNavItems
}

interface SidebarProps {
  open: boolean
  onNavigate?: () => void
}

export default function Sidebar({ open, onNavigate }: SidebarProps) {
  const navigate = useNavigate()
  const logout = () => {
    clearAccessToken()
    navigate('/login', { replace: true })
    onNavigate?.()
  }
  return (
    <>
      {open && <div className={styles.backdrop} onClick={onNavigate} aria-hidden />}
      <aside className={`${styles.sidebar} ${open ? styles.open : styles.closed}`}>
        <nav className={styles.nav}>
          <p className={styles.sectionLabel}>Navigation</p>
          {navItemsForRole().map(({ to, label, icon }) => (
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
        <p className={styles.sectionLabel} style={{ marginTop: '1.5rem' }}>Session</p>
        <button type="button" className={styles.navLink} onClick={logout}>
          <span className={styles.navIcon} aria-hidden>⎋</span>
          <span className={styles.navLabel}>Déconnexion</span>
        </button>
      </nav>
    </aside>
    </>
  )
}
