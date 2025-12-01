/**
 * AgentQA Test Executor
 * Executes Playwright tests with comprehensive credential management and reporting
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import {
  TestSuite,
  TestCase,
  TestStep,
  TestSuiteResult,
  TestCaseResult,
  StepResult,
  ExecuteOptions,
  Credentials,
  AuthConfig,
  Issue,
} from '../../types';
import { logger, console_log } from '../../utils/logger';

/**
 * Test Executor class for running Playwright tests
 */
export class TestExecutor {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private currentPage: Page | null = null;
  private credentials: Credentials = {};
  private authConfig: AuthConfig | null = null;
  private options: ExecuteOptions;
  private screenshotsDir: string;
  private videosDir: string;
  private tracesDir: string;
  private issues: Issue[] = [];

  constructor(options: ExecuteOptions = {}) {
    this.options = {
      headless: options.headless ?? true,
      workers: options.workers ?? 1,
      timeout: options.timeout ?? 30000,
      retries: options.retries ?? 1,
      video: options.video ?? false,
      trace: options.trace ?? false,
      ...options,
    };

    // Setup output directories
    const reportsDir = path.join(process.cwd(), 'reports');
    this.screenshotsDir = path.join(reportsDir, 'screenshots');
    this.videosDir = path.join(reportsDir, 'videos');
    this.tracesDir = path.join(reportsDir, 'traces');

    this.ensureDirectories();
  }

  /**
   * Ensure output directories exist
   */
  private ensureDirectories(): void {
    [this.screenshotsDir, this.videosDir, this.tracesDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Set credentials for test execution
   */
  setCredentials(credentials: Credentials): void {
    this.credentials = credentials;
    console_log.info('Credentials configured');
  }

  /**
   * Set authentication configuration
   */
  setAuthConfig(authConfig: AuthConfig): void {
    this.authConfig = authConfig;
    console_log.info(`Authentication configured: ${authConfig.type}`);
  }

  /**
   * Initialize the browser
   */
  async initialize(): Promise<void> {
    console_log.info('Initializing test executor...');

    const browserType = this.options.browser || 'chromium';

    this.browser = await chromium.launch({
      headless: this.options.headless,
      slowMo: this.options.debug ? 100 : 0,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    // Create context with video and trace options
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: this.options.video
        ? { dir: this.videosDir, size: { width: 1920, height: 1080 } }
        : undefined,
      ignoreHTTPSErrors: true,
    });

    // Start tracing if enabled
    if (this.options.trace) {
      await this.context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
      });
    }

    console_log.success('Test executor initialized');
  }

  /**
   * Perform authentication before tests
   */
  async authenticate(): Promise<boolean> {
    if (!this.authConfig || !this.context) {
      return true; // No auth required
    }

    console_log.info('Performing authentication...');
    const page = await this.context.newPage();

    try {
      switch (this.authConfig.type) {
        case 'form':
          await this.formAuthentication(page);
          break;
        case 'basic':
          await this.basicAuthentication(page);
          break;
        case 'token':
          await this.tokenAuthentication(page);
          break;
        default:
          console_log.warning(`Unknown auth type: ${this.authConfig.type}`);
      }

      // Save storage state for reuse
      const storageState = await this.context.storageState();
      fs.writeFileSync(
        path.join(process.cwd(), '.auth-state.json'),
        JSON.stringify(storageState)
      );

      console_log.success('Authentication successful');
      return true;
    } catch (error) {
      console_log.error(`Authentication failed: ${error}`);
      return false;
    } finally {
      await page.close();
    }
  }

