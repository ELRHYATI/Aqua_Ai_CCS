import { Navigate, useLocation } from 'react-router-dom'
import Layout from './Layout'
import { getAccessToken } from '../lib/authStorage'

/** Wraps the main app shell; requires a stored JWT (see /login). */
export default function ProtectedApp() {
  const loc = useLocation()
  if (!getAccessToken()) {
    return <Navigate to="/login" replace state={{ from: loc }} />
  }
  return <Layout />
}
