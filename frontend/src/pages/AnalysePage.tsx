import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/apiClient'
import { cn } from '../lib/utils'
import { BoltStyleChat } from '../components/ui/bolt-style-chat'
import styles from './AnalysePage.module.css'

const QUICK_ACTIONS = [
  { id: 'estran', label: 'Analyse Estran', query: "Faites une analyse complète des données Estran : biomasse, parcs, lignes, taux de recapture, et anomalies détectées." },
  { id: 'finance', label: 'Rapport financier YTD', query: "Génèrez un rapport financier YTD (year-to-date) avec les variances budget/réel et les principaux indicateurs." },
  { id: 'achat', label: 'Statut des achats', query: "Quel est le statut des achats (DA, BC) : priorités, retards, et commandes en cours ?" },
  { id: 'anomalies', label: 'Anomalies détectées', query: "Listez et analysez toutes les anomalies détectées (Estran, Finance, Achats) avec leur sévérité." },
]

function simpleMarkdownToHtml(text: string): string {
  if (!text) return ''
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />')
  // ### -> strong
  html = html.replace(/### (.+?)(<br \/>|$)/g, '<h3>$1</h3>')
  html = html.replace(/## (.+?)(<br \/>|$)/g, '<h2>$1</h2>')
  html = html.replace(/# (.+?)(<br \/>|$)/g, '<h1>$1</h1>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/^- (.+?)(<br \/>|$)/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>)+/g, '<ul>$&</ul>')
  return html
}

export default function AnalysePage() {
  const [question, setQuestion] = useState('')
  const [selectedModel, setSelectedModel] = useState('mistral:7b')
  const [includeAllData, setIncludeAllData] = useState(false)
  const [response, setResponse] = useState('')
  const [dataUsed, setDataUsed] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const { data: reports = [], refetch: refetchReports } = useQuery({
    queryKey: ['chat-reports'],
    queryFn: () => api.getChatReports(),
  })

  const runAnalysis = useCallback(async (messageOverride?: string) => {
    const q = (messageOverride ?? question).trim()
    if (!q || loading) return
    setQuestion(q)
    setLoading(true)
    setResponse('')
    setDataUsed([])
    try {
      const res = await api.postChatAnalyze({
        message: q,
        include_data: includeAllData,
      })
      setResponse(res.response)
      setDataUsed(res.data_used ?? [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      const isOffline = msg.toLowerCase().includes('failed') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch')
      setResponse(
        isOffline
          ? "Le modèle IA est hors ligne. Vérifiez qu'Ollama est lancé."
          : `Erreur : ${msg}`
      )
    } finally {
      setLoading(false)
    }
  }, [question, includeAllData, loading])

  const generatePdf = useCallback(async () => {
    const q = question.trim()
    if (!q || reportLoading) return
    setReportLoading(true)
    try {
      const blob = await api.postChatReport({
        message: q,
        title: `Rapport - ${q.slice(0, 60)}${q.length > 60 ? '…' : ''}`,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rapport_${Date.now()}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      refetchReports()
      setToast('Rapport téléchargé avec succès ✓')
    } catch (err) {
      setToast(`Erreur : ${err instanceof Error ? err.message : 'Échec du téléchargement'}`)
    } finally {
      setReportLoading(false)
    }
  }, [question, reportLoading, refetchReports])

  const redownloadReport = useCallback(async (filename: string) => {
    try {
      const blob = await api.getChatReportDownload(filename)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setToast('Rapport téléchargé avec succès ✓')
    } catch (err) {
      setToast(`Erreur : ${err instanceof Error ? err.message : 'Échec'}`)
    }
  }, [])

  const last5 = reports.slice(0, 5)

  const friendlyReportLabel = (filename: string, dateStr: string) => {
    const match = filename.match(/report_(\d{8})_\d+_(.+)\.pdf/)
    if (match) {
      const topic = match[2].replace(/_/g, ' ').slice(0, 30)
      return `${topic}${match[2].length > 30 ? '…' : ''} — ${dateStr}`
    }
    return `Rapport — ${dateStr}`
  }

  return (
    <div className={styles.page}>
      <BoltStyleChat
        title="Que voulez-vous"
        subtitle="Analysez vos données Estran, Finance et Achats avec l'IA."
        announcementText="Analyse IA Azura Aqua"
        placeholder="Posez votre question d'analyse…"
        inputValue={question}
        onInputChange={setQuestion}
        onSend={(msg) => runAnalysis(msg)}
        onQuickAction={(query) => {
          setQuestion(query)
          runAnalysis(query)
        }}
        quickActions={QUICK_ACTIONS}
        loading={loading}
        disabled={loading}
        selectedModel={selectedModel}
        onModelChange={(m) => setSelectedModel(m.id)}
      >
        <div className={cn('flex items-center gap-2 mb-5 pb-4 border-b border-white/10', styles.checkRow)}>
          <input
            type="checkbox"
            id="include-all-data"
            checked={includeAllData}
            onChange={(e) => setIncludeAllData(e.target.checked)}
            className="w-4 h-4 accent-[#00b4d8] rounded"
          />
          <label htmlFor="include-all-data" className="text-sm text-[#94a3b8] cursor-pointer select-none">
            Inclure toutes les données disponibles
          </label>
        </div>
        <div className={styles.resultsSection} role="region" aria-label="Résultats de l'analyse">
          {(loading || response) && (
            <div className={styles.result}>
              {loading && !response ? (
                <div className={styles.loading}>
                  <span className={styles.loadingDots}>
                    <span />
                    <span />
                    <span />
                  </span>
                  <p>Analyse en cours…</p>
                </div>
              ) : response ? (
                <>
                  <div
                    className={styles.resultContent}
                    dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(response) }}
                  />
                  {dataUsed.length > 0 && (
                    <div className={styles.sourcesRow}>
                      <span className={styles.sourcesLabel}>Sources :</span>
                      {dataUsed.map((s) => (
                        <span key={s} className={styles.sourceChip}>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    className={styles.pdfBtn}
                    onClick={generatePdf}
                    disabled={reportLoading || !question.trim()}
                  >
                    {reportLoading ? 'Génération…' : 'Générer le rapport PDF'}
                  </button>
                </>
              ) : null}
            </div>
          )}
          {last5.length > 0 && (
            <div className={styles.history}>
              <h3>Rapports récents</h3>
              <ul>
                {last5.map((r) => (
                  <li key={r.filename} className={styles.reportRow}>
                    <span className={styles.reportName} title={r.filename}>
                      {friendlyReportLabel(r.filename, new Date(r.created_at).toLocaleDateString('fr-FR'))}
                    </span>
                    <span className={styles.reportMeta}>
                      {r.size_kb} Ko
                    </span>
                    <button
                      type="button"
                      className={styles.redownloadBtn}
                      onClick={() => redownloadReport(r.filename)}
                      title="Télécharger à nouveau"
                    >
                      Télécharger
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </BoltStyleChat>
      {toast && (
        <div
          className={cn(styles.toast, toast.includes('Erreur') && styles.toastError)}
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  )
}
