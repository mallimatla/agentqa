'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../hooks/useAuth';
import { projectService, testRunService, Project, TestRun } from '../../../src/services/firestore';

export default function DashboardPage() {
  const { user, profile, loading, logout } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentRuns, setRecentRuns] = useState<TestRun[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      try {
        const [projectsData, runsData] = await Promise.all([
          projectService.listByUser(user.uid),
          testRunService.listByUser(user.uid, 5),
        ]);
        setProjects(projectsData);
        setRecentRuns(runsData);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setIsLoadingData(false);
      }
    }
    if (user) {
      loadData();
    }
  }, [user]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
      </div>
    );
  }

  const totalTests = recentRuns.reduce((sum, run) => sum + run.passed + run.failed + run.skipped, 0);
  const totalPassed = recentRuns.reduce((sum, run) => sum + run.passed, 0);
  const avgPassRate = recentRuns.length > 0
    ? recentRuns.reduce((sum, run) => sum + run.passRate, 0) / recentRuns.length
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold">Q</span>
                </div>
                <span className="font-bold text-lg text-gray-800">AgentQA</span>
              </Link>
              <nav className="hidden md:flex items-center gap-6 ml-8">
                <Link href="/dashboard" className="text-indigo-600 font-medium">
                  Dashboard
                </Link>
                <Link href="/projects" className="text-gray-600 hover:text-gray-800">
                  Projects
                </Link>
                <Link href="/tests" className="text-gray-600 hover:text-gray-800">
                  Test Runs
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {profile?.displayName || user.email}
              </span>
              <button
                onClick={logout}
                className="text-gray-600 hover:text-gray-800 text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {profile?.displayName || 'there'}!
          </h1>
          <p className="text-gray-600 mt-1">
            Here's what's happening with your tests
          </p>
        </div>

        {/* Stats Grid */}
        <div className="stats-grid mb-8">
          <div className="stat-card">
            <div className="stat-value">{projects.length}</div>
            <div className="stat-label">Projects</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totalTests}</div>
            <div className="stat-label">Tests Run</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#10b981' }}>{totalPassed}</div>
            <div className="stat-label">Tests Passed</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{avgPassRate.toFixed(1)}%</div>
            <div className="stat-label">Avg Pass Rate</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card mb-8">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-4">
            <Link href="/projects/new" className="btn btn-primary">
              <span>+</span> New Project
            </Link>
            <Link href="/projects" className="btn btn-secondary">
              View All Projects
            </Link>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Recent Projects */}
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Recent Projects</h2>
              <Link href="/projects" className="text-indigo-600 text-sm hover:underline">
                View All
              </Link>
            </div>

            {isLoadingData ? (
              <div className="flex justify-center py-8">
                <div className="spinner" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
              </div>
            ) : projects.length > 0 ? (
              <div className="space-y-3">
                {projects.slice(0, 5).map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="block p-4 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-gray-900">{project.name}</h3>
                        <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                          {project.baseUrl}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400">
                        {project.updatedAt?.toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">📋</div>
                <p className="text-gray-600 mb-4">No projects yet</p>
                <Link href="/projects/new" className="btn btn-primary">
                  Create Your First Project
                </Link>
              </div>
            )}
          </div>

          {/* Recent Test Runs */}
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Recent Test Runs</h2>
              <Link href="/tests" className="text-indigo-600 text-sm hover:underline">
                View All
              </Link>
            </div>

            {isLoadingData ? (
              <div className="flex justify-center py-8">
                <div className="spinner" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
              </div>
            ) : recentRuns.length > 0 ? (
              <div className="space-y-3">
                {recentRuns.map((run) => (
                  <div
                    key={run.id}
                    className="p-4 rounded-lg border border-gray-200"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className={`badge ${run.status === 'completed' ? 'badge-success' : run.status === 'failed' ? 'badge-danger' : 'badge-warning'}`}>
                        {run.status}
                      </span>
                      <span className="text-xs text-gray-400">
                        {run.startedAt?.toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-green-600">✓ {run.passed}</span>
                      <span className="text-red-600">✗ {run.failed}</span>
                      <span className="text-gray-400">⊘ {run.skipped}</span>
                      <span className="ml-auto font-medium">{run.passRate.toFixed(1)}%</span>
                    </div>
                    <div className="mt-2">
                      <div className="progress-bar">
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${run.passRate}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">🧪</div>
                <p className="text-gray-600">No test runs yet</p>
                <p className="text-sm text-gray-500 mt-1">
                  Create a project to start testing
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Getting Started */}
        {projects.length === 0 && (
          <div className="card mt-8 bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
            <h2 className="text-xl font-bold mb-4">Get Started with AgentQA</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <div className="text-3xl mb-2">1️⃣</div>
                <h3 className="font-semibold mb-1">Create a Project</h3>
                <p className="text-indigo-100 text-sm">
                  Define your app, user roles, and features
                </p>
              </div>
              <div>
                <div className="text-3xl mb-2">2️⃣</div>
                <h3 className="font-semibold mb-1">Generate Tests</h3>
                <p className="text-indigo-100 text-sm">
                  Our AI creates comprehensive test cases
                </p>
              </div>
              <div>
                <div className="text-3xl mb-2">3️⃣</div>
                <h3 className="font-semibold mb-1">Run & Report</h3>
                <p className="text-indigo-100 text-sm">
                  Execute tests and get detailed insights
                </p>
              </div>
            </div>
            <Link
              href="/projects/new"
              className="btn bg-white text-indigo-600 mt-6 hover:bg-gray-100"
            >
              Create Your First Project
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
