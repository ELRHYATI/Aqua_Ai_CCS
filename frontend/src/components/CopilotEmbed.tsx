/**
 * Copilot embed - optional iframe for Copilot Studio / M365 Copilot.
 * Set VITE_COPILOT_URL in .env to enable.
 */

const copilotUrl = import.meta.env.VITE_COPILOT_URL as string | undefined

export default function CopilotEmbed() {
  if (!copilotUrl) {
    return null
  }

  return (
    <iframe
      src={copilotUrl}
      title="Copilot"
      style={{
        width: '100%',
        height: '520px',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow)',
      }}
    />
  )
}
