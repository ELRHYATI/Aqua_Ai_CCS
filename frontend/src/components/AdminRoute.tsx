import { Navigate } from 'react-router-dom'
import AdminPage from '../pages/AdminPage'

function readAdminRole(): string {
  try {
    return localStorage.getItem('azura_user_role') || ''
  } catch {
    return ''
  }
}

/** Renders the admin panel only when the logged-in user has role `admin` (set at login). */
export default function AdminRoute() {
  if (readAdminRole() !== 'admin') {
    return <Navigate to="/app" replace />
  }
  return <AdminPage />
}
