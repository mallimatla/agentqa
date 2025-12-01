'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../hooks/useAuth';
import { testRunService, projectService, TestRun, Project } from '../../../src/services/firestore';

export default function TestRunsPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [projects, setProjects] = useState<Map<string, Project>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      try {
        const runsData = await testRunService.listByUser(user.uid, 50);
        setTestRuns(runsData);

        // Load project names
        const projectIds = [...new Set(runsData.map(r => r.projectId))];
        const projectsData = await Promise.all(
          projectIds.map(id => projectService.get(id))
        );

        const projectMap = new Map<string, Project>();
        projectsData.forEach(p => {
          if (p) projectMap.set(p.id, p);
        });
        setProjects(projectMap);
      } catch (error) {
        console.error('Error loading test runs:', error);
      } finally {
        setIsLoading(false);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'badge-success';
      case 'failed':
        return 'badge-danger';
      case 'running':
        return 'badge-warning';
      default:
        return 'badge-secondary';
    }
  };

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
                <Link href="/dashboard" className="text-gray-600 hover:text-gray-800">
                  Dashboard
                </Link>
                <Link href="/projects" className="text-gray-600 hover:text-gray-800">
                  Projects
                </Link>
                <Link href="/tests" className="text-indigo-600 font-medium">
                  Test Runs
                </Link>
              </nav>
            </div>
            <button
              onClick={logout}
              className="text-gray-600 hover:text-gray-800 text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Test Runs</h1>
          <p className="text-gray-600 mt-1">View all your test execution history</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
          </div>
        ) : testRuns.length > 0 ? (
          <div className="card overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Results
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pass Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {testRuns.map((run) => {
                  const project = projects.get(run.projectId);
                  const totalTests = run.passed + run.failed + run.skipped;

                  return (
                    <tr key={run.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link
                          href={`/projects/${run.projectId}`}
                          className="text-indigo-600 hover:underline font-medium"
                        >
                          {project?.name || 'Unknown Project'}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`badge ${getStatusColor(run.status)}`}>
                          {run.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-green-600">{run.passed} passed</span>
                          <span className="text-red-600">{run.failed} failed</span>
                          <span className="text-gray-400">{run.skipped} skipped</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{ width: `${run.passRate}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">
                            {run.passRate.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {run.duration > 0 ? `${(run.duration / 1000).toFixed(1)}s` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {run.startedAt?.toLocaleDateString()} {run.startedAt?.toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        {run.reportUrl ? (
                          <a
                            href={run.reportUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:underline"
                          >
                            View Report
                          </a>
                        ) : (
                          <span className="text-gray-400">No report</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card text-center py-12">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No test runs yet</h3>
            <p className="text-gray-600 mb-6">
              Create a project and run tests to see results here
            </p>
            <Link href="/projects" className="btn btn-primary">
              View Projects
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
