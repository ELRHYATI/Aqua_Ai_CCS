import { Link } from 'react-router-dom'
import { AzuraLanding } from '@/components/ui/demo'
import { AzuraScrollSection } from '@/components/ui/azura-scroll-section'
import { LandingFooter } from '@/components/ui/landing-footer'
import { Droplets } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      {/* Header - blends with hero gradient */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-[#0a1520]/90 via-[#0d1825]/85 to-transparent backdrop-blur-xl border-b border-cyan-500/10">
        <Link to="/" className="flex items-center gap-2 group">
          <Droplets className="w-8 h-8 text-cyan-400/90 group-hover:text-cyan-300 transition-colors" />
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-cyan-400 to-blue-500">
            AZURA AQUA
          </span>
        </Link>
        <Link
          to="/login"
          className="px-5 py-2.5 rounded-full bg-gradient-to-r from-cyan-500/20 to-blue-600/20 border border-cyan-400/25 text-cyan-200 hover:from-cyan-500/30 hover:to-blue-600/30 hover:border-cyan-400/40 text-sm font-medium transition-all duration-300"
        >
          Login
        </Link>
      </header>

      {/* Hero + Spline */}
      <main className="pt-16">
        <AzuraLanding />
        {/* Scroll animation - Découvrez la plateforme */}
        <AzuraScrollSection />
        {/* Footer */}
        <LandingFooter />
      </main>
    </div>
  )
}
