/**
 * API Route: Projects CRUD Operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '../../../src/config/firebase-admin';

// Helper to verify auth token
async function verifyToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('No token provided');
  }
  const token = authHeader.split('Bearer ')[1];
  return adminAuth.verifyIdToken(token);
}

// GET: List all projects for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const decodedToken = await verifyToken(request);

    const projectsRef = adminDb.collection('projects');
    const snapshot = await projectsRef
      .where('userId', '==', decodedToken.uid)
      .orderBy('updatedAt', 'desc')
      .get();

    const projects = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate(),
    }));

    return NextResponse.json({ projects });
  } catch (error: any) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch projects' },
      { status: error.message === 'No token provided' ? 401 : 500 }
    );
  }
}

// POST: Create a new project
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyToken(request);
    const data = await request.json();

    const projectData = {
      userId: decodedToken.uid,
      name: data.name,
      description: data.description || '',
      baseUrl: data.baseUrl,
      framework: data.framework || 'other',
      userRoles: data.userRoles || [],
      userStories: data.userStories || [],
      features: data.features || [],
      criticalFlows: data.criticalFlows || [],
      testingScope: data.testingScope || {
        includePositive: true,
        includeNegative: true,
        includeBoundary: true,
        includeEdgeCases: true,
        includeAccessibility: false,
        includeSecurity: true,
        includePerformance: false,
        testDepth: 'standard',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await adminDb.collection('projects').add(projectData);

    return NextResponse.json({
      id: docRef.id,
      ...projectData,
    });
  } catch (error: any) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create project' },
      { status: error.message === 'No token provided' ? 401 : 500 }
    );
  }
}
