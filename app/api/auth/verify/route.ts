/**
 * API Route: Verify Firebase Auth Token
 * Used to verify tokens on the server side
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '../../../../src/config/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401 }
      );
    }

    const decodedToken = await adminAuth.verifyIdToken(token);

    return NextResponse.json({
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
    });
  } catch (error: any) {
    console.error('Token verification error:', error);
    return NextResponse.json(
      { error: 'Invalid token' },
      { status: 401 }
    );
  }
}
