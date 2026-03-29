import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Brain, Bolt, SendHorizontal, Zap, Sparkles, Code, Check } from 'lucide-react'

interface Model {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  badge?: string
  badgeColor?: 'default' | 'pro'
}

const models: Model[] = [
  { id: 'mistral:7b', name: 'Mistral 7B', description: 'Fast & intelligent', icon: <Zap className="size-4 text-cyan-400" />, badge: 'Default', badgeColor: 'default' },
  { id: 'llama3.2', name: 'Llama 3.2', description: 'Most capable', icon: <Sparkles className="size-4 text-purple-400" />, badge: 'Pro', badgeColor: 'pro' },
  { id: 'phi3', name: 'Phi 3', description: 'Lightning fast', icon: <Brain className="size-4 text-emerald-400" /> },
  { id: 'codellama', name: 'CodeLlama', description: 'Code specialist', icon: <Code className="size-4 text-teal-400" /> },
]

function ModelSelector({
  selectedModel = 'mistral:7b',
  onModelChange,
}: {
  selectedModel?: string
  onModelChange?: (model: Model) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const selected = models.find((m) => m.id === selectedModel) || models[0]

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 text-[#a5b4c8] hover:text-white hover:bg-white/5 active:scale-95 cursor-pointer"
      >
        {selected.icon}
        <span>{selected.name}</span>
        <ChevronDown className={`size-3.5 opacity-50 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 py-2 rounded-xl bg-[#1a1b1e] border border-white/10 shadow-2xl z-50 min-w-[220px] overflow-hidden">
          <div className="px-3 pb-2 mb-1 border-b border-white/5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">SELECT MODEL</span>
          </div>
          <div className="py-1">
            {models.map((m) => {
              const isSelected = m.id === selected.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onModelChange?.(m)
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors cursor-pointer ${
                    isSelected ? 'bg-white/[0.12]' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="flex-shrink-0 mt-0.5">{m.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-[#c4d1e0]'}`}>
                        {m.name}
                      </span>
                      {m.badge && (
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium ${
                            m.badgeColor === 'pro'
                              ? 'bg-purple-500 text-white'
                              : 'bg-[#00b4d8] text-white'
                          }`}
                        >
                          {m.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#94a3b8] mt-0.5">{m.description}</p>
                  </div>
                  {isSelected && (
                    <Check className="size-4 flex-shrink-0 text-[#00b4d8]" strokeWidth={2.5} />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

interface ChatInputProps {
  onSend?: (message: string) => void
  placeholder?: string
  disabled?: boolean
  loading?: boolean
  value?: string
  onChange?: (value: string) => void
}

interface ChatInputInternalProps extends ChatInputProps {
  selectedModel?: string
  onModelChange?: (model: Model) => void
}

function ChatInput({
  onSend,
  placeholder = "Posez votre question d'analyse…",
  disabled,
  loading,
  value = '',
  onChange,
  selectedModel,
  onModelChange,
}: ChatInputInternalProps) {
  const [internalMessage, setInternalMessage] = useState(value)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const msg = onChange !== undefined ? value : internalMessage
  const setMsg = onChange ?? setInternalMessage

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [msg])

  const handleSubmit = () => {
    if (msg.trim() && !disabled) {
      onSend?.(msg.trim())
      if (onChange === undefined) setInternalMessage('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="relative w-full max-w-[680px] mx-auto">
      <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-b from-white/[0.08] to-transparent pointer-events-none" />
      <div className="relative rounded-2xl bg-[#1e1e22] ring-1 ring-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_2px_20px_rgba(0,0,0,0.4)]">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full resize-none bg-transparent text-[15px] text-white placeholder-[#94a3b8] px-5 pt-5 pb-3 focus:outline-none min-h-[80px] max-h-[200px] disabled:opacity-60 cursor-text"
            style={{ height: '80px' }}
          />
        </div>
        <div className="flex items-center justify-between px-3 pb-3 pt-1">
          <div className="flex items-center gap-1">
            <ModelSelector selectedModel={selectedModel} onModelChange={onModelChange} />
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit}
              disabled={!msg.trim() || disabled}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold bg-[#00b4d8] hover:bg-[#00c4e8] text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed enabled:cursor-pointer active:scale-95 shadow-[0_0_24px_rgba(0,180,216,0.4)] border border-[#00b4d8]/50"
            >
              <span className="hidden sm:inline">
                {loading ? 'Analyse…' : 'Lancer l\'analyse'}
              </span>
              <SendHorizontal className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RayBackground() {
  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none">
      <div className="absolute inset-0 bg-[#0a0c10]" />
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[4000px] h-[1800px] sm:w-[6000px]"
        style={{
          background: `radial-gradient(circle at center 800px, rgba(0, 180, 216, 0.6) 0%, rgba(0, 180, 216, 0.25) 14%, rgba(0, 180, 216, 0.12) 18%, rgba(0, 180, 216, 0.05) 22%, rgba(17, 17, 20, 0.2) 25%)`,
        }}
      />
      <div
        className="absolute top-[175px] left-1/2 w-[1600px] h-[1600px] sm:top-1/2 sm:w-[3043px] sm:h-[2865px]"
        style={{ transform: 'translate(-50%) rotate(180deg)' }}
      >
        <div
          className="absolute w-full h-full rounded-full -mt-[13px]"
          style={{
            background:
              'radial-gradient(43.89% 25.74% at 50.02% 97.24%, #111114 0%, #0a0c10 100%)',
            border: '16px solid rgba(0,180,216,0.15)',
            transform: 'rotate(180deg)',
            zIndex: 5,
          }}
        />
        <div
          className="absolute w-full h-full rounded-full bg-[#0a0c10] -mt-[11px]"
          style={{
            border: '23px solid rgba(0,180,216,0.2)',
            transform: 'rotate(180deg)',
            zIndex: 4,
          }}
        />
        <div
          className="absolute w-full h-full rounded-full bg-[#0a0c10] -mt-[8px]"
          style={{
            border: '23px solid rgba(0,180,216,0.25)',
            transform: 'rotate(180deg)',
            zIndex: 3,
          }}
        />
        <div
          className="absolute w-full h-full rounded-full bg-[#0a0c10] -mt-[4px]"
          style={{
            border: '23px solid rgba(0,180,216,0.3)',
            transform: 'rotate(180deg)',
            zIndex: 2,
          }}
        />
        <div
          className="absolute w-full h-full rounded-full bg-[#0a0c10]"
          style={{
            border: '20px solid rgba(0,150,200,0.4)',
            boxShadow: '0 -15px 24.8px rgba(0,150,200,0.4)',
            transform: 'rotate(180deg)',
            zIndex: 1,
          }}
        />
      </div>
    </div>
  )
}

function AnnouncementBadge({ text, href = '#' }: { text: string; href?: string }) {
  const content = (
    <>
      <span
        className="absolute top-0 left-0 right-0 h-1/2 pointer-events-none opacity-70 mix-blend-overlay"
        style={{
          background:
            'radial-gradient(ellipse at center top, rgba(255, 255, 255, 0.15) 0%, transparent 70%)',
        }}
      />
      <span
        className="absolute -top-px left-1/2 -translate-x-1/2 h-[2px] w-[100px] opacity-60"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(0,180,216,0.8) 20%, rgba(0,150,200,0.8) 50%, rgba(0,180,216,0.8) 80%, transparent 100%)',
          filter: 'blur(0.5px)',
        }}
      />
      <Bolt className="size-4 relative z-10 text-white" />
      <span className="relative z-10 text-white font-medium">{text}</span>
    </>
  )
  const className =
    'relative inline-flex items-center gap-2 px-5 py-2 min-h-[40px] rounded-full text-sm overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-default'
  const style = {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
    backdropFilter: 'blur(20px) saturate(140%)',
    boxShadow:
      'inset 0 1px rgba(255,255,255,0.2), inset 0 -1px rgba(0,0,0,0.1), 0 8px 32px -8px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,255,255,0.08)',
  }
  return <div className={className} style={style}>{content}</div>
}

interface QuickAction {
  id: string
  label: string
  query: string
}

function QuickActions({
  actions,
  onSelect,
}: {
  actions: QuickAction[]
  onSelect?: (query: string) => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <span className="text-sm text-[#94a3b8] font-medium">
        Actions rapides
      </span>
      <div className="flex flex-wrap gap-2 justify-center">
        {actions.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect?.(opt.query)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-white/15 bg-white/5 hover:bg-[#00b4d8]/15 hover:border-[#00b4d8]/30 text-[#c4d1e0] hover:text-white transition-all duration-200 active:scale-95 cursor-pointer"
          >
            <span>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export interface BoltStyleChatProps {
  title?: string
  subtitle?: string
  announcementText?: string
  placeholder?: string
  onSend?: (message: string) => void
  onQuickAction?: (query: string) => void
  quickActions?: QuickAction[]
  children?: React.ReactNode
  inputValue?: string
  onInputChange?: (value: string) => void
  loading?: boolean
  disabled?: boolean
  selectedModel?: string
  onModelChange?: (model: Model) => void
}

export function BoltStyleChat({
  title = 'Que voulez-vous',
  subtitle = "Analysez vos données Estran, Finance et Achats avec l'IA.",
  announcementText = 'Analyse IA Azura Aqua',
  placeholder = "Posez votre question d'analyse…",
  onSend,
  onQuickAction,
  quickActions = [],
  children,
  inputValue,
  onInputChange,
  loading = false,
  disabled = false,
  selectedModel = 'mistral:7b',
  onModelChange,
}: BoltStyleChatProps) {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-[70vh] w-full overflow-hidden bg-[#0a0c10] rounded-2xl border border-white/5">
      <RayBackground />
      <div className="absolute top-6">
        <AnnouncementBadge text={announcementText} />
      </div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center w-full overflow-hidden px-4 z-20">
        <div className="text-center mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-1">
            {title}{' '}
            <span className="bg-gradient-to-b from-[#4dd4f0] via-[#00b4d8] to-white bg-clip-text text-transparent italic">
              analyser
            </span>
            {' '}aujourd'hui ?
          </h1>
          <p className="text-base font-medium sm:text-lg text-[#94a3b8] max-w-xl mx-auto">{subtitle}</p>
        </div>
        <div className="w-full max-w-[700px] mb-6 sm:mb-8 mt-2">
          <ChatInput
            placeholder={placeholder}
            onSend={onSend}
            value={inputValue}
            onChange={onInputChange}
            loading={loading}
            disabled={disabled}
            selectedModel={selectedModel}
            onModelChange={onModelChange}
          />
        </div>
        {quickActions.length > 0 && (
          <QuickActions actions={quickActions} onSelect={onQuickAction} />
        )}
      </div>
      {children && (
        <div className="relative w-full mt-48 px-4 pb-8 z-10">
          {children}
        </div>
      )}
    </div>
  )
}