  /**
   * Form-based authentication
   */
  private async formAuthentication(page: Page): Promise<void> {
    if (!this.authConfig) return;

    await page.goto(this.authConfig.loginUrl || '/login');
    await page.waitForLoadState('networkidle');

    if (this.authConfig.usernameSelector && this.credentials.username) {
      await page.fill(this.authConfig.usernameSelector, this.credentials.username);
    }
    if (this.authConfig.usernameSelector && this.credentials.email) {
      await page.fill(this.authConfig.usernameSelector, this.credentials.email);
    }
    if (this.authConfig.passwordSelector && this.credentials.password) {
      await page.fill(this.authConfig.passwordSelector, this.credentials.password);
    }
    if (this.authConfig.submitSelector) {
      await page.click(this.authConfig.submitSelector);
    }

    await page.waitForLoadState('networkidle');

    if (this.authConfig.successIndicator) {
      await page.waitForSelector(this.authConfig.successIndicator, { timeout: 10000 });
    }
  }

  /**
   * Basic HTTP authentication
   */
  private async basicAuthentication(page: Page): Promise<void> {
    if (!this.credentials.username || !this.credentials.password) return;

    await this.context!.setHTTPCredentials({
      username: this.credentials.username,
      password: this.credentials.password,
    });
  }

  /**
   * Token-based authentication
   */
  private async tokenAuthentication(page: Page): Promise<void> {
    const baseUrl = this.options.url || 'http://localhost:3000';
    await page.goto(baseUrl);

    if (this.credentials.token) {
      await page.evaluate((token) => {
        localStorage.setItem('token', token);
        localStorage.setItem('authToken', token);
        localStorage.setItem('accessToken', token);
      }, this.credentials.token);
    }

    if (this.credentials.apiKey) {
      await page.evaluate((key) => {
        localStorage.setItem('apiKey', key);
      }, this.credentials.apiKey);
    }

    // Reload to apply authentication
    await page.reload();
    await page.waitForLoadState('networkidle');
  }

  /**
   * Execute a test suite
   */
  async executeSuite(suite: TestSuite): Promise<TestSuiteResult> {
    console_log.title(`Executing Test Suite: ${suite.name}`);
    const startTime = new Date();
    const results: TestCaseResult[] = [];

    // Initialize if not already done
    if (!this.browser) {
      await this.initialize();
    }

    // Set credentials if provided in suite
    if (suite.credentials) {
      this.setCredentials(suite.credentials);
    }

    // Authenticate if config provided
    if (suite.config?.auth) {
      this.setAuthConfig(suite.config.auth);
      await this.authenticate();
    }

    // Run setup if defined
    if (suite.setup && suite.setup.length > 0) {
      console_log.info('Running suite setup...');
      await this.executeSteps(suite.setup, 'setup');
    }

    // Execute test cases
    const testCases = this.filterTestCases(suite.testCases);
    let passedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console_log.subtitle(`[${i + 1}/${testCases.length}] ${testCase.name}`);

      if (testCase.skip) {
        console_log.warning('Skipped');
        skippedCount++;
        results.push({
          testId: testCase.id,
          testName: testCase.name,
          status: 'skipped',
          duration: 0,
          steps: [],
          browser: this.options.browser || 'chromium',
          startTime: new Date(),
          endTime: new Date(),
        });
        continue;
      }

      const result = await this.executeTestCase(testCase, suite.baseUrl);
      results.push(result);

      if (result.status === 'passed') {
        passedCount++;
        console_log.success(`Passed (${result.duration}ms)`);
      } else {
        failedCount++;
        console_log.error(`Failed: ${result.error}`);
      }
    }

    // Run teardown if defined
    if (suite.teardown && suite.teardown.length > 0) {
      console_log.info('Running suite teardown...');
      await this.executeSteps(suite.teardown, 'teardown');
    }

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    const suiteResult: TestSuiteResult = {
      suiteId: suite.id,
      suiteName: suite.name,
      status: failedCount === 0 ? 'passed' : passedCount === 0 ? 'failed' : 'partial',
      testResults: results,
      duration,
      passed: passedCount,
      failed: failedCount,
      skipped: skippedCount,
      passRate: testCases.length > 0 ? (passedCount / testCases.length) * 100 : 0,
      startTime,
      endTime,
      environment: {
        browser: this.options.browser || 'chromium',
        os: process.platform,
        nodeVersion: process.version,
        playwrightVersion: require('playwright/package.json').version,
      },
    };

