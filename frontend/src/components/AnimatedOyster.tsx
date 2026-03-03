import { motion } from 'framer-motion'

interface AnimatedOysterProps {
  className?: string
  delay?: number
  x?: number | string
  y?: number | string
  size?: number
  style?: React.CSSProperties
}

/** Oyster/parc icon - bivalve shell silhouette */
function OysterIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="opacity-70"
      aria-hidden
    >
      <ellipse
        cx="24"
        cy="28"
        rx="18"
        ry="12"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="rgba(6, 182, 212, 0.12)"
      />
      <path
        d="M6 28 Q24 14 42 28"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  )
}

export default function AnimatedOyster({
  className = '',
  delay = 0,
  x,
  y,
  size = 32,
  style: styleProp,
}: AnimatedOysterProps) {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const style = styleProp ?? (x != null || y != null ? { left: x, top: y } : {})

  return (
    <motion.div
      className={`absolute will-change-transform ${className}`}
      style={style}
      initial={{ opacity: 0, y: 0 }}
      animate={{
        opacity: 0.7,
        y: prefersReducedMotion ? 0 : [0, -16, -24, -16, 0],
      }}
      transition={{
        duration: 4 + Math.random() * 2,
        repeat: Infinity,
        delay,
      }}
      aria-hidden
    >
      <OysterIcon size={size} />
    </motion.div>
  )
}
