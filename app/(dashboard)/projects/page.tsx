'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../hooks/useAuth';
import { projectService, Project } from '../../../src/services/firestore';

export default function ProjectsPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    async function loadProjects() {
      if (!user) return;
      try {
        const data = await projectService.listByUser(user.uid);
        setProjects(data);
      } catch (error) {
        console.error('Error loading projects:', error);
      } finally {
        setIsLoading(false);
      }
    }
    if (user) {
      loadProjects();
    }
  }, [user]);

  const handleDelete = async (projectId: string) => {
    try {
      await projectService.delete(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
      </div>
    );
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
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="text-gray-600 mt-1">Manage your testing projects</p>
          </div>
          <Link href="/projects/new" className="btn btn-primary">
            <span className="mr-2">+</span> New Project
          </Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
          </div>
        ) : projects.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="card hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-semibold text-lg text-gray-900">{project.name}</h3>
                  <span className={`badge ${project.framework === 'react' ? 'badge-info' : project.framework === 'angular' ? 'badge-danger' : project.framework === 'nextjs' ? 'badge-success' : 'badge-secondary'}`}>
                    {project.framework || 'Web'}
                  </span>
                </div>

                <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                  {project.description || 'No description provided'}
                </p>

                <div className="text-sm text-gray-500 mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-4">🔗</span>
                    <span className="truncate">{project.baseUrl}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span>{project.userRoles?.length || 0} roles</span>
                    <span>{project.features?.length || 0} features</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <span className="text-xs text-gray-400">
                    Updated {project.updatedAt?.toLocaleDateString()}
                  </span>
                  <div className="flex gap-2">
                    {deleteConfirm === project.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(project.id)}
                          className="text-red-600 text-sm font-medium hover:underline"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="text-gray-600 text-sm hover:underline"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <Link
                          href={`/projects/${project.id}`}
                          className="text-indigo-600 text-sm font-medium hover:underline"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => setDeleteConfirm(project.id)}
                          className="text-red-600 text-sm hover:underline"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card text-center py-12">
            <div className="text-6xl mb-4">📋</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No projects yet</h3>
            <p className="text-gray-600 mb-6">
              Create your first project to start generating intelligent test cases
            </p>
            <Link href="/projects/new" className="btn btn-primary">
              Create Your First Project
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
