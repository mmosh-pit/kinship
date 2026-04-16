'use client'

import { AuthGuard } from '@/components/AuthGuard'

export default function BuilderLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthGuard>{children}</AuthGuard>
}
