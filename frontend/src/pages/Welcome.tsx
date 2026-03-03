import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Waves, BarChart3, ShoppingCart, ChevronDown } from 'lucide-react'
import AnimatedOyster from '../components/AnimatedOyster'
import FeatureCard from '../components/FeatureCard'
import TypewriterHero from '../components/TypewriterHero'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2, delayChildren: 0.3 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
}

const oysters = [
  { x: '10%', y: '20%', delay: 0, size: 36 },
  { x: '85%', y: '15%', delay: 0.8, size: 28 },
  { x: '25%', y: '70%', delay: 0.3, size: 32 },
  { x: '75%', y: '65%', delay: 1.2, size: 24 },
  { x: '50%', y: '45%', delay: 0.5, size: 20 },
]

const features = [
  {
    icon: Waves,
    title: 'Estran',
    description:
      'Analyse des données de production par parc, biomasse et récolte. Vue consolidée BD Estran.',
  },
  {
    icon: BarChart3,
    title: 'Finance',
    description:
      'Résultat YTD, Budget vs Réalisé, variances. Commentaires IA et KPIs financiers.',
  },
  {
    icon: ShoppingCart,
    title: 'Achats',
    description:
      'DA en cours, BC non livrés. Priorités et risk score pour un suivi Achats optimisé.',
  },
]

function WaveBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg
        className="absolute bottom-0 w-full h-32 text-ocean-mid/20 animate-wave"
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          fill="currentColor"
          d="M0,64 C360,120 720,0 1080,64 C1260,96 1380,96 1440,64 L1440,120 L0,120 Z"
        />
      </svg>
      <div className="absolute inset-0 bg-gradient-to-b from-ocean-dark via-[#0a2540] to-[#0f172a]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(30,64,175,0.3),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_80%,rgba(6,182,212,0.15),transparent_50%)]" />
    </div>
  )
}

export default function Welcome() {
  const [email, setEmail] = useState('')

  useEffect(() => {
    document.title = 'AZURA AQUA - IA pour l\'aquaculture du futur'
  }, [])

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <div className="min-h-screen bg-[#0a2540] text-white overflow-x-hidden">
      {/* Hero */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-20">
        <WaveBackground />

        {/* Floating oysters */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {oysters.map((o, i) => (
            <AnimatedOyster
              key={i}
              delay={o.delay}
              size={o.size}
              className="text-cyan-400/80"
              style={{ left: o.x, top: o.y }}
            />
          ))}
        </div>

        <motion.div
          className="relative z-10 max-w-4xl mx-auto text-center"
          variants={prefersReducedMotion ? undefined : containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.h1
            variants={prefersReducedMotion ? undefined : itemVariants}
            className="text-4xl sm:text-5xl md:text-6xl font-bold font-display mb-6"
          >
            <span className="text-white">AZURA </span>
            <span className="bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">
              AQUA
            </span>
          </motion.h1>

          <motion.div
            variants={prefersReducedMotion ? undefined : itemVariants}
            className="text-xl sm:text-2xl md:text-3xl font-light text-cyan-100 mb-4 min-h-[1.5em]"
          >
            {prefersReducedMotion ? (
              "IA pour l'aquaculture du futur"
            ) : (
              <TypewriterHero
                text="IA pour l'aquaculture du futur"
                speed={70}
                className="drop-shadow-[0_0_20px_rgba(6,182,212,0.4)]"
              />
            )}
          </motion.div>

          <motion.p
            variants={prefersReducedMotion ? undefined : itemVariants}
            className="text-slate-400 text-base sm:text-lg mb-12 max-w-2xl mx-auto"
          >
            Analyse Estran · Finance YTD · TB Achats DA/BC
          </motion.p>

          <motion.div variants={prefersReducedMotion ? undefined : itemVariants}>
            <Link to="/">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-semibold text-lg shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-shadow"
                aria-label="Accéder à la démonstration de la plateforme"
              >
                Découvrir la démo
              </motion.button>
            </Link>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.a
          href="#features"
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          aria-label="Défiler vers les fonctionnalités"
        >
          <ChevronDown className="w-8 h-8 text-cyan-400/70" aria-hidden />
        </motion.a>
      </section>

      {/* Features */}
      <section id="features" className="relative py-24 px-6 bg-gradient-to-b from-[#0f172a] to-[#0a2540]">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-4xl font-bold text-center mb-4 font-display"
          >
            Plateforme IA
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-slate-400 text-center mb-16 max-w-xl mx-auto"
          >
            Une solution intégrée pour piloter aquaculture et finances
          </motion.p>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((f, i) => (
              <FeatureCard
                key={f.title}
                icon={f.icon}
                title={f.title}
                description={f.description}
                index={i}
              />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-24 px-6 bg-[#0a2540]">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl mx-auto text-center"
        >
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 font-display">
            <span className="bg-gradient-to-r from-cyan-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent">
              Prêt à transformer vos données ?
            </span>
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <input
              type="email"
              placeholder="votre@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-6 py-3 rounded-xl bg-slate-800/80 border border-cyan-500/30 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              aria-label="Adresse email"
            />
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="px-8 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-semibold"
            >
              Commencer
            </motion.button>
          </div>
        </motion.div>
      </section>
    </div>
  )
}
