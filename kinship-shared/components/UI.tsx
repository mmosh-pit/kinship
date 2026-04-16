'use client'

import { HEARTS_FACETS } from '@/lib/data'

// Status Badge
export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    published: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    ingested: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    draft: 'bg-accent/15 text-accent border-accent/20',
    pending: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    inactive: 'bg-white/10 text-muted border-white/10',
  }

  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${styles[status] || styles.draft}`}
    >
      {status}
    </span>
  )
}

// HEARTS Facet Badge
export function FacetBadge({
  facet,
  size = 'sm',
}: {
  facet: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const f = HEARTS_FACETS.find((h) => h.key === facet)
  if (!f) return null

  const sizeStyles = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
  }

  return (
    <div
      className={`${sizeStyles[size]} rounded-lg flex items-center justify-center font-bold text-white`}
      style={{ backgroundColor: f.color }}
      title={f.name}
    >
      {f.key}
    </div>
  )
}

// Facet Tag (pill style)
export function FacetTag({ facet }: { facet: string }) {
  const f = HEARTS_FACETS.find((h) => h.key === facet)
  if (!f) return null

  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
      style={{
        backgroundColor: `${f.color}33`,
        color: f.color,
        border: `1px solid ${f.color}44`,
      }}
    >
      {f.key} {f.name}
    </span>
  )
}

// Card wrapper
export function Card({
  children,
  className = '',
  hover = false,
  onClick,
}: {
  children: React.ReactNode
  className?: string
  hover?: boolean
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-card border border-card-border rounded-xl ${
        hover ? 'hover:border-accent/50 hover:bg-white/[0.04] transition-all cursor-pointer' : ''
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

// Empty State
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-20 h-20 rounded-2xl bg-accent/15 border border-card-border flex items-center justify-center mb-4">
        <span className="text-4xl">{icon}</span>
      </div>
      <h3 className="text-white font-bold text-lg mb-1">{title}</h3>
      <p className="text-muted text-sm max-w-sm mb-6">{description}</p>
      {action}
    </div>
  )
}

// Tag pill
export function Tag({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-input text-muted border border-white/[0.08]">
      {label}
    </span>
  )
}

// Scene type icon — generates a consistent color from any scene type string
function sceneTypeColor(type: string): string {
  let hash = 0
  for (let i = 0; i < type.length; i++) {
    hash = type.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 50%, 55%)`
}

export function SceneIcon({
  type,
  size = 'md',
}: {
  type: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeStyles = {
    sm: 'w-8 h-8 text-[10px]',
    md: 'w-10 h-10 text-xs',
    lg: 'w-14 h-14 text-sm',
  }
  const color = sceneTypeColor(type)
  const initials = type
    .split(/[\s_-]+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div
      className={`${sizeStyles[size]} rounded-xl flex items-center justify-center font-bold text-white`}
      style={{ backgroundColor: color }}
      title={type}
    >
      {initials}
    </div>
  )
}

// Loading Spinner
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeStyles = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }
  return (
    <svg
      className={`animate-spin ${sizeStyles[size]} text-accent`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

// Skeleton Loader
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-white/10 rounded ${className}`} />
  )
}

// Confirmation Dialog
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null

  const variantStyles = {
    danger: 'bg-red-500 hover:bg-red-400',
    warning: 'bg-accent hover:bg-accent-dark',
    info: 'bg-accent hover:bg-accent-dark',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative bg-card border border-card-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <h3 className="text-white font-bold text-lg mb-2">{title}</h3>
        <p className="text-muted text-sm mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 btn bg-input hover:bg-white/[0.1] text-white rounded-xl py-2.5 font-medium border border-card-border"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 btn ${variantStyles[variant]} text-white rounded-xl py-2.5 font-medium disabled:opacity-50`}
          >
            {loading ? <Spinner size="sm" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
