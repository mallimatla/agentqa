/**
 * AgentQA Web UI Server
 * Beautiful web interface for autonomous testing
 */

import express, { Express, Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { WebCrawler } from '../core/crawler/web-crawler';
import { CSVParser } from '../core/parser/csv-parser';
import { ScriptGenerator } from '../core/generator/script-generator';
import { TestExecutor } from '../core/executor/test-executor';
import { DashboardReporter } from '../core/reporter/dashboard-reporter';
import { console_log } from '../utils/logger';

export class WebUIServer {
  private app: Express;
  private server: http.Server;
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private port: number;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.setupMiddleware();
    this.setupWebSocket();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use('/reports', express.static(path.join(process.cwd(), 'reports')));
    this.app.use('/generated', express.static(path.join(process.cwd(), 'generated')));
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      console_log.info('Client connected to WebSocket');

      ws.on('close', () => {
        this.clients.delete(ws);
        console_log.info('Client disconnected from WebSocket');
      });
    });
  }

  private broadcast(event: string, data: any): void {
    const message = JSON.stringify({ event, data });
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  private setupRoutes(): void {
    // Serve main UI
    this.app.get('/', (req: Request, res: Response) => {
      res.send(this.getMainHTML());
    });

    // API: Discover
    this.app.post('/api/discover', async (req: Request, res: Response) => {
      const { url, depth = 3, maxPages = 50, auth } = req.body;

      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      try {
        this.broadcast('status', { message: 'Starting discovery...', type: 'info' });

        const crawler = new WebCrawler();
        await crawler.initialize({ headless: true });

        if (auth && auth.type && auth.credentials) {
          this.broadcast('status', { message: 'Authenticating...', type: 'info' });
          // Ensure login URL is absolute
          const authConfig = {
            ...auth,
            loginUrl: auth.loginUrl?.startsWith('http') ? auth.loginUrl : `${url}${auth.loginUrl || '/login'}`,
          };
          await crawler.authenticate(authConfig, auth.credentials);
        }

        this.broadcast('status', { message: `Crawling ${url}...`, type: 'info' });

        const result = await crawler.discover(url, {
          depth: parseInt(depth),
          maxPages: parseInt(maxPages),
          screenshot: true,
        });

        await crawler.close();

        // Save discovery result
        const reportsDir = path.join(process.cwd(), 'reports', 'json');
        if (!fs.existsSync(reportsDir)) {
          fs.mkdirSync(reportsDir, { recursive: true });
        }
        fs.writeFileSync(
          path.join(reportsDir, 'discovery.json'),
          JSON.stringify(result, null, 2)
        );

        // Export test cases to CSV
        if (result.suggestedTestCases.length > 0) {
          const csvParser = new CSVParser();
          const suite = {
            id: 'discovered',
            name: 'Discovered Tests',
            description: `Auto-generated tests from ${url}`,
            baseUrl: result.baseUrl,
            testCases: result.suggestedTestCases,
          };

          const csvDir = path.join(process.cwd(), 'generated');
          if (!fs.existsSync(csvDir)) {
            fs.mkdirSync(csvDir, { recursive: true });
          }
          await csvParser.exportToCSV(suite, path.join(csvDir, 'discovered-test-cases.csv'));
        }

        this.broadcast('status', { message: 'Discovery completed!', type: 'success' });
        this.broadcast('discovery-complete', result);

        res.json({ success: true, result });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.broadcast('status', { message: `Error: ${errorMessage}`, type: 'error' });
        res.status(500).json({ error: errorMessage });
      }
    });

    // API: Execute tests
    this.app.post('/api/execute', async (req: Request, res: Response) => {
      const { url, useGenerated = true, csvPath, auth } = req.body;

      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      try {
        this.broadcast('status', { message: 'Preparing test execution...', type: 'info' });

        let suite;

        if (csvPath) {
          const parser = new CSVParser();
          suite = await parser.parseFile(csvPath, url);
        } else {
          // Use discovered test cases
          const discoveryPath = path.join(process.cwd(), 'reports', 'json', 'discovery.json');
          if (fs.existsSync(discoveryPath)) {
            const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf-8'));
            suite = {
              id: 'discovered',
              name: 'Discovered Tests',
              description: `Auto-generated tests from ${url}`,
              baseUrl: discovery.baseUrl,
              testCases: discovery.suggestedTestCases,
              credentials: undefined,
              config: undefined,
            } as any;
          } else {
            return res.status(400).json({ error: 'No test cases found. Run discovery first.' });
          }
        }

        if (auth && auth.credentials) {
          suite.credentials = auth.credentials;
          suite.config = { baseUrl: url, auth };
        }

        const executor = new TestExecutor({
          url,
          headless: true,
          video: true,
        });

        if (auth && auth.credentials) {
          executor.setCredentials(auth.credentials);
        }
        if (auth && auth.type) {
          executor.setAuthConfig(auth);
        }

        await executor.initialize();

        this.broadcast('status', { message: 'Running tests...', type: 'info' });

        // Track progress
        let completed = 0;
        const total = suite.testCases.length;

        const result = await executor.executeSuite(suite);

        await executor.close();

        // Generate report
        const reporter = new DashboardReporter({
          openAfterGeneration: false,
        });

        await reporter.generateReport(result, undefined, executor.getIssues());

        this.broadcast('status', { message: 'Tests completed!', type: 'success' });
        this.broadcast('execution-complete', result);

        res.json({ success: true, result });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.broadcast('status', { message: `Error: ${errorMessage}`, type: 'error' });
        res.status(500).json({ error: errorMessage });
      }
    });

    // API: Full workflow
    this.app.post('/api/run', async (req: Request, res: Response) => {
      const { url, depth = 3, auth } = req.body;

      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      try {
        // Step 1: Discover
        this.broadcast('status', { message: 'Step 1/3: Starting discovery...', type: 'info' });

        const crawler = new WebCrawler();
        await crawler.initialize({ headless: true });

        if (auth && auth.type) {
          await crawler.authenticate(auth, auth.credentials || {});
        }

        const discovery = await crawler.discover(url, { depth: parseInt(depth), screenshot: true });
        await crawler.close();

        this.broadcast('status', { message: `Discovered ${discovery.statistics.totalPages} pages, ${discovery.suggestedTestCases.length} test cases`, type: 'info' });

        if (discovery.suggestedTestCases.length === 0) {
          this.broadcast('status', { message: 'No test cases generated', type: 'warning' });
          return res.json({ success: true, discovery, result: null });
        }

        // Step 2: Generate
        this.broadcast('status', { message: 'Step 2/3: Generating test scripts...', type: 'info' });

        const suite = {
          id: 'auto-generated',
          name: 'Auto-Generated Test Suite',
          description: `Automatically generated tests for ${url}`,
          baseUrl: discovery.baseUrl,
          testCases: discovery.suggestedTestCases,
          credentials: auth?.credentials,
        };

        const generator = new ScriptGenerator({ template: 'typescript' });
        await generator.generateFromSuite(suite as any);

        // Step 3: Execute
        this.broadcast('status', { message: 'Step 3/3: Executing tests...', type: 'info' });

        const executor = new TestExecutor({
          url,
          headless: true,
          video: true,
        });

        if (auth?.credentials) {
          executor.setCredentials(auth.credentials);
        }
        if (auth?.type) {
          executor.setAuthConfig(auth);
        }

        await executor.initialize();
        const result = await executor.executeSuite(suite as any);
        await executor.close();

        // Generate report
        const reporter = new DashboardReporter({ openAfterGeneration: false });
        await reporter.generateReport(result, discovery, executor.getIssues());

        this.broadcast('status', { message: 'All steps completed!', type: 'success' });
        this.broadcast('workflow-complete', { discovery, result });

        res.json({ success: true, discovery, result });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.broadcast('status', { message: `Error: ${errorMessage}`, type: 'error' });
        res.status(500).json({ error: errorMessage });
      }
    });

    // API: Get latest results
    this.app.get('/api/results', (req: Request, res: Response) => {
      const resultsPath = path.join(process.cwd(), 'reports', 'json', 'latest.json');
      if (fs.existsSync(resultsPath)) {
        const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
        res.json(results);
      } else {
        res.json({ error: 'No results available' });
      }
    });

    // API: Get discovery results
    this.app.get('/api/discovery', (req: Request, res: Response) => {
      const discoveryPath = path.join(process.cwd(), 'reports', 'json', 'discovery.json');
      if (fs.existsSync(discoveryPath)) {
        const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf-8'));
        res.json(discovery);
      } else {
        res.json({ error: 'No discovery results available' });
      }
    });

    // API: Upload CSV
    this.app.post('/api/upload-csv', express.text({ type: 'text/csv', limit: '10mb' }), async (req: Request, res: Response) => {
      try {
        const csvContent = req.body;
        const csvDir = path.join(process.cwd(), 'generated');
        if (!fs.existsSync(csvDir)) {
          fs.mkdirSync(csvDir, { recursive: true });
        }
        const csvPath = path.join(csvDir, 'uploaded-test-cases.csv');
        fs.writeFileSync(csvPath, csvContent);

        const parser = new CSVParser();
        const suite = await parser.parseContent(csvContent, '', 'Uploaded Tests');

        res.json({ success: true, testCases: suite.testCases.length, path: csvPath });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: errorMessage });
      }
    });

    // API: Upload CSV and Execute Tests
    this.app.post('/api/csv-execute', async (req: Request, res: Response) => {
      const { csvContent, url, auth } = req.body;

      if (!csvContent || !url) {
        return res.status(400).json({ error: 'CSV content and URL are required' });
      }

      try {
        this.broadcast('status', { message: 'Parsing CSV test cases...', type: 'info' });

        // Save CSV file
        const csvDir = path.join(process.cwd(), 'generated');
        if (!fs.existsSync(csvDir)) {
          fs.mkdirSync(csvDir, { recursive: true });
        }
        const csvPath = path.join(csvDir, 'uploaded-test-cases.csv');
        fs.writeFileSync(csvPath, csvContent);

        // Parse CSV
        const parser = new CSVParser();
        const suite = await parser.parseContent(csvContent, url, 'Uploaded Tests');

        this.broadcast('status', { message: `Parsed ${suite.testCases.length} test cases`, type: 'info' });

        if (suite.testCases.length === 0) {
          this.broadcast('status', { message: 'No test cases found in CSV', type: 'warning' });
          return res.json({ success: false, error: 'No test cases found in CSV' });
        }

        // Generate Playwright scripts
        this.broadcast('status', { message: 'Generating Playwright scripts...', type: 'info' });

        const generator = new ScriptGenerator({ template: 'typescript' });
        await generator.generateFromSuite(suite);

        this.broadcast('status', { message: 'Scripts generated! Starting execution...', type: 'info' });

        // Execute tests
        const executor = new TestExecutor({
          url,
          headless: true,
          video: true,
        });

        if (auth && auth.credentials) {
          executor.setCredentials(auth.credentials);
          suite.credentials = auth.credentials;
        }
        if (auth && auth.type) {
          executor.setAuthConfig(auth);
        }

        await executor.initialize();

        this.broadcast('status', { message: `Executing ${suite.testCases.length} tests...`, type: 'info' });

        const result = await executor.executeSuite(suite);
        await executor.close();

        // Generate report
        this.broadcast('status', { message: 'Generating report...', type: 'info' });

        const reporter = new DashboardReporter({ openAfterGeneration: false });
        await reporter.generateReport(result, undefined, executor.getIssues());

        this.broadcast('status', { message: `Completed! Passed: ${result.passed}, Failed: ${result.failed}`, type: 'success' });
        this.broadcast('execution-complete', result);

        res.json({ success: true, result });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.broadcast('status', { message: `Error: ${errorMessage}`, type: 'error' });
        res.status(500).json({ error: errorMessage });
      }
    });

    // API: Download CSV Template
    this.app.get('/api/csv-template', (req: Request, res: Response) => {
      const template = `test_id,test_name,description,category,priority,tags,step_order,action,step_description,selector,selector_strategy,value,assertion_type,expected_value,wait_condition,wait_timeout,drag_source,drag_target,continue_on_error,screenshot,expected_result
TC001,Sample Login Test,Verify user can login,functional,high,"smoke,auth",1,navigate,Open login page,/login,css,,urlContains,/login,domLoaded,5000,,,false,true,User should be logged in
TC001,Sample Login Test,Verify user can login,functional,high,"smoke,auth",2,type,Enter username,[name="username"],name,testuser,,,visible,3000,,,false,false,User should be logged in
TC001,Sample Login Test,Verify user can login,functional,high,"smoke,auth",3,type,Enter password,[name="password"],name,password123,,,visible,3000,,,false,false,User should be logged in
TC001,Sample Login Test,Verify user can login,functional,high,"smoke,auth",4,click,Click login button,[type="submit"],css,,,,networkIdle,10000,,,false,true,User should be logged in`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="agentqa-test-template.csv"');
      res.send(template);
    });
  }

  private getMainHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentQA - Autonomous Testing Platform</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #6366f1;
      --primary-dark: #4f46e5;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
      --gray-50: #f9fafb;
      --gray-100: #f3f4f6;
      --gray-200: #e5e7eb;
      --gray-300: #d1d5db;
      --gray-400: #9ca3af;
      --gray-500: #6b7280;
      --gray-600: #4b5563;
      --gray-700: #374151;
      --gray-800: #1f2937;
      --gray-900: #111827;
      --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      color: var(--gray-800);
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }

    /* Header */
    header {
      text-align: center;
      padding: 3rem 0;
      color: white;
    }

    .logo {
      font-size: 3rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
    }

    .logo span {
      color: #fbbf24;
    }

    .tagline {
      font-size: 1.25rem;
      opacity: 0.9;
      font-weight: 300;
    }

    /* Main Card */
    .main-card {
      background: white;
      border-radius: 1.5rem;
      box-shadow: var(--shadow-lg);
      overflow: hidden;
      margin-bottom: 2rem;
    }

    /* Tabs */
    .tabs {
      display: flex;
      border-bottom: 2px solid var(--gray-100);
      background: var(--gray-50);
    }

    .tab {
      flex: 1;
      padding: 1.25rem;
      text-align: center;
      cursor: pointer;
      font-weight: 500;
      color: var(--gray-500);
      transition: all 0.3s;
      border-bottom: 3px solid transparent;
      margin-bottom: -2px;
    }

    .tab:hover {
      color: var(--primary);
      background: white;
    }

    .tab.active {
      color: var(--primary);
      border-bottom-color: var(--primary);
      background: white;
    }

    .tab-icon {
      font-size: 1.5rem;
      margin-bottom: 0.25rem;
      display: block;
    }

    /* Tab Content */
    .tab-content {
      display: none;
      padding: 2rem;
    }

    .tab-content.active {
      display: block;
    }

    /* Form */
    .form-group {
      margin-bottom: 1.5rem;
    }

    label {
      display: block;
      font-weight: 500;
      margin-bottom: 0.5rem;
      color: var(--gray-700);
    }

    input[type="text"],
    input[type="url"],
    input[type="password"],
    input[type="number"],
    select,
    textarea {
      width: 100%;
      padding: 0.875rem 1rem;
      border: 2px solid var(--gray-200);
      border-radius: 0.75rem;
      font-size: 1rem;
      transition: all 0.3s;
      font-family: inherit;
    }

    input:focus,
    select:focus,
    textarea:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    /* Buttons */
    .btn {
      padding: 1rem 2rem;
      border: none;
      border-radius: 0.75rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
    }

    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .btn-secondary {
      background: var(--gray-100);
      color: var(--gray-700);
    }

    .btn-secondary:hover {
      background: var(--gray-200);
    }

    .btn-success {
      background: linear-gradient(135deg, var(--success) 0%, #059669 100%);
      color: white;
    }

    .btn-block {
      width: 100%;
    }

    /* Status Log */
    .status-log {
      background: var(--gray-900);
      border-radius: 0.75rem;
      padding: 1rem;
      max-height: 200px;
      overflow-y: auto;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.875rem;
      margin-top: 1rem;
    }

    .status-log .entry {
      padding: 0.25rem 0;
      border-bottom: 1px solid var(--gray-800);
    }

    .status-log .entry:last-child {
      border-bottom: none;
    }

    .status-log .info { color: #60a5fa; }
    .status-log .success { color: #34d399; }
    .status-log .error { color: #f87171; }
    .status-log .warning { color: #fbbf24; }
    .status-log .timestamp { color: var(--gray-500); margin-right: 0.5rem; }

    /* Results Section */
    .results-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: linear-gradient(135deg, var(--gray-50) 0%, white 100%);
      border: 1px solid var(--gray-200);
      border-radius: 1rem;
      padding: 1.5rem;
      text-align: center;
    }

    .stat-card.passed { border-left: 4px solid var(--success); }
    .stat-card.failed { border-left: 4px solid var(--danger); }
    .stat-card.total { border-left: 4px solid var(--primary); }

    .stat-value {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }

    .stat-card.passed .stat-value { color: var(--success); }
    .stat-card.failed .stat-value { color: var(--danger); }
    .stat-card.total .stat-value { color: var(--primary); }

    .stat-label {
      font-size: 0.875rem;
      color: var(--gray-500);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Test Results List */
    .test-list {
      max-height: 400px;
      overflow-y: auto;
    }

    .test-item {
      display: flex;
      align-items: center;
      padding: 1rem;
      background: var(--gray-50);
      border-radius: 0.5rem;
      margin-bottom: 0.5rem;
      transition: all 0.3s;
    }

    .test-item:hover {
      background: var(--gray-100);
    }

    .test-status {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 1rem;
    }

    .test-status.passed { background: var(--success); }
    .test-status.failed { background: var(--danger); }
    .test-status.skipped { background: var(--warning); }

    .test-name {
      flex: 1;
      font-weight: 500;
    }

    .test-duration {
      color: var(--gray-500);
      font-size: 0.875rem;
    }

    /* Progress Bar */
    .progress-container {
      margin: 1.5rem 0;
    }

    .progress-bar {
      width: 100%;
      height: 12px;
      background: var(--gray-200);
      border-radius: 6px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--success), #34d399);
      border-radius: 6px;
      transition: width 0.5s ease;
    }

    .progress-text {
      text-align: center;
      margin-top: 0.5rem;
      font-weight: 600;
      color: var(--gray-700);
    }

    /* Auth Section */
    .auth-section {
      background: var(--gray-50);
      border-radius: 0.75rem;
      padding: 1.5rem;
      margin-top: 1rem;
      display: none;
    }

    .auth-section.visible {
      display: block;
    }

    .auth-section h4 {
      margin-bottom: 1rem;
      color: var(--gray-700);
    }

    /* Checkbox */
    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .checkbox-group input {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    /* Grid layout for form */
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    @media (max-width: 640px) {
      .form-row {
        grid-template-columns: 1fr;
      }
    }

    /* Animations */
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid white;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 3rem;
      color: var(--gray-500);
    }

    .empty-state-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }

    /* Feature cards */
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin-top: 2rem;
    }

    .feature-card {
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(10px);
      border-radius: 1rem;
      padding: 1.5rem;
      color: white;
      text-align: center;
    }

    .feature-icon {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }

    .feature-title {
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .feature-desc {
      font-size: 0.875rem;
      opacity: 0.8;
    }

    /* Notification */
    .notification {
      position: fixed;
      top: 1rem;
      right: 1rem;
      padding: 1rem 1.5rem;
      border-radius: 0.5rem;
      color: white;
      font-weight: 500;
      box-shadow: var(--shadow-lg);
      transform: translateX(400px);
      transition: transform 0.3s ease;
      z-index: 1000;
    }

    .notification.show {
      transform: translateX(0);
    }

    .notification.success { background: var(--success); }
    .notification.error { background: var(--danger); }
    .notification.info { background: var(--primary); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">Agent<span>QA</span></div>
      <p class="tagline">Autonomous Web Application Testing Platform</p>
    </header>

    <div class="main-card">
      <div class="tabs">
        <div class="tab active" data-tab="discover">
          <span class="tab-icon">🔍</span>
          Discover
        </div>
        <div class="tab" data-tab="csv-upload">
          <span class="tab-icon">📄</span>
          CSV Upload
        </div>
        <div class="tab" data-tab="results">
          <span class="tab-icon">📊</span>
          Results
        </div>
        <div class="tab" data-tab="workflow">
          <span class="tab-icon">🚀</span>
          Full Workflow
        </div>
      </div>

      <!-- Discover Tab -->
      <div class="tab-content active" id="discover">
        <h2 style="margin-bottom: 1.5rem;">Discover Web Application</h2>
        <p style="color: var(--gray-500); margin-bottom: 1.5rem;">
          Enter a URL to automatically discover all pages, forms, buttons, and generate test cases.
        </p>

        <div class="form-group">
          <label for="discover-url">Web Application URL</label>
          <input type="url" id="discover-url" placeholder="https://your-app.com" />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="discover-depth">Crawl Depth</label>
            <select id="discover-depth">
              <option value="1">1 - Shallow</option>
              <option value="2">2 - Medium</option>
              <option value="3" selected>3 - Deep</option>
              <option value="5">5 - Very Deep</option>
            </select>
          </div>
          <div class="form-group">
            <label for="discover-pages">Max Pages</label>
            <input type="number" id="discover-pages" value="50" min="1" max="200" />
          </div>
        </div>

        <div class="checkbox-group">
          <input type="checkbox" id="discover-auth" />
          <label for="discover-auth" style="margin: 0;">Requires Authentication</label>
        </div>

        <div class="auth-section" id="discover-auth-section">
          <h4>🔐 Authentication Settings</h4>
          <div class="form-group">
            <label>Auth Type</label>
            <select id="discover-auth-type">
              <option value="form">Form Login</option>
              <option value="basic">Basic HTTP</option>
              <option value="token">Token/API Key</option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Username/Email</label>
              <input type="text" id="discover-username" placeholder="username" />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="discover-password" placeholder="password" />
            </div>
          </div>
        </div>

        <button class="btn btn-primary btn-block" id="btn-discover">
          <span>🔍</span> Start Discovery
        </button>

        <div class="status-log" id="discover-log" style="display: none;"></div>
      </div>

      <!-- CSV Upload Tab -->
      <div class="tab-content" id="csv-upload">
        <h2 style="margin-bottom: 1.5rem;">Upload & Execute CSV Test Cases</h2>
        <p style="color: var(--gray-500); margin-bottom: 1.5rem;">
          Upload your test cases in CSV format, we'll generate Playwright scripts and execute them.
        </p>

        <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem;">
          <a href="/api/csv-template" class="btn btn-secondary" download>
            <span>📥</span> Download CSV Template
          </a>
        </div>

        <div class="form-group">
          <label for="csv-url">Web Application URL (Base URL for tests)</label>
          <input type="url" id="csv-url" placeholder="https://your-app.com" />
        </div>

        <div class="form-group">
          <label>Upload CSV File</label>
          <div id="csv-drop-zone" style="border: 2px dashed var(--gray-300); border-radius: 0.75rem; padding: 2rem; text-align: center; cursor: pointer; transition: all 0.3s; background: var(--gray-50);">
            <div style="font-size: 3rem; margin-bottom: 0.5rem;">📄</div>
            <p style="color: var(--gray-600); margin-bottom: 0.5rem;">Drag & drop your CSV file here</p>
            <p style="color: var(--gray-400); font-size: 0.875rem;">or click to browse</p>
            <input type="file" id="csv-file-input" accept=".csv" style="display: none;" />
          </div>
          <div id="csv-file-name" style="margin-top: 0.5rem; color: var(--success); font-weight: 500; display: none;"></div>
        </div>

        <div class="form-group">
          <label>Or Paste CSV Content Directly</label>
          <textarea id="csv-content" rows="6" placeholder="test_id,test_name,description,category,priority,tags,step_order,action,step_description,selector..." style="font-family: monospace; font-size: 0.875rem;"></textarea>
        </div>

        <div class="checkbox-group">
          <input type="checkbox" id="csv-auth" />
          <label for="csv-auth" style="margin: 0;">Requires Authentication</label>
        </div>

        <div class="auth-section" id="csv-auth-section">
          <h4>🔐 Authentication Settings</h4>
          <div class="form-row">
            <div class="form-group">
              <label>Username/Email</label>
              <input type="text" id="csv-username" placeholder="username" />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="csv-password" placeholder="password" />
            </div>
          </div>
        </div>

        <button class="btn btn-success btn-block" id="btn-csv-execute">
          <span>▶️</span> Generate Scripts & Execute Tests
        </button>

        <div class="status-log" id="csv-log" style="display: none;"></div>

        <div id="csv-preview" style="margin-top: 1.5rem; display: none;">
          <h4 style="margin-bottom: 0.5rem;">Preview (first 5 rows)</h4>
          <div style="overflow-x: auto; background: var(--gray-100); border-radius: 0.5rem; padding: 1rem;">
            <table id="csv-preview-table" style="width: 100%; border-collapse: collapse; font-size: 0.75rem;">
            </table>
          </div>
        </div>
      </div>

      <!-- Results Tab -->
      <div class="tab-content" id="results">
        <h2 style="margin-bottom: 1.5rem;">Test Results</h2>

        <div id="results-content">
          <div class="empty-state">
            <div class="empty-state-icon">📋</div>
            <h3>No Results Yet</h3>
            <p>Run discovery and execute tests to see results here.</p>
          </div>
        </div>
      </div>

      <!-- Full Workflow Tab -->
      <div class="tab-content" id="workflow">
        <h2 style="margin-bottom: 1.5rem;">Complete Workflow</h2>
        <p style="color: var(--gray-500); margin-bottom: 1.5rem;">
          One-click solution: Discover → Generate → Execute → Report
        </p>

        <div class="form-group">
          <label for="workflow-url">Web Application URL</label>
          <input type="url" id="workflow-url" placeholder="https://your-app.com" />
        </div>

        <div class="form-group">
          <label for="workflow-depth">Crawl Depth</label>
          <select id="workflow-depth">
            <option value="2">2 - Quick Scan</option>
            <option value="3" selected>3 - Standard</option>
            <option value="5">5 - Thorough</option>
          </select>
        </div>

        <div class="checkbox-group">
          <input type="checkbox" id="workflow-auth" />
          <label for="workflow-auth" style="margin: 0;">Requires Authentication</label>
        </div>

        <div class="auth-section" id="workflow-auth-section">
          <h4>🔐 Authentication Settings</h4>
          <div class="form-row">
            <div class="form-group">
              <label>Username/Email</label>
              <input type="text" id="workflow-username" placeholder="username" />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="workflow-password" placeholder="password" />
            </div>
          </div>
        </div>

        <button class="btn btn-primary btn-block" id="btn-workflow">
          <span>🚀</span> Run Complete Workflow
        </button>

        <div class="status-log" id="workflow-log" style="display: none;"></div>
      </div>
    </div>

    <!-- Features -->
    <div class="features">
      <div class="feature-card">
        <div class="feature-icon">🤖</div>
        <div class="feature-title">Auto-Discovery</div>
        <div class="feature-desc">Automatically find all pages, forms, and elements</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">⚡</div>
        <div class="feature-title">Smart Generation</div>
        <div class="feature-desc">AI-powered test case generation</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">🎭</div>
        <div class="feature-title">Playwright Engine</div>
        <div class="feature-desc">Reliable cross-browser testing</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">📊</div>
        <div class="feature-title">Rich Reports</div>
        <div class="feature-desc">Beautiful dashboards and JSON export</div>
      </div>
    </div>
  </div>

  <div class="notification" id="notification"></div>

  <script>
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
      });
    });

    // Auth section toggles
    ['discover', 'execute', 'workflow'].forEach(section => {
      const checkbox = document.getElementById(section + '-auth');
      const authSection = document.getElementById(section + '-auth-section');
      if (checkbox && authSection) {
        checkbox.addEventListener('change', () => {
          authSection.classList.toggle('visible', checkbox.checked);
        });
      }
    });

    // CSV upload toggle
    document.getElementById('execute-source').addEventListener('change', (e) => {
      document.getElementById('csv-upload-section').style.display =
        e.target.value === 'csv' ? 'block' : 'none';
    });

    // WebSocket connection
    const ws = new WebSocket('ws://' + window.location.host);
    ws.onmessage = (event) => {
      const { event: eventName, data } = JSON.parse(event.data);

      if (eventName === 'status') {
        addLogEntry(data.message, data.type);
      }

      if (eventName === 'discovery-complete' || eventName === 'execution-complete' || eventName === 'workflow-complete') {
        showNotification('Operation completed successfully!', 'success');
        loadResults();
      }
    };

    // Add log entry
    function addLogEntry(message, type = 'info') {
      const logs = document.querySelectorAll('.status-log');
      const timestamp = new Date().toLocaleTimeString();
      logs.forEach(log => {
        log.style.display = 'block';
        log.innerHTML += '<div class="entry"><span class="timestamp">[' + timestamp + ']</span><span class="' + type + '">' + message + '</span></div>';
        log.scrollTop = log.scrollHeight;
      });
    }

    // Show notification
    function showNotification(message, type = 'info') {
      const notification = document.getElementById('notification');
      notification.textContent = message;
      notification.className = 'notification ' + type + ' show';
      setTimeout(() => notification.classList.remove('show'), 3000);
    }

    // Load results
    async function loadResults() {
      try {
        const response = await fetch('/api/results');
        const data = await response.json();

        if (data.error) {
          return;
        }

        const resultsContent = document.getElementById('results-content');
        const summary = data.summary || {};
        const testResults = data.testResults?.[0]?.tests || [];

        resultsContent.innerHTML = \`
          <div class="results-grid">
            <div class="stat-card total">
              <div class="stat-value">\${summary.totalTests || 0}</div>
              <div class="stat-label">Total Tests</div>
            </div>
            <div class="stat-card passed">
              <div class="stat-value">\${summary.passed || 0}</div>
              <div class="stat-label">Passed</div>
            </div>
            <div class="stat-card failed">
              <div class="stat-value">\${summary.failed || 0}</div>
              <div class="stat-label">Failed</div>
            </div>
          </div>

          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" style="width: \${summary.passRate || 0}%"></div>
            </div>
            <div class="progress-text">\${(summary.passRate || 0).toFixed(1)}% Pass Rate</div>
          </div>

          <h3 style="margin: 1.5rem 0 1rem;">Test Cases</h3>
          <div class="test-list">
            \${testResults.map(test => \`
              <div class="test-item">
                <div class="test-status \${test.status}"></div>
                <div class="test-name">\${test.testName}</div>
                <div class="test-duration">\${test.duration}ms</div>
              </div>
            \`).join('')}
          </div>
        \`;

        // Switch to results tab
        document.querySelector('[data-tab="results"]').click();
      } catch (error) {
        console.error('Failed to load results:', error);
      }
    }

    // Discover button
    document.getElementById('btn-discover').addEventListener('click', async () => {
      const url = document.getElementById('discover-url').value;
      if (!url) {
        showNotification('Please enter a URL', 'error');
        return;
      }

      const btn = document.getElementById('btn-discover');
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Discovering...';

      const body = {
        url,
        depth: document.getElementById('discover-depth').value,
        maxPages: document.getElementById('discover-pages').value,
      };

      if (document.getElementById('discover-auth').checked) {
        body.auth = {
          type: document.getElementById('discover-auth-type').value,
          credentials: {
            username: document.getElementById('discover-username').value,
            password: document.getElementById('discover-password').value,
          }
        };
      }

      try {
        const response = await fetch('/api/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await response.json();

        if (data.error) {
          showNotification(data.error, 'error');
        }
      } catch (error) {
        showNotification('Failed to start discovery', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>🔍</span> Start Discovery';
      }
    });

    // Execute button
    document.getElementById('btn-execute').addEventListener('click', async () => {
      const url = document.getElementById('execute-url').value;
      if (!url) {
        showNotification('Please enter a URL', 'error');
        return;
      }

      const btn = document.getElementById('btn-execute');
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Executing...';

      const body = { url };

      if (document.getElementById('execute-auth').checked) {
        body.auth = {
          type: 'form',
          credentials: {
            username: document.getElementById('execute-username').value,
            password: document.getElementById('execute-password').value,
          }
        };
      }

      try {
        const response = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await response.json();

        if (data.error) {
          showNotification(data.error, 'error');
        }
      } catch (error) {
        showNotification('Failed to execute tests', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>▶️</span> Execute Tests';
      }
    });

    // Workflow button
    document.getElementById('btn-workflow').addEventListener('click', async () => {
      const url = document.getElementById('workflow-url').value;
      if (!url) {
        showNotification('Please enter a URL', 'error');
        return;
      }

      const btn = document.getElementById('btn-workflow');
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Running...';

      const body = {
        url,
        depth: document.getElementById('workflow-depth').value,
      };

      if (document.getElementById('workflow-auth').checked) {
        body.auth = {
          type: 'form',
          credentials: {
            username: document.getElementById('workflow-username').value,
            password: document.getElementById('workflow-password').value,
          }
        };
      }

      try {
        const response = await fetch('/api/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await response.json();

        if (data.error) {
          showNotification(data.error, 'error');
        }
      } catch (error) {
        showNotification('Failed to run workflow', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>🚀</span> Run Complete Workflow';
      }
    });

    // CSV Upload functionality
    let csvFileContent = '';

    // CSV Auth toggle
    const csvAuthCheckbox = document.getElementById('csv-auth');
    const csvAuthSection = document.getElementById('csv-auth-section');
    if (csvAuthCheckbox && csvAuthSection) {
      csvAuthCheckbox.addEventListener('change', () => {
        csvAuthSection.classList.toggle('visible', csvAuthCheckbox.checked);
      });
    }

    // Drag and drop zone
    const dropZone = document.getElementById('csv-drop-zone');
    const fileInput = document.getElementById('csv-file-input');
    const fileNameDisplay = document.getElementById('csv-file-name');
    const csvContentArea = document.getElementById('csv-content');
    const csvPreview = document.getElementById('csv-preview');
    const csvPreviewTable = document.getElementById('csv-preview-table');

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--primary)';
      dropZone.style.background = 'rgba(99, 102, 241, 0.1)';
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'var(--gray-300)';
      dropZone.style.background = 'var(--gray-50)';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--gray-300)';
      dropZone.style.background = 'var(--gray-50)';

      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.csv')) {
        handleCSVFile(file);
      } else {
        showNotification('Please upload a CSV file', 'error');
      }
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleCSVFile(file);
      }
    });

    function handleCSVFile(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        csvFileContent = e.target.result;
        csvContentArea.value = csvFileContent;
        fileNameDisplay.textContent = '✓ ' + file.name + ' loaded';
        fileNameDisplay.style.display = 'block';
        showCSVPreview(csvFileContent);
        showNotification('CSV file loaded!', 'success');
      };
      reader.readAsText(file);
    }

    // Show CSV preview
    function showCSVPreview(content) {
      const lines = content.trim().split('\\n').slice(0, 6);
      if (lines.length < 2) return;

      const headers = lines[0].split(',').slice(0, 8);
      let tableHTML = '<thead><tr>';
      headers.forEach(h => tableHTML += '<th style="padding: 0.5rem; border: 1px solid var(--gray-200); background: var(--gray-200);">' + h.trim() + '</th>');
      tableHTML += '</tr></thead><tbody>';

      lines.slice(1).forEach(line => {
        const cells = line.split(',').slice(0, 8);
        tableHTML += '<tr>';
        cells.forEach(c => tableHTML += '<td style="padding: 0.5rem; border: 1px solid var(--gray-200);">' + c.trim().substring(0, 20) + '</td>');
        tableHTML += '</tr>';
      });
      tableHTML += '</tbody>';

      csvPreviewTable.innerHTML = tableHTML;
      csvPreview.style.display = 'block';
    }

    // CSV content change
    csvContentArea.addEventListener('input', () => {
      csvFileContent = csvContentArea.value;
      if (csvFileContent.trim()) {
        showCSVPreview(csvFileContent);
      }
    });

    // CSV Execute button
    document.getElementById('btn-csv-execute').addEventListener('click', async () => {
      const url = document.getElementById('csv-url').value;
      const content = csvContentArea.value || csvFileContent;

      if (!url) {
        showNotification('Please enter the Web Application URL', 'error');
        return;
      }

      if (!content.trim()) {
        showNotification('Please upload or paste CSV test cases', 'error');
        return;
      }

      const btn = document.getElementById('btn-csv-execute');
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Generating & Executing...';

      const body = {
        url,
        csvContent: content,
      };

      if (document.getElementById('csv-auth').checked) {
        body.auth = {
          type: 'form',
          credentials: {
            username: document.getElementById('csv-username').value,
            password: document.getElementById('csv-password').value,
          }
        };
      }

      try {
        const response = await fetch('/api/csv-execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await response.json();

        if (data.error) {
          showNotification(data.error, 'error');
        } else {
          showNotification('Tests completed! Check Results tab.', 'success');
        }
      } catch (error) {
        showNotification('Failed to execute tests: ' + error.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>▶️</span> Generate Scripts & Execute Tests';
      }
    });

    // Load results on page load
    loadResults();
  </script>
</body>
</html>`;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console_log.success(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   AgentQA Web UI is running!                                  ║
║                                                               ║
║   Open your browser and go to:                                ║
║   http://localhost:${this.port}                                    ║
║                                                               ║
║   Press Ctrl+C to stop                                        ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
        `);
        resolve();
      });
    });
  }

  stop(): void {
    this.server.close();
  }
}

// CLI runner
if (require.main === module) {
  const port = parseInt(process.argv[2] || '3000');
  const server = new WebUIServer(port);
  server.start();
}

export default WebUIServer;
