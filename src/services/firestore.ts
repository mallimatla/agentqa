/**
 * Firestore Database Service for AgentQA
 * Handles all database operations for projects, test suites, and results
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  DocumentReference,
} from 'firebase/firestore';
import { db } from '../config/firebase';

// Collection names
const COLLECTIONS = {
  USERS: 'users',
  PROJECTS: 'projects',
  TEST_SUITES: 'testSuites',
  TEST_RUNS: 'testRuns',
  TEST_RESULTS: 'testResults',
  DISCOVERIES: 'discoveries',
};

// Types
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: Date;
  lastLogin: Date;
  settings: {
    defaultBrowser: 'chromium' | 'firefox' | 'webkit';
    headless: boolean;
    notifications: boolean;
  };
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string;
  baseUrl: string;
  framework?: string;
  industry?: string;
  userRoles: any[];
  userStories: any[];
  features: any[];
  criticalFlows: any[];
  testingScope: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestSuite {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  description: string;
  scenarios: any[];
  testCases: any[];
  coverage: {
    positiveTests: number;
    negativeTests: number;
    totalTests: number;
  };
  createdAt: Date;
}

export interface TestRun {
  id: string;
  suiteId: string;
  projectId: string;
  userId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
  duration: number;
  startedAt: Date;
  completedAt?: Date;
  reportUrl?: string;
  videoUrls?: string[];
}

// User operations
export const userService = {
  async create(uid: string, data: Partial<UserProfile>): Promise<void> {
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    await setDoc(userRef, {
      ...data,
      uid,
      plan: 'free',
      createdAt: Timestamp.now(),
      lastLogin: Timestamp.now(),
      settings: {
        defaultBrowser: 'chromium',
        headless: true,
        notifications: true,
      },
    });
  },

  async get(uid: string): Promise<UserProfile | null> {
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const data = userSnap.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate(),
        lastLogin: data.lastLogin?.toDate(),
      } as UserProfile;
    }
    return null;
  },

  async update(uid: string, data: Partial<UserProfile>): Promise<void> {
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    await updateDoc(userRef, {
      ...data,
      lastLogin: Timestamp.now(),
    });
  },
};

// Project operations
export const projectService = {
  async create(data: Omit<Project, 'id'>): Promise<Project> {
    const projectRef = doc(collection(db, COLLECTIONS.PROJECTS));
    const projectData = {
      ...data,
      id: projectRef.id,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    await setDoc(projectRef, projectData);
    return {
      ...projectData,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Project;
  },

  async get(projectId: string): Promise<Project | null> {
    const projectRef = doc(db, COLLECTIONS.PROJECTS, projectId);
    const projectSnap = await getDoc(projectRef);
    if (projectSnap.exists()) {
      const data = projectSnap.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      } as Project;
    }
    return null;
  },

  async listByUser(userId: string): Promise<Project[]> {
    const q = query(
      collection(db, COLLECTIONS.PROJECTS),
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      } as Project;
    });
  },

  async update(projectId: string, data: Partial<Project>): Promise<void> {
    const projectRef = doc(db, COLLECTIONS.PROJECTS, projectId);
    await updateDoc(projectRef, {
      ...data,
      updatedAt: Timestamp.now(),
    });
  },

  async delete(projectId: string): Promise<void> {
    const projectRef = doc(db, COLLECTIONS.PROJECTS, projectId);
    await deleteDoc(projectRef);
  },
};

// Test Suite operations
export const testSuiteService = {
  async create(data: Partial<TestSuite>): Promise<string> {
    const suiteRef = doc(collection(db, COLLECTIONS.TEST_SUITES));
    const suiteData = {
      ...data,
      id: suiteRef.id,
      createdAt: Timestamp.now(),
    };
    await setDoc(suiteRef, suiteData);
    return suiteRef.id;
  },

  async get(suiteId: string): Promise<TestSuite | null> {
    const suiteRef = doc(db, COLLECTIONS.TEST_SUITES, suiteId);
    const suiteSnap = await getDoc(suiteRef);
    if (suiteSnap.exists()) {
      const data = suiteSnap.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate(),
      } as TestSuite;
    }
    return null;
  },

  async listByProject(projectId: string): Promise<TestSuite[]> {
    const q = query(
      collection(db, COLLECTIONS.TEST_SUITES),
      where('projectId', '==', projectId),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate(),
      } as TestSuite;
    });
  },
};

// Test Run operations
export const testRunService = {
  async create(data: Partial<TestRun>): Promise<string> {
    const runRef = doc(collection(db, COLLECTIONS.TEST_RUNS));
    const runData = {
      ...data,
      id: runRef.id,
      status: 'pending',
      passed: 0,
      failed: 0,
      skipped: 0,
      passRate: 0,
      duration: 0,
      startedAt: Timestamp.now(),
    };
    await setDoc(runRef, runData);
    return runRef.id;
  },

  async get(runId: string): Promise<TestRun | null> {
    const runRef = doc(db, COLLECTIONS.TEST_RUNS, runId);
    const runSnap = await getDoc(runRef);
    if (runSnap.exists()) {
      const data = runSnap.data();
      return {
        ...data,
        startedAt: data.startedAt?.toDate(),
        completedAt: data.completedAt?.toDate(),
      } as TestRun;
    }
    return null;
  },

  async update(runId: string, data: Partial<TestRun>): Promise<void> {
    const runRef = doc(db, COLLECTIONS.TEST_RUNS, runId);
    await updateDoc(runRef, data);
  },

  async complete(runId: string, results: { passed: number; failed: number; skipped: number; duration: number }): Promise<void> {
    const runRef = doc(db, COLLECTIONS.TEST_RUNS, runId);
    const total = results.passed + results.failed + results.skipped;
    await updateDoc(runRef, {
      ...results,
      status: results.failed > 0 ? 'failed' : 'completed',
      passRate: total > 0 ? (results.passed / total) * 100 : 0,
      completedAt: Timestamp.now(),
    });
  },

  async listByProject(projectId: string, limitCount = 10): Promise<TestRun[]> {
    const q = query(
      collection(db, COLLECTIONS.TEST_RUNS),
      where('projectId', '==', projectId),
      orderBy('startedAt', 'desc'),
      limit(limitCount)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        startedAt: data.startedAt?.toDate(),
        completedAt: data.completedAt?.toDate(),
      } as TestRun;
    });
  },

  async listByUser(userId: string, limitCount = 20): Promise<TestRun[]> {
    const q = query(
      collection(db, COLLECTIONS.TEST_RUNS),
      where('userId', '==', userId),
      orderBy('startedAt', 'desc'),
      limit(limitCount)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        startedAt: data.startedAt?.toDate(),
        completedAt: data.completedAt?.toDate(),
      } as TestRun;
    });
  },
};

export default {
  userService,
  projectService,
  testSuiteService,
  testRunService,
};
