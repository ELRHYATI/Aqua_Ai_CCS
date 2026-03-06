import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Welcome from './pages/Welcome'
import Dashboard from './pages/Dashboard'
import EstranPage from './pages/EstranPage'
import FinancePage from './pages/FinancePage'
import AchatPage from './pages/AchatPage'
import CopilotPage from './pages/CopilotPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/app" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="estran" element={<EstranPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="achat" element={<AchatPage />} />
        <Route path="copilot" element={<CopilotPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
