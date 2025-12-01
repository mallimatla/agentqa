/**
 * API Route: Test Suite Operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '../../../../src/config/firebase-admin';

// Helper to verify auth token
async function verifyToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('No token provided');
  }
  const token = authHeader.split('Bearer ')[1];
  return adminAuth.verifyIdToken(token);
}

// GET: Get a specific test suite
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const decodedToken = await verifyToken(request);
    const { id } = await params;

    const docRef = adminDb.collection('testSuites').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Test suite not found' },
        { status: 404 }
      );
    }

    const data = doc.data();
    if (data?.userId !== decodedToken.uid) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      id: doc.id,
      ...data,
      createdAt: data?.createdAt?.toDate(),
    });
  } catch (error: any) {
    console.error('Error fetching test suite:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch test suite' },
      { status: error.message === 'No token provided' ? 401 : 500 }
    );
  }
}

// DELETE: Delete a test suite
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const decodedToken = await verifyToken(request);
    const { id } = await params;

    const docRef = adminDb.collection('testSuites').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Test suite not found' },
        { status: 404 }
      );
    }

    if (doc.data()?.userId !== decodedToken.uid) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    await docRef.delete();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting test suite:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete test suite' },
      { status: error.message === 'No token provided' ? 401 : 500 }
    );
  }
}
