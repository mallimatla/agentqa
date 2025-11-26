/**
 * AgentQA Dashboard Reporter
 * Generates comprehensive HTML dashboards and JSON reports
 */

import * as fs from 'fs';
import * as path from 'path';
import express, { Express, Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import open from 'open';
import {
  TestSuiteResult,
  TestCaseResult,
  Issue,
  DashboardData,
  DiscoveryResult,
  ReportConfig,
} from '../../types';
import { logger, console_log } from '../../utils/logger';

/**
 * Dashboard Reporter class
 */
export class DashboardReporter {
  private reportsDir: string;
  private config: ReportConfig;
  private app: Express | null = null;
  private server: any = null;
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();

  constructor(config: Partial<ReportConfig> = {}) {
    this.config = {
      format: config.format || 'both',
      outputDir: config.outputDir || path.join(process.cwd(), 'reports'),
      includeScreenshots: config.includeScreenshots ?? true,
      includeVideos: config.includeVideos ?? true,
      includeTraces: config.includeTraces ?? true,
      openAfterGeneration: config.openAfterGeneration ?? true,
      title: config.title || 'AgentQA Test Report',
      ...config,
    };

    this.reportsDir = this.config.outputDir;
    this.ensureDirectories();
  }

  /**
   * Ensure output directories exist
   */
  private ensureDirectories(): void {
    const dirs = [
      this.reportsDir,
      path.join(this.reportsDir, 'html'),
      path.join(this.reportsDir, 'json'),
      path.join(this.reportsDir, 'screenshots'),
      path.join(this.reportsDir, 'videos'),
      path.join(this.reportsDir, 'traces'),
    ];

    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Generate report from test results
   */
  async generateReport(
    results: TestSuiteResult,
    discovery?: DiscoveryResult,
    issues?: Issue[]
  ): Promise<{ htmlPath?: string; jsonPath?: string }> {
    console_log.title('Generating Test Reports');

    const dashboardData = this.buildDashboardData(results, discovery, issues || []);
    const paths: { htmlPath?: string; jsonPath?: string } = {};

    // Generate JSON report
    if (this.config.format === 'json' || this.config.format === 'both') {
      paths.jsonPath = await this.generateJSONReport(dashboardData);
      console_log.success(`JSON report: ${paths.jsonPath}`);
    }

    // Generate HTML dashboard
    if (this.config.format === 'html' || this.config.format === 'both') {
      paths.htmlPath = await this.generateHTMLDashboard(dashboardData);
      console_log.success(`HTML dashboard: ${paths.htmlPath}`);
    }

    // Open report if configured
    if (this.config.openAfterGeneration && paths.htmlPath) {
      await open(paths.htmlPath);
    }

    return paths;
  }

  /**
   * Build dashboard data from results
   */
  private buildDashboardData(
    results: TestSuiteResult,
    discovery?: DiscoveryResult,
    issues: Issue[] = []
  ): DashboardData {
    return {
      summary: {
        totalTests: results.passed + results.failed + results.skipped,
        passed: results.passed,
        failed: results.failed,
        skipped: results.skipped,
        passRate: results.passRate,
        duration: results.duration,
        lastRun: results.endTime,
      },
      trends: [], // TODO: Implement historical tracking
      testResults: [results],
      issues,
      coverage: discovery
        ? {
            pages: discovery.statistics.totalPages,
            elements: discovery.statistics.totalElements,
            forms: discovery.statistics.totalForms,
            percentage: discovery.statistics.coverage,
          }
        : { pages: 0, elements: 0, forms: 0, percentage: 0 },
    };
  }

  /**
   * Generate JSON report
   */
  private async generateJSONReport(data: DashboardData): Promise<string> {
    const jsonPath = path.join(this.reportsDir, 'json', `report-${Date.now()}.json`);

    const report = {
      metadata: {
        title: this.config.title,
        generatedAt: new Date().toISOString(),
        version: '1.0.0',
      },
      summary: data.summary,
      testResults: data.testResults.map((suite) => ({
        suiteId: suite.suiteId,
        suiteName: suite.suiteName,
        status: suite.status,
        duration: suite.duration,
        passed: suite.passed,
        failed: suite.failed,
        skipped: suite.skipped,
        passRate: suite.passRate,
        environment: suite.environment,
        tests: suite.testResults.map((test) => ({
          testId: test.testId,
          testName: test.testName,
          status: test.status,
          duration: test.duration,
          error: test.error,
          screenshot: test.screenshot,
          video: test.video,
          steps: test.steps,
        })),
      })),
      issues: data.issues,
      coverage: data.coverage,
    };

    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    // Also create latest.json for easy access
    const latestPath = path.join(this.reportsDir, 'json', 'latest.json');
    fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));

    return jsonPath;
  }

  /**
   * Generate HTML dashboard
   */
  private async generateHTMLDashboard(data: DashboardData): Promise<string> {
    const htmlPath = path.join(this.reportsDir, 'html', 'index.html');
    const html = this.generateDashboardHTML(data);
    fs.writeFileSync(htmlPath, html);
    return htmlPath;
  }

  /**
   * Generate dashboard HTML content
   */
  private generateDashboardHTML(data: DashboardData): string {
    const { summary, testResults, issues, coverage } = data;
    const suiteResults = testResults[0];

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.config.title}</title>
  <style>
    :root {
      --primary: #3b82f6;
      --success: #22c55e;
      --danger: #ef4444;
      --warning: #f59e0b;
      --gray-100: #f3f4f6;
      --gray-200: #e5e7eb;
      --gray-300: #d1d5db;
      --gray-600: #4b5563;
      --gray-800: #1f2937;
      --gray-900: #111827;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--gray-100);
      color: var(--gray-800);
      line-height: 1.6;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
    }

    header {
      background: linear-gradient(135deg, var(--gray-900), var(--gray-800));
      color: white;
      padding: 2rem;
      margin-bottom: 2rem;
      border-radius: 1rem;
    }

    header h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }

    header p {
      color: var(--gray-300);
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: white;
      padding: 1.5rem;
      border-radius: 1rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }

    .stat-card h3 {
      font-size: 0.875rem;
      color: var(--gray-600);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .stat-card .value {
      font-size: 2rem;
      font-weight: 700;
    }

    .stat-card.passed .value { color: var(--success); }
    .stat-card.failed .value { color: var(--danger); }
    .stat-card.skipped .value { color: var(--warning); }

    .progress-bar {
      width: 100%;
      height: 8px;
      background: var(--gray-200);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 1rem;
    }

    .progress-bar .fill {
      height: 100%;
      background: var(--success);
      transition: width 0.3s ease;
    }

    .section {
      background: white;
      border-radius: 1rem;
      padding: 1.5rem;
      margin-bottom: 2rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .section h2 {
      font-size: 1.25rem;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid var(--gray-200);
    }

    .test-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .test-item {
      display: flex;
      align-items: center;
      padding: 1rem;
      background: var(--gray-100);
      border-radius: 0.5rem;
      cursor: pointer;
      transition: background 0.2s;
    }

    .test-item:hover {
      background: var(--gray-200);
    }

    .test-item .status {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 1rem;
    }

    .test-item .status.passed { background: var(--success); }
    .test-item .status.failed { background: var(--danger); }
    .test-item .status.skipped { background: var(--warning); }

    .test-item .name {
      flex: 1;
      font-weight: 500;
    }

    .test-item .duration {
      color: var(--gray-600);
      font-size: 0.875rem;
    }

    .test-item .error {
      color: var(--danger);
      font-size: 0.875rem;
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: rgba(239, 68, 68, 0.1);
      border-radius: 0.25rem;
    }

    .issue-card {
      border-left: 4px solid var(--danger);
      padding: 1rem;
      margin-bottom: 1rem;
      background: rgba(239, 68, 68, 0.05);
      border-radius: 0 0.5rem 0.5rem 0;
    }

    .issue-card h4 {
      color: var(--danger);
      margin-bottom: 0.5rem;
    }

    .issue-card p {
      color: var(--gray-600);
      font-size: 0.875rem;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge.critical { background: var(--danger); color: white; }
    .badge.high { background: var(--warning); color: white; }
    .badge.medium { background: var(--primary); color: white; }
    .badge.low { background: var(--gray-300); color: var(--gray-800); }

    .chart-container {
      height: 300px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 2rem;
      padding: 2rem;
    }

    .chart-bar {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }

    .chart-bar .bar {
      width: 60px;
      background: var(--primary);
      border-radius: 4px 4px 0 0;
      transition: height 0.3s ease;
    }

    .chart-bar.passed .bar { background: var(--success); }
    .chart-bar.failed .bar { background: var(--danger); }
    .chart-bar.skipped .bar { background: var(--warning); }

    .chart-bar .label {
      font-size: 0.875rem;
      color: var(--gray-600);
    }

    .chart-bar .value {
      font-weight: 600;
    }

    .download-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-size: 1rem;
      cursor: pointer;
      transition: background 0.2s;
    }

    .download-btn:hover {
      background: #2563eb;
    }

    .env-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }

    .env-item {
      text-align: center;
      padding: 1rem;
      background: var(--gray-100);
      border-radius: 0.5rem;
    }

    .env-item .label {
      font-size: 0.75rem;
      color: var(--gray-600);
      text-transform: uppercase;
    }

    .env-item .value {
      font-weight: 600;
      margin-top: 0.25rem;
    }

    .screenshot-gallery {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }

    .screenshot-item {
      border-radius: 0.5rem;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .screenshot-item img {
      width: 100%;
      height: auto;
      display: block;
    }

    footer {
      text-align: center;
      color: var(--gray-600);
      padding: 2rem;
      font-size: 0.875rem;
    }

    @media (max-width: 768px) {
      .container {
        padding: 1rem;
      }

      header {
        padding: 1.5rem;
      }

      header h1 {
        font-size: 1.5rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${this.config.title}</h1>
      <p>Generated: ${new Date().toLocaleString()} | Duration: ${this.formatDuration(summary.duration)}</p>
    </header>

    <!-- Summary Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <h3>Total Tests</h3>
        <div class="value">${summary.totalTests}</div>
      </div>
      <div class="stat-card passed">
        <h3>Passed</h3>
        <div class="value">${summary.passed}</div>
      </div>
      <div class="stat-card failed">
        <h3>Failed</h3>
        <div class="value">${summary.failed}</div>
      </div>
      <div class="stat-card skipped">
        <h3>Skipped</h3>
        <div class="value">${summary.skipped}</div>
      </div>
      <div class="stat-card">
        <h3>Pass Rate</h3>
        <div class="value" style="color: ${summary.passRate >= 80 ? 'var(--success)' : summary.passRate >= 50 ? 'var(--warning)' : 'var(--danger)'}">${summary.passRate.toFixed(1)}%</div>
        <div class="progress-bar">
          <div class="fill" style="width: ${summary.passRate}%"></div>
        </div>
      </div>
    </div>

    <!-- Chart -->
    <div class="section">
      <h2>Test Results Overview</h2>
      <div class="chart-container">
        <div class="chart-bar passed">
          <div class="bar" style="height: ${Math.max(20, (summary.passed / summary.totalTests) * 200)}px"></div>
          <div class="label">Passed</div>
          <div class="value">${summary.passed}</div>
        </div>
        <div class="chart-bar failed">
          <div class="bar" style="height: ${Math.max(20, (summary.failed / summary.totalTests) * 200)}px"></div>
          <div class="label">Failed</div>
          <div class="value">${summary.failed}</div>
        </div>
        <div class="chart-bar skipped">
          <div class="bar" style="height: ${Math.max(20, (summary.skipped / summary.totalTests) * 200)}px"></div>
          <div class="label">Skipped</div>
          <div class="value">${summary.skipped}</div>
        </div>
      </div>
    </div>

    <!-- Test Results -->
    <div class="section">
      <h2>Test Cases</h2>
      <div class="test-list">
        ${suiteResults?.testResults.map((test) => `
          <div class="test-item">
            <div class="status ${test.status}"></div>
            <div class="name">${test.testName}</div>
            <div class="duration">${this.formatDuration(test.duration)}</div>
          </div>
          ${test.error ? `<div class="error">${test.error}</div>` : ''}
        `).join('') || '<p>No test results available</p>'}
      </div>
    </div>

    <!-- Issues -->
    ${issues.length > 0 ? `
    <div class="section">
      <h2>Issues Found (${issues.length})</h2>
      ${issues.map((issue) => `
        <div class="issue-card">
          <span class="badge ${issue.severity}">${issue.severity}</span>
          <h4>${issue.title}</h4>
          <p>${issue.description}</p>
          <p><strong>Expected:</strong> ${issue.expected}</p>
          <p><strong>Actual:</strong> ${issue.actual}</p>
          <p><strong>URL:</strong> ${issue.url}</p>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- Coverage -->
    ${coverage.pages > 0 ? `
    <div class="section">
      <h2>Coverage</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <h3>Pages Discovered</h3>
          <div class="value">${coverage.pages}</div>
        </div>
        <div class="stat-card">
          <h3>Elements Found</h3>
          <div class="value">${coverage.elements}</div>
        </div>
        <div class="stat-card">
          <h3>Forms Found</h3>
          <div class="value">${coverage.forms}</div>
        </div>
        <div class="stat-card">
          <h3>Coverage</h3>
          <div class="value">${coverage.percentage.toFixed(1)}%</div>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Environment -->
    <div class="section">
      <h2>Environment</h2>
      <div class="env-info">
        <div class="env-item">
          <div class="label">Browser</div>
          <div class="value">${suiteResults?.environment.browser || 'N/A'}</div>
        </div>
        <div class="env-item">
          <div class="label">OS</div>
          <div class="value">${suiteResults?.environment.os || 'N/A'}</div>
        </div>
        <div class="env-item">
          <div class="label">Node.js</div>
          <div class="value">${suiteResults?.environment.nodeVersion || 'N/A'}</div>
        </div>
        <div class="env-item">
          <div class="label">Playwright</div>
          <div class="value">${suiteResults?.environment.playwrightVersion || 'N/A'}</div>
        </div>
      </div>
    </div>

    <!-- Download -->
    <div class="section" style="text-align: center;">
      <button class="download-btn" onclick="downloadJSON()">
        Download JSON Report
      </button>
    </div>

    <footer>
      <p>Generated by AgentQA - Autonomous Web Testing Platform</p>
    </footer>
  </div>

  <script>
    const reportData = ${JSON.stringify(data, null, 2)};

    function downloadJSON() {
      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'test-report-${Date.now()}.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>`;
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  /**
   * Start live dashboard server
   */
  async startLiveServer(port: number = 3000): Promise<string> {
    this.app = express();

    // Serve static files
    this.app.use('/reports', express.static(this.reportsDir));
    this.app.use(express.json());

    // API endpoints
    this.app.get('/api/results', (req: Request, res: Response) => {
      const latestPath = path.join(this.reportsDir, 'json', 'latest.json');
      if (fs.existsSync(latestPath)) {
        res.json(JSON.parse(fs.readFileSync(latestPath, 'utf-8')));
      } else {
        res.json({ error: 'No results available' });
      }
    });

    // Dashboard page
    this.app.get('/', (req: Request, res: Response) => {
      const htmlPath = path.join(this.reportsDir, 'html', 'index.html');
      if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
      } else {
        res.send('<h1>AgentQA Dashboard</h1><p>No reports generated yet.</p>');
      }
    });

    // Start HTTP server
    return new Promise((resolve) => {
      this.server = this.app!.listen(port, () => {
        const url = `http://localhost:${port}`;
        console_log.success(`Live dashboard running at ${url}`);

        // Setup WebSocket for live updates
        this.wss = new WebSocketServer({ server: this.server });
        this.wss.on('connection', (ws: WebSocket) => {
          this.clients.add(ws);
          ws.on('close', () => this.clients.delete(ws));
        });

        resolve(url);
      });
    });
  }

  /**
   * Send live update to connected clients
   */
  broadcastUpdate(data: any): void {
    const message = JSON.stringify(data);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Stop live server
   */
  async stopServer(): Promise<void> {
    if (this.wss) {
      this.wss.close();
    }
    if (this.server) {
      this.server.close();
    }
    console_log.info('Dashboard server stopped');
  }

  /**
   * Generate discovery report
   */
  async generateDiscoveryReport(discovery: DiscoveryResult): Promise<string> {
    const htmlPath = path.join(this.reportsDir, 'html', 'discovery-report.html');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentQA Discovery Report</title>
  <style>
    /* Same styles as dashboard... */
    :root {
      --primary: #3b82f6;
      --success: #22c55e;
      --gray-100: #f3f4f6;
      --gray-200: #e5e7eb;
      --gray-600: #4b5563;
      --gray-800: #1f2937;
      --gray-900: #111827;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--gray-100); color: var(--gray-800); line-height: 1.6; }
    .container { max-width: 1400px; margin: 0 auto; padding: 2rem; }
    header { background: linear-gradient(135deg, var(--gray-900), var(--gray-800)); color: white; padding: 2rem; margin-bottom: 2rem; border-radius: 1rem; }
    header h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .section { background: white; border-radius: 1rem; padding: 1.5rem; margin-bottom: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .section h2 { font-size: 1.25rem; margin-bottom: 1rem; border-bottom: 2px solid var(--gray-200); padding-bottom: 0.5rem; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .stat-card { background: white; padding: 1rem; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
    .stat-card h3 { font-size: 0.75rem; color: var(--gray-600); text-transform: uppercase; }
    .stat-card .value { font-size: 1.5rem; font-weight: 700; color: var(--primary); }
    .page-item { padding: 1rem; border: 1px solid var(--gray-200); border-radius: 0.5rem; margin-bottom: 0.5rem; }
    .page-item h4 { color: var(--primary); }
    .page-item p { color: var(--gray-600); font-size: 0.875rem; }
    .element-list { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
    .element-tag { padding: 0.25rem 0.5rem; background: var(--gray-200); border-radius: 0.25rem; font-size: 0.75rem; }
    .test-case-card { padding: 1rem; border: 1px solid var(--gray-200); border-radius: 0.5rem; margin-bottom: 0.5rem; }
    .test-case-card h4 { margin-bottom: 0.5rem; }
    .test-case-card .steps { font-size: 0.875rem; color: var(--gray-600); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Discovery Report</h1>
      <p>Base URL: ${discovery.baseUrl} | Framework: ${discovery.framework}</p>
      <p>Duration: ${this.formatDuration(discovery.statistics.duration)}</p>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <h3>Pages</h3>
        <div class="value">${discovery.statistics.totalPages}</div>
      </div>
      <div class="stat-card">
        <h3>Elements</h3>
        <div class="value">${discovery.statistics.totalElements}</div>
      </div>
      <div class="stat-card">
        <h3>Forms</h3>
        <div class="value">${discovery.statistics.totalForms}</div>
      </div>
      <div class="stat-card">
        <h3>Links</h3>
        <div class="value">${discovery.statistics.totalLinks}</div>
      </div>
      <div class="stat-card">
        <h3>Interactions</h3>
        <div class="value">${discovery.statistics.totalInteractions}</div>
      </div>
      <div class="stat-card">
        <h3>Test Cases</h3>
        <div class="value">${discovery.suggestedTestCases.length}</div>
      </div>
    </div>

    <div class="section">
      <h2>Discovered Pages</h2>
      ${discovery.pages.map((page) => `
        <div class="page-item">
          <h4>${page.title || page.path}</h4>
          <p>URL: ${page.url}</p>
          <p>Load Time: ${page.loadTime}ms | Elements: ${page.elements.length} | Forms: ${page.forms.length}</p>
          <div class="element-list">
            ${page.elements.slice(0, 10).map((el) => `<span class="element-tag">${el.type}: ${el.text?.substring(0, 20) || el.selector.substring(0, 20)}</span>`).join('')}
            ${page.elements.length > 10 ? `<span class="element-tag">+${page.elements.length - 10} more</span>` : ''}
          </div>
        </div>
      `).join('')}
    </div>

    <div class="section">
      <h2>Suggested Test Cases</h2>
      ${discovery.suggestedTestCases.map((tc) => `
        <div class="test-case-card">
          <h4>${tc.name}</h4>
          <p>${tc.description}</p>
          <div class="steps">
            <strong>Steps:</strong> ${tc.steps.length}
            <br>
            ${tc.steps.map((s, i) => `${i + 1}. ${s.description}`).join('<br>')}
          </div>
        </div>
      `).join('')}
    </div>

    ${discovery.errors.length > 0 ? `
    <div class="section">
      <h2>Errors (${discovery.errors.length})</h2>
      ${discovery.errors.map((err) => `<p style="color: red;">${err.url}: ${err.error}</p>`).join('')}
    </div>
    ` : ''}
  </div>
</body>
</html>`;

    fs.writeFileSync(htmlPath, html);
    console_log.success(`Discovery report: ${htmlPath}`);

    // Also save as JSON
    const jsonPath = path.join(this.reportsDir, 'json', 'discovery.json');
    fs.writeFileSync(jsonPath, JSON.stringify(discovery, null, 2));

    return htmlPath;
  }
}

export default DashboardReporter;
