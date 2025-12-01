/**
 * API Route: Generate Test Cases for a Project
 * Uses the StrategyEngine for intelligent test generation
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

// POST: Generate test cases for a project
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const decodedToken = await verifyToken(request);
    const { id } = await params;
    const options = await request.json();

    // Get the project
    const projectRef = adminDb.collection('projects').doc(id);
    const projectDoc = await projectRef.get();

    if (!projectDoc.exists) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const project = projectDoc.data();
    if (project?.userId !== decodedToken.uid) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Import the StrategyEngine dynamically (server-side only)
    const { StrategyEngine } = await import('../../../../../dist/core/intelligence/strategy-engine');

    const engine = new StrategyEngine();

    // Build project config for strategy engine
    const projectConfig = {
      id,
      name: project?.name || 'Unknown',
      description: project?.description || '',
      baseUrl: project?.baseUrl || '',
      applicationInfo: project?.applicationInfo || { type: 'web', framework: 'other' },
      userRoles: project?.userRoles || [],
      userStories: project?.userStories || [],
      features: project?.features || [],
      criticalFlows: project?.criticalFlows || [],
      testingScope: project?.testingScope || {},
      performanceBenchmarks: project?.performanceBenchmarks || [],
      environments: project?.environments || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Generate strategy
    const strategy = engine.generateStrategy(projectConfig as any);

    // Generate intelligent test suite
    const suite = engine.generateIntelligentSuite(projectConfig as any);

    // Generate coverage report
    const report = engine.generateReport(suite, projectConfig as any);

    // Save test suite to Firestore
    const testSuiteData = {
      projectId: id,
      userId: decodedToken.uid,
      name: suite.name,
      description: suite.description,
      strategy: {
        name: strategy.name,
        testPhases: strategy.testPhases.map((p: any) => p.name),
        riskAreas: strategy.riskAreas.length,
      },
      scenarios: suite.scenarios.length,
      testCases: suite.testCases,
      coverage: suite.coverage,
      report: {
        summary: report.summary,
        recommendations: report.recommendations,
      },
      createdAt: new Date(),
    };

    const suiteRef = await adminDb.collection('testSuites').add(testSuiteData);

    return NextResponse.json({
      id: suiteRef.id,
      strategy: {
        name: strategy.name,
        testPhases: strategy.testPhases,
        riskAreas: strategy.riskAreas,
      },
      suite: {
        id: suite.id,
        name: suite.name,
        scenarios: suite.scenarios.length,
        testCases: suite.testCases.length,
        coverage: suite.coverage,
      },
      report: {
        summary: report.summary,
        recommendations: report.recommendations,
      },
    });
  } catch (error: any) {
    console.error('Error generating tests:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate tests' },
      { status: error.message === 'No token provided' ? 401 : 500 }
    );
  }
}
