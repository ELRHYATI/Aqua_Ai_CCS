import { Link } from 'react-router-dom'
import { Droplets, BarChart3, Waves, ShoppingCart, Mail } from 'lucide-react'

export function LandingFooter() {
  const modules = [
    { to: '/app', label: 'Dashboard', icon: BarChart3 },
    { to: '/app/estran', label: 'Estran', icon: Waves },
    { to: '/app/finance', label: 'Finance', icon: BarChart3 },
    { to: '/app/achat', label: 'Achats', icon: ShoppingCart },
  ]

  return (
    <footer className="relative bg-[#060a12] border-t border-cyan-500/10">
      {/* Subtle gradient line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

      <div className="max-w-6xl mx-auto px-6 py-16 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link to="/" className="inline-flex items-center gap-2 mb-6">
              <Droplets className="w-9 h-9 text-cyan-400" />
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-blue-500">
                AZURA AQUA
              </span>
            </Link>
            <p className="text-slate-400 text-sm md:text-base max-w-sm leading-relaxed">
              Plateforme IA pour l'aquaculture. Analyse Estran, Finance YTD vs Budget/N-1, 
              Achats DA/BC. Détection d'anomalies et pilotage de la production.
            </p>
          </div>

          {/* Modules */}
          <div>
            <h4 className="text-sm font-semibold text-cyan-300/90 uppercase tracking-wider mb-6">
              Modules
            </h4>
            <ul className="space-y-4">
              {modules.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="flex items-center gap-2 text-slate-400 hover:text-cyan-300 transition-colors text-sm"
                  >
                    <Icon className="w-4 h-4 opacity-70" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact / CTA */}
          <div>
            <h4 className="text-sm font-semibold text-cyan-300/90 uppercase tracking-wider mb-6">
              Accès
            </h4>
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center w-full md:w-auto px-6 py-3 rounded-full bg-gradient-to-r from-cyan-500/20 to-blue-600/20 border border-cyan-400/30 text-cyan-200 hover:from-cyan-500/30 hover:to-blue-600/30 hover:border-cyan-400/50 text-sm font-medium transition-all"
            >
              Accéder au Dashboard
            </Link>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-8 border-t border-slate-800/60 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-slate-500 text-sm">
            © {new Date().getFullYear()} AZURA AQUA. Tous droits réservés.
          </p>
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Mail className="w-4 h-4" />
            <span>IA Finance Océan</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
