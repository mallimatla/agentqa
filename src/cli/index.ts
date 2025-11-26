#!/usr/bin/env node

/**
 * AgentQA CLI
 * Command-line interface for the autonomous testing platform
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { WebCrawler } from '../core/crawler/web-crawler';
import { CSVParser } from '../core/parser/csv-parser';
import { ScriptGenerator } from '../core/generator/script-generator';
import { TestExecutor } from '../core/executor/test-executor';
import { DashboardReporter } from '../core/reporter/dashboard-reporter';
import { console_log } from '../utils/logger';
import {
  TestSuite,
  DiscoverOptions,
  GenerateOptions,
  ExecuteOptions,
  Credentials,
  AuthConfig,
} from '../types';

const program = new Command();

// ASCII Art Banner
const banner = `
${chalk.cyan('╔═══════════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.white('    _                    _    ___    _    ')}           ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.bold.white('   / \\   __ _  ___ _ __ | |_ / _ \\  / \\   ')}           ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.bold.blue('  / _ \\ / _` |/ _ \\ \'_ \\| __| | | |/ _ \\  ')}           ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.bold.blue(' / ___ \\ (_| |  __/ | | | |_| |_| / ___ \\ ')}           ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.bold.magenta('/_/   \\_\\__, |\\___|_| |_|\\__|\\__\\_\\/_/   \\_\\')}           ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.bold.magenta('        |___/                              ')}           ${chalk.cyan('║')}
${chalk.cyan('║')}                                                               ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('Autonomous Web Application Testing Platform')}                ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('Auto-discover • Generate • Execute • Report')}                ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════════════════════════════╝')}
`;

program
  .name('agentqa')
  .description('AgentQA - Autonomous Web Application Testing Platform')
  .version('1.0.0')
  .hook('preAction', () => {
    console.log(banner);
  });

// ============================================================================
// DISCOVER COMMAND
// ============================================================================
program
  .command('discover')
  .description('Discover and analyze a web application, auto-generate test cases')
  .argument('<url>', 'The URL of the web application to discover')
  .option('-d, --depth <number>', 'Maximum crawl depth', '3')
  .option('-p, --pages <number>', 'Maximum pages to crawl', '50')
  .option('-s, --screenshot', 'Take screenshots during discovery', false)
  .option('--headless', 'Run in headless mode', true)
  .option('-a, --auth <type>', 'Authentication type (form, basic, token)')
  .option('-o, --output <dir>', 'Output directory for results')
  .action(async (url: string, options: any) => {
    const spinner = ora('Initializing discovery...').start();

    try {
      const crawler = new WebCrawler();
      await crawler.initialize({ headless: options.headless !== false });

      // Handle authentication if required
      if (options.auth) {
        const credentials = await promptCredentials(options.auth);
        const authConfig = await promptAuthConfig(options.auth, url);
        await crawler.authenticate(authConfig, credentials);
      }

      spinner.text = 'Discovering web application...';

      const discoveryOptions: DiscoverOptions = {
        depth: parseInt(options.depth),
        maxPages: parseInt(options.pages),
        screenshot: options.screenshot,
        headless: options.headless !== false,
      };

      const result = await crawler.discover(url, discoveryOptions);

      spinner.succeed('Discovery completed!');

      // Generate reports
      const reporter = new DashboardReporter({
        outputDir: options.output || path.join(process.cwd(), 'reports'),
        openAfterGeneration: true,
      });

      await reporter.generateDiscoveryReport(result);

      // Export suggested test cases to CSV
      if (result.suggestedTestCases.length > 0) {
        const csvParser = new CSVParser();
        const suite: TestSuite = {
          id: 'discovered',
          name: 'Discovered Tests',
          description: `Auto-generated tests from ${url}`,
          baseUrl: result.baseUrl,
          testCases: result.suggestedTestCases,
        };

        const csvPath = path.join(
          options.output || process.cwd(),
          'generated',
          'discovered-test-cases.csv'
        );

        if (!fs.existsSync(path.dirname(csvPath))) {
          fs.mkdirSync(path.dirname(csvPath), { recursive: true });
        }

        await csvParser.exportToCSV(suite, csvPath);
        console_log.success(`Test cases exported to: ${csvPath}`);
      }

      await crawler.close();

      // Summary
      console.log('\n');
      console_log.title('Discovery Summary');
      console_log.bullet(`Pages discovered: ${result.statistics.totalPages}`);
      console_log.bullet(`Elements found: ${result.statistics.totalElements}`);
      console_log.bullet(`Forms found: ${result.statistics.totalForms}`);
      console_log.bullet(`Test cases generated: ${result.suggestedTestCases.length}`);
      console_log.bullet(`Framework detected: ${result.framework}`);

    } catch (error) {
      spinner.fail('Discovery failed');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// ============================================================================
// GENERATE COMMAND
// ============================================================================
program
  .command('generate')
  .description('Generate Playwright test scripts from CSV test cases')
  .argument('<csv>', 'Path to CSV file containing test cases')
  .argument('<url>', 'Base URL of the application')
  .option('-o, --output <dir>', 'Output directory for generated tests')
  .option('-t, --template <type>', 'Template type (typescript, javascript)', 'typescript')
  .option('--page-object', 'Generate page object models', false)
  .option('--comments', 'Include comments in generated code', true)
  .action(async (csvPath: string, url: string, options: any) => {
    const spinner = ora('Parsing CSV file...').start();

    try {
      // Parse CSV
      const parser = new CSVParser();
      const suite = await parser.parseFile(csvPath, url);

      spinner.text = 'Generating Playwright tests...';

      // Generate tests
      const generator = new ScriptGenerator({
        output: options.output || path.join(process.cwd(), 'generated', 'tests'),
        template: options.template,
        pageObject: options.pageObject,
        includeComments: options.comments !== false,
      });

      const files = await generator.generateFromSuite(suite);

      spinner.succeed('Test generation completed!');

      console.log('\n');
      console_log.title('Generated Files');
      files.forEach((file) => {
        console_log.bullet(path.relative(process.cwd(), file));
      });

      console.log('\n');
      console_log.info(`Run tests with: ${chalk.cyan('npx playwright test')}`);

    } catch (error) {
      spinner.fail('Generation failed');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// ============================================================================
// EXECUTE COMMAND
// ============================================================================
program
  .command('execute')
  .description('Execute test cases against a web application')
  .argument('<url>', 'Base URL of the application')
  .option('-c, --csv <path>', 'Path to CSV file with test cases')
  .option('-g, --generated', 'Run generated Playwright tests', false)
  .option('-b, --browser <type>', 'Browser to use (chromium, firefox, webkit)', 'chromium')
  .option('--headless', 'Run in headless mode', true)
  .option('-w, --workers <number>', 'Number of parallel workers', '1')
  .option('-r, --retries <number>', 'Number of retries on failure', '1')
  .option('-t, --tag <tag>', 'Run only tests with this tag')
  .option('--grep <pattern>', 'Run only tests matching pattern')
  .option('--video', 'Record video', false)
  .option('--trace', 'Capture trace', false)
  .option('-a, --auth <type>', 'Authentication type (form, basic, token)')
  .action(async (url: string, options: any) => {
    const spinner = ora('Preparing test execution...').start();

    try {
      const executeOptions: ExecuteOptions = {
        url,
        browser: options.browser,
        headless: options.headless !== false,
        workers: parseInt(options.workers),
        retries: parseInt(options.retries),
        tag: options.tag,
        grep: options.grep,
        video: options.video,
        trace: options.trace,
      };

      // Handle authentication
      let credentials: Credentials | undefined;
      let authConfig: AuthConfig | undefined;

      if (options.auth) {
        credentials = await promptCredentials(options.auth);
        authConfig = await promptAuthConfig(options.auth, url);
      }

      let result;

      if (options.generated) {
        // Run generated Playwright tests
        spinner.text = 'Running generated Playwright tests...';
        const executor = new TestExecutor(executeOptions);
        result = await executor.runGeneratedTests(
          path.join(process.cwd(), 'generated', 'tests')
        );
      } else if (options.csv) {
        // Parse CSV and execute
        spinner.text = 'Parsing test cases...';
        const parser = new CSVParser();
        const suite = await parser.parseFile(options.csv, url);

        if (credentials) {
          suite.credentials = credentials;
        }
        if (authConfig) {
          suite.config = { ...suite.config, auth: authConfig, baseUrl: url };
        }

        spinner.text = 'Executing tests...';
        const executor = new TestExecutor(executeOptions);

        if (credentials) {
          executor.setCredentials(credentials);
        }
        if (authConfig) {
          executor.setAuthConfig(authConfig);
        }

        await executor.initialize();
        result = await executor.executeSuite(suite);
        await executor.close();
      } else {
        spinner.fail('Please provide --csv or --generated option');
        process.exit(1);
      }

      spinner.succeed('Test execution completed!');

      // Generate report
      const reporter = new DashboardReporter({
        openAfterGeneration: true,
      });

      const executor = new TestExecutor(executeOptions);
      await reporter.generateReport(result, undefined, executor.getIssues());

      // Summary
      console.log('\n');
      console_log.title('Execution Summary');
      console_log.bullet(`Status: ${result.status.toUpperCase()}`);
      console_log.bullet(`Passed: ${result.passed}`);
      console_log.bullet(`Failed: ${result.failed}`);
      console_log.bullet(`Skipped: ${result.skipped}`);
      console_log.bullet(`Pass Rate: ${result.passRate.toFixed(2)}%`);
      console_log.bullet(`Duration: ${result.duration}ms`);

    } catch (error) {
      spinner.fail('Execution failed');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// ============================================================================
// RUN COMMAND (All-in-one)
// ============================================================================
program
  .command('run')
  .description('Complete workflow: discover, generate, and execute tests')
  .argument('<url>', 'URL of the web application')
  .option('-a, --auth <type>', 'Authentication type (form, basic, token)')
  .option('--headless', 'Run in headless mode', true)
  .option('-d, --depth <number>', 'Maximum crawl depth', '3')
  .action(async (url: string, options: any) => {
    console_log.title('AgentQA Complete Workflow');

    try {
      // Handle authentication
      let credentials: Credentials | undefined;
      let authConfig: AuthConfig | undefined;

      if (options.auth) {
        credentials = await promptCredentials(options.auth);
        authConfig = await promptAuthConfig(options.auth, url);
      }

      // Step 1: Discover
      console_log.subtitle('Step 1: Discovery');
      const crawler = new WebCrawler();
      await crawler.initialize({ headless: options.headless !== false });

      if (authConfig && credentials) {
        await crawler.authenticate(authConfig, credentials);
      }

      const discovery = await crawler.discover(url, {
        depth: parseInt(options.depth),
        screenshot: true,
        headless: options.headless !== false,
      });

      await crawler.close();

      if (discovery.suggestedTestCases.length === 0) {
        console_log.warning('No test cases generated from discovery');
        return;
      }

      // Step 2: Generate
      console_log.subtitle('Step 2: Generate Tests');
      const suite: TestSuite = {
        id: 'auto-generated',
        name: 'Auto-Generated Test Suite',
        description: `Automatically generated tests for ${url}`,
        baseUrl: discovery.baseUrl,
        testCases: discovery.suggestedTestCases,
        credentials,
        config: authConfig ? { baseUrl: url, auth: authConfig } : undefined,
      };

      const generator = new ScriptGenerator({
        template: 'typescript',
        includeComments: true,
      });

      await generator.generateFromSuite(suite);

      // Step 3: Execute
      console_log.subtitle('Step 3: Execute Tests');
      const executor = new TestExecutor({
        url,
        headless: options.headless !== false,
        video: true,
      });

      if (credentials) {
        executor.setCredentials(credentials);
      }
      if (authConfig) {
        executor.setAuthConfig(authConfig);
      }

      await executor.initialize();
      const result = await executor.executeSuite(suite);
      await executor.close();

      // Step 4: Report
      console_log.subtitle('Step 4: Generate Report');
      const reporter = new DashboardReporter({
        openAfterGeneration: true,
      });

      await reporter.generateReport(result, discovery, executor.getIssues());

      // Final Summary
      console.log('\n');
      console_log.title('Complete Workflow Summary');
      console_log.divider();
      console_log.bullet(`URL Tested: ${url}`);
      console_log.bullet(`Pages Discovered: ${discovery.statistics.totalPages}`);
      console_log.bullet(`Tests Generated: ${discovery.suggestedTestCases.length}`);
      console_log.bullet(`Tests Passed: ${result.passed}`);
      console_log.bullet(`Tests Failed: ${result.failed}`);
      console_log.bullet(`Pass Rate: ${result.passRate.toFixed(2)}%`);
      console_log.divider();

    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// ============================================================================
// TEMPLATE COMMAND
// ============================================================================
program
  .command('template')
  .description('Generate a CSV template for test cases')
  .option('-o, --output <path>', 'Output path for template')
  .action(async (options: any) => {
    try {
      const parser = new CSVParser();
      const outputPath = options.output || path.join(process.cwd(), 'test-cases-template.csv');
      await parser.generateTemplate(outputPath);
      console_log.success(`Template created: ${outputPath}`);
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// ============================================================================
// SERVE COMMAND
// ============================================================================
program
  .command('serve')
  .description('Start live dashboard server')
  .option('-p, --port <number>', 'Port number', '3000')
  .action(async (options: any) => {
    try {
      const reporter = new DashboardReporter();
      const url = await reporter.startLiveServer(parseInt(options.port));
      console_log.success(`Dashboard running at ${url}`);
      console_log.info('Press Ctrl+C to stop');
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// ============================================================================
// WEB UI COMMAND
// ============================================================================
program
  .command('ui')
  .description('Start the beautiful web UI dashboard')
  .option('-p, --port <number>', 'Port number', '3000')
  .action(async (options: any) => {
    try {
      const { WebUIServer } = await import('../web/server');
      const server = new WebUIServer(parseInt(options.port));
      await server.start();
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// ============================================================================
// INTERACTIVE MODE
// ============================================================================
program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode')
  .action(async () => {
    console.log(banner);

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Discover a web application', value: 'discover' },
          { name: 'Generate tests from CSV', value: 'generate' },
          { name: 'Execute tests', value: 'execute' },
          { name: 'Complete workflow (discover + generate + execute)', value: 'run' },
          { name: 'Generate CSV template', value: 'template' },
          { name: 'Start dashboard server', value: 'serve' },
          { name: 'Exit', value: 'exit' },
        ],
      },
    ]);

    if (answers.action === 'exit') {
      process.exit(0);
    }

    if (answers.action === 'discover' || answers.action === 'run') {
      const urlAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'url',
          message: 'Enter the web application URL:',
          validate: (input: string) => {
            try {
              new URL(input);
              return true;
            } catch {
              return 'Please enter a valid URL';
            }
          },
        },
        {
          type: 'confirm',
          name: 'requiresAuth',
          message: 'Does this application require authentication?',
          default: false,
        },
      ]);

      let authType;
      if (urlAnswer.requiresAuth) {
        const authAnswer = await inquirer.prompt([
          {
            type: 'list',
            name: 'authType',
            message: 'Select authentication type:',
            choices: ['form', 'basic', 'token'],
          },
        ]);
        authType = authAnswer.authType;
      }

      const args = [answers.action, urlAnswer.url];
      if (authType) {
        args.push('--auth', authType);
      }

      program.parse(['node', 'agentqa', ...args]);
    }

    if (answers.action === 'generate') {
      const genAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'csv',
          message: 'Enter path to CSV file:',
        },
        {
          type: 'input',
          name: 'url',
          message: 'Enter base URL:',
        },
      ]);

      program.parse(['node', 'agentqa', 'generate', genAnswer.csv, genAnswer.url]);
    }

    if (answers.action === 'execute') {
      const execAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'url',
          message: 'Enter base URL:',
        },
        {
          type: 'list',
          name: 'source',
          message: 'Test source:',
          choices: [
            { name: 'CSV file', value: 'csv' },
            { name: 'Generated tests', value: 'generated' },
          ],
        },
      ]);

      const args = ['execute', execAnswer.url];
      if (execAnswer.source === 'csv') {
        const csvAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'path',
            message: 'Enter CSV file path:',
          },
        ]);
        args.push('--csv', csvAnswer.path);
      } else {
        args.push('--generated');
      }

      program.parse(['node', 'agentqa', ...args]);
    }

    if (answers.action === 'template') {
      program.parse(['node', 'agentqa', 'template']);
    }

    if (answers.action === 'serve') {
      program.parse(['node', 'agentqa', 'serve']);
    }
  });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function promptCredentials(authType: string): Promise<Credentials> {
  const questions: any[] = [];

  if (authType === 'form' || authType === 'basic') {
    questions.push(
      {
        type: 'input',
        name: 'username',
        message: 'Enter username/email:',
      },
      {
        type: 'password',
        name: 'password',
        message: 'Enter password:',
        mask: '*',
      }
    );
  }

  if (authType === 'token') {
    questions.push({
      type: 'password',
      name: 'token',
      message: 'Enter authentication token:',
      mask: '*',
    });
  }

  return inquirer.prompt(questions);
}

async function promptAuthConfig(authType: string, baseUrl: string): Promise<AuthConfig> {
  const config: AuthConfig = { type: authType as any };

  if (authType === 'form') {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'loginUrl',
        message: 'Login page URL:',
        default: `${baseUrl}/login`,
      },
      {
        type: 'input',
        name: 'usernameSelector',
        message: 'Username input selector:',
        default: '[name="username"], [name="email"], #username, #email',
      },
      {
        type: 'input',
        name: 'passwordSelector',
        message: 'Password input selector:',
        default: '[name="password"], #password, [type="password"]',
      },
      {
        type: 'input',
        name: 'submitSelector',
        message: 'Submit button selector:',
        default: '[type="submit"], button:has-text("Login"), button:has-text("Sign in")',
      },
      {
        type: 'input',
        name: 'successIndicator',
        message: 'Success indicator selector (element visible after login):',
        default: '',
      },
    ]);

    return { ...config, ...answers };
  }

  return config;
}

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
