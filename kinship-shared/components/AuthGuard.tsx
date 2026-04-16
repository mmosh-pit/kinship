'use client'

/**
 * Auth Guard Component
 *
 * Protects routes by requiring authentication.
 * Redirects unauthenticated users to the login page.
 */

import React, { useEffect, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

interface AuthGuardProps {
  children: ReactNode
  fallback?: ReactNode
}

/**
 * AuthGuard - Wraps protected content
 *
 * Usage:
 * <AuthGuard>
 *   <ProtectedContent />
 * </AuthGuard>
 */
export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, isLoading, router])

  // Show loading state
  if (isLoading) {
    return (
      fallback || (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="mt-4 text-muted text-sm">Loading...</p>
          </div>
        </div>
      )
    )
  }

  // Not authenticated - will redirect
  if (!isAuthenticated) {
    return (
      fallback || (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="mt-4 text-muted text-sm">
              Redirecting to login...
            </p>
          </div>
        </div>
      )
    )
  }

  // Authenticated - render children
  return <>{children}</>
}

/**
 * withAuth HOC - Alternative way to protect pages
 *
 * Usage:
 * export default withAuth(MyProtectedPage)
 */
export function withAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>
) {
  return function WithAuthComponent(props: P) {
    return (
      <AuthGuard>
        <WrappedComponent {...props} />
      </AuthGuard>
    )
  }
}

export default AuthGuard
