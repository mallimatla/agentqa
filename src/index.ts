/**
 * AgentQA - Autonomous Web Application Testing Platform
 *
 * A comprehensive, zero-configuration testing framework that can:
 * - Auto-discover web application elements and generate test cases
 * - Parse test cases from CSV files
 * - Generate Playwright test scripts
 * - Execute tests with credential management
 * - Generate comprehensive HTML dashboards and JSON reports
 *
 * @packageDocumentation
 */

// Core modules
export { WebCrawler } from './core/crawler/web-crawler';
export { CSVParser } from './core/parser/csv-parser';
export { ScriptGenerator } from './core/generator/script-generator';
export { TestExecutor } from './core/executor/test-executor';
export { DashboardReporter } from './core/reporter/dashboard-reporter';

// Types
export * from './types';

// Utilities
export { logger, console_log } from './utils/logger';

// Version
export const VERSION = '1.0.0';

/**
 * Quick start function for common use cases
 */
export async function quickStart(options: {
  url: string;
  mode: 'discover' | 'execute' | 'full';
  csvPath?: string;
  credentials?: {
    username?: string;
    password?: string;
    email?: string;
    token?: string;
  };
  authConfig?: {
    type: 'form' | 'basic' | 'token';
    loginUrl?: string;
    usernameSelector?: string;
    passwordSelector?: string;
    submitSelector?: string;
  };
  options?: {
    headless?: boolean;
    browser?: 'chromium' | 'firefox' | 'webkit';
    depth?: number;
    maxPages?: number;
  };
}) {
  const { WebCrawler } = await import('./core/crawler/web-crawler');
  const { CSVParser } = await import('./core/parser/csv-parser');
  const { ScriptGenerator } = await import('./core/generator/script-generator');
  const { TestExecutor } = await import('./core/executor/test-executor');
  const { DashboardReporter } = await import('./core/reporter/dashboard-reporter');

  const reporter = new DashboardReporter();

  if (options.mode === 'discover' || options.mode === 'full') {
    // Discovery
    const crawler = new WebCrawler();
    await crawler.initialize({ headless: options.options?.headless ?? true });

    if (options.authConfig && options.credentials) {
      await crawler.authenticate(options.authConfig as any, options.credentials);
    }

    const discovery = await crawler.discover(options.url, {
      depth: options.options?.depth,
      maxPages: options.options?.maxPages,
      headless: options.options?.headless,
    });

    await crawler.close();

    if (options.mode === 'discover') {
      await reporter.generateDiscoveryReport(discovery);
      return { discovery };
    }

    // Full mode - continue to generate and execute
    if (options.mode === 'full') {
      const suite = {
        id: 'auto-generated',
        name: 'Auto-Generated Test Suite',
        description: `Automatically generated tests for ${options.url}`,
        baseUrl: discovery.baseUrl,
        testCases: discovery.suggestedTestCases,
        credentials: options.credentials,
      };

      const generator = new ScriptGenerator();
      await generator.generateFromSuite(suite as any);

      const executor = new TestExecutor({
        url: options.url,
        browser: options.options?.browser,
        headless: options.options?.headless,
      });

      if (options.credentials) {
        executor.setCredentials(options.credentials);
      }
      if (options.authConfig) {
        executor.setAuthConfig(options.authConfig as any);
      }

      await executor.initialize();
      const result = await executor.executeSuite(suite as any);
      await executor.close();

      await reporter.generateReport(result, discovery, executor.getIssues());

      return { discovery, result };
    }
  }

  if (options.mode === 'execute' && options.csvPath) {
    const parser = new CSVParser();
    const suite = await parser.parseFile(options.csvPath, options.url);

    if (options.credentials) {
      suite.credentials = options.credentials;
    }

    const executor = new TestExecutor({
      url: options.url,
      browser: options.options?.browser,
      headless: options.options?.headless,
    });

    if (options.credentials) {
      executor.setCredentials(options.credentials);
    }
    if (options.authConfig) {
      executor.setAuthConfig(options.authConfig as any);
    }

    await executor.initialize();
    const result = await executor.executeSuite(suite);
    await executor.close();

    await reporter.generateReport(result, undefined, executor.getIssues());

    return { result };
  }

  throw new Error('Invalid options: specify mode and required parameters');
}

// Default export
export default {
  WebCrawler,
  CSVParser,
  ScriptGenerator,
  TestExecutor,
  DashboardReporter,
  quickStart,
  VERSION,
};
