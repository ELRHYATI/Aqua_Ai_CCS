import { useState, useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UploadCloud, FileSpreadsheet, Check, AlertCircle,
  X, ExternalLink,
} from 'lucide-react'
import { api } from '../services/apiClient'
import type { TaskStatusResponse, SyncSheetProgress } from '../services/apiClient'
import { invalidateDashboardDataQueries } from '../utils/invalidateAppQueries'
import styles from './ImportBar.module.css'
import { cn } from '../lib/utils'

const ACCEPT = '.xlsx,.xlsm'
const MAX_SIZE_MB = 50
const POLL_MS = 500

type Stage = 'idle' | 'uploading' | 'success' | 'error' | 'bad_type'

interface ImportResult {
  estran: number
  finance: number
  purchases: number
  sheets_progress?: SyncSheetProgress[]
}

const MODULE_COLORS: Record<string, string> = {
  Estran: '#0D9488',
  Finance: '#3B82F6',
  Achats: '#F97316',
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export default function ImportBar() {
  const [stage, setStage] = useState<Stage>('idle')
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [taskStatus, setTaskStatus] = useState<TaskStatusResponse | null>(null)
  const [uploadPct, setUploadPct] = useState(0)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const badTypeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  useEffect(() => () => { stopPolling(); if (badTypeTimer.current) clearTimeout(badTypeTimer.current) }, [stopPolling])

  const startPolling = useCallback((tid: string) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.getTaskStatus(tid)
        setTaskStatus(s)
        if (s.status === 'done') {
          stopPolling()
          const r: ImportResult = {
            estran: s.result?.estran ?? 0,
            finance: s.result?.finance ?? 0,
            purchases: s.result?.purchases ?? 0,
            sheets_progress: s.result?.sheets_progress,
          }
          setResult(r)
          setStage('success')
          await invalidateDashboardDataQueries(queryClient)
        } else if (s.status === 'error') {
          stopPolling()
          setError(s.error_message ?? "Erreur inconnue")
          setStage('error')
        }
      } catch {
        stopPolling()
        setError("Impossible de contacter le serveur")
        setStage('error')
      }
    }, POLL_MS)
  }, [stopPolling, queryClient])

  const handleFile = useCallback(async (files: File | FileList | null) => {
    const list = !files ? [] : files instanceof FileList ? Array.from(files) : [files]
    if (list.length === 0) return
    const f = list[0]
    const ext = f.name.toLowerCase().slice(f.name.lastIndexOf('.'))
    if (!['.xlsx', '.xlsm'].includes(ext)) {
      setStage('bad_type')
      if (badTypeTimer.current) clearTimeout(badTypeTimer.current)
      badTypeTimer.current = setTimeout(() => setStage('idle'), 2000)
      return
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Le fichier dépasse ${MAX_SIZE_MB} Mo`)
      setStage('error')
      return
    }

    setFile(f)
    setError(null)
    setResult(null)
    setTaskStatus(null)
    setStage('uploading')
    setUploadPct(0)

    const pctInterval = setInterval(() => {
      setUploadPct(p => Math.min(p + 8, 90))
    }, 200)

    try {
      const tid = await api.uploadExcelRaw(f)
      clearInterval(pctInterval)
      setUploadPct(100)
      setTaskId(tid)
      startPolling(tid)
    } catch (err) {
      clearInterval(pctInterval)
      setError(err instanceof Error ? err.message : "Erreur d'envoi")
      setStage('error')
    }
  }, [startPolling])

  const resetToIdle = () => {
    stopPolling()
    setStage('idle')
    setFile(null)
    setTaskId(null)
    setTaskStatus(null)
    setUploadPct(0)
    setResult(null)
    setError(null)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFile(e.dataTransfer.files?.length ? e.dataTransfer.files : null)
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
  }, [])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files && e.target.files.length ? e.target.files : null)
    e.target.value = ''
  }, [handleFile])

  const currentStage = taskStatus?.result?.current_stage ?? (taskStatus?.status === 'running' ? 'reading' : 'pending')
  const sheetsDetected = taskStatus?.result?.sheets_detected ?? []

  const summaryRows = result?.sheets_progress?.length
    ? result.sheets_progress
    : [
      ...(result && result.estran > 0 ? [{ sheet_name: 'Primaire', target_page: 'Estran', rows_loaded: result.estran, rows_total: result.estran, percent: 100 }] : []),
      ...(result && result.finance > 0 ? [{ sheet_name: 'Rapport', target_page: 'Finance', rows_loaded: result.finance, rows_total: result.finance, percent: 100 }] : []),
      ...(result && result.purchases > 0 ? [{ sheet_name: 'DA/BC', target_page: 'Achats', rows_loaded: result.purchases, rows_total: result.purchases, percent: 100 }] : []),
    ]

  return (
    <div className={styles.bar} data-import-trigger>
      <AnimatePresence mode="wait">
        {/* ── IDLE / DROP ZONE ── */}
        {(stage === 'idle' || stage === 'bad_type') && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.25 }}
            className={cn(
              styles.dropZone,
              isDragging && styles.dropZoneDrag,
              stage === 'bad_type' && styles.dropZoneError,
            )}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <input type="file" accept={ACCEPT} onChange={handleChange} className={styles.hiddenInput} aria-label="Importer" />

            {stage === 'bad_type' ? (
              <>
                <X size={36} className="text-red-400 mb-2" />
                <p className="text-sm font-medium text-red-400">Format non supporté</p>
                <p className="text-xs text-red-400/70">Uniquement .xlsx et .xlsm</p>
              </>
            ) : (
              <>
                <motion.div animate={isDragging ? { y: [0, -8, 0] } : {}} transition={isDragging ? { repeat: Infinity, duration: 0.8 } : {}}>
                  <UploadCloud size={36} className="text-teal-400 mb-2" />
                </motion.div>
                <p className="text-sm font-medium text-slate-200">
                  {isDragging ? 'Déposez le fichier ici' : 'Importer un fichier Excel'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isDragging ? '' : 'Glissez-déposez ou cliquez pour sélectionner · .xlsx ou .xlsm'}
                </p>
                {!isDragging && <p className="text-[0.65rem] text-slate-600 mt-1">Taille max : {MAX_SIZE_MB} Mo</p>}
                {!isDragging && (
                  <span className={cn(styles.browseBtn, 'mt-3')}>Parcourir</span>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* ── UPLOADING / PROGRESS ── */}
        {stage === 'uploading' && (
          <motion.div
            key="uploading"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className={styles.progressCard}
          >
            <div className="flex items-center gap-3 mb-4">
              <FileSpreadsheet size={20} className="text-teal-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{file?.name ?? 'Fichier'}</p>
                <p className="text-xs text-slate-500">{file ? fmtSize(file.size) : ''}</p>
              </div>
            </div>

            {/* Stage 1: Upload */}
            {uploadPct < 100 && (
              <div className="mb-3">
                <p className="text-xs text-slate-400 mb-1">Envoi du fichier...</p>
                <div className={styles.progressTrack}>
                  <motion.div className={styles.progressFill} animate={{ width: `${uploadPct}%` }} transition={{ duration: 0.3 }} />
                </div>
                <p className="text-[0.65rem] text-slate-500 mt-1">{uploadPct}%</p>
              </div>
            )}

            {/* Stage 2: Reading */}
            {uploadPct >= 100 && currentStage === 'reading' && (
              <div className="mb-3">
                <p className="text-xs text-slate-400 mb-1">Lecture des feuilles Excel...</p>
                <div className={cn(styles.progressTrack, 'mb-2')}>
                  <div className={cn(styles.progressFill, 'w-full animate-pulse')} />
                </div>
                {sheetsDetected.map(s => (
                  <motion.p key={s.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    className="text-xs text-emerald-400 mb-0.5">
                    ✓ Feuille &lsquo;{s.name}&rsquo; détectée
                  </motion.p>
                ))}
              </div>
            )}

            {/* Stage 3: Loading */}
            {uploadPct >= 100 && currentStage === 'loading' && (
              <div className="mb-3">
                <p className="text-xs text-slate-400 mb-2">Chargement en base de données...</p>
                {sheetsDetected.map(s => (
                  <motion.p key={s.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    className="text-xs text-emerald-400 mb-0.5">
                    ✓ Feuille &lsquo;{s.name}&rsquo; détectée
                  </motion.p>
                ))}
                <div className={cn(styles.progressTrack, 'mt-2')}>
                  <div className={cn(styles.progressFill, 'w-3/4 animate-pulse')} />
                </div>
                <p className="text-[0.65rem] text-slate-500 mt-1">Import en cours...</p>
              </div>
            )}
          </motion.div>
        )}

        {/* ── SUCCESS ── */}
        {stage === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.35 }}
            className={styles.progressCard}
          >
            <div className="flex items-center gap-3 mb-4">
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <Check size={22} className="text-emerald-400" />
                </div>
              </motion.div>
              <div>
                <p className="text-sm font-semibold text-emerald-400">Import réussi</p>
                <p className="text-xs text-slate-500">Les données sont maintenant disponibles</p>
              </div>
            </div>

            {summaryRows.length > 0 && (
              <div className="border border-slate-700/50 rounded-lg overflow-hidden mb-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-800/50 text-slate-400">
                      <th className="text-left px-3 py-1.5 font-medium">Page</th>
                      <th className="text-left px-3 py-1.5 font-medium">Feuille</th>
                      <th className="text-right px-3 py-1.5 font-medium">Lignes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((row, i) => {
                      const notFound = row.status === 'not_found' || (row.rows_loaded === 0 && row.percent === 0)
                      return (
                        <tr key={i} className="border-t border-slate-700/30">
                          <td className="px-3 py-1.5">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full" style={{ background: notFound ? '#f97316' : (MODULE_COLORS[row.target_page] ?? '#64748b') }} />
                              <span className={notFound ? 'text-slate-500' : 'text-slate-200'}>{row.target_page}</span>
                              {!notFound && <ExternalLink size={10} className="text-slate-500" />}
                            </span>
                          </td>
                          <td className={cn('px-3 py-1.5', notFound ? 'text-amber-400' : 'text-slate-400')}>
                            {row.sheet_name}
                          </td>
                          <td className={cn('px-3 py-1.5 text-right font-medium', notFound ? 'text-amber-400 italic' : 'text-slate-200')}>
                            {notFound ? 'Non trouvée' : `${row.rows_loaded.toLocaleString('fr-FR')} lignes`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button type="button" className={styles.browseBtn} onClick={resetToIdle}>
                Nouvel import
              </button>
            </div>
          </motion.div>
        )}

        {/* ── ERROR ── */}
        {stage === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className={styles.progressCard}
          >
            <div className="flex items-center gap-3 mb-3">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
                <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
                  <AlertCircle size={22} className="text-red-400" />
                </div>
              </motion.div>
              <div>
                <p className="text-sm font-semibold text-red-400">Erreur lors de l&apos;import</p>
              </div>
            </div>
            {error && (
              <div className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 mb-4 font-mono text-xs text-red-300 break-all">
                {error}
              </div>
            )}
            <button type="button" className={styles.browseBtn} onClick={resetToIdle}>
              Réessayer
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
