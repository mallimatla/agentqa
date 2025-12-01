/**
 * API Route: Individual Project Operations
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

// GET: Get a specific project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const decodedToken = await verifyToken(request);
    const { id } = await params;

    const docRef = adminDb.collection('projects').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Project not found' },
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
      updatedAt: data?.updatedAt?.toDate(),
    });
  } catch (error: any) {
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch project' },
      { status: error.message === 'No token provided' ? 401 : 500 }
    );
  }
}

// PUT: Update a project
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const decodedToken = await verifyToken(request);
    const { id } = await params;
    const updates = await request.json();

    const docRef = adminDb.collection('projects').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    if (doc.data()?.userId !== decodedToken.uid) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };
    delete updateData.id;
    delete updateData.userId;
    delete updateData.createdAt;

    await docRef.update(updateData);

    const updatedDoc = await docRef.get();
    const data = updatedDoc.data();

    return NextResponse.json({
      id: updatedDoc.id,
      ...data,
      createdAt: data?.createdAt?.toDate(),
      updatedAt: data?.updatedAt?.toDate(),
    });
  } catch (error: any) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update project' },
      { status: error.message === 'No token provided' ? 401 : 500 }
    );
  }
}

// DELETE: Delete a project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const decodedToken = await verifyToken(request);
    const { id } = await params;

    const docRef = adminDb.collection('projects').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    if (doc.data()?.userId !== decodedToken.uid) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Delete associated test suites and runs
    const testSuitesRef = adminDb.collection('testSuites');
    const suitesSnapshot = await testSuitesRef.where('projectId', '==', id).get();

    const batch = adminDb.batch();
    suitesSnapshot.docs.forEach(suiteDoc => {
      batch.delete(suiteDoc.ref);
    });

    const testRunsRef = adminDb.collection('testRuns');
    const runsSnapshot = await testRunsRef.where('projectId', '==', id).get();
    runsSnapshot.docs.forEach(runDoc => {
      batch.delete(runDoc.ref);
    });

    batch.delete(docRef);
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete project' },
      { status: error.message === 'No token provided' ? 401 : 500 }
    );
  }
}
