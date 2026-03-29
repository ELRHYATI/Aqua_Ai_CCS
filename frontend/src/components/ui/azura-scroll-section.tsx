'use client'

import React from 'react'
import { ContainerScroll } from '@/components/ui/container-scroll-animation'
import { BarChart3, Waves, ShoppingCart } from 'lucide-react'

export function AzuraScrollSection() {
  return (
    <div className="flex flex-col overflow-hidden pb-24 pt-[800px] bg-[#0a0f1a]">
      <ContainerScroll
        titleComponent={
          <>
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-100">
              Découvrez la plateforme
            </h2>
            <h3 className="text-4xl md:text-[5rem] font-bold mt-4 leading-none bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500">
              AZURA AQUA
            </h3>
            <p className="text-lg md:text-xl text-slate-400 mt-6 max-w-2xl mx-auto">
              Analyse IA intégrée pour l'aquaculture : Estran, Finance YTD, Achats
            </p>
          </>
        }
      >
        <div className="h-full w-full grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 p-6 md:p-10">
          <FeatureCard
            icon={<Waves className="w-10 h-10 text-cyan-400" />}
            title="Estran"
            description="Production, biomasse, taux de recapture. Suivi des parcs et lignes. Détection d'anomalies."
          />
          <FeatureCard
            icon={<BarChart3 className="w-10 h-10 text-blue-400" />}
            title="Finance"
            description="YTD vs Budget et N-1. Variances automatiques. KPI depuis MODELE RAPPORT, BAL, GL."
          />
          <FeatureCard
            icon={<ShoppingCart className="w-10 h-10 text-indigo-400" />}
            title="Achats"
            description="DA, BC, fournisseurs. Suivi des bons de commande et demandes d'achat."
          />
        </div>
      </ContainerScroll>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="rounded-2xl bg-slate-800/80 border border-slate-700/50 p-6 md:p-8 hover:border-cyan-500/30 transition-colors">
      <div className="mb-4">{icon}</div>
      <h4 className="text-xl font-semibold text-white mb-2">{title}</h4>
      <p className="text-slate-400 text-sm md:text-base leading-relaxed">
        {description}
      </p>
    </div>
  )
}
