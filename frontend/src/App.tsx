import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedApp from './components/ProtectedApp'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/Dashboard'
import EstranPage from './pages/EstranPage'
import FinancePage from './pages/FinancePage'
import AchatPage from './pages/AchatPage'
import CopilotPage from './pages/CopilotPage'
import AnalysePage from './pages/AnalysePage'
import AdminRoute from './components/AdminRoute'
import LoginPage from './pages/LoginPage'
import SetupPage from './pages/SetupPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/dashboard" element={<Navigate to="/app" replace />} />
      <Route path="/app" element={<ProtectedApp />}>
        <Route index element={<Dashboard />} />
        <Route path="estran" element={<EstranPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="achat" element={<AchatPage />} />
        <Route path="copilot" element={<CopilotPage />} />
        <Route path="analyse" element={<AnalysePage />} />
        <Route path="admin" element={<AdminRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
