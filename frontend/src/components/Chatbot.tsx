import { useState, useRef, useEffect, useCallback } from 'react'
import { api } from '../services/apiClient'
import TypewriterText from './TypewriterText'
import styles from './Chatbot.module.css'
import { cn } from '../lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
  dataUsed?: string[]
}

const QUICK_SUGGESTIONS = [
  "Quelle est la biomasse totale ?",
  "Anomalies détectées cette semaine",
  "DA en attente de validation",
]

const OFFLINE_ERROR =
  "Le modèle IA est hors ligne. Vérifiez qu'Ollama est lancé."

export default function Chatbot() {
  const [open, setOpen] = useState(false)
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'chat' | 'analyse'>('chat')
  const [status, setStatus] = useState<'idle' | 'ready' | 'error'>('idle')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [lastQuestionForReport, setLastQuestionForReport] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [toast])

  useEffect(() => {
    if (hasOpenedOnce && status === 'idle') {
      setStatus('ready')
      setMessages([
        {
          role: 'assistant',
          content:
            "Je suis l'assistant AZURA AQUA (via Ollama).\n\nJe peux vous aider avec :\n• Estran — production, biomasse, anomalies\n• Finance — budget, variances, KPI\n• Achats — DA, BC, fournisseurs\n\nComment puis-je vous aider ?",
        },
      ])
    }
  }, [hasOpenedOnce, status])

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim()
    if (!text || loading) return
    setInput('')

    const userMsg: Message = { role: 'user', content: text }
    setMessages((m) => [...m, userMsg])
    setLoading(true)
    setLastQuestionForReport(text)

    try {
      if (mode === 'analyse') {
        const res = await api.postChatAnalyze({ message: text, include_data: true })
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: res.response,
            dataUsed: res.data_used,
          },
        ])
      } else {
        const res = await api.postChat(text)
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: res.response,
            dataUsed: res.data_used,
          },
        ])
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erreur inconnue'
      const isOffline =
        msg.toLowerCase().includes('failed') ||
        msg.toLowerCase().includes('network') ||
        msg.toLowerCase().includes('fetch')
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: isOffline ? OFFLINE_ERROR : `Erreur : ${msg}`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const downloadPdf = async () => {
    const question = lastQuestionForReport || messages.filter((m) => m.role === 'user').pop()?.content
    if (!question) return
    setPdfLoading(true)
    try {
      const blob = await api.postChatReport({
        message: question,
        title: `Rapport - ${question.slice(0, 50)}${question.length > 50 ? '…' : ''}`,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rapport_${Date.now()}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setToast('Rapport téléchargé avec succès ✓')
    } catch (err) {
      setToast(`Erreur : ${err instanceof Error ? err.message : 'Échec du téléchargement'}`)
    } finally {
      setPdfLoading(false)
    }
  }

  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') return i
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
        aria-label="Ouvrir l'assistant IA"
      >
        💬
      </button>
      {hasOpenedOnce && (
        <div
          className={cn(styles.panel, !open && styles.panelClosed)}
          aria-hidden={!open}
        >
          <div className={styles.header}>
            <h3>Assistant IA</h3>
            <div className={styles.modeToggle}>
              <button
                type="button"
                className={cn(styles.modeBtn, mode === 'chat' && styles.modeActive)}
                onClick={() => setMode('chat')}
              >
                Chat
              </button>
              <button
                type="button"
                className={cn(styles.modeBtn, mode === 'analyse' && styles.modeActive)}
                onClick={() => setMode('analyse')}
              >
                Analyse
              </button>
            </div>
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
            {messages.map((msg, i) => (
              <div key={i} className={styles.messageWrapper}>
                <div className={cn(styles.message, styles[msg.role])}>
                  {msg.role === 'assistant' && i === lastAssistantIndex && !loading ? (
                    <TypewriterText
                      text={msg.content}
                      speed={30}
                      onComplete={() => {}}
                      onProgress={scrollToBottom}
                    />
                  ) : (
                    msg.content
                  )}
                </div>
                {msg.role === 'assistant' && msg.dataUsed?.length && (
                  <span className={styles.dataBadge}>Basé sur données réelles ✓</span>
                )}
              </div>
            ))}
            {loading && (
              <div className={styles.messageWrapper}>
                <div className={cn(styles.message, styles.assistant, styles.loadingBubble)}>
                  <span className={styles.loadingDots}>
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              </div>
            )}
          </div>
          {mode === 'analyse' && lastAssistantIndex >= 0 && !loading && (
            <div className={styles.pdfBar}>
              <button
                type="button"
                className={styles.pdfBtn}
                onClick={downloadPdf}
                disabled={pdfLoading || !lastQuestionForReport}
              >
                {pdfLoading ? 'Génération…' : 'Télécharger en PDF'}
              </button>
            </div>
          )}
          {toast && <div className={styles.toast}>{toast}</div>}
          <div className={styles.inputArea}>
            <div className={styles.inputRow}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder={mode === 'analyse' ? 'Posez une question d\'analyse…' : 'Votre question…'}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => send()}
                disabled={loading || !input.trim()}
              >
                Envoyer
              </button>
            </div>
            {!loading && (
              <div className={styles.suggestions}>
                {QUICK_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={styles.suggestionChip}
                    onClick={() => send(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
