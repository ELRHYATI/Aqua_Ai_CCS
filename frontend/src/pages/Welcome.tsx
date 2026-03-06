import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import { Waves, BarChart3, ShoppingCart, Bot, ArrowRight, ChevronDown, Sparkles } from 'lucide-react'
import styles from './Welcome.module.css'

const PARTICLES_COUNT = 60

function useParticles() {
  return useRef(
    Array.from({ length: PARTICLES_COUNT }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 3,
      duration: 3 + Math.random() * 6,
      delay: Math.random() * 4,
      opacity: 0.15 + Math.random() * 0.35,
    })),
  ).current
}

function ParticleField() {
  const particles = useParticles()
  return (
    <div className={styles.particleField}>
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className={styles.particle}
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size }}
          animate={{
            y: [0, -30 - Math.random() * 40, 0],
            opacity: [0, p.opacity, 0],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

function WaveLayer({ index }: { index: number }) {
  const offsets = [0, 80, 160]
  const opacities = [0.06, 0.04, 0.025]
  return (
    <motion.svg
      className={styles.waveSvg}
      style={{ bottom: offsets[index], opacity: opacities[index] }}
      viewBox="0 0 1440 200"
      preserveAspectRatio="none"
      animate={{ x: [0, index % 2 === 0 ? -80 : 80, 0] }}
      transition={{ duration: 8 + index * 3, repeat: Infinity, ease: 'easeInOut' }}
    >
      <path
        fill="currentColor"
        d={
          index === 0
            ? 'M0,80 C320,150 480,20 720,80 C960,140 1120,30 1440,80 L1440,200 L0,200 Z'
            : index === 1
              ? 'M0,100 C240,40 480,140 720,90 C960,40 1200,130 1440,100 L1440,200 L0,200 Z'
              : 'M0,120 C360,60 720,160 1080,90 C1260,60 1380,120 1440,120 L1440,200 L0,200 Z'
        }
      />
    </motion.svg>
  )
}

function TypewriterText({ text, speed = 55 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setDisplayed('')
    setDone(false)
    let i = 0
    const id = setInterval(() => {
      if (i <= text.length) {
        setDisplayed(text.slice(0, i))
        i++
      } else {
        setDone(true)
        clearInterval(id)
      }
    }, speed)
    return () => clearInterval(id)
  }, [text, speed])

  return (
    <span>
      {displayed}
      {!done && <span className={styles.cursor} />}
    </span>
  )
}

function CountUp({ target, duration = 2000, suffix = '' }: { target: number; duration?: number; suffix?: string }) {
  const [value, setValue] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          const start = performance.now()
          const animate = (now: number) => {
            const elapsed = now - start
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3)
            setValue(Math.round(target * eased))
            if (progress < 1) requestAnimationFrame(animate)
          }
          requestAnimationFrame(animate)
        }
      },
      { threshold: 0.3 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [target, duration])

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  )
}

const STATS = [
  { value: 108, suffix: '+', label: 'Colonnes analysées' },
  { value: 4, suffix: '', label: 'Algorithmes ML' },
  { value: 2, suffix: '', label: 'Pages de données' },
  { value: 99, suffix: '%', label: 'Couverture anomalies' },
]

const FEATURES = [
  {
    icon: Waves,
    title: 'BD Estran',
    desc: 'Primaire & Hors Calibre, taux de recapture, biomasses, anomalies ML temps réel',
    color: '#00b4d8',
  },
  {
    icon: BarChart3,
    title: 'Finance',
    desc: 'YTD vs Budget vs N-1, variances automatiques, commentaires IA intelligents',
    color: '#22d3a8',
  },
  {
    icon: ShoppingCart,
    title: 'Achats',
    desc: 'DA & BC, délais, priorités par score de risque, alertes critiques',
    color: '#fbbf24',
  },
  {
    icon: Bot,
    title: 'Copilot IA',
    desc: 'Chat intelligent avec RAG sur vos données, citations et recommandations',
    color: '#a78bfa',
  },
]

