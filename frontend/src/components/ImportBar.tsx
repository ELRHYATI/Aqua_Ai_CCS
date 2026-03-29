import { useState, useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, FileSpreadsheet, Check, AlertCircle } from 'lucide-react'
import { api } from '../services/apiClient'
import { invalidateDashboardDataQueries } from '../utils/invalidateAppQueries'
import styles from './ImportBar.module.css'

const ACCEPT = '.xlsx,.xlsm'
const MAX_SIZE_MB = 20
const PROGRESS_STEPS = [
  'Lecture feuille 1/3…',
  'Lecture feuille 2/3…',
  'Lecture feuille 3/3…',
  'Import terminé ✓',
]

export default function ImportBar() {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [progressStep, setProgressStep] = useState(0)
  const [result, setResult] = useState<{ estran: number; finance: number; purchases: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!isUploading) {
      setProgressStep(0)
      return
    }
    const iv = setInterval(() => {
      setProgressStep((s) => Math.min(s + 1, PROGRESS_STEPS.length - 1))
    }, 600)
    return () => clearInterval(iv)
  }, [isUploading])

  const handleFile = useCallback(
    async (files: File | FileList | null) => {
      const list = !files ? [] : files instanceof FileList ? Array.from(files) : [files]
      if (list.length === 0) return
      for (const f of list) {
        const ext = f.name.toLowerCase().slice(f.name.lastIndexOf('.'))
        if (!['.xlsx', '.xlsm'].includes(ext)) {
          setError('Format : .xlsx ou .xlsm')
          return
        }
        if (f.size > MAX_SIZE_MB * 1024 * 1024) {
          setError(`Max ${MAX_SIZE_MB} Mo`)
          return
        }
      }
      setError(null)
      setResult(null)
      setIsUploading(true)
      setProgressStep(0)
      try {
        const counts = await api.uploadExcel(list.length === 1 ? list[0] : list)
        setResult(counts)
        setProgressStep(PROGRESS_STEPS.length - 1)
        await invalidateDashboardDataQueries(queryClient)
        setTimeout(() => setResult(null), 4000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur d\'import')
      } finally {
        setIsUploading(false)
      }
    },
    [queryClient],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const fl = e.dataTransfer.files
      handleFile(fl?.length ? fl : null)
    },
    [handleFile],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
  }, [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fs = e.target.files
      handleFile(fs && fs.length ? fs : null)
      e.target.value = ''
    },
    [handleFile],
  )

  return (
    <div className={styles.bar}>
      <span className={styles.badge}>Import manuel</span>
      <div
        className={`${styles.zone} ${isDragging ? styles.dragging : ''} ${isUploading ? styles.uploading : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          type="file"
          accept={ACCEPT}
          multiple
          onChange={handleChange}
          disabled={isUploading}
          className={styles.input}
          aria-label="Importer des fichiers Excel"
        />
        {isUploading ? (
          <div className={styles.progressWrap}>
            <span className={styles.label}>
              <Upload className={styles.icon} aria-hidden />
              {PROGRESS_STEPS[progressStep] ?? 'Import en cours…'}
            </span>
            <div className={styles.progressBar} role="progressbar" aria-valuenow={progressStep + 1} aria-valuemin={0} aria-valuemax={PROGRESS_STEPS.length}>
              <div
                className={styles.progressFill}
                style={{ width: `${((progressStep + 1) / PROGRESS_STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        ) : result ? (
          <span className={styles.success}>
            <Check className={styles.icon} aria-hidden />
            Importé : {result.estran} Estran · {result.finance} Finance · {result.purchases} Achats
          </span>
        ) : (
          <span className={styles.label}>
            <FileSpreadsheet className={styles.icon} aria-hidden />
            Glissez des fichiers .xlsx ici (REFLEXION, MODELE GL, BAL MODELE…) ou cliquez
          </span>
        )}
      </div>
      {error && (
        <span className={styles.error}>
          <AlertCircle size={14} aria-hidden />
          {error}
        </span>
      )}
    </div>
  )
}
