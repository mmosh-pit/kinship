'use client'

interface VersionBadgeProps {
  version: number
  className?: string
}

export default function VersionBadge({
  version,
  className = '',
}: VersionBadgeProps) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-md bg-white/[0.1] text-white/70 font-medium ${className}`}
      title={`Manifest version ${version}`}
    >
      v{version}
    </span>
  )
}
