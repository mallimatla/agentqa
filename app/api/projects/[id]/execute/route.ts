/**
 * API Route: Execute Tests for a Project
 * Note: Actual browser execution needs to run on a worker/serverless function with browser support
 * This endpoint manages the test run lifecycle
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '../../../../../src/config/firebase-admin';

// Helper to verify auth token
async function verifyToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('No token provided');
  }
  const token = authHeader.split('Bearer ')[1];
  return adminAuth.verifyIdToken(token);
}

// POST: Start test execution
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const decodedToken = await verifyToken(request);
    const { id } = await params;
    const { testSuiteId, options = {} } = await request.json();

    // Verify project ownership
    const projectRef = adminDb.collection('projects').doc(id);
    const projectDoc = await projectRef.get();

    if (!projectDoc.exists) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    if (projectDoc.data()?.userId !== decodedToken.uid) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Get test suite
    const suiteRef = adminDb.collection('testSuites').doc(testSuiteId);
    const suiteDoc = await suiteRef.get();

    if (!suiteDoc.exists) {
      return NextResponse.json(
        { error: 'Test suite not found' },
        { status: 404 }
      );
    }

    const suite = suiteDoc.data();
    const testCases = suite?.testCases || [];

    // Create test run record
    const testRunData = {
      projectId: id,
      testSuiteId,
      userId: decodedToken.uid,
      status: 'pending',
      passed: 0,
      failed: 0,
      skipped: 0,
      passRate: 0,
      duration: 0,
      results: [],
      options: {
        headless: options.headless ?? true,
        video: options.video ?? false,
        screenshot: options.screenshot ?? true,
        ...options,
      },
      startedAt: new Date(),
      completedAt: null,
      reportUrl: null,
    };

    const runRef = await adminDb.collection('testRuns').add(testRunData);

    // In a real implementation, this would:
    // 1. Queue the test execution to a worker (e.g., AWS Lambda, Cloud Run with Playwright)
    // 2. The worker would execute tests and update the testRun document
    // 3. Results would stream back via Firestore real-time updates

    // For now, we'll simulate the execution status
    // The actual execution can be triggered by a separate worker service

    return NextResponse.json({
      runId: runRef.id,
      status: 'pending',
      message: 'Test run queued for execution',
      testCases: testCases.length,
      estimatedDuration: testCases.length * 5, // ~5 seconds per test
    });
  } catch (error: any) {
    console.error('Error starting test execution:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start test execution' },
      { status: error.message === 'No token provided' ? 401 : 500 }
    );
  }
}

// GET: Get test run status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const decodedToken = await verifyToken(request);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');

    if (!runId) {
      // List all runs for this project
      const runsRef = adminDb.collection('testRuns');
      const snapshot = await runsRef
        .where('projectId', '==', id)
        .where('userId', '==', decodedToken.uid)
        .orderBy('startedAt', 'desc')
        .limit(20)
        .get();

      const runs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startedAt: doc.data().startedAt?.toDate(),
        completedAt: doc.data().completedAt?.toDate(),
      }));

      return NextResponse.json({ runs });
    }

    // Get specific run
    const runRef = adminDb.collection('testRuns').doc(runId);
    const runDoc = await runRef.get();

    if (!runDoc.exists) {
      return NextResponse.json(
        { error: 'Test run not found' },
        { status: 404 }
      );
    }

    const run = runDoc.data();
    if (run?.userId !== decodedToken.uid) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      id: runDoc.id,
      ...run,
      startedAt: run?.startedAt?.toDate(),
      completedAt: run?.completedAt?.toDate(),
    });
  } catch (error: any) {
    console.error('Error fetching test runs:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch test runs' },
      { status: error.message === 'No token provided' ? 401 : 500 }
    );
  }
}
