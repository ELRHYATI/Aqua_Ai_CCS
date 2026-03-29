'use client'

import { SplineScene } from '@/components/ui/splite'
import { Card } from '@/components/ui/card'
import { Spotlight } from '@/components/ui/spotlight'
import { Link } from 'react-router-dom'

export function AzuraLanding() {
  return (
    <Card className="w-full min-h-[calc(100vh-4rem)] bg-gradient-to-br from-[#0c1929] via-[#0f2847] to-[#0d2137] border-0 rounded-none relative overflow-hidden">
      {/* Soft overlay for smoother merge at bottom */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f1a]/80 via-transparent to-transparent pointer-events-none" />
      <Spotlight
        className="-top-40 left-0 md:left-60"
        fill="rgb(34 211 238 / 0.2)"
      />
      <div className="flex flex-col lg:flex-row h-full min-h-[calc(100vh-4rem)] relative z-10">
        {/* GAUCHE - Texte */}
        <div className="flex-1 p-8 md:p-12 flex flex-col justify-center order-2 lg:order-1 text-center lg:text-left relative z-10">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-cyan-400 to-blue-500">
            AZURA AQUA
          </h1>
          <p className="mt-4 md:mt-6 text-lg md:text-xl text-cyan-100/90 max-w-xl leading-relaxed mx-auto lg:mx-0">
            IA Finance Océan — Estran + Finance YTD vs Budget/N-1 + Achats
          </p>
          <p className="mt-2 text-sm md:text-base text-cyan-200/60 max-w-lg mx-auto lg:mx-0">
            Analyse anomalies auto • DA/BC • Données Estran
          </p>
          <div className="mt-8 flex justify-center lg:justify-start">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 px-8 py-4 rounded-full text-lg font-semibold text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 transition-all duration-300"
            >
              Accéder Dashboard
            </Link>
          </div>
        </div>

        {/* DROITE - Spline 3D */}
        <div className="flex-1 min-h-[300px] lg:min-h-[500px] lg:min-h-0 order-1 lg:order-2 relative z-10">
          <SplineScene
            scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
            className="w-full h-full min-h-[300px]"
          />
        </div>
      </div>
    </Card>
  )
}