export default function Welcome() {
  const [heroReady, setHeroReady] = useState(false)
  const { scrollYProgress } = useScroll()
  const heroOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0])
  const heroScale = useTransform(scrollYProgress, [0, 0.25], [1, 0.95])

  useEffect(() => {
    document.title = 'AZURA AQUA - IA pour l\'aquaculture'
    const t = setTimeout(() => setHeroReady(true), 300)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className={styles.page}>
      {/* ---- HERO ---- */}
      <motion.section className={styles.hero} style={{ opacity: heroOpacity, scale: heroScale }}>
        <div className={styles.heroBg}>
          <ParticleField />
          <div className={styles.gradientOrb1} />
          <div className={styles.gradientOrb2} />
          <div className={styles.gridOverlay} />
          {[0, 1, 2].map((i) => (
            <WaveLayer key={i} index={i} />
          ))}
        </div>

        <AnimatePresence>
          {heroReady && (
            <motion.div
              className={styles.heroContent}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
            >
              <motion.div
                className={styles.badge}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                <Sparkles size={14} />
                Plateforme IA Aquaculture
              </motion.div>

              <motion.h1
                className={styles.title}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className={styles.titleWhite}>AZURA</span>{' '}
                <span className={styles.titleAccent}>AQUA</span>
              </motion.h1>

              <motion.div
                className={styles.subtitle}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.6 }}
              >
                <TypewriterText text="Intelligence artificielle pour l'aquaculture du futur" speed={40} />
              </motion.div>

              <motion.p
                className={styles.subtitleMuted}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.5 }}
              >
                Analyse Estran · Finance YTD · TB Achats DA/BC · Détection d'anomalies ML
              </motion.p>

              <motion.div
                className={styles.heroCta}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5, duration: 0.5 }}
              >
                <Link to="/app" className={styles.ctaPrimary}>
                  <span>Accéder à la plateforme</span>
                  <ArrowRight size={18} />
                </Link>
                <a href="#features" className={styles.ctaSecondary}>
                  Découvrir
                  <ChevronDown size={16} />
                </a>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          className={styles.scrollIndicator}
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ChevronDown size={22} />
        </motion.div>
      </motion.section>

      {/* ---- STATS ---- */}
      <section className={styles.statsSection}>
        <div className={styles.statsGrid}>
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              className={styles.statCard}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
            >
              <p className={styles.statValue}>
                <CountUp target={s.value} suffix={s.suffix} />
              </p>
              <p className={styles.statLabel}>{s.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---- FEATURES ---- */}
      <section id="features" className={styles.featuresSection}>
        <motion.div
          className={styles.sectionHeader}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className={styles.sectionTitle}>
            Quatre piliers,{' '}
            <span className={styles.sectionTitleAccent}>une vision</span>
          </h2>
          <p className={styles.sectionSubtitle}>
            Chaque module est alimenté par des algorithmes de machine learning et des modèles IA avancés
          </p>
        </motion.div>

        <div className={styles.featuresGrid}>
          {FEATURES.map((f, i) => {
            const Icon = f.icon
            return (
              <motion.div
                key={f.title}
                className={styles.featureCard}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ delay: i * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -6, transition: { duration: 0.25 } }}
              >
                <div
                  className={styles.featureIconWrap}
                  style={{ '--feat-color': f.color } as React.CSSProperties}
                >
                  <Icon size={28} strokeWidth={1.5} />
                </div>
                <div className={styles.featureAccentLine} style={{ background: f.color }} />
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureDesc}>{f.desc}</p>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* ---- CTA ---- */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaGlow} />
        <motion.div
          className={styles.ctaContent}
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className={styles.ctaTitle}>
            Prêt à transformer vos données ?
          </h2>
          <p className={styles.ctaDesc}>
            Importez vos fichiers Excel, laissez l'IA détecter les anomalies et générer des insights
          </p>
          <Link to="/app" className={styles.ctaPrimaryLg}>
            <span>Commencer maintenant</span>
            <ArrowRight size={20} />
          </Link>
        </motion.div>
      </section>

      {/* ---- FOOTER ---- */}
      <footer className={styles.footer}>
        <p>AZURA AQUA &copy; {new Date().getFullYear()} &mdash; Plateforme IA pour l'aquaculture</p>
      </footer>
    </div>
  )
}
