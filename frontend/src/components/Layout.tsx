import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Topbar from './Topbar'
import Sidebar from './Sidebar'
import ImportBar from './ImportBar'
import Chatbot from './Chatbot'
import styles from './Layout.module.css'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className={styles.layout}>
      <Topbar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />
      <div className={styles.main}>
        <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
        <main className={styles.content}>
          <ImportBar />
          <Outlet />
        </main>
      </div>
      <Chatbot />
    </div>
  )
}
