import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Users, Shield, ClipboardList, BarChart2, Plus, Pencil,
  KeyRound, Power, Search, Download, AlertTriangle,
  CheckCircle, Copy, X,
} from 'lucide-react'
import { api } from '../services/apiClient'
import type {
  UserResponse, UserCreate, UserUpdate, UserPrivileges,
  AuditLog, AuditSummary,
} from '../services/apiClient'
import styles from './AdminPage.module.css'
import { cn } from '../lib/utils'

/* ───────── constants ───────── */

const PRIVILEGES: { key: keyof UserPrivileges; label: string }[] = [
  { key: 'can_view_finance', label: 'Finance' },
  { key: 'can_view_estran', label: 'Estran' },
  { key: 'can_view_achat', label: 'Achats' },
  { key: 'can_use_chatbot', label: 'Chatbot' },
  { key: 'can_export_pdf', label: 'Export PDF' },
  { key: 'can_upload_files', label: 'Import' },
  { key: 'can_run_ml', label: 'ML' },
  { key: 'can_manage_users', label: 'Gestion users' },
]

const ROLE_DESC: Record<string, string> = {
  admin: 'Accès complet à toutes les fonctionnalités',
  manager: 'Accès lecture/écriture + analyses ML',
  analyst: 'Accès lecture + chatbot',
  viewer: 'Accès lecture uniquement',
}

const ACTION_LABELS: Record<string, string> = {
  login_attempt: 'Tentative de connexion',
  login_success: 'Connexion réussie',
  login_failed: 'Connexion échouée',
  logout: 'Déconnexion',
  file_upload: 'Import de fichier Excel',
  chat_message: 'Question posée à l\'assistant IA',
  chat_report_generated: 'Rapport PDF généré',
  user_created: 'Nouvel utilisateur créé',
  user_updated: 'Utilisateur modifié',
  user_privileges_changed: 'Privilèges modifiés',
  session_revoked: 'Session révoquée',
  page_view: 'Consultation de page',
  first_setup: 'Configuration initiale',
  sync: 'Synchronisation des données',
  chat_blocked: 'Message bloqué',
  access_denied: 'Accès refusé',
}

const MOD_CATS: Record<string, string> = { auth: 'dotAuth', estran: 'dotData', finance: 'dotData', achat: 'dotData', chat: 'dotChat', upload: 'dotImport', ml: 'dotData', admin: 'dotAdmin' }
const MOD_BADGE: Record<string, string> = { auth: 'roleAdmin', estran: 'deptEstran', finance: 'deptFinance', achat: 'deptAchat', chat: 'deptAll', upload: 'deptAll', admin: 'roleAdmin', ml: 'deptAll' }
const PIE_COLORS = ['#0d9488', '#3b82f6', '#f97316', '#8b5cf6', '#ef4444', '#eab308']

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }
const rowVariant = { hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0, transition: { duration: 0.2 } } }

/* ───────── helpers ───────── */

function initials(name: string): string { return name.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2) }
function avClass(role: string): string { return role === 'admin' ? styles.avAdmin : role === 'manager' ? styles.avManager : role === 'analyst' ? styles.avAnalyst : styles.avViewer }
function roleClass(role: string): string { return role === 'admin' ? styles.roleAdmin : role === 'manager' ? styles.roleManager : role === 'analyst' ? styles.roleAnalyst : styles.roleViewer }
function deptClass(dept: string | null): string { const d = (dept || '').toLowerCase(); if (d.includes('estran')) return styles.deptEstran; if (d.includes('finance')) return styles.deptFinance; if (d.includes('achat')) return styles.deptAchat; return styles.deptAll }
function generateTempPass(): string { const c = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; let p = ''; for (let i = 0; i < 12; i++) { if (i === 4 || i === 8) p += '-'; p += c[Math.floor(Math.random() * c.length)] } return p }

function exportCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const hdr = Object.keys(rows[0]!)
  const csv = [hdr.join(','), ...rows.map(r => hdr.map(h => String(r[h] ?? '')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}

/* ═══════════════════════════════════
   MAIN ADMIN PAGE
   ═══════════════════════════════════ */

export default function AdminPage() {
  const [tab, setTab] = useState<'users' | 'sessions' | 'audit' | 'stats'>('users')
  const [toast, setToast] = useState<string | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t) } }, [toast])

  /* ── queries ── */
  const statsQ = useQuery({ queryKey: ['admin-stats'], queryFn: () => api.getAdminStats(), refetchInterval: 30000 })
  const usersQ = useQuery({ queryKey: ['admin-users'], queryFn: () => api.getAdminUsers(), placeholderData: keepPreviousData })
  const summaryQ = useQuery({ queryKey: ['admin-audit-summary'], queryFn: () => api.getAdminAuditSummary(), placeholderData: keepPreviousData })

  const st = statsQ.data

  return (
    <div className={styles.page}>
      {/* ══════ HEADER ══════ */}
      <motion.div className={styles.header} initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div>
          <h1>Panneau d'administration</h1>
          <p className={styles.subtitle}>Gestion des utilisateurs · Sessions · Audit</p>
        </div>
        <div className={styles.statPills}>
          <span className={cn(styles.statPill, styles.pillGreen)}>
            <Users size={12} /> {st?.active_users ?? '—'} utilisateurs actifs
          </span>
          <span className={cn(styles.statPill, styles.pillBlue)}>
            <Shield size={12} /> JWT sans état
          </span>
          <span className={cn(styles.statPill, styles.pillPurple)}>
            <ClipboardList size={12} /> {st?.actions_today ?? '—'} actions aujourd'hui
          </span>
          {(st?.alerts_active ?? 0) > 0 && (
            <span className={cn(styles.statPill, styles.pillRed)}>
              <AlertTriangle size={12} /> {st?.alerts_active} alertes
            </span>
          )}
        </div>
      </motion.div>

      {/* ══════ TABS ══════ */}
      <div className={styles.tabBar}>
        {([
          { id: 'users' as const, label: 'Utilisateurs', icon: Users, dot: false },
          { id: 'sessions' as const, label: 'Sessions', icon: Shield, dot: false },
          { id: 'audit' as const, label: 'Audit', icon: ClipboardList, dot: (st?.alerts_active ?? 0) > 0 },
          { id: 'stats' as const, label: 'Statistiques', icon: BarChart2, dot: false },
        ]).map(t => (
          <button key={t.id} className={cn(styles.tab, tab === t.id && styles.tabActive)} onClick={() => setTab(t.id)}>
            <t.icon size={14} /> {t.label}
            {t.dot && <span className={styles.tabDot} />}
          </button>
        ))}
      </div>

      {/* ══════ TAB CONTENT ══════ */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
          {tab === 'users' && <UsersTab users={usersQ.data ?? []} loading={usersQ.isLoading} onToast={setToast} queryClient={queryClient} />}
          {tab === 'sessions' && <SessionsTab />}
          {tab === 'audit' && <AuditTab />}
          {tab === 'stats' && <StatsTab summary={summaryQ.data} loading={summaryQ.isLoading} />}
        </motion.div>
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div className={styles.toast} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            <CheckCircle size={16} className="inline mr-1" /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ═══════════════════════════════════
   TAB 1 — USERS
   ═══════════════════════════════════ */

function UsersTab({ users, loading, onToast, queryClient }: {
  users: UserResponse[]; loading: boolean; onToast: (msg: string) => void
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState<'create' | 'edit' | 'reset' | null>(null)
  const [selectedUser, setSelectedUser] = useState<UserResponse | null>(null)

  const filtered = useMemo(() => {
    let list = users
    if (search) { const s = search.toLowerCase(); list = list.filter(u => u.full_name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)) }
    if (roleFilter) list = list.filter(u => u.role === roleFilter)
    if (statusFilter === 'active') list = list.filter(u => u.is_active)
    if (statusFilter === 'inactive') list = list.filter(u => !u.is_active)
    return list
  }, [users, search, roleFilter, statusFilter])

  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patchAdminUser(id, { is_active: active }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); onToast('Statut mis à jour') },
  })

  return (
    <>
      <div className={styles.toolbar}>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className={cn(styles.searchInput, 'pl-8')} placeholder="Rechercher un utilisateur..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className={styles.selectInput} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">Tous les rôles</option>
          <option value="admin">Admin</option><option value="manager">Manager</option>
          <option value="analyst">Analyst</option><option value="viewer">Viewer</option>
        </select>
        <select className={styles.selectInput} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Statut: Tous</option>
          <option value="active">Actif</option><option value="inactive">Inactif</option>
        </select>
        <button className={styles.btnTeal} onClick={() => { setModal('create'); setSelectedUser(null) }}>
          <Plus size={14} /> Ajouter
        </button>
      </div>

      <p className="text-xs text-slate-500 mb-2">{filtered.length} utilisateur(s) trouvé(s)</p>

      <div className={styles.glass}>
        {loading ? (
          <div className="space-y-3 p-4">{[1,2,3].map(i => <div key={i} className={styles.skeleton} style={{ width: '100%', height: 40 }} />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Utilisateur</th><th>Rôle</th><th>Département</th><th>Statut</th><th>Actions</th>
                </tr>
              </thead>
              <motion.tbody variants={stagger} initial="hidden" animate="visible">
                {paged.map(u => (
                  <motion.tr key={u.id} variants={rowVariant}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className={cn(styles.avatar, avClass(u.role))}>{initials(u.full_name)}</span>
                        <div>
                          <div className="font-semibold text-slate-200">{u.full_name}</div>
                          <div className="text-xs text-slate-500">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className={cn(styles.badge, roleClass(u.role))}>{u.role}</span></td>
                    <td><span className={cn(styles.badge, deptClass(u.department))}>{u.department || 'Tous'}</span></td>
                    <td>
                      <span className={cn(styles.statusDot, u.is_active ? styles.dotGreen : styles.dotRed)} />
                      {u.is_active ? 'Actif' : 'Inactif'}
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                        <button className={styles.iconBtn} title="Modifier" onClick={() => { setSelectedUser(u); setModal('edit') }}><Pencil size={13} /></button>
                        <button className={styles.iconBtn} title="Réinitialiser MDP" onClick={() => { setSelectedUser(u); setModal('reset') }}><KeyRound size={13} /></button>
                        <button
                          className={cn(styles.iconBtn, u.is_active ? styles.iconBtnRed : styles.iconBtnGreen)}
                          title={u.is_active ? 'Désactiver' : 'Activer'}
                          onClick={() => { if (confirm(`${u.is_active ? 'Désactiver' : 'Activer'} ${u.full_name} ?`)) toggleActive.mutate({ id: u.id, active: !u.is_active }) }}
                        >
                          <Power size={13} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Précédent</button>
          <span>Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Suivant</button>
        </div>
      )}

      {/* Modals */}
      {modal === 'create' && <CreateUserModal onClose={() => setModal(null)} onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); onToast('Utilisateur créé') }} />}
      {modal === 'edit' && selectedUser && <EditUserModal user={selectedUser} onClose={() => setModal(null)} onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); setModal(null); onToast('Utilisateur mis à jour') }} />}
      {modal === 'reset' && selectedUser && <ResetPasswordModal user={selectedUser} onClose={() => setModal(null)} onSuccess={() => onToast('Mot de passe réinitialisé')} />}
    </>
  )
}

