'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../hooks/useAuth';
import { projectService, testSuiteService, testRunService, Project, TestSuite, TestRun } from '../../../../src/services/firestore';

interface GenerationResult {
  strategy: any;
  suite: any;
  report: any;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [testSuites, setTestSuites] = useState<TestSuite[]>([]);
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'tests' | 'runs'>('overview');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      try {
        const [projectData, suitesData, runsData] = await Promise.all([
          projectService.get(resolvedParams.id),
          testSuiteService.listByProject(resolvedParams.id),
          testRunService.listByProject(resolvedParams.id, 10),
        ]);

        if (!projectData) {
          router.push('/projects');
          return;
        }

        setProject(projectData);
        setTestSuites(suitesData);
        setTestRuns(runsData);
      } catch (error) {
        console.error('Error loading project:', error);
      } finally {
        setIsLoading(false);
      }
    }
    if (user) {
      loadData();
    }
  }, [user, resolvedParams.id, router]);

  const handleGenerateTests = async () => {
    if (!user || !project) return;

    setIsGenerating(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/projects/${project.id}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error('Failed to generate tests');
      }

      const result = await response.json();
      setGenerationResult(result);

      // Reload test suites
      const suitesData = await testSuiteService.listByProject(project.id);
      setTestSuites(suitesData);
    } catch (error) {
      console.error('Error generating tests:', error);
      alert('Failed to generate tests. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExecuteTests = async (testSuiteId: string) => {
    if (!user || !project) return;

    setIsExecuting(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/projects/${project.id}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ testSuiteId }),
      });

      if (!response.ok) {
        throw new Error('Failed to start test execution');
      }

      const result = await response.json();
      alert(`Test run started! Run ID: ${result.runId}`);

      // Reload test runs
      const runsData = await testRunService.listByProject(project.id, 10);
      setTestRuns(runsData);
    } catch (error) {
      console.error('Error executing tests:', error);
      alert('Failed to start test execution. Please try again.');
    } finally {
      setIsExecuting(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
      </div>
    );
  }

  if (!user || !project) {
    return null;
  }

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
                <Link href="/projects" className="text-indigo-600 font-medium">
                  Projects
                </Link>
                <Link href="/tests" className="text-gray-600 hover:text-gray-800">
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
        {/* Project Header */}
        <div className="card mb-8">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Link href="/projects" className="text-gray-400 hover:text-gray-600">
                  &larr;
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                <span className={`badge ${project.framework === 'react' ? 'badge-info' : project.framework === 'angular' ? 'badge-danger' : 'badge-secondary'}`}>
                  {project.framework || 'Web'}
                </span>
              </div>
              <p className="text-gray-600">{project.description || 'No description'}</p>
              <a
                href={project.baseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline text-sm inline-block mt-2"
              >
                {project.baseUrl} &rarr;
              </a>
            </div>
            <button
              onClick={handleGenerateTests}
              className="btn btn-primary"
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <div className="spinner mr-2" style={{ width: 16, height: 16 }} />
                  Generating...
                </>
              ) : (
                'Generate Tests'
              )}
            </button>
          </div>
        </div>

        {/* Generation Result */}
        {generationResult && (
          <div className="card mb-8 bg-green-50 border-green-200">
            <h3 className="font-semibold text-green-800 mb-4">Test Generation Complete!</h3>
            <div className="grid md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-700">{generationResult.suite.scenarios}</div>
                <div className="text-sm text-green-600">Scenarios</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-700">{generationResult.suite.testCases}</div>
                <div className="text-sm text-green-600">Test Cases</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-700">{generationResult.suite.coverage.positiveTests}</div>
                <div className="text-sm text-green-600">Positive Tests</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-700">{generationResult.suite.coverage.negativeTests}</div>
                <div className="text-sm text-green-600">Negative Tests</div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-8">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'tests', label: `Test Suites (${testSuites.length})` },
              { id: 'runs', label: `Test Runs (${testRuns.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* User Roles */}
            <div className="card">
              <h3 className="font-semibold mb-4">User Roles ({project.userRoles?.length || 0})</h3>
              {project.userRoles?.length > 0 ? (
                <div className="space-y-2">
                  {project.userRoles.map((role: any) => (
                    <div key={role.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="font-medium">{role.name}</span>
                      <span className="badge badge-secondary">{role.accessLevel}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No user roles defined</p>
              )}
            </div>

            {/* Features */}
            <div className="card">
              <h3 className="font-semibold mb-4">Features ({project.features?.length || 0})</h3>
              {project.features?.length > 0 ? (
                <div className="space-y-2">
                  {project.features.map((feature: any) => (
                    <div key={feature.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex justify-between">
                        <span className="font-medium">{feature.name}</span>
                        <span className="text-sm text-gray-500">{feature.module}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{feature.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No features defined</p>
              )}
            </div>

            {/* User Stories */}
            <div className="card md:col-span-2">
              <h3 className="font-semibold mb-4">User Stories ({project.userStories?.length || 0})</h3>
              {project.userStories?.length > 0 ? (
                <div className="space-y-3">
                  {project.userStories.map((story: any) => (
                    <div key={story.id} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium">{story.title}</span>
                        <span className={`badge ${story.priority === 'critical' ? 'badge-danger' : story.priority === 'high' ? 'badge-warning' : 'badge-secondary'}`}>
                          {story.priority}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        As a <strong>{story.asA}</strong>, I want to <strong>{story.iWant}</strong>, so that <strong>{story.soThat}</strong>
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No user stories defined</p>
              )}
            </div>

            {/* Testing Scope */}
            <div className="card md:col-span-2">
              <h3 className="font-semibold mb-4">Testing Scope</h3>
              <div className="flex flex-wrap gap-2">
                {project.testingScope?.includePositive && <span className="badge badge-success">Positive Tests</span>}
                {project.testingScope?.includeNegative && <span className="badge badge-warning">Negative Tests</span>}
                {project.testingScope?.includeBoundary && <span className="badge badge-info">Boundary Tests</span>}
                {project.testingScope?.includeEdgeCases && <span className="badge badge-secondary">Edge Cases</span>}
                {project.testingScope?.includeSecurity && <span className="badge badge-danger">Security Tests</span>}
                {project.testingScope?.includeAccessibility && <span className="badge badge-info">Accessibility</span>}
                {project.testingScope?.includePerformance && <span className="badge badge-warning">Performance</span>}
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Test Depth: {project.testingScope?.testDepth || 'standard'}
              </p>
            </div>
          </div>
        )}

        {activeTab === 'tests' && (
          <div>
            {testSuites.length > 0 ? (
              <div className="space-y-4">
                {testSuites.map((suite) => (
                  <div key={suite.id} className="card">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-lg">{suite.name}</h3>
                        <p className="text-gray-600 text-sm mt-1">{suite.description}</p>
                        <div className="flex gap-4 mt-3 text-sm">
                          <span className="text-gray-500">
                            {suite.scenarios} scenarios
                          </span>
                          <span className="text-gray-500">
                            {suite.testCases?.length || 0} test cases
                          </span>
                          <span className="text-green-600">
                            {suite.coverage?.positiveTests || 0} positive
                          </span>
                          <span className="text-red-600">
                            {suite.coverage?.negativeTests || 0} negative
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleExecuteTests(suite.id)}
                        className="btn btn-primary"
                        disabled={isExecuting}
                      >
                        {isExecuting ? 'Starting...' : 'Run Tests'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card text-center py-12">
                <div className="text-4xl mb-4">🧪</div>
                <h3 className="text-lg font-semibold mb-2">No Test Suites Yet</h3>
                <p className="text-gray-600 mb-4">Generate your first test suite to get started</p>
                <button
                  onClick={handleGenerateTests}
                  className="btn btn-primary"
                  disabled={isGenerating}
                >
                  Generate Tests
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'runs' && (
          <div>
            {testRuns.length > 0 ? (
              <div className="space-y-4">
                {testRuns.map((run) => (
                  <div key={run.id} className="card">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className={`badge ${run.status === 'completed' ? 'badge-success' : run.status === 'failed' ? 'badge-danger' : run.status === 'running' ? 'badge-warning' : 'badge-secondary'}`}>
                          {run.status}
                        </span>
                        <span className="text-sm text-gray-500 ml-3">
                          {run.startedAt?.toLocaleString()}
                        </span>
                      </div>
                      {run.reportUrl && (
                        <a
                          href={run.reportUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline text-sm"
                        >
                          View Report &rarr;
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <span className="text-green-600 font-medium">{run.passed}</span>
                        <span className="text-gray-400">passed</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-red-600 font-medium">{run.failed}</span>
                        <span className="text-gray-400">failed</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600 font-medium">{run.skipped}</span>
                        <span className="text-gray-400">skipped</span>
                      </div>
                      <div className="ml-auto">
                        <span className="text-lg font-semibold">{run.passRate.toFixed(1)}%</span>
                        <span className="text-gray-400 text-sm ml-1">pass rate</span>
                      </div>
                    </div>
                    <div className="mt-3">
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
              <div className="card text-center py-12">
                <div className="text-4xl mb-4">📊</div>
                <h3 className="text-lg font-semibold mb-2">No Test Runs Yet</h3>
                <p className="text-gray-600">Generate and run tests to see results here</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
