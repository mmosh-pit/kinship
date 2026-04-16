'use client'

/**
 * Login Page
 *
 * Handles user authentication with email and password.
 * Displays appropriate error messages for different failure scenarios.
 */

import React, { useState, FormEvent, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { LoginErrorCode } from '@/lib/auth-types'

export default function LoginPage() {
  const router = useRouter()
  const { login, isAuthenticated, isLoading } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<LoginErrorCode | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/agents')
    }
  }, [isAuthenticated, isLoading, router])

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setErrorCode(null)
    setIsSubmitting(true)

    try {
      const result = await login(email, password)

      if (result.success) {
        // Redirect to dashboard on successful login
        router.push('/agents')
      } else {
        setError(result.error)
        setErrorCode(result.code)
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      setErrorCode('SERVER_ERROR')
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * Get error icon based on error code
   */
  const getErrorIcon = () => {
    switch (errorCode) {
      case 'NO_MEMBERSHIP':
      case 'MEMBERSHIP_EXPIRED':
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        )
      default:
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )
    }
  }

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Login Card */}
        <div className="bg-card border border-card-border rounded-2xl p-8 shadow-2xl shadow-black/50">
          {/* Logo/Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#eb8000] to-amber-700 flex items-center justify-center shadow-lg shadow-accent/20">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-wide flex items-center justify-center gap-2">
              KINSHIP
              <span className="text-xs font-bold text-white bg-accent px-2 py-1 rounded">
                STUDIO
              </span>
            </h1>
            <p className="text-muted mt-3 text-sm">
              Sign in to your account
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div
              className={`flex items-start gap-3 p-4 rounded-xl mb-6 ${
                errorCode === 'NO_MEMBERSHIP' ||
                errorCode === 'MEMBERSHIP_EXPIRED'
                  ? 'bg-accent/10 border border-accent/20 text-accent'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}
            >
              {getErrorIcon()}
              <span className="text-sm leading-relaxed">{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Email
              </label>
              <input
                type="email"
                placeholder="Enter your email"
                className="w-full px-4 py-3 bg-input border border-card-border rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
                autoComplete="email"
              />
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Password
              </label>
              <input
                type="password"
                placeholder="Enter your password"
                className="w-full px-4 py-3 bg-input border border-card-border rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isSubmitting}
                autoComplete="current-password"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full py-3.5 mt-2 bg-accent hover:bg-accent-dark text-white font-semibold rounded-full transition-all duration-200 shadow-lg shadow-accent/20 hover:shadow-accent/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Signing in...</span>
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="text-center mt-8 pt-6 border-t border-card-border">
            <p className="text-sm text-muted">
              Need a membership?{' '}
              <a
                href="https://www.kinship.today/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-[#c96d00] transition-colors font-medium"
              >
                Visit Kinship
              </a>
            </p>
          </div>
        </div>

        {/* Version info */}
        <p className="text-center text-white/30 text-xs mt-6">
          Kinship Studio v1.0
        </p>
      </div>
    </div>
  )
}