/* ── Create User Modal ── */

function CreateUserModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ full_name: '', email: '', role: 'viewer', department: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdPass, setCreatedPass] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)

  const handleCreate = async () => {
    if (!form.full_name.trim() || !emailValid) return
    setLoading(true); setError('')
    const tempPass = generateTempPass()
    try {
      const privs: Record<string, boolean> = {}
      PRIVILEGES.forEach(p => { privs[p.key] = form.role === 'admin' })
      if (form.role !== 'admin') { privs.can_use_chatbot = true; privs.can_export_pdf = true }
      await api.postAdminUser({ ...form, password: tempPass, ...privs } as UserCreate)
      setCreatedPass(tempPass)
      onSuccess()
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur') }
    finally { setLoading(false) }
  }

  const copyPass = () => { if (createdPass) { navigator.clipboard.writeText(createdPass); setCopied(true); setTimeout(() => setCopied(false), 2000) } }

  return (
    <motion.div className={styles.modalOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className={styles.modalCard} initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.3 }} onClick={e => e.stopPropagation()}>
        {createdPass ? (
          <div className="text-center py-4">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
              <CheckCircle size={48} className="text-emerald-400 mx-auto mb-3" />
            </motion.div>
            <h2 className="text-lg font-bold text-slate-100 mb-1">Utilisateur créé avec succès !</h2>
            <div className={styles.tempPassBox}>
              <span className={styles.tempPass}>{createdPass}</span>
              <button className={styles.copyBtn} onClick={copyPass}>{copied ? 'Copié ✓' : <><Copy size={12} /> Copier</>}</button>
            </div>
            <p className={styles.passWarning}>⚠ Notez ce mot de passe maintenant. Il ne sera plus affiché après la fermeture.</p>
            <button className={cn(styles.btnTeal, 'mt-4')} onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <>
            <h2>Créer un nouvel utilisateur</h2>
            <p className={styles.modalSub}>Un mot de passe temporaire sera généré automatiquement</p>
            {error && <div className={styles.errorBanner}><AlertTriangle size={14} /> {error}</div>}
            <div className={styles.formRow}>
              <label>Nom complet</label>
              <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Mohamed Benali" />
            </div>
            <div className={styles.formRow}>
              <label>Email professionnel</label>
              <div className="relative">
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="m.benali@azura.ma" />
                {form.email && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                    {emailValid ? <CheckCircle size={14} className="text-emerald-400" /> : <X size={14} className="text-red-400" />}
                  </span>
                )}
              </div>
            </div>
            <div className={styles.formRow}>
              <label>Rôle</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="admin">Admin</option><option value="manager">Manager</option>
                <option value="analyst">Analyst</option><option value="viewer">Viewer</option>
              </select>
              <p className={styles.roleDesc}>{ROLE_DESC[form.role]}</p>
            </div>
            <div className={styles.formRow}>
              <label>Département</label>
              <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                <option value="">Tous</option><option value="estran">Estran</option>
                <option value="finance">Finance</option><option value="achat">Achats</option>
              </select>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={onClose}>Annuler</button>
              <button className={styles.btnTeal} onClick={handleCreate} disabled={loading || !form.full_name.trim() || !emailValid}>
                {loading ? 'Création…' : 'Créer l\'utilisateur'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}

/* ── Edit User Modal ── */

function EditUserModal({ user, onClose, onSuccess }: { user: UserResponse; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState<UserUpdate>({ full_name: user.full_name, email: user.email, role: user.role, department: user.department || '', is_active: user.is_active })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setLoading(true); setError('')
    try {
      const payload = { ...form }
      if (!payload.department) delete payload.department
      await api.patchAdminUser(user.id, payload)
      onSuccess()
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur') }
    finally { setLoading(false) }
  }

  return (
    <motion.div className={styles.modalOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className={styles.modalCard} initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.3 }} onClick={e => e.stopPropagation()}>
        <h2>Modifier {user.full_name}</h2>
        <p className={styles.modalSub}>{user.email}</p>
        {error && <div className={styles.errorBanner}><AlertTriangle size={14} /> {error}</div>}
        <div className={styles.formRow}>
          <label>Nom complet</label>
          <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
        </div>
        <div className={styles.formRow}>
          <label>Email</label>
          <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </div>
        <div className={styles.formRow}>
          <label>Rôle</label>
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
            <option value="admin">Admin</option><option value="manager">Manager</option>
            <option value="analyst">Analyst</option><option value="viewer">Viewer</option>
          </select>
          {form.role && <p className={styles.roleDesc}>{ROLE_DESC[form.role]}</p>}
        </div>
        <div className={styles.formRow}>
          <label>Département</label>
          <select value={form.department || ''} onChange={e => setForm(f => ({ ...f, department: e.target.value || undefined }))}>
            <option value="">Tous</option><option value="estran">Estran</option>
            <option value="finance">Finance</option><option value="achat">Achats</option>
          </select>
        </div>
        <div className={styles.formRow}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active ?? true} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            Compte actif
          </label>
          {form.is_active === false && <p className="text-xs text-amber-400 mt-1">⚠ Désactiver ce compte révoquera toutes ses sessions actives.</p>}
        </div>
        <div className={styles.modalActions}>
          <button className={styles.btnGhost} onClick={onClose}>Annuler</button>
          <button className={styles.btnTeal} onClick={handleSave} disabled={loading}>
            {loading ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ── Reset Password Modal ── */

function ResetPasswordModal({ user, onClose, onSuccess }: { user: UserResponse; onClose: () => void; onSuccess: () => void }) {
  const [newPass, setNewPass] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleReset = async () => {
    setLoading(true)
    const tempPass = generateTempPass()
    try {
      await api.patchAdminUser(user.id, { password: tempPass })
      setNewPass(tempPass); onSuccess()
    } catch { /* keep modal open */ }
    finally { setLoading(false) }
  }

  const copyPass = () => { if (newPass) { navigator.clipboard.writeText(newPass); setCopied(true); setTimeout(() => setCopied(false), 2000) } }

  return (
    <motion.div className={styles.modalOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className={styles.modalCard} initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.3 }} onClick={e => e.stopPropagation()}>
        {newPass ? (
          <div className="text-center py-4">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
              <CheckCircle size={48} className="text-emerald-400 mx-auto mb-3" />
            </motion.div>
            <h2 className="text-lg font-bold text-slate-100 mb-1">Mot de passe réinitialisé</h2>
            <div className={styles.tempPassBox}>
              <span className={styles.tempPass}>{newPass}</span>
              <button className={styles.copyBtn} onClick={copyPass}>{copied ? 'Copié ✓' : <><Copy size={12} /> Copier</>}</button>
            </div>
            <p className={styles.passWarning}>⚠ Notez ce mot de passe maintenant. Il ne sera plus affiché après la fermeture.</p>
            <button className={cn(styles.btnTeal, 'mt-4')} onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <>
            <h2>Réinitialiser le mot de passe</h2>
            <p className={styles.modalSub}>de {user.full_name}</p>
            <p className="text-sm text-slate-400 mb-4">Un nouveau mot de passe temporaire sera généré. L'utilisateur devra se reconnecter immédiatement.</p>
            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={onClose}>Annuler</button>
              <button className={styles.btnTeal} onClick={handleReset} disabled={loading}>
                {loading ? 'Génération…' : 'Générer un nouveau mot de passe'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}

/* ═══════════════════════════════════
   TAB 2 — SESSIONS (JWT info)
   ═══════════════════════════════════ */

function SessionsTab() {
  return (
    <div className={styles.glass}>
      <div className="flex items-center gap-3 mb-4">
        <Shield size={20} className="text-blue-400" />
        <div>
          <h3 className="font-semibold text-slate-200">Sessions JWT (sans état)</h3>
          <p className="text-xs text-slate-500">L'application utilise des tokens JWT — les sessions ne sont pas stockées côté serveur.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
          <p className="text-xs text-slate-500 uppercase mb-1">Méthode d'auth</p>
          <p className="text-lg font-bold text-blue-400">JWT Bearer</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
          <p className="text-xs text-slate-500 uppercase mb-1">Algorithme</p>
          <p className="text-lg font-bold text-blue-400">HS256</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
          <p className="text-xs text-slate-500 uppercase mb-1">Révocation</p>
          <p className="text-sm text-slate-400">Désactivez un compte via l'onglet Utilisateurs pour bloquer l'accès.</p>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════
   TAB 3 — AUDIT
   ═══════════════════════════════════ */

function AuditTab() {
  const [filters, setFilters] = useState({ search: '', date_from: '', date_to: '', module: '' as string })
  const [catFilters, setCatFilters] = useState<string[]>([])
  const [page, setPage] = useState(1)

  const moduleParam = catFilters.length === 1 ? catFilters[0] : filters.module || undefined

  const auditQ = useQuery({
    queryKey: ['admin-audit', page, filters, catFilters],
    queryFn: () => api.getAdminAudit({
      page, page_size: 30,
      search: filters.search || undefined,
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
      module: moduleParam,
    }),
    placeholderData: keepPreviousData,
  })

  const toggleCat = (mod: string) => {
    setCatFilters(prev => prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod])
    setPage(1)
  }

  const items = auditQ.data?.items ?? []

  const handleExport = () => {
    exportCsv(items.map(r => ({
      timestamp: r.timestamp, user: r.full_name || r.email || r.user_id, action: r.action,
      module: r.module, status: r.status, ip: r.ip_address, details: r.chat_message || r.file_name || '',
    })), `audit_log_${filters.date_from || 'all'}_${filters.date_to || 'now'}.csv`)
  }

  return (
    <>
      <div className={styles.toolbar}>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className={cn(styles.searchInput, 'pl-8')} placeholder="Rechercher une action, un utilisateur..." value={filters.search} onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1) }} />
        </div>
        <input type="date" className={styles.selectInput} value={filters.date_from} onChange={e => { setFilters(f => ({ ...f, date_from: e.target.value })); setPage(1) }} />
        <input type="date" className={styles.selectInput} value={filters.date_to} onChange={e => { setFilters(f => ({ ...f, date_to: e.target.value })); setPage(1) }} />
        <button className={styles.btnGhost} onClick={handleExport}><Download size={13} /> CSV</button>
      </div>

      <div className={styles.catPills}>
        {['auth', 'estran', 'finance', 'achat', 'chat', 'admin'].map(mod => (
          <button key={mod} className={cn(styles.catPill, catFilters.includes(mod) && styles.catPillActive)} onClick={() => toggleCat(mod)}>
            {mod}
          </button>
        ))}
      </div>

      <div className={styles.glass}>
        {auditQ.isLoading ? (
          <div className="space-y-3 p-4">{[1,2,3,4].map(i => <div key={i} className={styles.skeleton} style={{ width: '100%', height: 60 }} />)}</div>
        ) : items.length === 0 ? (
          <p className="text-center text-slate-500 py-8">Aucun événement pour ces filtres</p>
        ) : (
          <div className={styles.timeline}>
            {items.map((item: AuditLog) => {
              const dotClass = MOD_CATS[item.module] || 'dotAdmin'
              const badgeClass = MOD_BADGE[item.module] || 'roleViewer'
              return (
                <motion.div key={item.id} className={styles.timelineItem} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                  <span className={cn(styles.timelineDot, styles[dotClass])} />
                  <div className={styles.timelineCard}>
                    <div className={styles.timelineMeta}>
                      {item.full_name && <span className={cn(styles.avatar, avClass(item.module === 'admin' ? 'admin' : 'viewer'), '!w-6 !h-6 !text-[0.5rem]')}>{initials(item.full_name || '?')}</span>}
                      <span className="font-semibold text-sm text-slate-200">{item.full_name || item.email || 'Système'}</span>
                      <span className={cn(styles.badge, styles[badgeClass])}>{item.module}</span>
                      <span className={cn(styles.badge, item.status === 'success' ? 'text-emerald-400 bg-emerald-400/10' : item.status === 'failed' ? 'text-red-400 bg-red-400/10' : 'text-amber-400 bg-amber-400/10')}>{item.status}</span>
                      <span className={styles.timelineTime}>{item.timestamp ? new Date(item.timestamp).toLocaleString('fr-FR') : '—'}</span>
                    </div>
                    <p className={styles.timelineAction}>{ACTION_LABELS[item.action] || item.action}</p>
                    {item.ip_address && <span className={styles.timelineIp}>{item.ip_address}</span>}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {auditQ.data && auditQ.data.pages > 1 && (
        <div className={styles.pagination}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Précédent</button>
          <span>Page {page} / {auditQ.data.pages} ({auditQ.data.total} événements)</span>
          <button disabled={page >= auditQ.data.pages} onClick={() => setPage(p => p + 1)}>Suivant</button>
        </div>
      )}
    </>
  )
}

/* ═══════════════════════════════════
   TAB 4 — STATISTICS
   ═══════════════════════════════════ */

function StatsTab({ summary, loading }: { summary: AuditSummary | undefined; loading: boolean }) {
  if (loading || !summary) return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className={styles.skeleton} style={{ width: '100%', height: 200 }} />)}</div>

  const eventsData = summary.events_per_day?.map(d => ({ date: d.date.slice(5), events: d.count })) ?? []
  const modulesData = summary.most_used_modules?.map(m => ({ name: m.module, value: m.count })) ?? []

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Événements (30j)', value: summary.total_events, color: 'text-teal-400' },
          { label: 'Connexions échouées', value: summary.failed_logins, color: summary.failed_logins > 0 ? 'text-red-400' : 'text-slate-400' },
          { label: 'Tentatives bloquées', value: summary.blocked_attempts, color: summary.blocked_attempts > 0 ? 'text-amber-400' : 'text-slate-400' },
          { label: 'Fichiers importés', value: summary.files_uploaded, color: 'text-blue-400' },
          { label: 'Questions IA', value: summary.chatbot_questions, color: 'text-purple-400' },
        ].map(s => (
          <div key={s.label} className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
            <p className="text-[0.65rem] text-slate-500 uppercase tracking-wider">{s.label}</p>
            <p className={cn('text-xl font-bold mt-1', s.color)}>{s.value.toLocaleString('fr-FR')}</p>
          </div>
        ))}
      </div>

      {summary.suspicious_ips && summary.suspicious_ips.length > 0 && (
        <div className={styles.errorBanner}><AlertTriangle size={14} /> {summary.suspicious_ips.length} IP suspecte(s): {summary.suspicious_ips.join(', ')}</div>
      )}

      <div className={styles.statsGrid}>
        {/* Events per day */}
        <div className={styles.glass}>
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Événements par jour</h3>
          <div style={{ height: 240 }}>
            {eventsData.length === 0 ? <p className="text-slate-500 text-sm">Aucune donnée</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={eventsData}>
                  <defs><linearGradient id="evGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0d9488" stopOpacity={0.3} /><stop offset="100%" stopColor="#0d9488" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <RTooltip />
                  <Area dataKey="events" name="Événements" type="monotone" stroke="#0d9488" fill="url(#evGrad)" strokeWidth={2} isAnimationActive animationDuration={800} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Modules distribution */}
        <div className={styles.glass}>
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Répartition par module</h3>
          <div style={{ height: 240 }}>
            {modulesData.length === 0 ? <p className="text-slate-500 text-sm">Aucune donnée</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={modulesData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" nameKey="name"
                    isAnimationActive animationDuration={800} label={({ name, value }) => `${name}: ${value}`}>
                    {modulesData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top users */}
        <div className={styles.glass}>
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Utilisateurs les plus actifs</h3>
          <div style={{ height: 240 }}>
            {(summary.most_active_users ?? []).length === 0 ? <p className="text-slate-500 text-sm">Aucune donnée</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.most_active_users.map(u => ({ user: u.user_id.slice(0, 8), actions: u.count }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                  <XAxis dataKey="user" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <RTooltip />
                  <Bar dataKey="actions" name="Actions" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
