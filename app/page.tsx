'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from './hooks/useAuth';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-xl">Q</span>
              </div>
              <span className="font-bold text-xl text-gray-800">AgentQA</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login" className="text-gray-600 hover:text-gray-800 font-medium">
                Sign In
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Get Started Free
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-full text-sm font-medium mb-8">
            <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
            Powered by Intelligent Test Generation
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Test Like{' '}
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              1000 Expert Testers
            </span>
          </h1>

          <p className="text-xl text-gray-600 mb-10 max-w-3xl mx-auto">
            AgentQA automatically generates comprehensive test strategies, scenarios, and test cases
            for your web application. Positive, negative, boundary, and edge case testing — all automated.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link href="/signup" className="btn btn-primary text-lg px-8 py-4">
              Start Testing Free
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link href="#features" className="btn btn-outline text-lg px-8 py-4">
              See How It Works
            </Link>
          </div>

          {/* Stats */}
          <div className="stats-grid max-w-4xl mx-auto">
            <div className="stat-card">
              <div className="stat-value">10x</div>
              <div className="stat-label">Faster Test Creation</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">100%</div>
              <div className="stat-label">Coverage Analysis</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">24/7</div>
              <div className="stat-label">Automated Testing</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">0</div>
              <div className="stat-label">Setup Required</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Everything You Need</h2>
          <p className="text-gray-600 text-center mb-16 max-w-2xl mx-auto">
            From test strategy to execution, AgentQA handles the entire testing lifecycle
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="card hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white text-2xl mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">How It Works</h2>
          <p className="text-gray-600 text-center mb-16 max-w-2xl mx-auto">
            Get comprehensive test coverage in three simple steps
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6">
                  {index + 1}
                </div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-indigo-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Transform Your Testing?
          </h2>
          <p className="text-indigo-100 text-lg mb-8">
            Join thousands of teams using AgentQA to ship quality software faster.
          </p>
          <Link href="/signup" className="btn bg-white text-indigo-600 text-lg px-8 py-4 hover:bg-gray-100">
            Get Started — It's Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 bg-gray-900 text-gray-400">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">Q</span>
            </div>
            <span className="font-bold text-lg text-white">AgentQA</span>
          </div>
          <p className="mb-4">Intelligent Web Application Testing Platform</p>
          <p className="text-sm">© 2024 AgentQA. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

const features = [
  {
    icon: '🧠',
    title: 'Intelligent Test Generation',
    description: 'AI-powered engine generates test strategies, scenarios, and test cases from your user stories and features.',
  },
  {
    icon: '✅',
    title: 'Positive & Negative Tests',
    description: 'Automatically creates both happy path and error scenarios including boundary and edge cases.',
  },
  {
    icon: '👥',
    title: 'Multi-Role Testing',
    description: 'Test across different user personas with role-based access verification and permission testing.',
  },
  {
    icon: '🔒',
    title: 'Security Testing',
    description: 'Built-in security tests for SQL injection, XSS, and authorization bypass attempts.',
  },
  {
    icon: '📊',
    title: 'Beautiful Reports',
    description: 'Comprehensive dashboards with coverage metrics, recommendations, and exportable reports.',
  },
  {
    icon: '🚀',
    title: 'CI/CD Ready',
    description: 'Integrate with your existing workflows using our API and webhook support.',
  },
];

const steps = [
  {
    title: 'Define Your App',
    description: 'Tell us about your application, user roles, features, and critical flows using our intuitive wizard.',
  },
  {
    title: 'Generate Tests',
    description: 'Our AI engine creates comprehensive test strategies and generates hundreds of test cases automatically.',
  },
  {
    title: 'Execute & Report',
    description: 'Run tests with a single click and get detailed reports with coverage analysis and recommendations.',
  },
];
