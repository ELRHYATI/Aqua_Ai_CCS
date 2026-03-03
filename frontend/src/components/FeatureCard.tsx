import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

interface FeatureCardProps {
  icon: LucideIcon
  title: string
  description: string
  index?: number
}

const itemVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.15,
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
}

export default function FeatureCard({
  icon: Icon,
  title,
  description,
  index = 0,
}: FeatureCardProps) {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <motion.div
      variants={prefersReducedMotion ? undefined : itemVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      custom={index}
      whileHover={prefersReducedMotion ? undefined : { y: -8, scale: 1.02 }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
      className="group relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-800/80 to-slate-900/80 p-8 backdrop-blur-sm border border-cyan-500/20 will-change-transform"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative">
        <div className="mb-6 inline-flex rounded-xl bg-cyan-500/20 p-4 text-cyan-400">
          <Icon className="h-8 w-8" strokeWidth={1.5} aria-hidden />
        </div>
        <h3 className="text-xl font-semibold text-white mb-3 font-display">
          {title}
        </h3>
        <p className="text-slate-400 leading-relaxed">{description}</p>
      </div>
    </motion.div>
  )
}
