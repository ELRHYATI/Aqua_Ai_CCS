import { useState, useEffect, useRef } from 'react'

interface TypewriterTextProps {
  text: string
  speed?: number // ms per word
  onComplete?: () => void
  onProgress?: () => void
}

export default function TypewriterText({
  text,
  speed = 50,
  onComplete,
  onProgress,
}: TypewriterTextProps) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const words = useRef<string[]>([])
  const indexRef = useRef(0)
  const onCompleteRef = useRef(onComplete)
  const onProgressRef = useRef(onProgress)
  onCompleteRef.current = onComplete
  onProgressRef.current = onProgress

  useEffect(() => {
    if (!text.trim()) {
      setDisplayed(text)
      setDone(true)
      onCompleteRef.current?.()
      return
    }
    // Split into words and whitespace blocks to preserve paragraphs and spacing
    words.current = text.split(/(\S+|\s+)/).filter(Boolean)
    indexRef.current = 0
    setDisplayed('')
    setDone(false)
  }, [text])

  useEffect(() => {
    const w = words.current
    if (w.length === 0 || indexRef.current >= w.length) {
      if (!done) {
        setDone(true)
        onCompleteRef.current?.()
      }
      return
    }
    const id = setInterval(() => {
      if (indexRef.current >= w.length) {
        clearInterval(id)
        setDone(true)
        onCompleteRef.current?.()
        return
      }
      indexRef.current += 1
      setDisplayed(w.slice(0, indexRef.current).join(''))
      onProgressRef.current?.()
    }, speed)
    return () => clearInterval(id)
  }, [text, speed, done])

  return (
    <span>
      {displayed}
      {!done && <span className="typewriter-cursor" aria-hidden="true" />}
    </span>
  )
}
