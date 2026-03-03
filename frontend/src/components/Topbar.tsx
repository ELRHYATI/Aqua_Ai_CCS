import { Link } from 'react-router-dom'
import { Menu, PanelLeftClose } from 'lucide-react'
import styles from './Topbar.module.css'

interface TopbarProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export default function Topbar({ sidebarOpen, onToggleSidebar }: TopbarProps) {
  return (
    <header className={styles.topbar}>
      <button
        type="button"
        onClick={onToggleSidebar}
        className={styles.menuBtn}
        aria-label={sidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        aria-expanded={sidebarOpen}
      >
        {sidebarOpen ? (
          <PanelLeftClose className={styles.menuIcon} aria-hidden />
        ) : (
          <Menu className={styles.menuIcon} aria-hidden />
        )}
      </button>
      <Link to="/" className={styles.logo}>
        AZURA AQUA
      </Link>
      <span className={styles.divider} aria-hidden />
      <span className={styles.subtitle}>IA Finance · Estran · Achats</span>
    </header>
  )
}
