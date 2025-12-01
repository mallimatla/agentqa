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
import { StrategyEngine } from '../core/intelligence/strategy-engine';
import { console_log } from '../utils/logger';
import { ProjectConfig, UserRole, UserStory, Feature, CriticalFlow, TestingScope } from '../types';

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

    // API: Generate Intelligent Test Suite
    this.app.post('/api/intelligent-generate', async (req: Request, res: Response) => {
      const { project } = req.body;

      if (!project || !project.name || !project.baseUrl) {
        return res.status(400).json({ error: 'Project configuration is required' });
      }

      try {
        this.broadcast('status', { message: 'Starting intelligent test generation...', type: 'info' });

        // Create project config with defaults
        const projectConfig: ProjectConfig = {
          id: `proj-${Date.now()}`,
          name: project.name,
          description: project.description || '',
          baseUrl: project.baseUrl,
          applicationInfo: {
            type: project.applicationType || 'web',
            framework: project.framework || 'other',
            industry: project.industry || '',
          },
          userRoles: (project.userRoles || []).map((role: any, index: number) => ({
            id: `role-${index + 1}`,
            name: role.name,
            description: role.description || '',
            permissions: role.permissions || [],
            accessLevel: role.accessLevel || 'user',
            credentials: role.credentials,
            restrictions: role.restrictions || [],
          })),
          userStories: (project.userStories || []).map((story: any, index: number) => ({
            id: `story-${index + 1}`,
            title: story.title,
            description: story.description || '',
            asA: story.asA || 'user',
            iWant: story.iWant || '',
            soThat: story.soThat || '',
            acceptanceCriteria: story.acceptanceCriteria || [],
            priority: story.priority || 'medium',
            tags: story.tags || [],
            estimatedComplexity: story.complexity || 'medium',
          })),
          features: (project.features || []).map((feature: any, index: number) => ({
            id: `feature-${index + 1}`,
            name: feature.name,
            description: feature.description || '',
            module: feature.module || 'General',
            userStories: [],
            businessRules: (feature.businessRules || []).map((rule: any, rIndex: number) => ({
              id: `rule-${index}-${rIndex}`,
              name: rule.name || `Rule ${rIndex + 1}`,
              description: rule.description || '',
              condition: rule.condition || '',
              action: rule.action || '',
              priority: rule.priority || 'medium',
              category: rule.category || 'validation',
            })),
            inputs: (feature.inputs || []).map((input: any) => ({
              name: input.name,
              type: input.type || 'text',
              required: input.required || false,
              minLength: input.minLength,
              maxLength: input.maxLength,
              minValue: input.minValue,
              maxValue: input.maxValue,
              pattern: input.pattern,
              validValues: input.validValues,
              description: input.description,
            })),
            outputs: (feature.outputs || []).map((output: any) => ({
              name: output.name,
              type: output.type || 'display',
              description: output.description || '',
              successIndicator: output.successIndicator,
            })),
            validations: (feature.validations || []).map((v: any) => ({
              field: v.field,
              type: v.type || 'required',
              rule: v.rule || '',
              errorMessage: v.errorMessage || '',
            })),
            integrations: feature.integrations || [],
            status: 'active' as const,
          })),
          criticalFlows: (project.criticalFlows || []).map((flow: any, index: number) => ({
            id: `flow-${index + 1}`,
            name: flow.name,
            description: flow.description || '',
            priority: flow.priority || 'high',
            steps: flow.steps || [],
            expectedOutcome: flow.expectedOutcome || '',
            userRole: flow.userRole || 'user',
            frequency: flow.frequency || 'high',
            businessImpact: flow.businessImpact || 'high',
          })),
          performanceBenchmarks: project.performanceBenchmarks || [],
          environments: project.environments || [{ name: 'Production', url: project.baseUrl, type: 'production' as const }],
          testingScope: {
            includePositive: project.testingScope?.includePositive !== false,
            includeNegative: project.testingScope?.includeNegative !== false,
            includeBoundary: project.testingScope?.includeBoundary !== false,
            includeEdgeCases: project.testingScope?.includeEdgeCases !== false,
            includeAccessibility: project.testingScope?.includeAccessibility || false,
            includeSecurity: project.testingScope?.includeSecurity !== false,
            includePerformance: project.testingScope?.includePerformance || false,
            includeCrossBrowser: project.testingScope?.includeCrossBrowser || false,
            includeMobile: project.testingScope?.includeMobile || false,
            browsers: project.testingScope?.browsers || ['chromium'],
            viewports: project.testingScope?.viewports || [{ name: 'Desktop', width: 1920, height: 1080 }],
            testDepth: project.testingScope?.testDepth || 'deep',
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        this.broadcast('status', { message: 'Analyzing project requirements...', type: 'info' });

        // Generate intelligent test suite
        const engine = new StrategyEngine();
        const strategy = engine.generateStrategy(projectConfig);

        this.broadcast('status', { message: `Generated test strategy with ${strategy.testPhases.length} phases`, type: 'info' });

        const suite = engine.generateIntelligentSuite(projectConfig);

        this.broadcast('status', { message: `Generated ${suite.scenarios.length} scenarios and ${suite.testCases.length} test cases`, type: 'info' });

        const report = engine.generateReport(suite, projectConfig);

        // Save project and results
        const dataDir = path.join(process.cwd(), 'generated', 'intelligent');
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }

        fs.writeFileSync(path.join(dataDir, 'project-config.json'), JSON.stringify(projectConfig, null, 2));
        fs.writeFileSync(path.join(dataDir, 'test-strategy.json'), JSON.stringify(strategy, null, 2));
        fs.writeFileSync(path.join(dataDir, 'test-suite.json'), JSON.stringify(suite, null, 2));
        fs.writeFileSync(path.join(dataDir, 'generation-report.json'), JSON.stringify(report, null, 2));

        // Export test cases to CSV
        const csvParser = new CSVParser();
        const csvSuite = {
          id: suite.id,
          name: suite.name,
          description: suite.description,
          baseUrl: suite.baseUrl,
          testCases: suite.testCases,
        };
        await csvParser.exportToCSV(csvSuite, path.join(dataDir, 'generated-test-cases.csv'));

        this.broadcast('status', { message: 'Test suite generated successfully!', type: 'success' });
        this.broadcast('intelligent-complete', { strategy, suite, report });

        res.json({
          success: true,
          strategy,
          suite: {
            ...suite,
            testCases: suite.testCases.slice(0, 50), // Limit for response size
          },
          report,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.broadcast('status', { message: `Error: ${errorMessage}`, type: 'error' });
        res.status(500).json({ error: errorMessage });
      }
    });

    // API: Execute Intelligent Test Suite
    this.app.post('/api/intelligent-execute', async (req: Request, res: Response) => {
      const { baseUrl, auth } = req.body;

      const suitePath = path.join(process.cwd(), 'generated', 'intelligent', 'test-suite.json');
      if (!fs.existsSync(suitePath)) {
        return res.status(400).json({ error: 'No intelligent test suite found. Generate tests first.' });
      }

      try {
        const suiteData = JSON.parse(fs.readFileSync(suitePath, 'utf-8'));
        const url = baseUrl || suiteData.baseUrl;

        this.broadcast('status', { message: `Executing ${suiteData.testCases.length} intelligent test cases...`, type: 'info' });

        const suite = {
          id: suiteData.id,
          name: suiteData.name,
          description: suiteData.description,
          baseUrl: url,
          testCases: suiteData.testCases,
          credentials: auth?.credentials,
          config: auth ? { baseUrl: url, auth } : undefined,
        };

        // Generate Playwright scripts
        const generator = new ScriptGenerator({ template: 'typescript' });
        await generator.generateFromSuite(suite as any);

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

        let completed = 0;
        const total = suite.testCases.length;

        const result = await executor.executeSuite(suite as any);
        await executor.close();

        // Generate report
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

    // API: Get Intelligent Test Report
    this.app.get('/api/intelligent-report', (req: Request, res: Response) => {
      const reportPath = path.join(process.cwd(), 'generated', 'intelligent', 'generation-report.json');
      if (fs.existsSync(reportPath)) {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        res.json(report);
      } else {
        res.json({ error: 'No report available' });
      }
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

    /* Wizard Styles */
    .wizard-steps {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2rem;
      position: relative;
    }

    .wizard-steps::before {
      content: '';
      position: absolute;
      top: 20px;
      left: 10%;
      right: 10%;
      height: 2px;
      background: var(--gray-200);
      z-index: 0;
    }

    .wizard-step {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      z-index: 1;
    }

    .step-number {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--gray-200);
      color: var(--gray-500);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      margin-bottom: 0.5rem;
      transition: all 0.3s;
    }

    .wizard-step.active .step-number,
    .wizard-step.completed .step-number {
      background: var(--primary);
      color: white;
    }

    .wizard-step.completed .step-number {
      background: var(--success);
    }

    .step-label {
      font-size: 0.75rem;
      color: var(--gray-500);
      text-align: center;
      max-width: 80px;
    }

    .wizard-step.active .step-label {
      color: var(--primary);
      font-weight: 600;
    }

    .wizard-content {
      display: none;
      min-height: 400px;
    }

    .wizard-content.active {
      display: block;
    }

    .wizard-nav {
      display: flex;
      justify-content: space-between;
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--gray-200);
    }

    /* Dynamic Items (Roles, Stories, Features, Flows) */
    .dynamic-item {
      background: var(--gray-50);
      border: 1px solid var(--gray-200);
      border-radius: 0.75rem;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }

    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .item-title {
      font-weight: 600;
      color: var(--primary);
    }

    .btn-remove {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: none;
      background: var(--danger);
      color: white;
      font-size: 1.25rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s;
    }

    .btn-remove:hover {
      transform: scale(1.1);
    }

    /* Checkbox Grid for Scope */
    .checkbox-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
    }

    .checkbox-card {
      display: flex;
      flex-direction: column;
      padding: 1rem;
      background: white;
      border: 2px solid var(--gray-200);
      border-radius: 0.75rem;
      cursor: pointer;
      transition: all 0.3s;
    }

    .checkbox-card:hover {
      border-color: var(--primary);
    }

    .checkbox-card input {
      position: absolute;
      opacity: 0;
    }

    .checkbox-card input:checked + .checkbox-label {
      color: var(--primary);
    }

    .checkbox-card:has(input:checked) {
      border-color: var(--primary);
      background: rgba(99, 102, 241, 0.05);
    }

    .checkbox-label {
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .checkbox-desc {
      font-size: 0.75rem;
      color: var(--gray-500);
    }

    .checkbox-card.small {
      flex-direction: row;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
    }

    .checkbox-card.small .checkbox-label {
      margin: 0;
    }

    .scope-section h4 {
      margin-bottom: 0.75rem;
      color: var(--gray-700);
    }

    /* Results Summary */
    .results-summary {
      background: linear-gradient(135deg, var(--gray-50) 0%, white 100%);
      border: 1px solid var(--gray-200);
      border-radius: 1rem;
      padding: 1.5rem;
    }

    .results-summary h3 {
      color: var(--success);
      margin-bottom: 0.5rem;
    }

    /* Recommendation Items */
    .recommendation-item {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      background: var(--gray-50);
      border-radius: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .recommendation-item .icon {
      font-size: 1.5rem;
    }

    .recommendation-item .content {
      flex: 1;
    }

    .recommendation-item .title {
      font-weight: 600;
      color: var(--gray-800);
    }

    .recommendation-item .desc {
      font-size: 0.875rem;
      color: var(--gray-600);
    }

    .recommendation-item .impact {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-weight: 500;
    }

    .recommendation-item .impact.high {
      background: rgba(239, 68, 68, 0.1);
      color: var(--danger);
    }

    .recommendation-item .impact.medium {
      background: rgba(245, 158, 11, 0.1);
      color: var(--warning);
    }

    @media (max-width: 768px) {
      .wizard-steps {
        flex-wrap: wrap;
        gap: 1rem;
      }
      .wizard-steps::before {
        display: none;
      }
      .form-row {
        grid-template-columns: 1fr !important;
      }
    }
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
        <div class="tab active" data-tab="intelligent">
          <span class="tab-icon">🧠</span>
          Intelligent Testing
        </div>
        <div class="tab" data-tab="discover">
          <span class="tab-icon">🔍</span>
          Quick Discover
        </div>
        <div class="tab" data-tab="csv-upload">
          <span class="tab-icon">📄</span>
          CSV Upload
        </div>
        <div class="tab" data-tab="results">
          <span class="tab-icon">📊</span>
          Results
        </div>
      </div>

      <!-- Intelligent Testing Tab - Multi-Step Wizard -->
      <div class="tab-content active" id="intelligent">
        <h2 style="margin-bottom: 0.5rem;">🧠 Intelligent Test Generation</h2>
        <p style="color: var(--gray-500); margin-bottom: 1.5rem;">
          Tell us about your application and we'll generate comprehensive test strategy, scenarios, and test cases like 1000 expert testers.
        </p>

        <!-- Wizard Steps Indicator -->
        <div class="wizard-steps">
          <div class="wizard-step active" data-step="1">
            <div class="step-number">1</div>
            <div class="step-label">Project Info</div>
          </div>
          <div class="wizard-step" data-step="2">
            <div class="step-number">2</div>
            <div class="step-label">User Roles</div>
          </div>
          <div class="wizard-step" data-step="3">
            <div class="step-number">3</div>
            <div class="step-label">User Stories</div>
          </div>
          <div class="wizard-step" data-step="4">
            <div class="step-number">4</div>
            <div class="step-label">Features</div>
          </div>
          <div class="wizard-step" data-step="5">
            <div class="step-number">5</div>
            <div class="step-label">Critical Flows</div>
          </div>
          <div class="wizard-step" data-step="6">
            <div class="step-number">6</div>
            <div class="step-label">Test Scope</div>
          </div>
        </div>

        <!-- Step 1: Project Info -->
        <div class="wizard-content active" id="wizard-step-1">
          <h3 style="margin-bottom: 1rem;">📋 Project Information</h3>
          <div class="form-group">
            <label for="proj-name">Project/Application Name *</label>
            <input type="text" id="proj-name" placeholder="e.g., E-Commerce Platform, HR Management System" />
          </div>
          <div class="form-group">
            <label for="proj-description">Project Description</label>
            <textarea id="proj-description" rows="3" placeholder="Describe what your application does, its main purpose, and target users..."></textarea>
          </div>
          <div class="form-group">
            <label for="proj-url">Application URL *</label>
            <input type="url" id="proj-url" placeholder="https://your-app.com" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="proj-framework">Framework/Technology</label>
              <select id="proj-framework">
                <option value="angular">Angular</option>
                <option value="react">React</option>
                <option value="nextjs">Next.js</option>
                <option value="vue">Vue.js</option>
                <option value="other" selected>Other/Unknown</option>
              </select>
            </div>
            <div class="form-group">
              <label for="proj-industry">Industry/Domain</label>
              <input type="text" id="proj-industry" placeholder="e.g., Finance, Healthcare, E-commerce" />
            </div>
          </div>
        </div>

        <!-- Step 2: User Roles -->
        <div class="wizard-content" id="wizard-step-2">
          <h3 style="margin-bottom: 1rem;">👥 User Roles & Personas</h3>
          <p style="color: var(--gray-500); margin-bottom: 1rem; font-size: 0.9rem;">
            Define all user types that will use your application. We'll test each role's access and restrictions.
          </p>
          <div id="user-roles-container">
            <div class="dynamic-item" data-role-index="0">
              <div class="item-header">
                <span class="item-title">Role 1</span>
                <button type="button" class="btn-remove" onclick="removeRole(this)">×</button>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Role Name *</label>
                  <input type="text" class="role-name" placeholder="e.g., Admin, Manager, User" />
                </div>
                <div class="form-group">
                  <label>Access Level</label>
                  <select class="role-access">
                    <option value="admin">Admin (Full Access)</option>
                    <option value="manager">Manager</option>
                    <option value="user" selected>Regular User</option>
                    <option value="guest">Guest (Limited)</option>
                    <option value="readonly">Read Only</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label>What can this role do? (Permissions)</label>
                <textarea class="role-permissions" rows="2" placeholder="e.g., View reports, Edit own profile, Manage users, Access admin panel..."></textarea>
              </div>
              <div class="form-group">
                <label>What is restricted for this role?</label>
                <textarea class="role-restrictions" rows="2" placeholder="e.g., Cannot delete records, No access to billing, Cannot change settings..."></textarea>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Test Username (optional)</label>
                  <input type="text" class="role-username" placeholder="testuser" />
                </div>
                <div class="form-group">
                  <label>Test Password (optional)</label>
                  <input type="password" class="role-password" placeholder="password" />
                </div>
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-secondary" onclick="addRole()" style="margin-top: 1rem;">
            <span>+</span> Add Another Role
          </button>
        </div>

        <!-- Step 3: User Stories -->
        <div class="wizard-content" id="wizard-step-3">
          <h3 style="margin-bottom: 1rem;">📖 User Stories & Requirements</h3>
          <p style="color: var(--gray-500); margin-bottom: 1rem; font-size: 0.9rem;">
            Add user stories that describe what users want to accomplish. Format: As a [role], I want [feature], so that [benefit].
          </p>
          <div id="user-stories-container">
            <div class="dynamic-item" data-story-index="0">
              <div class="item-header">
                <span class="item-title">User Story 1</span>
                <button type="button" class="btn-remove" onclick="removeStory(this)">×</button>
              </div>
              <div class="form-group">
                <label>Story Title *</label>
                <input type="text" class="story-title" placeholder="e.g., User Login, Create Order, Generate Report" />
              </div>
              <div class="form-row" style="grid-template-columns: repeat(3, 1fr);">
                <div class="form-group">
                  <label>As a...</label>
                  <input type="text" class="story-as-a" placeholder="user, admin, manager" />
                </div>
                <div class="form-group">
                  <label>I want to...</label>
                  <input type="text" class="story-i-want" placeholder="log into the system" />
                </div>
                <div class="form-group">
                  <label>So that...</label>
                  <input type="text" class="story-so-that" placeholder="I can access my dashboard" />
                </div>
              </div>
              <div class="form-group">
                <label>Acceptance Criteria (one per line)</label>
                <textarea class="story-criteria" rows="3" placeholder="User can enter username and password\nSystem validates credentials\nUser is redirected to dashboard on success\nError message shown on invalid credentials"></textarea>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Priority</label>
                  <select class="story-priority">
                    <option value="critical">Critical</option>
                    <option value="high" selected>High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Complexity</label>
                  <select class="story-complexity">
                    <option value="simple">Simple</option>
                    <option value="medium" selected>Medium</option>
                    <option value="complex">Complex</option>
                    <option value="very-complex">Very Complex</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-secondary" onclick="addStory()" style="margin-top: 1rem;">
            <span>+</span> Add Another Story
          </button>
        </div>

        <!-- Step 4: Features -->
        <div class="wizard-content" id="wizard-step-4">
          <h3 style="margin-bottom: 1rem;">⚙️ Features & Inputs</h3>
          <p style="color: var(--gray-500); margin-bottom: 1rem; font-size: 0.9rem;">
            Define the main features and their input fields. This helps us generate boundary and validation tests.
          </p>
          <div id="features-container">
            <div class="dynamic-item" data-feature-index="0">
              <div class="item-header">
                <span class="item-title">Feature 1</span>
                <button type="button" class="btn-remove" onclick="removeFeature(this)">×</button>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Feature Name *</label>
                  <input type="text" class="feature-name" placeholder="e.g., User Registration, Product Search" />
                </div>
                <div class="form-group">
                  <label>Module/Section</label>
                  <input type="text" class="feature-module" placeholder="e.g., Authentication, Catalog" />
                </div>
              </div>
              <div class="form-group">
                <label>Description</label>
                <textarea class="feature-description" rows="2" placeholder="Describe what this feature does..."></textarea>
              </div>
              <div class="form-group">
                <label>Input Fields (JSON format - we'll help you build this)</label>
                <textarea class="feature-inputs" rows="4" placeholder='[
  {"name": "email", "type": "email", "required": true, "maxLength": 100},
  {"name": "password", "type": "password", "required": true, "minLength": 8},
  {"name": "age", "type": "number", "minValue": 18, "maxValue": 120}
]'></textarea>
              </div>
              <div class="form-group">
                <label>Business Rules (one per line)</label>
                <textarea class="feature-rules" rows="2" placeholder="Email must be unique\nPassword must contain uppercase and number"></textarea>
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-secondary" onclick="addFeature()" style="margin-top: 1rem;">
            <span>+</span> Add Another Feature
          </button>
        </div>

        <!-- Step 5: Critical Flows -->
        <div class="wizard-content" id="wizard-step-5">
          <h3 style="margin-bottom: 1rem;">🎯 Critical User Flows</h3>
          <p style="color: var(--gray-500); margin-bottom: 1rem; font-size: 0.9rem;">
            Define the most important user journeys that must always work. These get highest test priority.
          </p>
          <div id="flows-container">
            <div class="dynamic-item" data-flow-index="0">
              <div class="item-header">
                <span class="item-title">Critical Flow 1</span>
                <button type="button" class="btn-remove" onclick="removeFlow(this)">×</button>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Flow Name *</label>
                  <input type="text" class="flow-name" placeholder="e.g., Complete Purchase, User Onboarding" />
                </div>
                <div class="form-group">
                  <label>User Role</label>
                  <input type="text" class="flow-role" placeholder="e.g., Customer, Admin" />
                </div>
              </div>
              <div class="form-group">
                <label>Steps (one per line, in order)</label>
                <textarea class="flow-steps" rows="4" placeholder="1. User adds item to cart\n2. User proceeds to checkout\n3. User enters shipping info\n4. User enters payment details\n5. User confirms order\n6. Order confirmation displayed"></textarea>
              </div>
              <div class="form-group">
                <label>Expected Final Outcome</label>
                <input type="text" class="flow-outcome" placeholder="e.g., Order is created and confirmation email sent" />
              </div>
              <div class="form-row" style="grid-template-columns: repeat(3, 1fr);">
                <div class="form-group">
                  <label>Priority</label>
                  <select class="flow-priority">
                    <option value="critical" selected>Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Usage Frequency</label>
                  <select class="flow-frequency">
                    <option value="very-high">Very High</option>
                    <option value="high" selected>High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Business Impact</label>
                  <select class="flow-impact">
                    <option value="critical" selected>Critical (Revenue)</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-secondary" onclick="addFlow()" style="margin-top: 1rem;">
            <span>+</span> Add Another Flow
          </button>
        </div>

        <!-- Step 6: Test Scope -->
        <div class="wizard-content" id="wizard-step-6">
          <h3 style="margin-bottom: 1rem;">🎚️ Testing Scope & Configuration</h3>
          <p style="color: var(--gray-500); margin-bottom: 1rem; font-size: 0.9rem;">
            Configure what types of tests to generate. More options = more comprehensive coverage.
          </p>

          <div class="scope-section">
            <h4>Test Types</h4>
            <div class="checkbox-grid">
              <label class="checkbox-card">
                <input type="checkbox" id="scope-positive" checked />
                <span class="checkbox-label">✅ Positive Tests</span>
                <span class="checkbox-desc">Happy path scenarios</span>
              </label>
              <label class="checkbox-card">
                <input type="checkbox" id="scope-negative" checked />
                <span class="checkbox-label">❌ Negative Tests</span>
                <span class="checkbox-desc">Invalid inputs, errors</span>
              </label>
              <label class="checkbox-card">
                <input type="checkbox" id="scope-boundary" checked />
                <span class="checkbox-label">📏 Boundary Tests</span>
                <span class="checkbox-desc">Min/max value testing</span>
              </label>
              <label class="checkbox-card">
                <input type="checkbox" id="scope-edge" checked />
                <span class="checkbox-label">🔀 Edge Cases</span>
                <span class="checkbox-desc">Unusual scenarios</span>
              </label>
              <label class="checkbox-card">
                <input type="checkbox" id="scope-security" checked />
                <span class="checkbox-label">🔒 Security Tests</span>
                <span class="checkbox-desc">Injection, XSS, auth bypass</span>
              </label>
              <label class="checkbox-card">
                <input type="checkbox" id="scope-accessibility" />
                <span class="checkbox-label">♿ Accessibility</span>
                <span class="checkbox-desc">WCAG compliance</span>
              </label>
            </div>
          </div>

          <div class="scope-section" style="margin-top: 1.5rem;">
            <h4>Test Depth</h4>
            <div class="form-group">
              <select id="scope-depth" style="max-width: 300px;">
                <option value="shallow">Shallow - Basic coverage</option>
                <option value="moderate">Moderate - Standard coverage</option>
                <option value="deep" selected>Deep - Thorough coverage</option>
                <option value="exhaustive">Exhaustive - Maximum coverage (like 1000 testers)</option>
              </select>
            </div>
          </div>

          <div class="scope-section" style="margin-top: 1.5rem;">
            <h4>Browser & Device Testing</h4>
            <div class="checkbox-grid" style="grid-template-columns: repeat(3, 1fr);">
              <label class="checkbox-card small">
                <input type="checkbox" id="browser-chromium" checked />
                <span class="checkbox-label">Chrome</span>
              </label>
              <label class="checkbox-card small">
                <input type="checkbox" id="browser-firefox" />
                <span class="checkbox-label">Firefox</span>
              </label>
              <label class="checkbox-card small">
                <input type="checkbox" id="browser-webkit" />
                <span class="checkbox-label">Safari</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Navigation Buttons -->
        <div class="wizard-nav">
          <button type="button" class="btn btn-secondary" id="wizard-prev" style="visibility: hidden;">
            ← Previous
          </button>
          <div style="flex: 1;"></div>
          <button type="button" class="btn btn-primary" id="wizard-next">
            Next →
          </button>
          <button type="button" class="btn btn-success" id="wizard-generate" style="display: none;">
            🚀 Generate Test Suite
          </button>
        </div>

        <!-- Generation Results -->
        <div id="generation-results" style="display: none; margin-top: 2rem;">
          <div class="results-summary">
            <h3>🎉 Test Suite Generated!</h3>
            <div class="results-grid" style="margin-top: 1rem;">
              <div class="stat-card total">
                <div class="stat-value" id="gen-scenarios">0</div>
                <div class="stat-label">Test Scenarios</div>
              </div>
              <div class="stat-card passed">
                <div class="stat-value" id="gen-positive">0</div>
                <div class="stat-label">Positive Tests</div>
              </div>
              <div class="stat-card failed">
                <div class="stat-value" id="gen-negative">0</div>
                <div class="stat-label">Negative Tests</div>
              </div>
              <div class="stat-card" style="border-left: 4px solid var(--warning);">
                <div class="stat-value" id="gen-total" style="color: var(--warning);">0</div>
                <div class="stat-label">Total Test Cases</div>
              </div>
            </div>
          </div>

          <div style="margin-top: 1.5rem;">
            <h4>Test Strategy Summary</h4>
            <div id="strategy-summary" style="background: var(--gray-50); padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem;"></div>
          </div>

          <div style="margin-top: 1.5rem;">
            <h4>Recommendations</h4>
            <div id="recommendations-list" style="margin-top: 0.5rem;"></div>
          </div>

          <div style="margin-top: 1.5rem; display: flex; gap: 1rem;">
            <button type="button" class="btn btn-primary" id="btn-execute-intelligent">
              ▶️ Execute All Tests
            </button>
            <a href="/generated/intelligent/generated-test-cases.csv" download class="btn btn-secondary">
              📥 Download CSV
            </a>
            <button type="button" class="btn btn-secondary" onclick="resetWizard()">
              🔄 Start Over
            </button>
          </div>
        </div>

        <div class="status-log" id="intelligent-log" style="display: none;"></div>
      </div>

      <!-- Discover Tab -->
      <div class="tab-content" id="discover">
        <h2 style="margin-bottom: 1.5rem;">Quick Discovery Mode</h2>
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

    // ==========================================
    // INTELLIGENT TESTING WIZARD
    // ==========================================

    let currentWizardStep = 1;
    const totalWizardSteps = 6;

    // Wizard navigation
    document.getElementById('wizard-next').addEventListener('click', () => {
      if (currentWizardStep < totalWizardSteps) {
        goToWizardStep(currentWizardStep + 1);
      }
    });

    document.getElementById('wizard-prev').addEventListener('click', () => {
      if (currentWizardStep > 1) {
        goToWizardStep(currentWizardStep - 1);
      }
    });

    function goToWizardStep(step) {
      // Update step indicators
      document.querySelectorAll('.wizard-step').forEach((s, index) => {
        s.classList.remove('active');
        if (index + 1 < step) {
          s.classList.add('completed');
        } else {
          s.classList.remove('completed');
        }
        if (index + 1 === step) {
          s.classList.add('active');
        }
      });

      // Update content
      document.querySelectorAll('.wizard-content').forEach(c => c.classList.remove('active'));
      document.getElementById('wizard-step-' + step).classList.add('active');

      // Update buttons
      document.getElementById('wizard-prev').style.visibility = step === 1 ? 'hidden' : 'visible';
      document.getElementById('wizard-next').style.display = step === totalWizardSteps ? 'none' : 'inline-flex';
      document.getElementById('wizard-generate').style.display = step === totalWizardSteps ? 'inline-flex' : 'none';

      currentWizardStep = step;
    }

    // Dynamic item management
    let roleIndex = 1;
    let storyIndex = 1;
    let featureIndex = 1;
    let flowIndex = 1;

    function addRole() {
      const container = document.getElementById('user-roles-container');
      const template = container.querySelector('.dynamic-item').cloneNode(true);
      template.setAttribute('data-role-index', roleIndex);
      template.querySelector('.item-title').textContent = 'Role ' + (roleIndex + 1);
      template.querySelectorAll('input, textarea, select').forEach(el => el.value = '');
      container.appendChild(template);
      roleIndex++;
    }

    function removeRole(btn) {
      const container = document.getElementById('user-roles-container');
      if (container.querySelectorAll('.dynamic-item').length > 1) {
        btn.closest('.dynamic-item').remove();
      }
    }

    function addStory() {
      const container = document.getElementById('user-stories-container');
      const template = container.querySelector('.dynamic-item').cloneNode(true);
      template.setAttribute('data-story-index', storyIndex);
      template.querySelector('.item-title').textContent = 'User Story ' + (storyIndex + 1);
      template.querySelectorAll('input, textarea, select').forEach(el => el.value = '');
      container.appendChild(template);
      storyIndex++;
    }

    function removeStory(btn) {
      const container = document.getElementById('user-stories-container');
      if (container.querySelectorAll('.dynamic-item').length > 1) {
        btn.closest('.dynamic-item').remove();
      }
    }

    function addFeature() {
      const container = document.getElementById('features-container');
      const template = container.querySelector('.dynamic-item').cloneNode(true);
      template.setAttribute('data-feature-index', featureIndex);
      template.querySelector('.item-title').textContent = 'Feature ' + (featureIndex + 1);
      template.querySelectorAll('input, textarea').forEach(el => el.value = '');
      container.appendChild(template);
      featureIndex++;
    }

    function removeFeature(btn) {
      const container = document.getElementById('features-container');
      if (container.querySelectorAll('.dynamic-item').length > 1) {
        btn.closest('.dynamic-item').remove();
      }
    }

    function addFlow() {
      const container = document.getElementById('flows-container');
      const template = container.querySelector('.dynamic-item').cloneNode(true);
      template.setAttribute('data-flow-index', flowIndex);
      template.querySelector('.item-title').textContent = 'Critical Flow ' + (flowIndex + 1);
      template.querySelectorAll('input, textarea').forEach(el => el.value = '');
      container.appendChild(template);
      flowIndex++;
    }

    function removeFlow(btn) {
      const container = document.getElementById('flows-container');
      if (container.querySelectorAll('.dynamic-item').length > 1) {
        btn.closest('.dynamic-item').remove();
      }
    }

    // Collect wizard data
    function collectWizardData() {
      const project = {
        name: document.getElementById('proj-name').value,
        description: document.getElementById('proj-description').value,
        baseUrl: document.getElementById('proj-url').value,
        framework: document.getElementById('proj-framework').value,
        industry: document.getElementById('proj-industry').value,
        userRoles: [],
        userStories: [],
        features: [],
        criticalFlows: [],
        testingScope: {
          includePositive: document.getElementById('scope-positive').checked,
          includeNegative: document.getElementById('scope-negative').checked,
          includeBoundary: document.getElementById('scope-boundary').checked,
          includeEdgeCases: document.getElementById('scope-edge').checked,
          includeSecurity: document.getElementById('scope-security').checked,
          includeAccessibility: document.getElementById('scope-accessibility').checked,
          testDepth: document.getElementById('scope-depth').value,
          browsers: [],
        }
      };

      // Collect browsers
      if (document.getElementById('browser-chromium').checked) project.testingScope.browsers.push('chromium');
      if (document.getElementById('browser-firefox').checked) project.testingScope.browsers.push('firefox');
      if (document.getElementById('browser-webkit').checked) project.testingScope.browsers.push('webkit');

      // Collect roles
      document.querySelectorAll('#user-roles-container .dynamic-item').forEach(item => {
        const name = item.querySelector('.role-name').value;
        if (name) {
          project.userRoles.push({
            name,
            accessLevel: item.querySelector('.role-access').value,
            permissions: item.querySelector('.role-permissions').value.split(',').map(s => s.trim()).filter(s => s),
            restrictions: item.querySelector('.role-restrictions').value.split(',').map(s => s.trim()).filter(s => s),
            credentials: {
              username: item.querySelector('.role-username').value,
              password: item.querySelector('.role-password').value,
            }
          });
        }
      });

      // Collect stories
      document.querySelectorAll('#user-stories-container .dynamic-item').forEach(item => {
        const title = item.querySelector('.story-title').value;
        if (title) {
          project.userStories.push({
            title,
            asA: item.querySelector('.story-as-a').value,
            iWant: item.querySelector('.story-i-want').value,
            soThat: item.querySelector('.story-so-that').value,
            acceptanceCriteria: item.querySelector('.story-criteria').value.split('\\n').filter(s => s.trim()),
            priority: item.querySelector('.story-priority').value,
            complexity: item.querySelector('.story-complexity').value,
          });
        }
      });

      // Collect features
      document.querySelectorAll('#features-container .dynamic-item').forEach(item => {
        const name = item.querySelector('.feature-name').value;
        if (name) {
          let inputs = [];
          try {
            const inputsStr = item.querySelector('.feature-inputs').value;
            if (inputsStr) {
              inputs = JSON.parse(inputsStr);
            }
          } catch (e) {
            console.log('Invalid inputs JSON');
          }

          project.features.push({
            name,
            module: item.querySelector('.feature-module').value,
            description: item.querySelector('.feature-description').value,
            inputs,
            businessRules: item.querySelector('.feature-rules').value.split('\\n').filter(s => s.trim()).map(r => ({ description: r })),
            outputs: [],
            validations: inputs.filter(i => i.required).map(i => ({ field: i.name, type: 'required', rule: 'required', errorMessage: i.name + ' is required' })),
          });
        }
      });

      // Collect flows
      document.querySelectorAll('#flows-container .dynamic-item').forEach(item => {
        const name = item.querySelector('.flow-name').value;
        if (name) {
          project.criticalFlows.push({
            name,
            userRole: item.querySelector('.flow-role').value,
            steps: item.querySelector('.flow-steps').value.split('\\n').filter(s => s.trim()),
            expectedOutcome: item.querySelector('.flow-outcome').value,
            priority: item.querySelector('.flow-priority').value,
            frequency: item.querySelector('.flow-frequency').value,
            businessImpact: item.querySelector('.flow-impact').value,
          });
        }
      });

      return project;
    }

    // Generate test suite
    document.getElementById('wizard-generate').addEventListener('click', async () => {
      const project = collectWizardData();

      if (!project.name || !project.baseUrl) {
        showNotification('Please enter project name and URL', 'error');
        goToWizardStep(1);
        return;
      }

      const btn = document.getElementById('wizard-generate');
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Generating...';

      document.getElementById('intelligent-log').style.display = 'block';

      try {
        const response = await fetch('/api/intelligent-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project })
        });

        const data = await response.json();

        if (data.error) {
          showNotification(data.error, 'error');
        } else {
          // Show results
          document.getElementById('generation-results').style.display = 'block';
          document.getElementById('gen-scenarios').textContent = data.suite.scenarios?.length || 0;
          document.getElementById('gen-positive').textContent = data.suite.coverage?.positiveTests || 0;
          document.getElementById('gen-negative').textContent = data.suite.coverage?.negativeTests || 0;
          document.getElementById('gen-total').textContent = data.suite.coverage?.totalTests || 0;

          // Strategy summary
          const strategy = data.strategy;
          document.getElementById('strategy-summary').innerHTML =
            '<p><strong>Approach:</strong> ' + (strategy.approach || 'Comprehensive testing') + '</p>' +
            '<p><strong>Phases:</strong> ' + (strategy.testPhases?.map(p => p.name).join(' → ') || 'Standard') + '</p>' +
            '<p><strong>Risk Areas:</strong> ' + (strategy.riskAreas?.length || 0) + ' identified</p>';

          // Recommendations
          const recsHtml = (data.report.recommendations || []).map(rec =>
            '<div class="recommendation-item">' +
            '<div class="icon">' + (rec.type === 'coverage' ? '📊' : rec.type === 'risk' ? '⚠️' : '💡') + '</div>' +
            '<div class="content">' +
            '<div class="title">' + rec.title + '</div>' +
            '<div class="desc">' + rec.description + '</div>' +
            '</div>' +
            '<span class="impact ' + rec.impact + '">' + rec.impact.toUpperCase() + '</span>' +
            '</div>'
          ).join('');
          document.getElementById('recommendations-list').innerHTML = recsHtml || '<p style="color: var(--gray-500);">No recommendations - great coverage!</p>';

          showNotification('Test suite generated successfully!', 'success');
        }
      } catch (error) {
        showNotification('Failed to generate tests: ' + error.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '🚀 Generate Test Suite';
      }
    });

    // Execute intelligent tests
    document.getElementById('btn-execute-intelligent').addEventListener('click', async () => {
      const btn = document.getElementById('btn-execute-intelligent');
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Executing...';

      try {
        const response = await fetch('/api/intelligent-execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseUrl: document.getElementById('proj-url').value
          })
        });

        const data = await response.json();

        if (data.error) {
          showNotification(data.error, 'error');
        } else {
          showNotification('Tests executed! Check Results tab.', 'success');
          loadResults();
        }
      } catch (error) {
        showNotification('Failed to execute tests: ' + error.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '▶️ Execute All Tests';
      }
    });

    // Reset wizard
    function resetWizard() {
      goToWizardStep(1);
      document.getElementById('generation-results').style.display = 'none';
      document.getElementById('intelligent-log').style.display = 'none';
      document.getElementById('intelligent-log').innerHTML = '';

      // Clear all inputs
      document.querySelectorAll('#intelligent input, #intelligent textarea').forEach(el => el.value = '');
      document.querySelectorAll('#intelligent select').forEach(el => el.selectedIndex = 0);

      // Reset checkboxes
      document.getElementById('scope-positive').checked = true;
      document.getElementById('scope-negative').checked = true;
      document.getElementById('scope-boundary').checked = true;
      document.getElementById('scope-edge').checked = true;
      document.getElementById('scope-security').checked = true;
      document.getElementById('scope-accessibility').checked = false;
      document.getElementById('browser-chromium').checked = true;
      document.getElementById('browser-firefox').checked = false;
      document.getElementById('browser-webkit').checked = false;

      // Reset dynamic items to just one each
      ['user-roles-container', 'user-stories-container', 'features-container', 'flows-container'].forEach(containerId => {
        const container = document.getElementById(containerId);
        const items = container.querySelectorAll('.dynamic-item');
        items.forEach((item, index) => {
          if (index > 0) item.remove();
          else {
            item.querySelectorAll('input, textarea').forEach(el => el.value = '');
            item.querySelectorAll('select').forEach(el => el.selectedIndex = 0);
          }
        });
      });

      roleIndex = 1;
      storyIndex = 1;
      featureIndex = 1;
      flowIndex = 1;
    }

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
