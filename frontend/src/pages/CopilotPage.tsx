import CopilotEmbed from '../components/CopilotEmbed'
import styles from './CopilotPage.module.css'

/**
 * Copilot page: shows embedded Copilot Studio if VITE_COPILOT_URL is set,
 * otherwise shows full-page AZURA AQUA assistant (chatbot).
 */
export default function CopilotPage() {
  const hasEmbed = !!import.meta.env.VITE_COPILOT_URL

  return (
    <div className={styles.page}>
      <h1>{hasEmbed ? 'Copilot' : 'Assistant AZURA AQUA'}</h1>
      {hasEmbed ? (
        <CopilotEmbed />
      ) : (
        <div className={styles.chatFull}>
          <p className={styles.hint}>
            Copilot AZURA AQUA (GPT-4). Définissez VITE_COPILOT_URL dans .env pour
            intégrer Copilot Studio. Sinon, utilisez le chatbot flottant (icône en bas à droite).
          </p>
        </div>
      )}
    </div>
  )
}
