/**
 * Authentication Type Definitions
 *
 * Types for user authentication, MongoDB documents, and API responses.
 */

import { ObjectId } from 'mongodb'

// ============================================
// MongoDB Document Types
// ============================================

/**
 * User profile information
 */
export interface UserProfile {
  name?: string
  lastName?: string
  displayName?: string
  username?: string
  bio?: string
  image?: string
  seniority?: number
  symbol?: string
  link?: string
  following?: number
  follower?: number
  connectionnft?: string
  connectionbadge?: string
  connection?: number
  isprivate?: boolean
  request?: boolean
}

/**
 * Guest data for user
 */
export interface GuestData {
  picture?: string
  banner?: string
  name?: string
  displayname?: string
  lastname?: string
  username?: string
  website?: string
  pronouns?: string
  bio?: string
}

/**
 * User subscription information
 */
export interface UserSubscription {
  product_id?: string
  purchase_token?: string
  subscription_id?: string
  subscription_tier?: number
  expires_at?: { $numberLong: string }
  platform?: string
  changed_plan?: boolean
}

/**
 * Bluesky integration data
 */
export interface BlueskyData {
  handle?: string
  password?: string
}

/**
 * User document from mmosh-users collection
 */
export interface UserDocument {
  _id: ObjectId
  uuid: string
  name: string
  email: string
  password: string
  telegramId?: number
  guest_data?: GuestData
  sessions?: string[]
  bluesky?: BlueskyData
  subscription?: UserSubscription
  wallet: string
  referred_by?: string
  onboarding_step?: number
  created_at?: Date
  profile?: UserProfile
  profilenft?: string
  tokenUsage?: number
  updated_date?: Date
  role?: string
  hasBlueSkyConnected?: boolean
  nickname?: string
  updated_at?: Date
}

/**
 * Membership document from mmosh-app-user-membership collection
 */
export interface MembershipDocument {
  _id: ObjectId
  membership: string
  membershiptype: string
  price: number
  expirydate: string
  wallet: string
  created_date?: Date
  updated_date?: Date
}

// ============================================
// API Request/Response Types
// ============================================

/**
 * Login request payload
 */
export interface LoginRequest {
  email: string
  password: string
}

/**
 * Login response on success
 */
export interface LoginSuccessResponse {
  success: true
  message: string
  token: string
  user: {
    id: string
    email: string
    name: string
    username?: string
    wallet: string
    profileImage?: string
    membership: {
      type: string
      membershipType: string
      expiryDate: string
    }
  }
}

/**
 * Login response on error
 */
export interface LoginErrorResponse {
  success: false
  error: string
  code: LoginErrorCode
}

/**
 * Login error codes
 */
export type LoginErrorCode =
  | 'USER_NOT_FOUND'
  | 'INVALID_PASSWORD'
  | 'NO_MEMBERSHIP'
  | 'MEMBERSHIP_EXPIRED'
  | 'MISSING_CREDENTIALS'
  | 'SERVER_ERROR'

/**
 * Union type for login response
 */
export type LoginResponse = LoginSuccessResponse | LoginErrorResponse

// ============================================
// Auth Context Types
// ============================================

/**
 * Authenticated user state
 */
export interface AuthUser {
  id: string
  email: string
  name: string
  username?: string
  wallet: string
  profileImage?: string
  membership: {
    type: string
    membershipType: string
    expiryDate: string
  }
}

/**
 * Auth context state
 */
export interface AuthState {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
}

/**
 * Auth context actions
 */
export interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<LoginResponse>
  logout: () => void
  checkAuth: () => Promise<boolean>
}
