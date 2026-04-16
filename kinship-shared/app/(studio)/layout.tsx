'use client'

import StudioHeader from '@/components/StudioHeader'
import StudioSidebar from '@/components/StudioSidebar'
import { AuthGuard } from '@/components/AuthGuard'

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        <StudioHeader />
        <div className="flex flex-1 min-h-0">
          <StudioSidebar />
          <main className="flex-1 ml-[220px] p-8 min-h-[calc(100vh-60px)]">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}