    this.printSuiteResult(suiteResult);
    return suiteResult;
  }

  /**
   * Filter test cases based on options
   */
  private filterTestCases(testCases: TestCase[]): TestCase[] {
    let filtered = testCases;

    // Filter by tag
    if (this.options.tag) {
      filtered = filtered.filter((tc) => tc.tags.includes(this.options.tag!));
    }

    // Filter by grep pattern
    if (this.options.grep) {
      const pattern = new RegExp(this.options.grep, 'i');
      filtered = filtered.filter((tc) => pattern.test(tc.name) || pattern.test(tc.description));
    }

    // Handle only
    const onlyTests = filtered.filter((tc) => tc.only);
    if (onlyTests.length > 0) {
      filtered = onlyTests;
    }

    return filtered;
  }

  /**
   * Execute a single test case
   */
  private async executeTestCase(testCase: TestCase, baseUrl: string): Promise<TestCaseResult> {
    const startTime = new Date();
    const stepResults: StepResult[] = [];
    let error: string | undefined;
    let status: 'passed' | 'failed' | 'skipped' = 'passed';
    let screenshot: string | undefined;
    let video: string | undefined;
    let trace: string | undefined;

    // Create new page for test case
    this.currentPage = await this.context!.newPage();

    // Set timeout
    this.currentPage.setDefaultTimeout(testCase.timeout || this.options.timeout || 30000);

    let retries = 0;
    const maxRetries = testCase.retries || this.options.retries || 1;

    while (retries < maxRetries) {
      try {
        // Execute all steps
        for (const step of testCase.steps) {
          const stepResult = await this.executeStep(step, baseUrl);
          stepResults.push(stepResult);

          if (stepResult.status === 'failed' && !step.continueOnError) {
            throw new Error(stepResult.error);
          }
        }

        // Run cleanup steps if defined
        if (testCase.cleanup) {
          for (const step of testCase.cleanup) {
            await this.executeStep(step, baseUrl);
          }
        }

        break; // Success, exit retry loop
      } catch (err) {
        retries++;
        error = err instanceof Error ? err.message : String(err);

        if (retries >= maxRetries) {
          status = 'failed';

          // Capture screenshot on failure
          screenshot = path.join(
            this.screenshotsDir,
            `failure-${testCase.id}-${Date.now()}.png`
          );
          await this.currentPage.screenshot({ path: screenshot, fullPage: true });

          // Record issue
          this.issues.push({
            id: `issue-${Date.now()}`,
            testId: testCase.id,
            testName: testCase.name,
            severity: testCase.priority === 'critical' ? 'critical' : 'high',
            type: 'functional',
            title: `Test Failed: ${testCase.name}`,
            description: error,
            steps: testCase.steps.map((s) => s.description),
            expected: testCase.expectedResult,
            actual: error,
            screenshot,
            url: this.currentPage.url(),
            browser: this.options.browser || 'chromium',
            timestamp: new Date(),
            stackTrace: err instanceof Error ? err.stack : undefined,
          });
        } else {
          console_log.warning(`Retry ${retries}/${maxRetries}...`);
        }
      }
    }

    // Get video path if recording
    if (this.options.video) {
      video = await this.currentPage.video()?.path();
    }

    // Stop and save trace if enabled
    if (this.options.trace && this.context) {
      trace = path.join(this.tracesDir, `trace-${testCase.id}-${Date.now()}.zip`);
      await this.context.tracing.stop({ path: trace });
      // Restart tracing for next test
      await this.context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
      });
    }

    await this.currentPage.close();
    this.currentPage = null;

    const endTime = new Date();

    return {
      testId: testCase.id,
      testName: testCase.name,
      status,
      duration: endTime.getTime() - startTime.getTime(),
      steps: stepResults,
      error,
      screenshot,
      video,
      trace,
      browser: this.options.browser || 'chromium',
      startTime,
      endTime,
    };
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: TestStep, baseUrl: string): Promise<StepResult> {
    const startTime = Date.now();
    const logs: string[] = [];
    let error: string | undefined;
    let status: 'passed' | 'failed' | 'skipped' | 'pending' = 'passed';
    let screenshot: string | undefined;

    if (!this.currentPage) {
      return {
        stepId: step.id,
        status: 'failed',
        duration: 0,
        error: 'No page available',
        logs: [],
        retries: 0,
      };
    }

    try {
      logs.push(`Executing: ${step.action} - ${step.description}`);

      await this.performAction(step, baseUrl);

      // Take screenshot if step requires it
      if (step.screenshot) {
        screenshot = path.join(this.screenshotsDir, `step-${step.id}-${Date.now()}.png`);
        await this.currentPage.screenshot({ path: screenshot });
      }

      logs.push('Step completed successfully');
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      status = 'failed';
      logs.push(`Error: ${error}`);

      // Always capture screenshot on error
      if (this.currentPage) {
        screenshot = path.join(this.screenshotsDir, `error-${step.id}-${Date.now()}.png`);
        try {
          await this.currentPage.screenshot({ path: screenshot });
        } catch {
          // Ignore screenshot errors
        }
      }
    }

    return {
      stepId: step.id,
      status,
      duration: Date.now() - startTime,
      error,
      screenshot,
      logs,
      retries: 0,
    };
  }

  /**
   * Perform the actual test action
   */
  private async performAction(step: TestStep, baseUrl: string): Promise<void> {
    if (!this.currentPage) throw new Error('No page available');

    const page = this.currentPage;
    const timeout = step.wait?.timeout || this.options.timeout || 30000;

    switch (step.action) {
      case 'navigate':
        const url = step.value?.startsWith('http') ? step.value : `${baseUrl}${step.value || '/'}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout });
        break;

      case 'click':
        if (!step.selector) throw new Error('Selector required for click');
        await page.locator(step.selector).click({ timeout, ...step.options });
        break;

      case 'doubleClick':
        if (!step.selector) throw new Error('Selector required for double click');
        await page.locator(step.selector).dblclick({ timeout });
        break;

      case 'rightClick':
        if (!step.selector) throw new Error('Selector required for right click');
        await page.locator(step.selector).click({ button: 'right', timeout });
        break;

      case 'type':
        if (!step.selector) throw new Error('Selector required for type');
        const value = this.replaceVariables(step.value || '');
        await page.locator(step.selector).fill(value, { timeout });
        break;

      case 'clear':
        if (!step.selector) throw new Error('Selector required for clear');
        await page.locator(step.selector).clear({ timeout });
        break;

      case 'select':
        if (!step.selector) throw new Error('Selector required for select');
        await page.locator(step.selector).selectOption(step.value || '', { timeout });
        break;

      case 'check':
        if (!step.selector) throw new Error('Selector required for check');
        await page.locator(step.selector).check({ timeout });
        break;

      case 'uncheck':
        if (!step.selector) throw new Error('Selector required for uncheck');
        await page.locator(step.selector).uncheck({ timeout });
        break;

      case 'hover':
        if (!step.selector) throw new Error('Selector required for hover');
        await page.locator(step.selector).hover({ timeout });
        break;

      case 'scroll':
        if (step.selector) {
          await page.locator(step.selector).scrollIntoViewIfNeeded({ timeout });
        } else {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        }
        break;

      case 'dragDrop':
        if (!step.dragDrop) throw new Error('DragDrop config required');
        await page.locator(step.dragDrop.sourceSelector).dragTo(
          page.locator(step.dragDrop.targetSelector),
          { timeout }
        );
        break;

      case 'upload':
        if (!step.selector) throw new Error('Selector required for upload');
        await page.locator(step.selector).setInputFiles(step.value || '', { timeout });
        break;

      case 'keyPress':
        await page.keyboard.press(step.value || 'Enter');
        break;

      case 'wait':
        const waitTime = step.wait?.timeout || 1000;
        await page.waitForTimeout(waitTime);
        break;

      case 'screenshot':
        const ssPath = path.join(this.screenshotsDir, `${step.value || 'screenshot'}-${Date.now()}.png`);
        await page.screenshot({ path: ssPath, fullPage: true });
        break;

      case 'assert':
        await this.performAssertion(page, step, timeout);
        break;

      case 'executeScript':
        if (step.value) {
          await page.evaluate(new Function('return ' + step.value)());
        }
        break;

      case 'refresh':
        await page.reload({ waitUntil: 'networkidle', timeout });
        break;

      case 'goBack':
        await page.goBack({ waitUntil: 'networkidle', timeout });
        break;

      case 'goForward':
        await page.goForward({ waitUntil: 'networkidle', timeout });
        break;

      default:
        throw new Error(`Unknown action: ${step.action}`);
    }

    // Wait after action if specified
    if (step.wait) {
      await this.waitForCondition(page, step.wait.condition, step.wait.timeout || timeout);
    }
  }

  /**
   * Perform assertion
   */
  private async performAssertion(page: Page, step: TestStep, timeout: number): Promise<void> {
    const { expect } = require('@playwright/test');

    if (!step.assertion) throw new Error('Assertion config required');

    const { type, expected } = step.assertion;
    const selector = step.selector || '';

    switch (type) {
      case 'visible':
        await expect(page.locator(selector)).toBeVisible({ timeout });
        break;
      case 'hidden':
        await expect(page.locator(selector)).toBeHidden({ timeout });
        break;
      case 'enabled':
        await expect(page.locator(selector)).toBeEnabled({ timeout });
        break;
      case 'disabled':
        await expect(page.locator(selector)).toBeDisabled({ timeout });
        break;
      case 'checked':
        await expect(page.locator(selector)).toBeChecked({ timeout });
        break;
      case 'textEquals':
        await expect(page.locator(selector)).toHaveText(expected || '', { timeout });
        break;
      case 'textContains':
        await expect(page.locator(selector)).toContainText(expected || '', { timeout });
        break;
      case 'valueEquals':
        await expect(page.locator(selector)).toHaveValue(expected || '', { timeout });
        break;
      case 'urlEquals':
        await expect(page).toHaveURL(expected || '', { timeout });
        break;
      case 'urlContains':
        await expect(page).toHaveURL(new RegExp(expected || ''), { timeout });
        break;
      case 'titleEquals':
        await expect(page).toHaveTitle(expected || '', { timeout });
        break;
      case 'titleContains':
        await expect(page).toHaveTitle(new RegExp(expected || ''), { timeout });
        break;
      case 'elementExists':
        await expect(page.locator(selector)).toHaveCount(1, { timeout });
        break;
      case 'elementNotExists':
        await expect(page.locator(selector)).toHaveCount(0, { timeout });
        break;
      default:
        throw new Error(`Unknown assertion type: ${type}`);
    }
  }

  /**
   * Wait for specific condition
   */
  private async waitForCondition(page: Page, condition: string, timeout: number): Promise<void> {
    switch (condition) {
      case 'networkIdle':
        await page.waitForLoadState('networkidle', { timeout });
        break;
      case 'domLoaded':
        await page.waitForLoadState('domcontentloaded', { timeout });
        break;
      case 'visible':
        // Already handled by locator
        break;
      case 'stable':
        await page.waitForTimeout(500);
        break;
      default:
        await page.waitForTimeout(Math.min(timeout, 1000));
    }
  }

  /**
   * Replace variables in value string
   */
  private replaceVariables(value: string): string {
    let result = value;
    result = result.replace(/\{\{username\}\}/g, this.credentials.username || '');
    result = result.replace(/\{\{password\}\}/g, this.credentials.password || '');
    result = result.replace(/\{\{email\}\}/g, this.credentials.email || '');
    result = result.replace(/\{\{token\}\}/g, this.credentials.token || '');
    return result;
  }

  /**
   * Execute steps without test case context (for setup/teardown)
   */
  private async executeSteps(steps: TestStep[], context: string): Promise<void> {
    if (!this.context) return;

    const page = await this.context.newPage();
    this.currentPage = page;

    try {
      for (const step of steps) {
        await this.performAction(step, this.options.url || '');
      }
    } finally {
      await page.close();
      this.currentPage = null;
    }
  }

  /**
   * Get issues found during execution
   */
  getIssues(): Issue[] {
    return this.issues;
  }

  /**
   * Print suite result summary
   */
  private printSuiteResult(result: TestSuiteResult): void {
    console_log.divider();
    console_log.title('Execution Summary');
    console_log.bullet(`Status: ${result.status.toUpperCase()}`);
    console_log.bullet(`Duration: ${result.duration}ms`);
    console_log.bullet(`Passed: ${result.passed}`);
    console_log.bullet(`Failed: ${result.failed}`);
    console_log.bullet(`Skipped: ${result.skipped}`);
    console_log.bullet(`Pass Rate: ${result.passRate.toFixed(2)}%`);
    console_log.divider();
  }

  /**
   * Run generated Playwright tests using npx
   */
  async runGeneratedTests(testDir: string): Promise<TestSuiteResult> {
    console_log.title('Running Generated Playwright Tests');

    return new Promise((resolve, reject) => {
      const args = ['playwright', 'test', '--config', 'playwright.config.ts'];

      if (this.options.browser && this.options.browser !== 'all') {
        args.push('--project', this.options.browser);
      }

      if (this.options.workers) {
        args.push('--workers', String(this.options.workers));
      }

      if (this.options.retries) {
        args.push('--retries', String(this.options.retries));
      }

      if (this.options.grep) {
        args.push('--grep', this.options.grep);
      }

      const child = spawn('npx', args, {
        cwd: process.cwd(),
        stdio: 'inherit',
        shell: true,
      });

      child.on('close', (code) => {
        // Read the results file
        const resultsPath = path.join(process.cwd(), 'reports', 'results.json');

        if (fs.existsSync(resultsPath)) {
          const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
          resolve(this.convertPlaywrightResults(results));
        } else {
          resolve({
            suiteId: 'generated',
            suiteName: 'Generated Tests',
            status: code === 0 ? 'passed' : 'failed',
            testResults: [],
            duration: 0,
            passed: 0,
            failed: code === 0 ? 0 : 1,
            skipped: 0,
            passRate: code === 0 ? 100 : 0,
            startTime: new Date(),
            endTime: new Date(),
            environment: {
              browser: this.options.browser || 'chromium',
              os: process.platform,
              nodeVersion: process.version,
              playwrightVersion: require('playwright/package.json').version,
            },
          });
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Convert Playwright JSON report to our format
   */
  private convertPlaywrightResults(playwrightResults: any): TestSuiteResult {
    const suites = playwrightResults.suites || [];
    const testResults: TestCaseResult[] = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const suite of suites) {
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          const status = test.status === 'expected' ? 'passed' :
                        test.status === 'skipped' ? 'skipped' : 'failed';

          if (status === 'passed') passed++;
          else if (status === 'failed') failed++;
          else skipped++;

          testResults.push({
            testId: test.testId || spec.title,
            testName: spec.title,
            status,
            duration: test.results?.[0]?.duration || 0,
            steps: [],
            error: test.results?.[0]?.error?.message,
            browser: test.projectName || 'chromium',
            startTime: new Date(test.results?.[0]?.startTime || Date.now()),
            endTime: new Date(),
          });
        }
      }
    }

    return {
      suiteId: 'generated',
      suiteName: 'Generated Tests',
      status: failed === 0 ? 'passed' : passed === 0 ? 'failed' : 'partial',
      testResults,
      duration: playwrightResults.stats?.duration || 0,
      passed,
      failed,
      skipped,
      passRate: testResults.length > 0 ? (passed / testResults.length) * 100 : 0,
      startTime: new Date(playwrightResults.stats?.startTime || Date.now()),
      endTime: new Date(),
      environment: {
        browser: 'chromium',
        os: process.platform,
        nodeVersion: process.version,
        playwrightVersion: require('playwright/package.json').version,
      },
    };
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.context) {
      if (this.options.trace) {
        await this.context.tracing.stop();
      }
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
    console_log.info('Test executor closed');
  }
}

export default TestExecutor;
