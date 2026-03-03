import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, FileSpreadsheet, Check, AlertCircle } from 'lucide-react'
import { api } from '../services/apiClient'
import styles from './ImportBar.module.css'

const ACCEPT = '.xlsx,.xls'
const MAX_SIZE_MB = 20

const invalidateQueries = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  queryClient.invalidateQueries({ queryKey: ['estran'] })
  queryClient.invalidateQueries({ queryKey: ['finance'] })
  queryClient.invalidateQueries({ queryKey: ['achat'] })
  queryClient.invalidateQueries({ queryKey: ['ml'] })
}

export default function ImportBar() {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [result, setResult] = useState<{ estran: number; finance: number; purchases: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const handleFile = useCallback(
    async (file: File | null) => {
      if (!file) return
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
      if (!['.xlsx', '.xls'].includes(ext)) {
        setError('Format : .xlsx ou .xls')
        return
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`Max ${MAX_SIZE_MB} Mo`)
        return
      }
      setError(null)
      setResult(null)
      setIsUploading(true)
      try {
        const counts = await api.uploadExcel(file)
        setResult(counts)
        invalidateQueries(queryClient)
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
      handleFile(e.dataTransfer.files[0] || null)
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
      handleFile(e.target.files?.[0] || null)
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
          onChange={handleChange}
          disabled={isUploading}
          className={styles.input}
          aria-label="Importer un fichier Excel"
        />
        {isUploading ? (
          <span className={styles.label}>
            <Upload className={styles.icon} aria-hidden />
            Import en cours…
          </span>
        ) : result ? (
          <span className={styles.success}>
            <Check className={styles.icon} aria-hidden />
            Importé : {result.estran} Estran · {result.finance} Finance · {result.purchases} Achats
          </span>
        ) : (
          <span className={styles.label}>
            <FileSpreadsheet className={styles.icon} aria-hidden />
            Glissez un fichier .xlsx ici ou cliquez pour importer
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
