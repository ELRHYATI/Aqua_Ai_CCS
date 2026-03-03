import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface TypewriterHeroProps {
  text: string
  className?: string
  speed?: number
}

export default function TypewriterHero({
  text,
  className = '',
  speed = 60,
}: TypewriterHeroProps) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!text) return
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
    <span className={className}>
      <motion.span
        animate={{ opacity: 1 }}
        className="inline-block"
      >
        {displayed}
      </motion.span>
      {!done && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          className="inline-block w-0.5 h-[0.9em] align-baseline bg-cyan-400 ml-0.5"
        />
      )}
    </span>
  )
}
