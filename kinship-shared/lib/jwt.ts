/**
 * JWT Authentication Utilities
 *
 * Handles JWT token generation and verification for user authentication.
 */

import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken'

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

// Validate JWT secret in production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('Please define JWT_SECRET environment variable in production')
}

/**
 * User payload stored in JWT token
 */
export interface JWTUserPayload {
  userId: string
  email: string
  wallet: string
  username?: string
  name?: string
  membership?: string
  membershipExpiry?: string
}

/**
 * Decoded JWT token structure
 */
export interface DecodedToken extends JwtPayload, JWTUserPayload { }

/**
 * Generate a JWT token for a user
 * @param payload User data to encode in the token
 * @param expiresIn Optional custom expiration time
 */
export function generateToken(
  payload: JWTUserPayload,
  expiresIn?: string
): string {
  const options: SignOptions = {
    expiresIn: (expiresIn || JWT_EXPIRES_IN) as jwt.SignOptions['expiresIn'],  // ✅ properly typed
    algorithm: 'HS256',
  }

  return jwt.sign(payload, JWT_SECRET, options)
}

/**
 * Verify a JWT token
 * @param token The JWT token to verify
 * @returns Decoded token payload or null if invalid
 */
export function verifyToken(token: string): DecodedToken | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken
    return decoded
  } catch (error) {
    console.error('JWT verification failed:', error)
    return null
  }
}

/**
 * Decode a JWT token without verification (useful for debugging)
 * @param token The JWT token to decode
 */
export function decodeToken(token: string): DecodedToken | null {
  try {
    return jwt.decode(token) as DecodedToken
  } catch (error) {
    console.error('JWT decode failed:', error)
    return null
  }
}

/**
 * Check if a token is expired
 * @param token The JWT token to check
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token)
  if (!decoded || !decoded.exp) return true

  const currentTime = Math.floor(Date.now() / 1000)
  return decoded.exp < currentTime
}

/**
 * Extract token from Authorization header
 * @param authHeader The Authorization header value
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader) return null

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  return authHeader
}
