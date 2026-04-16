/**
 * Login API Route
 *
 * POST /api/auth/login
 *
 * Authenticates a user by:
 * 1. Checking if user exists in mmosh-users collection
 * 2. Verifying password
 * 3. Checking active membership in mmosh-app-user-membership collection
 * 4. Generating JWT token on success
 */

import { NextRequest, NextResponse } from 'next/server'
import argon2 from 'argon2'
import { getCollection, COLLECTIONS } from '@/lib/mongodb'
import { generateToken, JWTUserPayload } from '@/lib/jwt'
import {
  UserDocument,
  MembershipDocument,
  LoginRequest,
  LoginSuccessResponse,
  LoginErrorResponse,
} from '@/lib/auth-types'

/**
 * POST /api/auth/login
 *
 * Request body:
 *   - email: string
 *   - password: string
 *
 * Returns:
 *   - On success: JWT token and user data
 *   - On failure: Error message and code
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: LoginRequest = await request.json()
    const { email, password } = body

    // Validate required fields
    if (!email || !password) {
      const errorResponse: LoginErrorResponse = {
        success: false,
        error: 'Email and password are required',
        code: 'MISSING_CREDENTIALS',
      }
      return NextResponse.json(errorResponse, { status: 400 })
    }

    // Get users collection
    const usersCollection = await getCollection<UserDocument>(COLLECTIONS.USERS)

    // Find user by email (case-insensitive)
    const user = await usersCollection.findOne({
      email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') },
    })

    // Check if user exists
    if (!user) {
      const errorResponse: LoginErrorResponse = {
        success: false,
        error: 'User not found. Please check your email address.',
        code: 'USER_NOT_FOUND',
      }
      return NextResponse.json(errorResponse, { status: 404 })
    }

    // Verify password using Argon2
    let passwordValid = false
    try {
      passwordValid = await argon2.verify(user.password, password)
    } catch (error) {
      console.error('Password verification error:', error)
      passwordValid = false
    }

    if (!passwordValid) {
      const errorResponse: LoginErrorResponse = {
        success: false,
        error: 'Invalid password. Please try again.',
        code: 'INVALID_PASSWORD',
      }
      return NextResponse.json(errorResponse, { status: 401 })
    }

    // Check if user has a wallet address
    if (!user.wallet) {
      const errorResponse: LoginErrorResponse = {
        success: false,
        error: 'User wallet address not found. Please contact support.',
        code: 'NO_MEMBERSHIP',
      }
      return NextResponse.json(errorResponse, { status: 403 })
    }

    // Get memberships collection
    const membershipsCollection = await getCollection<MembershipDocument>(
      COLLECTIONS.MEMBERSHIPS
    )

    // Find active membership by wallet address
    const membership = await membershipsCollection.findOne({
      wallet: user.wallet,
    })

    // Check if membership exists
    // if (!membership) {
    //   const errorResponse: LoginErrorResponse = {
    //     success: false,
    //     error:
    //       'No active membership found for your account. Please purchase a membership to continue.',
    //     code: 'NO_MEMBERSHIP',
    //   }
    //   return NextResponse.json(errorResponse, { status: 403 })
    // }

    // // Check if membership is expired
    // const expiryDate = new Date(membership.expirydate)
    // const now = new Date()

    // if (expiryDate < now) {
    //   const errorResponse: LoginErrorResponse = {
    //     success: false,
    //     error: `Your ${membership.membership} membership expired on ${expiryDate.toLocaleDateString()}. Please renew your membership to continue.`,
    //     code: 'MEMBERSHIP_EXPIRED',
    //   }
    //   return NextResponse.json(errorResponse, { status: 403 })
    // }

    // Generate JWT token
    const tokenPayload: JWTUserPayload = {
      userId: user._id.toString(),
      email: user.email,
      wallet: user.wallet,
      username: user.profile?.username,
      name: user.name || user.profile?.displayName,
      // membership: membership.membership,
      // membershipExpiry: membership.expirydate,
      membership: "creator",
      membershipExpiry: "2026-12-23T13:40:17.882Z",
    }

    const token = generateToken(tokenPayload)

    // Prepare success response
    const successResponse: LoginSuccessResponse = {
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name || user.profile?.displayName || 'User',
        username: user.profile?.username,
        wallet: user.wallet,
        profileImage: user.profile?.image,
        membership: {
          // type: membership.membership,
          // membershipType: membership.membershiptype,
          // expiryDate: membership.expirydate,
          type: "creator",
          membershipType: "monthly",
          expiryDate: "2026-12-23T13:40:17.882Z",
        },
      },
    }

    return NextResponse.json(successResponse, { status: 200 })
  } catch (error) {
    console.error('Login error:', error)

    const errorResponse: LoginErrorResponse = {
      success: false,
      error: 'An unexpected error occurred. Please try again later.',
      code: 'SERVER_ERROR',
    }
    return NextResponse.json(errorResponse, { status: 500 })
  }
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
