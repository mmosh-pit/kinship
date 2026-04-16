import { Suspense } from 'react'
import RouteCreatePage from '@/components/RouteCreatePage'

export default function Page() {
  return (
    <Suspense
      fallback={<div className="p-6 text-white/70">Loading route creator…</div>}
    >
      <RouteCreatePage />
    </Suspense>
  )
}
