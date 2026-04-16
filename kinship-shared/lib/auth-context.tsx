'use client'

/**
 * Authentication Context Provider
 *
 * Manages authentication state across the application.
 * Uses the Kinship API for authentication.
 * 
 * API Response Format:
 *   { data: { token: "...", user: { ... } } }
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'
import {
  AuthContextValue,
  AuthUser,
  LoginResponse,
  LoginSuccessResponse,
} from '@/lib/auth-types'

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

// Auth API URL from environment
const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://192.168.1.19:6050'

// Local storage keys - using simple keys for compatibility
const TOKEN_KEY = 'token'
const USER_KEY = 'user'

// Create context with default values
const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Auth Provider Props
 */
interface AuthProviderProps {
  children: ReactNode
}

/**
 * API Response Types
 * 
 * The API returns: { data: { token, user } }
 */
interface ApiLoginResponse {
  data: {
    token: string
    user: {
      id?: string
      _id?: string
      uuid?: string
      email?: string
      name?: string
      wallet?: string
      profile?: {
        username?: string
        displayName?: string
        image?: string
      }
      membership?: {
        type?: string
        membershipType?: string
        expiryDate?: string
      }
    }
  }
}

/**
 * Transform API user to our AuthUser format
 */
function transformUser(apiUser: ApiLoginResponse['data']['user']): AuthUser {
  return {
    id: apiUser.id || apiUser._id || apiUser.uuid || '',
    email: apiUser.email || '',
    name: apiUser.name || apiUser.profile?.displayName || 'User',
    username: apiUser.profile?.username,
    wallet: apiUser.wallet || '',
    profileImage: apiUser.profile?.image,
    membership: {
      type: apiUser.membership?.type || 'free',
      membershipType: apiUser.membership?.membershipType || 'basic',
      expiryDate: apiUser.membership?.expiryDate || '',
    },
  }
}

/**
 * Auth Provider Component
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  /**
   * Check if there's an existing auth session on mount
   * Simple localStorage-based verification (no API call needed)
   */
  useEffect(() => {
    const initAuth = () => {
      try {
        const storedToken = localStorage.getItem(TOKEN_KEY)
        const storedUser = localStorage.getItem(USER_KEY)

        if (storedToken && storedUser) {
          // Token exists - trust it and restore session
          setToken(storedToken)
          try {
            setUser(JSON.parse(storedUser))
            console.log('[AUTH] Session restored from localStorage')
          } catch (e) {
            console.error('[AUTH] Failed to parse stored user:', e)
            clearAuthStorage()
          }
        } else {
          console.log('[AUTH] No stored session found')
        }
      } catch (error) {
        console.error('[AUTH] Initialization error:', error)
        clearAuthStorage()
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()
  }, [])

  /**
   * Clear auth data from storage
   */
  const clearAuthStorage = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }

  /**
   * Login function - calls Kinship Auth API
   * 
   * Request:
   *   POST {AUTH_API_URL}/login
   *   Body: { "handle": "email", "password": "password" }
   * 
   * Response:
   *   { "data": { "token": "...", "user": { ... } } }
   */
  const login = useCallback(
    async (email: string, password: string): Promise<LoginResponse> => {
      try {
        const endpoint = `${AUTH_API_URL}/login`
        console.log('[AUTH] Logging in via:', endpoint)
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            handle: email,  // API uses "handle" not "email"
            password 
          }),
        })

        // Parse response
        const responseData = await response.json()
        console.log('[AUTH] Response received:', { 
          status: response.status,
          hasData: !!responseData.data,
          hasToken: !!responseData.data?.token 
        })

        // Check for HTTP errors
        if (!response.ok) {
          console.error('[AUTH] Login failed:', response.status, responseData)
          
          const errorMessage = responseData.message || 
                              responseData.error || 
                              responseData.data?.message ||
                              'Login failed. Please check your credentials.'
          
          return {
            success: false,
            error: errorMessage,
            code: response.status === 401 ? 'INVALID_PASSWORD' : 
                  response.status === 404 ? 'USER_NOT_FOUND' : 'SERVER_ERROR',
          }
        }

        // Extract token and user from response.data
        const apiData = responseData.data
        
        if (!apiData || !apiData.token) {
          console.error('[AUTH] Invalid response structure:', responseData)
          return {
            success: false,
            error: 'Invalid response from server. Expected data.token',
            code: 'SERVER_ERROR',
          }
        }

        const { token: authToken, user: apiUser } = apiData
        console.log('[AUTH] ✅ Login successful, token received')

        // Transform user data to our format
        const transformedUser = transformUser(apiUser || {})
        
        // Store token and user data in localStorage
        localStorage.setItem(TOKEN_KEY, authToken)
        localStorage.setItem(USER_KEY, JSON.stringify(transformedUser))
        console.log('[AUTH] ✅ Token stored in localStorage as "token"')

        // Update state
        setToken(authToken)
        setUser(transformedUser)

        // Return success response
        const successResponse: LoginSuccessResponse = {
          success: true,
          message: 'Login successful',
          token: authToken,
          user: transformedUser,
        }

        return successResponse
      } catch (error) {
        console.error('[AUTH] Login error:', error)
        return {
          success: false,
          error: 'Network error. Please check your connection.',
          code: 'SERVER_ERROR',
        }
      }
    },
    []
  )

  /**
   * Logout function
   */
  const logout = useCallback(() => {
    console.log('[AUTH] Logging out, clearing storage')
    clearAuthStorage()
  }, [])

  /**
   * Check authentication status
   * Simple check - if token exists in localStorage, user is authenticated
   */
  const checkAuth = useCallback(async (): Promise<boolean> => {
    const storedToken = localStorage.getItem(TOKEN_KEY)
    const storedUser = localStorage.getItem(USER_KEY)
    return !!(storedToken && storedUser)
  }, [])

  const value: AuthContextValue = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isLoading,
    login,
    logout,
    checkAuth,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Hook to use auth context
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}

/**
 * Get stored auth token (for use outside React components)
 * This is used by the chat page to add Authorization header
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

/**
 * Get stored user data (for use outside React components)
 */
export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  const userData = localStorage.getItem(USER_KEY)
  return userData ? JSON.parse(userData) : null
}