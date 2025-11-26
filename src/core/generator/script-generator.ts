/**
 * AgentQA Playwright Script Generator
 * Generates executable Playwright test scripts from test cases
 */

import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';
import { v4 as uuidv4 } from 'uuid';
import {
  TestSuite,
  TestCase,
  TestStep,
  GenerateOptions,
  Credentials,
} from '../../types';
import { logger, console_log } from '../../utils/logger';

/**
 * Playwright Script Generator class
 */
export class ScriptGenerator {
  private outputDir: string;
  private template: 'typescript' | 'javascript';
  private includeComments: boolean;
  private pageObjectEnabled: boolean;

  constructor(options: GenerateOptions = {}) {
    this.outputDir = options.output || path.join(process.cwd(), 'generated', 'tests');
    this.template = options.template || 'typescript';
    this.includeComments = options.includeComments ?? true;
    this.pageObjectEnabled = options.pageObject ?? false;

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generate Playwright tests from a TestSuite
   */
  async generateFromSuite(suite: TestSuite): Promise<string[]> {
    console_log.title('Generating Playwright Tests');
    console_log.info(`Output directory: ${this.outputDir}`);
    console_log.info(`Template: ${this.template}`);
    console_log.info(`Test cases: ${suite.testCases.length}`);

    const generatedFiles: string[] = [];

    // Generate setup file
    const setupFile = await this.generateSetupFile(suite);
    generatedFiles.push(setupFile);

    // Generate test file
    const testFile = await this.generateTestFile(suite);
    generatedFiles.push(testFile);

    // Generate page objects if enabled
    if (this.pageObjectEnabled) {
      const pageObjectFiles = await this.generatePageObjects(suite);
      generatedFiles.push(...pageObjectFiles);
    }

    // Generate fixtures file
    const fixturesFile = await this.generateFixtures(suite);
    generatedFiles.push(fixturesFile);

    console_log.success(`Generated ${generatedFiles.length} files`);
    return generatedFiles;
  }

  /**
   * Generate setup/config file
   */
  private async generateSetupFile(suite: TestSuite): Promise<string> {
    const ext = this.template === 'typescript' ? 'ts' : 'js';
    const filePath = path.join(this.outputDir, `setup.${ext}`);

    const content = this.template === 'typescript'
      ? this.generateTypeScriptSetup(suite)
      : this.generateJavaScriptSetup(suite);

    fs.writeFileSync(filePath, content);
    console_log.bullet(`Created: setup.${ext}`);
    return filePath;
  }

  /**
   * Generate TypeScript setup file
   */
  private generateTypeScriptSetup(suite: TestSuite): string {
    return `/**
 * AgentQA Generated Test Setup
 * Suite: ${suite.name}
 * Generated: ${new Date().toISOString()}
 */

import { test as base, expect, Page } from '@playwright/test';

// Test configuration
export const CONFIG = {
  baseUrl: '${suite.baseUrl}',
  timeout: ${suite.config?.timeout || 30000},
  retries: ${suite.config?.retries || 1},
};

// Variables (replace with actual values or load from environment)
export const VARIABLES: Record<string, string> = ${JSON.stringify(suite.variables || {}, null, 2)};

// Credentials (load from environment variables in production)
export const CREDENTIALS = {
  username: process.env.TEST_USERNAME || '${suite.credentials?.username || ''}',
  password: process.env.TEST_PASSWORD || '${suite.credentials?.password || ''}',
  email: process.env.TEST_EMAIL || '${suite.credentials?.email || ''}',
};

// Helper function to replace variables in strings
export function replaceVariables(value: string): string {
  let result = value;
  for (const [key, val] of Object.entries(VARIABLES)) {
    result = result.replace(new RegExp(\`\\\\{\\\\{\${key}\\\\}\\\\}\`, 'g'), val);
  }
  // Replace credential variables
  result = result.replace(/\\{\\{username\\}\\}/g, CREDENTIALS.username);
  result = result.replace(/\\{\\{password\\}\\}/g, CREDENTIALS.password);
  result = result.replace(/\\{\\{email\\}\\}/g, CREDENTIALS.email);
  return result;
}

// Custom test fixture with authentication
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    // Add authentication logic here if needed
    await use(page);
  },
});

export { expect };
`;
  }

  /**
   * Generate JavaScript setup file
   */
  private generateJavaScriptSetup(suite: TestSuite): string {
    return `/**
 * AgentQA Generated Test Setup
 * Suite: ${suite.name}
 * Generated: ${new Date().toISOString()}
 */

const { test: base, expect } = require('@playwright/test');

// Test configuration
const CONFIG = {
  baseUrl: '${suite.baseUrl}',
  timeout: ${suite.config?.timeout || 30000},
  retries: ${suite.config?.retries || 1},
};

// Variables (replace with actual values or load from environment)
const VARIABLES = ${JSON.stringify(suite.variables || {}, null, 2)};

// Credentials (load from environment variables in production)
const CREDENTIALS = {
  username: process.env.TEST_USERNAME || '${suite.credentials?.username || ''}',
  password: process.env.TEST_PASSWORD || '${suite.credentials?.password || ''}',
  email: process.env.TEST_EMAIL || '${suite.credentials?.email || ''}',
};

// Helper function to replace variables in strings
function replaceVariables(value) {
  let result = value;
  for (const [key, val] of Object.entries(VARIABLES)) {
    result = result.replace(new RegExp(\`\\\\{\\\\{\${key}\\\\}\\\\}\`, 'g'), val);
  }
  result = result.replace(/\\{\\{username\\}\\}/g, CREDENTIALS.username);
  result = result.replace(/\\{\\{password\\}\\}/g, CREDENTIALS.password);
  result = result.replace(/\\{\\{email\\}\\}/g, CREDENTIALS.email);
  return result;
}

const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    await use(page);
  },
});

module.exports = { test, expect, CONFIG, VARIABLES, CREDENTIALS, replaceVariables };
`;
  }

  /**
   * Generate main test file
   */
  private async generateTestFile(suite: TestSuite): Promise<string> {
    const ext = this.template === 'typescript' ? 'ts' : 'js';
    const fileName = this.sanitizeFileName(suite.name);
    const filePath = path.join(this.outputDir, `${fileName}.spec.${ext}`);

    const content = this.template === 'typescript'
      ? this.generateTypeScriptTests(suite)
      : this.generateJavaScriptTests(suite);

    fs.writeFileSync(filePath, content);
    console_log.bullet(`Created: ${fileName}.spec.${ext}`);
    return filePath;
  }

  /**
   * Generate TypeScript test file
   */
  private generateTypeScriptTests(suite: TestSuite): string {
    const imports = `/**
 * AgentQA Generated Tests
 * Suite: ${suite.name}
 * Description: ${suite.description}
 * Generated: ${new Date().toISOString()}
 */

import { test, expect, CONFIG, replaceVariables } from './setup';
import { Page } from '@playwright/test';

`;

    const helpers = this.generateHelperFunctions();

    const tests = suite.testCases.map((tc) => this.generateTestCase(tc)).join('\n\n');

    return imports + helpers + `\ntest.describe('${suite.name}', () => {\n${tests}\n});\n`;
  }

  /**
   * Generate JavaScript test file
   */
  private generateJavaScriptTests(suite: TestSuite): string {
    const imports = `/**
 * AgentQA Generated Tests
 * Suite: ${suite.name}
 * Description: ${suite.description}
 * Generated: ${new Date().toISOString()}
 */

const { test, expect, CONFIG, replaceVariables } = require('./setup');

`;

    const helpers = this.generateHelperFunctions();

    const tests = suite.testCases.map((tc) => this.generateTestCase(tc)).join('\n\n');

    return imports + helpers + `\ntest.describe('${suite.name}', () => {\n${tests}\n});\n`;
  }

  /**
   * Generate helper functions
   */
  private generateHelperFunctions(): string {
    return `
// Helper: Get locator based on selector strategy
async function getLocator(page${this.template === 'typescript' ? ': Page' : ''}, selector${this.template === 'typescript' ? ': string' : ''}, strategy${this.template === 'typescript' ? ': string' : ''} = 'css') {
  switch (strategy) {
    case 'testId':
      return page.getByTestId(selector.replace('[data-testid="', '').replace('"]', ''));
    case 'role':
      return page.getByRole(selector${this.template === 'typescript' ? ' as any' : ''});
    case 'text':
      return page.getByText(selector);
    case 'label':
      return page.getByLabel(selector);
    case 'placeholder':
      return page.getByPlaceholder(selector);
    case 'xpath':
      return page.locator(\`xpath=\${selector}\`);
    case 'id':
      return page.locator(selector.startsWith('#') ? selector : \`#\${selector}\`);
    case 'name':
      return page.locator(\`[name="\${selector.replace('[name="', '').replace('"]', '')}"]\`);
    default:
      return page.locator(selector);
  }
}

// Helper: Wait for condition
async function waitForCondition(page${this.template === 'typescript' ? ': Page' : ''}, condition${this.template === 'typescript' ? ': string' : ''}, timeout${this.template === 'typescript' ? ': number' : ''} = 5000) {
  switch (condition) {
    case 'networkIdle':
      await page.waitForLoadState('networkidle', { timeout });
      break;
    case 'domLoaded':
      await page.waitForLoadState('domcontentloaded', { timeout });
      break;
    case 'stable':
      await page.waitForTimeout(500);
      break;
    default:
      await page.waitForTimeout(Math.min(timeout, 1000));
  }
}

`;
  }

  /**
   * Generate a single test case
   */
  private generateTestCase(testCase: TestCase): string {
    const comments = this.includeComments
      ? `  ${this.comment(`Test: ${testCase.name}`)}\n  ${this.comment(`Category: ${testCase.category} | Priority: ${testCase.priority}`)}\n  ${this.comment(`Expected: ${testCase.expectedResult}`)}\n`
      : '';

    const tags = testCase.tags.map((t) => `@${t}`).join(' ');
    const testFn = testCase.skip ? 'test.skip' : testCase.only ? 'test.only' : 'test';

    const steps = testCase.steps
      .map((step) => this.generateStep(step))
      .join('\n');

    return `${comments}  ${testFn}('${this.escapeString(testCase.name)} ${tags}', async ({ page }) => {
    test.setTimeout(${testCase.timeout || 60000});
${steps}
  });`;
  }

  /**
   * Generate a single test step
   */
  private generateStep(step: TestStep): string {
    const comment = this.includeComments
      ? `\n    ${this.comment(`Step ${step.order}: ${step.description}`)}`
      : '';

    let code = '';

    switch (step.action) {
      case 'navigate':
        code = this.generateNavigateStep(step);
        break;
      case 'click':
        code = this.generateClickStep(step);
        break;
      case 'doubleClick':
        code = this.generateDoubleClickStep(step);
        break;
      case 'rightClick':
        code = this.generateRightClickStep(step);
        break;
      case 'type':
        code = this.generateTypeStep(step);
        break;
      case 'clear':
        code = this.generateClearStep(step);
        break;
      case 'select':
        code = this.generateSelectStep(step);
        break;
      case 'check':
        code = this.generateCheckStep(step);
        break;
      case 'uncheck':
        code = this.generateUncheckStep(step);
        break;
      case 'hover':
        code = this.generateHoverStep(step);
        break;
      case 'scroll':
        code = this.generateScrollStep(step);
        break;
      case 'dragDrop':
        code = this.generateDragDropStep(step);
        break;
      case 'upload':
        code = this.generateUploadStep(step);
        break;
      case 'keyPress':
        code = this.generateKeyPressStep(step);
        break;
      case 'wait':
        code = this.generateWaitStep(step);
        break;
      case 'screenshot':
        code = this.generateScreenshotStep(step);
        break;
      case 'assert':
        code = this.generateAssertStep(step);
        break;
      case 'executeScript':
        code = this.generateExecuteScriptStep(step);
        break;
      case 'iframe':
        code = this.generateIframeStep(step);
        break;
      case 'refresh':
        code = `    await page.reload();`;
        break;
      case 'goBack':
        code = `    await page.goBack();`;
        break;
      case 'goForward':
        code = `    await page.goForward();`;
        break;
      default:
        code = `    // Unknown action: ${step.action}`;
    }

    // Add wait after action if specified
    if (step.wait) {
      code += `\n    await waitForCondition(page, '${step.wait.condition}', ${step.wait.timeout || 5000});`;
    }

    // Add screenshot if specified
    if (step.screenshot) {
      code += `\n    await page.screenshot({ path: 'reports/screenshots/step-${step.order}-${Date.now()}.png' });`;
    }

    // Wrap in try-catch if continueOnError is true
    if (step.continueOnError) {
      code = `    try {\n  ${code.split('\n').join('\n  ')}\n    } catch (error) {\n      console.warn('Step ${step.order} failed but continuing:', error);\n    }`;
    }

    return comment + '\n' + code;
  }

  /**
   * Generate navigation step
   */
  private generateNavigateStep(step: TestStep): string {
    const url = step.value?.startsWith('http')
      ? step.value
      : `\${CONFIG.baseUrl}${step.value || '/'}`;
    return `    await page.goto(\`${url}\`);`;
  }

  /**
   * Generate click step
   */
  private generateClickStep(step: TestStep): string {
    if (!step.selector) return '    // Click step missing selector';
    const options = step.options ? `, ${JSON.stringify(step.options)}` : '';
    return `    const clickTarget = await getLocator(page, '${this.escapeString(step.selector)}', '${step.selectorStrategy || 'css'}');
    await clickTarget.click(${options ? options.substring(2) : ''});`;
  }

  /**
   * Generate double click step
   */
  private generateDoubleClickStep(step: TestStep): string {
    if (!step.selector) return '    // Double click step missing selector';
    return `    const dblClickTarget = await getLocator(page, '${this.escapeString(step.selector)}', '${step.selectorStrategy || 'css'}');
    await dblClickTarget.dblclick();`;
  }

  /**
   * Generate right click step
   */
  private generateRightClickStep(step: TestStep): string {
    if (!step.selector) return '    // Right click step missing selector';
    return `    const rightClickTarget = await getLocator(page, '${this.escapeString(step.selector)}', '${step.selectorStrategy || 'css'}');
    await rightClickTarget.click({ button: 'right' });`;
  }

  /**
   * Generate type step
   */
  private generateTypeStep(step: TestStep): string {
    if (!step.selector) return '    // Type step missing selector';
    const value = step.value || '';
    return `    const typeTarget = await getLocator(page, '${this.escapeString(step.selector)}', '${step.selectorStrategy || 'css'}');
    await typeTarget.fill(replaceVariables('${this.escapeString(value)}'));`;
  }

  /**
   * Generate clear step
   */
  private generateClearStep(step: TestStep): string {
    if (!step.selector) return '    // Clear step missing selector';
    return `    const clearTarget = await getLocator(page, '${this.escapeString(step.selector)}', '${step.selectorStrategy || 'css'}');
    await clearTarget.clear();`;
  }

  /**
   * Generate select step
   */
  private generateSelectStep(step: TestStep): string {
    if (!step.selector) return '    // Select step missing selector';
    const value = step.value || '';
    return `    const selectTarget = await getLocator(page, '${this.escapeString(step.selector)}', '${step.selectorStrategy || 'css'}');
    await selectTarget.selectOption('${this.escapeString(value)}');`;
  }

  /**
   * Generate check step
   */
  private generateCheckStep(step: TestStep): string {
    if (!step.selector) return '    // Check step missing selector';
    return `    const checkTarget = await getLocator(page, '${this.escapeString(step.selector)}', '${step.selectorStrategy || 'css'}');
    await checkTarget.check();`;
  }

  /**
   * Generate uncheck step
   */
  private generateUncheckStep(step: TestStep): string {
    if (!step.selector) return '    // Uncheck step missing selector';
    return `    const uncheckTarget = await getLocator(page, '${this.escapeString(step.selector)}', '${step.selectorStrategy || 'css'}');
    await uncheckTarget.uncheck();`;
  }

  /**
   * Generate hover step
   */
  private generateHoverStep(step: TestStep): string {
    if (!step.selector) return '    // Hover step missing selector';
    return `    const hoverTarget = await getLocator(page, '${this.escapeString(step.selector)}', '${step.selectorStrategy || 'css'}');
    await hoverTarget.hover();`;
  }

  /**
   * Generate scroll step
   */
  private generateScrollStep(step: TestStep): string {
    if (step.selector) {
      return `    const scrollTarget = await getLocator(page, '${this.escapeString(step.selector)}', '${step.selectorStrategy || 'css'}');
    await scrollTarget.scrollIntoViewIfNeeded();`;
    }
    return `    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));`;
  }

  /**
   * Generate drag and drop step
   */
  private generateDragDropStep(step: TestStep): string {
    if (!step.dragDrop) return '    // Drag-drop step missing configuration';
    return `    const dragSource = await getLocator(page, '${this.escapeString(step.dragDrop.sourceSelector)}', 'css');
    const dropTarget = await getLocator(page, '${this.escapeString(step.dragDrop.targetSelector)}', 'css');
    await dragSource.dragTo(dropTarget);`;
  }

  /**
   * Generate file upload step
   */
  private generateUploadStep(step: TestStep): string {
    if (!step.selector) return '    // Upload step missing selector';
    const filePath = step.value || '';
    return `    const uploadInput = await getLocator(page, '${this.escapeString(step.selector)}', '${step.selectorStrategy || 'css'}');
    await uploadInput.setInputFiles('${this.escapeString(filePath)}');`;
  }

  /**
   * Generate key press step
   */
  private generateKeyPressStep(step: TestStep): string {
    const key = step.value || 'Enter';
    return `    await page.keyboard.press('${key}');`;
  }

  /**
   * Generate wait step
   */
  private generateWaitStep(step: TestStep): string {
    const timeout = step.wait?.timeout || 5000;
    return `    await page.waitForTimeout(${timeout});`;
  }

  /**
   * Generate screenshot step
   */
  private generateScreenshotStep(step: TestStep): string {
    const name = step.value || `screenshot-${Date.now()}`;
    return `    await page.screenshot({ path: 'reports/screenshots/${name}.png', fullPage: true });`;
  }

  /**
   * Generate assertion step
   */
  private generateAssertStep(step: TestStep): string {
    if (!step.assertion) return '    // Assert step missing assertion configuration';

    const { type, expected, timeout } = step.assertion;
    const selector = step.selector;

    switch (type) {
      case 'visible':
        return `    await expect(page.locator('${this.escapeString(selector || '')}')).toBeVisible({ timeout: ${timeout || 5000} });`;
      case 'hidden':
        return `    await expect(page.locator('${this.escapeString(selector || '')}')).toBeHidden({ timeout: ${timeout || 5000} });`;
      case 'enabled':
        return `    await expect(page.locator('${this.escapeString(selector || '')}')).toBeEnabled({ timeout: ${timeout || 5000} });`;
      case 'disabled':
        return `    await expect(page.locator('${this.escapeString(selector || '')}')).toBeDisabled({ timeout: ${timeout || 5000} });`;
      case 'checked':
        return `    await expect(page.locator('${this.escapeString(selector || '')}')).toBeChecked({ timeout: ${timeout || 5000} });`;
      case 'unchecked':
        return `    await expect(page.locator('${this.escapeString(selector || '')}')).not.toBeChecked({ timeout: ${timeout || 5000} });`;
      case 'textEquals':
        return `    await expect(page.locator('${this.escapeString(selector || '')}')).toHaveText('${this.escapeString(expected || '')}', { timeout: ${timeout || 5000} });`;
      case 'textContains':
        return `    await expect(page.locator('${this.escapeString(selector || '')}')).toContainText('${this.escapeString(expected || '')}', { timeout: ${timeout || 5000} });`;
      case 'valueEquals':
        return `    await expect(page.locator('${this.escapeString(selector || '')}')).toHaveValue('${this.escapeString(expected || '')}', { timeout: ${timeout || 5000} });`;
      case 'urlEquals':
        return `    await expect(page).toHaveURL('${this.escapeString(expected || '')}', { timeout: ${timeout || 5000} });`;
      case 'urlContains':
        return `    await expect(page).toHaveURL(new RegExp('${this.escapeString(expected || '')}'), { timeout: ${timeout || 5000} });`;
      case 'titleEquals':
        return `    await expect(page).toHaveTitle('${this.escapeString(expected || '')}', { timeout: ${timeout || 5000} });`;
      case 'titleContains':
        return `    await expect(page).toHaveTitle(new RegExp('${this.escapeString(expected || '')}'), { timeout: ${timeout || 5000} });`;
      case 'elementExists':
        return `    await expect(page.locator('${this.escapeString(selector || '')}')).toHaveCount(1, { timeout: ${timeout || 5000} });`;
      case 'elementNotExists':
        return `    await expect(page.locator('${this.escapeString(selector || '')}')).toHaveCount(0, { timeout: ${timeout || 5000} });`;
      case 'hasClass':
        return `    await expect(page.locator('${this.escapeString(selector || '')}')).toHaveClass(new RegExp('${this.escapeString(expected || '')}'), { timeout: ${timeout || 5000} });`;
      case 'attributeEquals':
        const attr = step.assertion.attribute || 'class';
        return `    await expect(page.locator('${this.escapeString(selector || '')}')).toHaveAttribute('${attr}', '${this.escapeString(expected || '')}', { timeout: ${timeout || 5000} });`;
      case 'elementCount':
        return `    await expect(page.locator('${this.escapeString(selector || '')}')).toHaveCount(${parseInt(expected || '0')}, { timeout: ${timeout || 5000} });`;
      default:
        return `    // Unknown assertion type: ${type}`;
    }
  }

  /**
   * Generate execute script step
   */
  private generateExecuteScriptStep(step: TestStep): string {
    const script = step.value || '() => {}';
    return `    await page.evaluate(${script});`;
  }

  /**
   * Generate iframe step
   */
  private generateIframeStep(step: TestStep): string {
    if (!step.selector) return '    // Iframe step missing selector';
    return `    const frameLocator = page.frameLocator('${this.escapeString(step.selector)}');
    // Use frameLocator for subsequent operations within the iframe`;
  }

  /**
   * Generate fixtures file
   */
  private async generateFixtures(suite: TestSuite): Promise<string> {
    const ext = this.template === 'typescript' ? 'ts' : 'js';
    const filePath = path.join(this.outputDir, `fixtures.${ext}`);

    const content = `/**
 * AgentQA Test Fixtures
 * Generated: ${new Date().toISOString()}
 */

${this.template === 'typescript' ? "import { test as base } from '@playwright/test';" : "const { test: base } = require('@playwright/test');"}

// Custom fixtures for common test scenarios
${this.template === 'typescript' ? 'export ' : ''}const testFixtures = {
  // Add custom fixtures here
  testData: {
    user: {
      email: 'test@example.com',
      password: 'TestPassword123!',
      name: 'Test User',
    },
    product: {
      name: 'Test Product',
      price: 99.99,
      quantity: 1,
    },
  },

  // Generate random test data
  generateEmail: ()${this.template === 'typescript' ? ': string' : ''} => \`test-\${Date.now()}@example.com\`,
  generateName: ()${this.template === 'typescript' ? ': string' : ''} => \`User \${Math.random().toString(36).substring(7)}\`,
  generatePhone: ()${this.template === 'typescript' ? ': string' : ''} => \`+1\${Math.floor(1000000000 + Math.random() * 9000000000)}\`,
};

${this.template === 'typescript' ? 'export default testFixtures;' : 'module.exports = { testFixtures };'}
`;

    fs.writeFileSync(filePath, content);
    console_log.bullet(`Created: fixtures.${ext}`);
    return filePath;
  }

  /**
   * Generate page objects
   */
  private async generatePageObjects(suite: TestSuite): Promise<string[]> {
    const files: string[] = [];
    const ext = this.template === 'typescript' ? 'ts' : 'js';
    const pagesDir = path.join(this.outputDir, 'pages');

    if (!fs.existsSync(pagesDir)) {
      fs.mkdirSync(pagesDir, { recursive: true });
    }

    // Extract unique pages from test cases
    const pages = new Set<string>();
    for (const testCase of suite.testCases) {
      for (const step of testCase.steps) {
        if (step.action === 'navigate' && step.value) {
          const pageName = this.extractPageName(step.value);
          pages.add(pageName);
        }
      }
    }

    // Generate page object for each page
    for (const pageName of pages) {
      const content = this.generatePageObject(pageName, suite);
      const filePath = path.join(pagesDir, `${pageName}.page.${ext}`);
      fs.writeFileSync(filePath, content);
      files.push(filePath);
      console_log.bullet(`Created: pages/${pageName}.page.${ext}`);
    }

    return files;
  }

  /**
   * Generate a single page object
   */
  private generatePageObject(pageName: string, suite: TestSuite): string {
    const className = this.toPascalCase(pageName) + 'Page';

    if (this.template === 'typescript') {
      return `/**
 * Page Object: ${className}
 * Generated: ${new Date().toISOString()}
 */

import { Page, Locator } from '@playwright/test';

export class ${className} {
  readonly page: Page;

  // Locators
  // Add page-specific locators here

  constructor(page: Page) {
    this.page = page;
  }

  async navigate(): Promise<void> {
    await this.page.goto('${suite.baseUrl}/${pageName}');
  }

  // Add page-specific methods here
}

export default ${className};
`;
    }

    return `/**
 * Page Object: ${className}
 * Generated: ${new Date().toISOString()}
 */

class ${className} {
  constructor(page) {
    this.page = page;
  }

  async navigate() {
    await this.page.goto('${suite.baseUrl}/${pageName}');
  }

  // Add page-specific methods here
}

module.exports = { ${className} };
`;
  }

  /**
   * Utility methods
   */
  private comment(text: string): string {
    return `// ${text}`;
  }

  private escapeString(str: string): string {
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  private sanitizeFileName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private extractPageName(url: string): string {
    const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '');
    return path.split('/')[0] || 'home';
  }

  private toPascalCase(str: string): string {
    return str
      .split(/[-_\s]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }
}

export default ScriptGenerator;
