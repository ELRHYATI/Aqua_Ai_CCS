import { useState, useCallback } from 'react'
import styles from './DataDropZone.module.css'

interface DataDropZoneProps {
  onUpload: (file: File) => Promise<{ estran: number; finance: number; purchases: number }>
  onSuccess?: () => void
}

const ACCEPT = '.xlsx,.xls'
const MAX_SIZE_MB = 20

export default function DataDropZone({ onUpload, onSuccess }: DataDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [result, setResult] = useState<{ estran: number; finance: number; purchases: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(
    async (file: File | null) => {
      if (!file) return
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
      if (!['.xlsx', '.xls'].includes(ext)) {
        setError('Format accepté : .xlsx ou .xls')
        return
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`Taille max : ${MAX_SIZE_MB} Mo`)
        return
      }
      setError(null)
      setResult(null)
      setIsUploading(true)
      try {
        const counts = await onUpload(file)
        setResult(counts)
        onSuccess?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur lors de l\'import')
      } finally {
        setIsUploading(false)
      }
    },
    [onUpload, onSuccess],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      handleFile(file || null)
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
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }, [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      handleFile(file || null)
      e.target.value = ''
    },
    [handleFile],
  )

  return (
    <div className={styles.wrapper}>
      <div
        className={`${styles.dropZone} ${isDragging ? styles.dragging : ''} ${isUploading ? styles.uploading : ''}`}
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
          aria-label="Choisir un fichier Excel"
        />
        {isUploading ? (
          <p className={styles.hint}>Import en cours…</p>
        ) : (
          <>
            <p className={styles.title}>Déposer un fichier Excel</p>
            <p className={styles.hint}>
              Glissez-déposez REFLEXION.xlsx ici, ou cliquez pour parcourir
            </p>
          </>
        )}
      </div>
      {error && <p className={styles.error}>{error}</p>}
      {result && !error && (
        <p className={styles.success}>
          Importé : <strong>{result.estran}</strong> Estran,{' '}
          <strong>{result.finance}</strong> Finance,{' '}
          <strong>{result.purchases}</strong> Achats
        </p>
      )}
    </div>
  )
}
