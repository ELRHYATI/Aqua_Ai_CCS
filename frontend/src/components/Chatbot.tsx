import { useState, useRef, useEffect, useCallback } from 'react'
import { api } from '../services/apiClient'
import TypewriterText from './TypewriterText'
import styles from './Chatbot.module.css'

interface Message {
  role: 'user' | 'assistant'
  content: string
  citations?: string[]
}

export default function Chatbot() {
  const [open, setOpen] = useState(false)
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastTypingDone, setLastTypingDone] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: text }])
    setLoading(true)
    setLastTypingDone(false)
    try {
      const { response, citations } = await api.postChat(text)
      setMessages((m) => [...m, { role: 'assistant', content: response, citations: citations ?? [] }])
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Erreur de connexion au serveur.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i
    }
    return -1
  })()

  return (
    <>
      <button
        type="button"
        className={styles.fab}
        onClick={() => {
          if (!open) setHasOpenedOnce(true)
          setOpen(!open)
        }}
        title="Assistant AZURA AQUA"
        aria-label="Ouvrir le chat"
      >
        💬
      </button>
      {hasOpenedOnce && (
        <div
          className={`${styles.panel} ${!open ? styles.panelClosed : ''}`}
          aria-hidden={!open}
        >
          <div className={styles.header}>
            <h3>Assistant AZURA AQUA</h3>
            <button
              type="button"
              className={styles.close}
              onClick={() => setOpen(false)}
              aria-label="Fermer"
            >
              ×
            </button>
          </div>
          <div className={styles.list} ref={listRef}>
            {messages.length === 0 && (
              <p className={styles.placeholder}>
                Posez une question sur Estran, Finance ou DA/BC.
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={styles.messageWrapper}>
                <div className={`${styles.message} ${styles[msg.role]}`}>
                  {msg.role === 'assistant' && i === lastAssistantIndex && !loading ? (
                    <TypewriterText
                      text={msg.content}
                      speed={45}
                      onComplete={() => setLastTypingDone(true)}
                      onProgress={scrollToBottom}
                    />
                  ) : (
                    msg.content
                  )}
                </div>
                {msg.role === 'assistant' &&
                  msg.citations &&
                  msg.citations.length > 0 &&
                  (i !== lastAssistantIndex || lastTypingDone) && (
                    <div className={styles.citations}>
                      <span className={styles.citationsLabel}>Sources :</span>
                      {msg.citations.map((c, j) => (
                        <span key={j} className={styles.citation}>
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
              </div>
            ))}
            {loading && (
              <div className={styles.messageWrapper}>
                <div className={`${styles.message} ${styles.assistant} ${styles.loadingBubble}`}>
                  <span className={styles.loadingDots}>
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className={styles.inputRow}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Votre message…"
              disabled={loading}
            />
            <button type="button" onClick={send} disabled={loading || !input.trim()}>
              Envoyer
            </button>
          </div>
        </div>
      )}
    </>
  )
}
