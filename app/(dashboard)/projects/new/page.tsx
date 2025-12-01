'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../hooks/useAuth';
import { projectService } from '../../../../src/services/firestore';

interface UserRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  accessLevel: string;
  credentials: { username: string; password: string };
}

interface Feature {
  id: string;
  name: string;
  description: string;
  module: string;
}

interface UserStory {
  id: string;
  title: string;
  description: string;
  asA: string;
  iWant: string;
  soThat: string;
  priority: string;
}

export default function NewProjectPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [projectData, setProjectData] = useState({
    name: '',
    description: '',
    baseUrl: '',
    framework: 'other',
  });

  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [userStories, setUserStories] = useState<UserStory[]>([]);
  const [testingScope, setTestingScope] = useState({
    includePositive: true,
    includeNegative: true,
    includeBoundary: true,
    includeEdgeCases: true,
    includeAccessibility: false,
    includeSecurity: true,
    includePerformance: false,
    testDepth: 'standard',
  });

  // Temp state for adding items
  const [newRole, setNewRole] = useState<Partial<UserRole>>({});
  const [newFeature, setNewFeature] = useState<Partial<Feature>>({});
  const [newStory, setNewStory] = useState<Partial<UserStory>>({});

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
      </div>
    );
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  const addRole = () => {
    if (newRole.name) {
      setUserRoles([
        ...userRoles,
        {
          id: `role-${Date.now()}`,
          name: newRole.name || '',
          description: newRole.description || '',
          permissions: [],
          accessLevel: newRole.accessLevel || 'user',
          credentials: {
            username: newRole.credentials?.username || '',
            password: newRole.credentials?.password || '',
          },
        },
      ]);
      setNewRole({});
    }
  };

  const addFeature = () => {
    if (newFeature.name) {
      setFeatures([
        ...features,
        {
          id: `feature-${Date.now()}`,
          name: newFeature.name || '',
          description: newFeature.description || '',
          module: newFeature.module || 'General',
        },
      ]);
      setNewFeature({});
    }
  };

  const addStory = () => {
    if (newStory.title) {
      setUserStories([
        ...userStories,
        {
          id: `story-${Date.now()}`,
          title: newStory.title || '',
          description: newStory.description || '',
          asA: newStory.asA || '',
          iWant: newStory.iWant || '',
          soThat: newStory.soThat || '',
          priority: newStory.priority || 'medium',
        },
      ]);
      setNewStory({});
    }
  };

  const handleSubmit = async () => {
    if (!projectData.name || !projectData.baseUrl) {
      alert('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const project = await projectService.create({
        userId: user.uid,
        name: projectData.name,
        description: projectData.description,
        baseUrl: projectData.baseUrl,
        framework: projectData.framework,
        userRoles,
        userStories,
        features,
        criticalFlows: [],
        testingScope,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      router.push(`/projects/${project.id}`);
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/projects" className="flex items-center gap-2 text-gray-600 hover:text-gray-800">
              <span>&larr;</span> Back to Projects
            </Link>
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            {['Basic Info', 'User Roles', 'Features', 'User Stories', 'Testing Scope'].map((label, idx) => (
              <div
                key={label}
                className={`flex items-center ${idx > 0 ? 'flex-1' : ''}`}
              >
                {idx > 0 && (
                  <div className={`flex-1 h-1 mx-2 ${step > idx ? 'bg-indigo-600' : 'bg-gray-200'}`} />
                )}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step > idx + 1
                      ? 'bg-indigo-600 text-white'
                      : step === idx + 1
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {idx + 1}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>Basic Info</span>
            <span>User Roles</span>
            <span>Features</span>
            <span>User Stories</span>
            <span>Testing Scope</span>
          </div>
        </div>
      </div>

      {/* Form Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="card">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold mb-6">Project Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="My E-Commerce App"
                    value={projectData.name}
                    onChange={(e) => setProjectData({ ...projectData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="A brief description of your application"
                    value={projectData.description}
                    onChange={(e) => setProjectData({ ...projectData, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Base URL *
                  </label>
                  <input
                    type="url"
                    className="input"
                    placeholder="https://myapp.com"
                    value={projectData.baseUrl}
                    onChange={(e) => setProjectData({ ...projectData, baseUrl: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Framework
                  </label>
                  <select
                    className="input"
                    value={projectData.framework}
                    onChange={(e) => setProjectData({ ...projectData, framework: e.target.value })}
                  >
                    <option value="react">React</option>
                    <option value="angular">Angular</option>
                    <option value="nextjs">Next.js</option>
                    <option value="vue">Vue.js</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: User Roles */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold mb-6">User Roles</h2>
              <p className="text-gray-600 mb-4">
                Define the different user roles in your application (e.g., Admin, User, Guest)
              </p>

              {userRoles.length > 0 && (
                <div className="space-y-3 mb-6">
                  {userRoles.map((role) => (
                    <div key={role.id} className="p-4 bg-gray-50 rounded-lg flex justify-between items-center">
                      <div>
                        <span className="font-medium">{role.name}</span>
                        <span className="ml-2 text-sm text-gray-500">({role.accessLevel})</span>
                        {role.credentials.username && (
                          <p className="text-sm text-gray-500">
                            Credentials: {role.credentials.username}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => setUserRoles(userRoles.filter(r => r.id !== role.id))}
                        className="text-red-600 hover:underline text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">Add New Role</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role Name</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Admin"
                      value={newRole.name || ''}
                      onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Access Level</label>
                    <select
                      className="input"
                      value={newRole.accessLevel || 'user'}
                      onChange={(e) => setNewRole({ ...newRole, accessLevel: e.target.value })}
                    >
                      <option value="admin">Admin</option>
                      <option value="user">User</option>
                      <option value="guest">Guest</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username/Email</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="admin@test.com"
                      value={newRole.credentials?.username || ''}
                      onChange={(e) => setNewRole({
                        ...newRole,
                        credentials: { ...newRole.credentials, username: e.target.value, password: newRole.credentials?.password || '' }
                      })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input
                      type="password"
                      className="input"
                      placeholder="password123"
                      value={newRole.credentials?.password || ''}
                      onChange={(e) => setNewRole({
                        ...newRole,
                        credentials: { ...newRole.credentials, password: e.target.value, username: newRole.credentials?.username || '' }
                      })}
                    />
                  </div>
                </div>
                <button onClick={addRole} className="btn btn-secondary mt-4">
                  + Add Role
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Features */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold mb-6">Features</h2>
              <p className="text-gray-600 mb-4">
                List the main features of your application that need testing
              </p>

              {features.length > 0 && (
                <div className="space-y-3 mb-6">
                  {features.map((feature) => (
                    <div key={feature.id} className="p-4 bg-gray-50 rounded-lg flex justify-between items-center">
                      <div>
                        <span className="font-medium">{feature.name}</span>
                        <span className="ml-2 text-sm text-gray-500">({feature.module})</span>
                        <p className="text-sm text-gray-500">{feature.description}</p>
                      </div>
                      <button
                        onClick={() => setFeatures(features.filter(f => f.id !== feature.id))}
                        className="text-red-600 hover:underline text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">Add New Feature</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Feature Name</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="User Login"
                        value={newFeature.name || ''}
                        onChange={(e) => setNewFeature({ ...newFeature, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Module</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Authentication"
                        value={newFeature.module || ''}
                        onChange={(e) => setNewFeature({ ...newFeature, module: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      className="input"
                      rows={2}
                      placeholder="User authentication via email and password"
                      value={newFeature.description || ''}
                      onChange={(e) => setNewFeature({ ...newFeature, description: e.target.value })}
                    />
                  </div>
                </div>
                <button onClick={addFeature} className="btn btn-secondary mt-4">
                  + Add Feature
                </button>
              </div>
            </div>
          )}

          {/* Step 4: User Stories */}
          {step === 4 && (
            <div>
              <h2 className="text-xl font-bold mb-6">User Stories</h2>
              <p className="text-gray-600 mb-4">
                Define user stories that describe the functionality from a user's perspective
              </p>

              {userStories.length > 0 && (
                <div className="space-y-3 mb-6">
                  {userStories.map((story) => (
                    <div key={story.id} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-medium">{story.title}</span>
                          <span className={`ml-2 badge ${story.priority === 'critical' ? 'badge-danger' : story.priority === 'high' ? 'badge-warning' : 'badge-secondary'}`}>
                            {story.priority}
                          </span>
                        </div>
                        <button
                          onClick={() => setUserStories(userStories.filter(s => s.id !== story.id))}
                          className="text-red-600 hover:underline text-sm"
                        >
                          Remove
                        </button>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        As a <strong>{story.asA}</strong>, I want to <strong>{story.iWant}</strong>, so that <strong>{story.soThat}</strong>
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">Add New User Story</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="User Login"
                        value={newStory.title || ''}
                        onChange={(e) => setNewStory({ ...newStory, title: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                      <select
                        className="input"
                        value={newStory.priority || 'medium'}
                        onChange={(e) => setNewStory({ ...newStory, priority: e.target.value })}
                      >
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">As a...</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="registered user"
                      value={newStory.asA || ''}
                      onChange={(e) => setNewStory({ ...newStory, asA: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">I want to...</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="log into my account"
                      value={newStory.iWant || ''}
                      onChange={(e) => setNewStory({ ...newStory, iWant: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">So that...</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="I can access my dashboard"
                      value={newStory.soThat || ''}
                      onChange={(e) => setNewStory({ ...newStory, soThat: e.target.value })}
                    />
                  </div>
                </div>
                <button onClick={addStory} className="btn btn-secondary mt-4">
                  + Add User Story
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Testing Scope */}
          {step === 5 && (
            <div>
              <h2 className="text-xl font-bold mb-6">Testing Scope</h2>
              <p className="text-gray-600 mb-4">
                Configure what types of tests should be generated
              </p>

              <div className="space-y-4">
                <h3 className="font-medium">Test Types</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: 'includePositive', label: 'Positive Tests', desc: 'Tests with valid inputs' },
                    { key: 'includeNegative', label: 'Negative Tests', desc: 'Tests with invalid inputs' },
                    { key: 'includeBoundary', label: 'Boundary Tests', desc: 'Tests at input boundaries' },
                    { key: 'includeEdgeCases', label: 'Edge Cases', desc: 'Unusual scenarios' },
                    { key: 'includeSecurity', label: 'Security Tests', desc: 'Security vulnerability checks' },
                    { key: 'includeAccessibility', label: 'Accessibility Tests', desc: 'WCAG compliance checks' },
                    { key: 'includePerformance', label: 'Performance Tests', desc: 'Load and speed tests' },
                  ].map(({ key, label, desc }) => (
                    <label key={key} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                      <input
                        type="checkbox"
                        checked={testingScope[key as keyof typeof testingScope] as boolean}
                        onChange={(e) => setTestingScope({ ...testingScope, [key]: e.target.checked })}
                        className="mt-1"
                      />
                      <div>
                        <span className="font-medium">{label}</span>
                        <p className="text-sm text-gray-500">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test Depth</label>
                  <select
                    className="input"
                    value={testingScope.testDepth}
                    onChange={(e) => setTestingScope({ ...testingScope, testDepth: e.target.value })}
                  >
                    <option value="shallow">Shallow - Quick smoke tests</option>
                    <option value="standard">Standard - Comprehensive testing</option>
                    <option value="deep">Deep - Exhaustive testing</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8 pt-6 border-t">
            <button
              onClick={() => setStep(Math.max(1, step - 1))}
              className="btn btn-secondary"
              disabled={step === 1}
            >
              Previous
            </button>
            {step < 5 ? (
              <button
                onClick={() => setStep(Math.min(5, step + 1))}
                className="btn btn-primary"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating...' : 'Create Project'}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
