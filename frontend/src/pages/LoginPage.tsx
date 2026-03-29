import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Droplets } from 'lucide-react'
import { api } from '../services/apiClient'
import { setAccessToken } from '../lib/authStorage'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/app'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) {
      setError('Veuillez entrer votre email.')
      return
    }
    if (!password) {
      setError('Veuillez entrer votre mot de passe.')
      return
    }
    setLoading(true)
    try {
      const data = await api.login(email.trim(), password)
      setAccessToken(data.access_token)
      try { localStorage.setItem('azura_user_name', data.full_name); localStorage.setItem('azura_user_role', data.role) } catch {}
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f1a] flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/10">
        <Link to="/" className="flex items-center gap-2 group">
          <Droplets className="w-8 h-8 text-cyan-400/90 group-hover:text-cyan-300 transition-colors" />
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-cyan-400 to-blue-500">
            AZURA AQUA
          </span>
        </Link>
        <Link
          to="/"
          className="text-slate-400 hover:text-cyan-300 text-sm transition-colors"
        >
          ← Retour
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-8 shadow-xl">
            <h1 className="text-2xl font-bold text-white mb-2">Connexion</h1>
            <p className="text-slate-400 text-sm mb-6">
              Connectez-vous pour accéder à la plateforme AZURA AQUA.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {error}
                </div>
              )}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  className="w-full px-4 py-3 rounded-lg bg-slate-900/80 border border-slate-600/50 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                  autoComplete="email"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                  Mot de passe
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-lg bg-slate-900/80 border border-slate-600/50 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                  autoComplete="current-password"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium hover:from-cyan-400 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all disabled:opacity-50"
              >
                {loading ? 'Connexion…' : 'Se connecter'}
              </button>
            </form>

            <p className="mt-6 text-center text-slate-500 text-xs">
              Première utilisation ?{' '}
              <Link to="/setup" className="text-cyan-400 hover:text-cyan-300 underline">
                Créer le premier administrateur
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
