/**
 * Token Verification API Route
 *
 * GET /api/auth/verify
 *
 * Verifies a JWT token and returns user information.
 * Also re-validates membership status.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt'
import { getCollection, COLLECTIONS } from '@/lib/mongodb'
import { MembershipDocument } from '@/lib/auth-types'

export async function GET(request: NextRequest) {
  try {
    // Extract token from Authorization header
    const authHeader = request.headers.get('authorization')
    const token = extractTokenFromHeader(authHeader)

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No token provided' },
        { status: 401 }
      )
    }

    // Verify the token
    const decoded = verifyToken(token)

    if (!decoded) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      )
    }

    // Optionally re-verify membership status from database
    // This ensures membership hasn't expired since last login
    try {
      if (decoded.wallet) {
        const membershipsCollection = await getCollection<MembershipDocument>(
          COLLECTIONS.MEMBERSHIPS
        )

        const membership = await membershipsCollection.findOne({
          wallet: decoded.wallet,
        })

        if (membership) {
          // Check if membership has expired
          const expiryDate = membership.expirydate
            ? new Date(membership.expirydate)
            : null

          if (expiryDate && expiryDate < new Date()) {
            return NextResponse.json(
              {
                success: false,
                error: 'Membership has expired',
                code: 'MEMBERSHIP_EXPIRED',
              },
              { status: 403 }
            )
          }
        }
      }
    } catch (dbError) {
      // If DB check fails, still allow access based on token validity
      console.warn('Membership re-verification failed:', dbError)
    }

    // Token is valid, return user info
    return NextResponse.json({
      success: true,
      user: {
        id: decoded.userId,
        email: decoded.email,
        wallet: decoded.wallet,
        username: decoded.username,
        name: decoded.name,
        membership: decoded.membership,
        membershipExpiry: decoded.membershipExpiry,
      },
    })
  } catch (error) {
    console.error('Token verification error:', error)
    return NextResponse.json(
      { success: false, error: 'Verification failed' },
      { status: 500 }
    )
  }
}
