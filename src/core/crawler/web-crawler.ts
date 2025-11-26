/**
 * AgentQA Web Crawler / Discovery Engine
 * Automatically discovers UI elements, forms, and interactions
 * Generates test cases from discovered elements
 */

import { chromium, Browser, Page, BrowserContext, Locator } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import {
  DiscoveryResult,
  DiscoveredPage,
  DiscoveredElement,
  DiscoveredForm,
  DiscoveredLink,
  DiscoveredInteraction,
  TestCase,
  TestStep,
  SitemapNode,
  ElementType,
  SelectorStrategy,
  TestCategory,
  AuthConfig,
  Credentials,
  DiscoverOptions,
} from '../../types';
import { logger, console_log } from '../../utils/logger';

/**
 * Framework detection patterns
 */
const FRAMEWORK_PATTERNS = {
  angular: [
    'ng-version',
    'ng-app',
    '_nghost',
    '_ngcontent',
    'ng-reflect',
    '[ngClass]',
    '[(ngModel)]',
  ],
  react: [
    'data-reactroot',
    'data-reactid',
    '__reactInternalInstance',
    '_reactRootContainer',
    'data-react-helmet',
  ],
  nextjs: [
    '__NEXT_DATA__',
    'next/head',
    'data-nextjs',
    '__next',
  ],
  vue: [
    'data-v-',
    '__vue__',
    'data-vue',
    'v-cloak',
  ],
};

/**
 * Interactive element selectors
 */
const INTERACTIVE_SELECTORS = {
  buttons: 'button, [role="button"], input[type="submit"], input[type="button"], a.btn, .button',
  links: 'a[href]',
  inputs: 'input:not([type="hidden"]), textarea, select',
  forms: 'form',
  clickable: '[onclick], [ng-click], [\\(click\\)], [v-on\\:click], [@click]',
  draggable: '[draggable="true"], .draggable, [data-draggable]',
  droppable: '[data-droppable], .droppable, .drop-zone',
  modals: '[role="dialog"], .modal, .dialog, [aria-modal="true"]',
  tabs: '[role="tab"], .tab, .nav-tab',
  dropdowns: 'select, [role="listbox"], [role="combobox"], .dropdown, .select',
  checkboxes: 'input[type="checkbox"], [role="checkbox"]',
  radios: 'input[type="radio"], [role="radio"]',
  sliders: 'input[type="range"], [role="slider"]',
  toggles: '[role="switch"], .toggle, .switch',
};

/**
 * Web Crawler class for discovering web application elements
 */
export class WebCrawler {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private visitedUrls = new Set<string>();
  private discoveredPages: DiscoveredPage[] = [];
  private errors: Array<{ url: string; error: string; timestamp: Date }> = [];
  private baseUrl: string = '';
  private maxDepth: number = 3;
  private maxPages: number = 50;
  private screenshotsDir: string = '';

  /**
   * Initialize the crawler
   */
  async initialize(options: {
    headless?: boolean;
    slowMo?: number;
    viewport?: { width: number; height: number };
  } = {}): Promise<void> {
    console_log.info('Initializing web crawler...');

    this.browser = await chromium.launch({
      headless: options.headless ?? true,
      slowMo: options.slowMo ?? 0,
    });

    this.context = await this.browser.newContext({
      viewport: options.viewport || { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    });

    console_log.success('Web crawler initialized');
  }

  /**
   * Perform authentication if required
   */
  async authenticate(
    authConfig: AuthConfig,
    credentials: Credentials
  ): Promise<void> {
    if (!this.context) throw new Error('Crawler not initialized');

    console_log.info('Performing authentication...');
    const page = await this.context.newPage();

    try {
      if (authConfig.type === 'form') {
        await page.goto(authConfig.loginUrl || `${this.baseUrl}/login`);
        await page.waitForLoadState('networkidle');

        if (authConfig.usernameSelector && credentials.username) {
          await page.fill(authConfig.usernameSelector, credentials.username);
        }
        if (authConfig.passwordSelector && credentials.password) {
          await page.fill(authConfig.passwordSelector, credentials.password);
        }
        if (authConfig.submitSelector) {
          await page.click(authConfig.submitSelector);
          await page.waitForLoadState('networkidle');
        }

        // Wait for success indicator
        if (authConfig.successIndicator) {
          await page.waitForSelector(authConfig.successIndicator, { timeout: 10000 });
        }

        console_log.success('Authentication successful');
      } else if (authConfig.type === 'token' && credentials.token) {
        // Set token in local storage or cookies
        await page.goto(this.baseUrl);
        await page.evaluate((token) => {
          localStorage.setItem('token', token);
          localStorage.setItem('authToken', token);
        }, credentials.token);
      }

      // Save authentication state
      const storageState = await this.context.storageState();
      fs.writeFileSync(
        path.join(process.cwd(), '.auth-state.json'),
        JSON.stringify(storageState)
      );
    } finally {
      await page.close();
    }
  }

  /**
   * Main discovery method - crawl and discover the web application
   */
  async discover(
    url: string,
    options: DiscoverOptions = {}
  ): Promise<DiscoveryResult> {
    const startTime = new Date();
    this.baseUrl = new URL(url).origin;
    this.maxDepth = options.depth || 3;
    this.maxPages = options.maxPages || 50;

    // Create screenshots directory if needed
    if (options.screenshot) {
      this.screenshotsDir = path.join(process.cwd(), 'reports', 'discovery-screenshots');
      if (!fs.existsSync(this.screenshotsDir)) {
        fs.mkdirSync(this.screenshotsDir, { recursive: true });
      }
    }

    console_log.title('Starting Web Discovery');
    console_log.info(`Base URL: ${this.baseUrl}`);
    console_log.info(`Max Depth: ${this.maxDepth}`);
    console_log.info(`Max Pages: ${this.maxPages}`);

    if (!this.browser) {
      await this.initialize({ headless: options.headless ?? true });
    }

    // Start crawling from the base URL
    await this.crawlPage(url, 0, options.screenshot || false);

    const endTime = new Date();

    // Detect framework
    const framework = await this.detectFramework();

    // Generate suggested test cases
    const suggestedTestCases = this.generateTestCases();

    // Build sitemap
    const sitemap = this.buildSitemap();

    const result: DiscoveryResult = {
      baseUrl: this.baseUrl,
      startTime,
      endTime,
      pages: this.discoveredPages,
      sitemap,
      suggestedTestCases,
      framework,
      errors: this.errors,
      statistics: {
        totalPages: this.discoveredPages.length,
        totalElements: this.discoveredPages.reduce((sum, p) => sum + p.elements.length, 0),
        totalForms: this.discoveredPages.reduce((sum, p) => sum + p.forms.length, 0),
        totalLinks: this.discoveredPages.reduce((sum, p) => sum + p.links.length, 0),
        totalInteractions: this.discoveredPages.reduce((sum, p) => sum + p.interactions.length, 0),
        duration: endTime.getTime() - startTime.getTime(),
        coverage: (this.discoveredPages.length / this.maxPages) * 100,
      },
    };

    this.printDiscoverySummary(result);

    return result;
  }

  /**
   * Crawl a single page
   */
  private async crawlPage(
    url: string,
    depth: number,
    takeScreenshot: boolean
  ): Promise<void> {
    // Check limits
    if (depth > this.maxDepth || this.visitedUrls.size >= this.maxPages) {
      return;
    }

    // Normalize URL
    const normalizedUrl = this.normalizeUrl(url);
    if (this.visitedUrls.has(normalizedUrl)) {
      return;
    }

    // Skip external URLs
    if (!normalizedUrl.startsWith(this.baseUrl)) {
      return;
    }

    this.visitedUrls.add(normalizedUrl);
    console_log.step(this.visitedUrls.size, `Crawling: ${normalizedUrl}`);

    const page = await this.context!.newPage();
    const startTime = Date.now();

    try {
      await page.goto(normalizedUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForLoadState('domcontentloaded');

      // Wait a bit for SPAs to render
      await page.waitForTimeout(1000);

      const loadTime = Date.now() - startTime;

      // Take screenshot if enabled
      let screenshotPath: string | undefined;
      if (takeScreenshot) {
        const filename = `page-${this.visitedUrls.size}.png`;
        screenshotPath = path.join(this.screenshotsDir, filename);
        await page.screenshot({ path: screenshotPath, fullPage: true });
      }

      // Discover page elements
      const discoveredPage = await this.discoverPageElements(page, normalizedUrl, loadTime);
      if (screenshotPath) {
        discoveredPage.screenshot = screenshotPath;
      }
      this.discoveredPages.push(discoveredPage);

      // Find and crawl linked pages
      const links = discoveredPage.links
        .filter((link) => link.isInternal && link.isNavigable)
        .map((link) => link.href);

      for (const link of links) {
        await this.crawlPage(link, depth + 1, takeScreenshot);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.errors.push({
        url: normalizedUrl,
        error: errorMessage,
        timestamp: new Date(),
      });
      console_log.warning(`Error crawling ${normalizedUrl}: ${errorMessage}`);
    } finally {
      await page.close();
    }
  }

  /**
   * Discover all elements on a page
   */
  private async discoverPageElements(
    page: Page,
    url: string,
    loadTime: number
  ): Promise<DiscoveredPage> {
    const title = await page.title();
    const path = new URL(url).pathname;
    const errors: string[] = [];

    // Collect console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Discover interactive elements
    const elements = await this.discoverInteractiveElements(page);

    // Discover forms
    const forms = await this.discoverForms(page);

    // Discover links
    const links = await this.discoverLinks(page);

    // Discover complex interactions
    const interactions = await this.discoverInteractions(page);

    return {
      url,
      title,
      path,
      elements,
      forms,
      links,
      interactions,
      timestamp: new Date(),
      loadTime,
      errors,
    };
  }

  /**
   * Discover interactive elements on the page
   */
  private async discoverInteractiveElements(page: Page): Promise<DiscoveredElement[]> {
    const elements: DiscoveredElement[] = [];

    for (const [type, selector] of Object.entries(INTERACTIVE_SELECTORS)) {
      try {
        const locators = page.locator(selector);
        const count = await locators.count();

        for (let i = 0; i < Math.min(count, 100); i++) {
          try {
            const locator = locators.nth(i);
            const element = await this.extractElementInfo(locator, type as ElementType);
            if (element) {
              elements.push(element);
            }
          } catch {
            // Skip elements that can't be processed
          }
        }
      } catch {
        // Skip selectors that fail
      }
    }

    return elements;
  }

  /**
   * Extract information from an element
   */
  private async extractElementInfo(
    locator: Locator,
    type: ElementType
  ): Promise<DiscoveredElement | null> {
    try {
      const isVisible = await locator.isVisible();
      if (!isVisible) return null;

      const tagName = await locator.evaluate((el) => el.tagName.toLowerCase());
      const text = await locator.innerText().catch(() => '');
      const attributes = await locator.evaluate((el) => {
        const attrs: Record<string, string> = {};
        for (const attr of el.attributes) {
          attrs[attr.name] = attr.value;
        }
        return attrs;
      });

      // Generate optimal selector
      const { selector, strategy } = await this.generateOptimalSelector(locator, attributes);

      // Generate alternative selectors
      const alternativeSelectors = await this.generateAlternativeSelectors(locator, attributes);

      const boundingBox = await locator.boundingBox();

      return {
        tagName,
        selector,
        selectorStrategy: strategy,
        alternativeSelectors,
        type: this.determineElementType(tagName, attributes, type),
        text: text.substring(0, 100),
        placeholder: attributes['placeholder'],
        name: attributes['name'],
        id: attributes['id'],
        classes: (attributes['class'] || '').split(' ').filter(Boolean),
        attributes,
        isInteractive: true,
        isVisible,
        boundingBox: boundingBox
          ? { x: boundingBox.x, y: boundingBox.y, width: boundingBox.width, height: boundingBox.height }
          : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Generate optimal selector for element
   */
  private async generateOptimalSelector(
    locator: Locator,
    attributes: Record<string, string>
  ): Promise<{ selector: string; strategy: SelectorStrategy }> {
    // Priority: data-testid > id > name > aria-label > unique class > xpath

    if (attributes['data-testid']) {
      return {
        selector: `[data-testid="${attributes['data-testid']}"]`,
        strategy: 'testId',
      };
    }

    if (attributes['data-test']) {
      return {
        selector: `[data-test="${attributes['data-test']}"]`,
        strategy: 'testId',
      };
    }

    if (attributes['id'] && !attributes['id'].includes('ngcontent')) {
      return {
        selector: `#${attributes['id']}`,
        strategy: 'id',
      };
    }

    if (attributes['name']) {
      return {
        selector: `[name="${attributes['name']}"]`,
        strategy: 'name',
      };
    }

    if (attributes['aria-label']) {
      return {
        selector: `[aria-label="${attributes['aria-label']}"]`,
        strategy: 'label',
      };
    }

    // Generate CSS selector
    try {
      const cssSelector = await locator.evaluate((el) => {
        const getUniqueSelector = (element: Element): string => {
          if (element.id) return `#${element.id}`;

          let selector = element.tagName.toLowerCase();

          if (element.className) {
            const classes = element.className.split(' ').filter(Boolean).slice(0, 2);
            if (classes.length) {
              selector += '.' + classes.join('.');
            }
          }

          const parent = element.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(
              (child) => child.tagName === element.tagName
            );
            if (siblings.length > 1) {
              const index = siblings.indexOf(element);
              selector += `:nth-child(${index + 1})`;
            }
          }

          return selector;
        };

        return getUniqueSelector(el);
      });

      return { selector: cssSelector, strategy: 'css' };
    } catch {
      return { selector: '', strategy: 'css' };
    }
  }

  /**
   * Generate alternative selectors
   */
  private async generateAlternativeSelectors(
    locator: Locator,
    attributes: Record<string, string>
  ): Promise<string[]> {
    const alternatives: string[] = [];

    if (attributes['data-testid']) {
      alternatives.push(`[data-testid="${attributes['data-testid']}"]`);
    }
    if (attributes['id']) {
      alternatives.push(`#${attributes['id']}`);
    }
    if (attributes['name']) {
      alternatives.push(`[name="${attributes['name']}"]`);
    }
    if (attributes['aria-label']) {
      alternatives.push(`[aria-label="${attributes['aria-label']}"]`);
    }
    if (attributes['placeholder']) {
      alternatives.push(`[placeholder="${attributes['placeholder']}"]`);
    }

    return alternatives.slice(0, 5);
  }

  /**
   * Determine element type
   */
  private determineElementType(
    tagName: string,
    attributes: Record<string, string>,
    hintType: ElementType
  ): ElementType {
    const type = attributes['type']?.toLowerCase();
    const role = attributes['role']?.toLowerCase();

    if (tagName === 'button' || type === 'button' || type === 'submit') {
      return 'button';
    }
    if (tagName === 'a') return 'link';
    if (tagName === 'input') {
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'range') return 'slider';
      return 'input';
    }
    if (tagName === 'textarea') return 'textarea';
    if (tagName === 'select') return 'select';
    if (tagName === 'form') return 'form';
    if (role === 'dialog' || role === 'modal') return 'modal';
    if (role === 'tab') return 'tab';
    if (role === 'switch') return 'toggle';
    if (attributes['draggable'] === 'true') return 'draggable';

    return hintType || 'custom';
  }

  /**
   * Discover forms on the page
   */
  private async discoverForms(page: Page): Promise<DiscoveredForm[]> {
    const forms: DiscoveredForm[] = [];

    try {
      const formLocators = page.locator('form');
      const count = await formLocators.count();

      for (let i = 0; i < count; i++) {
        const formLocator = formLocators.nth(i);

        const formInfo = await formLocator.evaluate((form) => ({
          action: form.getAttribute('action') || '',
          method: form.getAttribute('method') || 'GET',
          id: form.id,
          classes: form.className,
        }));

        // Find form fields
        const fields: DiscoveredElement[] = [];
        const fieldSelectors = 'input:not([type="hidden"]), textarea, select';
        const fieldLocators = formLocator.locator(fieldSelectors);
        const fieldCount = await fieldLocators.count();

        for (let j = 0; j < fieldCount; j++) {
          const field = await this.extractElementInfo(fieldLocators.nth(j), 'input');
          if (field) fields.push(field);
        }

        // Find submit button
        const submitLocator = formLocator.locator(
          'button[type="submit"], input[type="submit"], button:not([type])'
        ).first();
        const submitButton = await this.extractElementInfo(submitLocator, 'button');

        const { selector } = await this.generateOptimalSelector(formLocator, {
          id: formInfo.id,
          class: formInfo.classes,
        });

        forms.push({
          selector,
          action: formInfo.action,
          method: formInfo.method,
          fields,
          submitButton: submitButton || undefined,
        });
      }
    } catch (error) {
      logger.warn('Error discovering forms:', error);
    }

    return forms;
  }

  /**
   * Discover links on the page
   */
  private async discoverLinks(page: Page): Promise<DiscoveredLink[]> {
    const links: DiscoveredLink[] = [];

    try {
      const linkLocators = page.locator('a[href]');
      const count = await linkLocators.count();

      for (let i = 0; i < Math.min(count, 200); i++) {
        const locator = linkLocators.nth(i);

        const linkInfo = await locator.evaluate((el) => ({
          href: el.getAttribute('href') || '',
          text: el.innerText.trim().substring(0, 100),
          target: el.getAttribute('target'),
        }));

        const { selector } = await this.generateOptimalSelector(locator, {});
        const fullHref = this.resolveUrl(linkInfo.href);
        const isInternal = fullHref.startsWith(this.baseUrl);
        const isNavigable =
          isInternal &&
          !linkInfo.href.startsWith('#') &&
          !linkInfo.href.startsWith('javascript:') &&
          !linkInfo.href.startsWith('mailto:') &&
          !linkInfo.href.startsWith('tel:');

        links.push({
          href: fullHref,
          text: linkInfo.text,
          selector,
          isInternal,
          isNavigable,
        });
      }
    } catch (error) {
      logger.warn('Error discovering links:', error);
    }

    return links;
  }

  /**
   * Discover complex interactions (drag-drop, etc.)
   */
  private async discoverInteractions(page: Page): Promise<DiscoveredInteraction[]> {
    const interactions: DiscoveredInteraction[] = [];

    // Discover drag-drop pairs
    try {
      const draggables = page.locator('[draggable="true"], .draggable, [data-draggable]');
      const droppables = page.locator('[data-droppable], .droppable, .drop-zone, .dropzone');

      const draggableCount = await draggables.count();
      const droppableCount = await droppables.count();

      if (draggableCount > 0 && droppableCount > 0) {
        const sourceElement = await this.extractElementInfo(draggables.first(), 'draggable');
        const targetElement = await this.extractElementInfo(droppables.first(), 'droppable');

        if (sourceElement && targetElement) {
          interactions.push({
            type: 'dragDrop',
            source: sourceElement,
            target: targetElement,
            description: `Drag ${sourceElement.text || 'element'} to ${targetElement.text || 'drop zone'}`,
          });
        }
      }
    } catch (error) {
      logger.warn('Error discovering interactions:', error);
    }

    return interactions;
  }

  /**
   * Detect the framework used by the application
   */
  private async detectFramework(): Promise<'angular' | 'react' | 'nextjs' | 'vue' | 'unknown'> {
    if (this.discoveredPages.length === 0) return 'unknown';

    const page = await this.context!.newPage();

    try {
      await page.goto(this.discoveredPages[0].url);

      const html = await page.content();

      for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
        for (const pattern of patterns) {
          if (html.includes(pattern)) {
            console_log.info(`Detected framework: ${framework}`);
            return framework as 'angular' | 'react' | 'nextjs' | 'vue';
          }
        }
      }
    } finally {
      await page.close();
    }

    return 'unknown';
  }

  /**
   * Generate test cases from discovered elements
   */
  private generateTestCases(): TestCase[] {
    const testCases: TestCase[] = [];

    for (const pageInfo of this.discoveredPages) {
      // Generate navigation test
      testCases.push(this.generateNavigationTest(pageInfo));

      // Generate form tests
      for (const form of pageInfo.forms) {
        testCases.push(this.generateFormTest(pageInfo, form));
      }

      // Generate button click tests
      const buttons = pageInfo.elements.filter((el) => el.type === 'button');
      for (const button of buttons.slice(0, 5)) {
        testCases.push(this.generateButtonTest(pageInfo, button));
      }

      // Generate drag-drop tests
      for (const interaction of pageInfo.interactions) {
        if (interaction.type === 'dragDrop') {
          testCases.push(this.generateDragDropTest(pageInfo, interaction));
        }
      }
    }

    return testCases;
  }

  /**
   * Generate navigation test
   */
  private generateNavigationTest(page: DiscoveredPage): TestCase {
    return {
      id: uuidv4(),
      name: `Navigate to ${page.title || page.path}`,
      description: `Verify navigation to ${page.url}`,
      category: 'smoke' as TestCategory,
      priority: 'high',
      tags: ['navigation', 'smoke'],
      steps: [
        {
          id: uuidv4(),
          order: 1,
          action: 'navigate',
          description: `Navigate to ${page.path}`,
          value: page.url,
          wait: { condition: 'domLoaded', timeout: 10000 },
        },
        {
          id: uuidv4(),
          order: 2,
          action: 'assert',
          description: 'Verify page URL',
          assertion: {
            type: 'urlContains',
            expected: page.path,
            timeout: 5000,
          },
        },
        {
          id: uuidv4(),
          order: 3,
          action: 'assert',
          description: 'Verify page title',
          assertion: {
            type: 'titleContains',
            expected: page.title.split(' ')[0] || '',
            timeout: 5000,
          },
          screenshot: true,
        },
      ],
      expectedResult: `Page ${page.path} should load successfully with correct title`,
    };
  }

  /**
   * Generate form test
   */
  private generateFormTest(page: DiscoveredPage, form: DiscoveredForm): TestCase {
    const steps: TestStep[] = [
      {
        id: uuidv4(),
        order: 1,
        action: 'navigate',
        description: `Navigate to ${page.path}`,
        value: page.url,
        wait: { condition: 'domLoaded', timeout: 10000 },
      },
    ];

    let order = 2;
    for (const field of form.fields) {
      steps.push({
        id: uuidv4(),
        order: order++,
        action: field.type === 'checkbox' ? 'check' : field.type === 'select' ? 'select' : 'type',
        description: `Fill ${field.name || field.placeholder || 'field'}`,
        selector: field.selector,
        selectorStrategy: field.selectorStrategy,
        value: this.generateTestDataForField(field),
        wait: { condition: 'visible', timeout: 5000 },
      });
    }

    if (form.submitButton) {
      steps.push({
        id: uuidv4(),
        order: order++,
        action: 'click',
        description: 'Submit form',
        selector: form.submitButton.selector,
        selectorStrategy: form.submitButton.selectorStrategy,
        wait: { condition: 'networkIdle', timeout: 10000 },
        screenshot: true,
      });
    }

    return {
      id: uuidv4(),
      name: `Form Submission - ${page.title || page.path}`,
      description: `Test form submission on ${page.path}`,
      category: 'functional' as TestCategory,
      priority: 'high',
      tags: ['form', 'functional'],
      steps,
      expectedResult: 'Form should submit successfully',
    };
  }

  /**
   * Generate button test
   */
  private generateButtonTest(page: DiscoveredPage, button: DiscoveredElement): TestCase {
    return {
      id: uuidv4(),
      name: `Click ${button.text || 'Button'} - ${page.title || page.path}`,
      description: `Test clicking ${button.text || 'button'} on ${page.path}`,
      category: 'ui' as TestCategory,
      priority: 'medium',
      tags: ['button', 'ui'],
      steps: [
        {
          id: uuidv4(),
          order: 1,
          action: 'navigate',
          description: `Navigate to ${page.path}`,
          value: page.url,
          wait: { condition: 'domLoaded', timeout: 10000 },
        },
        {
          id: uuidv4(),
          order: 2,
          action: 'assert',
          description: 'Verify button is visible',
          selector: button.selector,
          selectorStrategy: button.selectorStrategy,
          assertion: { type: 'visible', timeout: 5000 },
        },
        {
          id: uuidv4(),
          order: 3,
          action: 'click',
          description: `Click ${button.text || 'button'}`,
          selector: button.selector,
          selectorStrategy: button.selectorStrategy,
          wait: { condition: 'stable', timeout: 5000 },
          screenshot: true,
        },
      ],
      expectedResult: 'Button should be clickable and respond to click',
    };
  }

  /**
   * Generate drag-drop test
   */
  private generateDragDropTest(page: DiscoveredPage, interaction: DiscoveredInteraction): TestCase {
    return {
      id: uuidv4(),
      name: `Drag Drop - ${page.title || page.path}`,
      description: interaction.description,
      category: 'functional' as TestCategory,
      priority: 'medium',
      tags: ['dragdrop', 'interaction'],
      steps: [
        {
          id: uuidv4(),
          order: 1,
          action: 'navigate',
          description: `Navigate to ${page.path}`,
          value: page.url,
          wait: { condition: 'domLoaded', timeout: 10000 },
        },
        {
          id: uuidv4(),
          order: 2,
          action: 'dragDrop',
          description: interaction.description,
          dragDrop: {
            sourceSelector: interaction.source?.selector || '',
            targetSelector: interaction.target?.selector || '',
          },
          wait: { condition: 'stable', timeout: 5000 },
          screenshot: true,
        },
      ],
      expectedResult: 'Element should be dragged and dropped successfully',
    };
  }

  /**
   * Generate test data for form fields
   */
  private generateTestDataForField(field: DiscoveredElement): string {
    const type = field.attributes['type']?.toLowerCase();
    const name = field.name?.toLowerCase() || '';
    const placeholder = field.placeholder?.toLowerCase() || '';

    if (type === 'email' || name.includes('email') || placeholder.includes('email')) {
      return 'test@example.com';
    }
    if (type === 'password' || name.includes('password')) {
      return 'TestPassword123!';
    }
    if (type === 'tel' || name.includes('phone')) {
      return '+1234567890';
    }
    if (type === 'number' || name.includes('age') || name.includes('quantity')) {
      return '25';
    }
    if (name.includes('name') || placeholder.includes('name')) {
      return 'Test User';
    }
    if (name.includes('url') || name.includes('website')) {
      return 'https://example.com';
    }
    if (name.includes('date')) {
      return new Date().toISOString().split('T')[0];
    }

    return 'Test Value';
  }

  /**
   * Build sitemap from discovered pages
   */
  private buildSitemap(): SitemapNode[] {
    const nodeMap = new Map<string, SitemapNode>();
    const roots: SitemapNode[] = [];

    // Create nodes for all pages
    for (const page of this.discoveredPages) {
      const pathParts = page.path.split('/').filter(Boolean);
      let currentPath = '';

      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        currentPath += '/' + part;

        if (!nodeMap.has(currentPath)) {
          nodeMap.set(currentPath, {
            url: this.baseUrl + currentPath,
            title: i === pathParts.length - 1 ? page.title : part,
            children: [],
            depth: i,
          });
        }
      }
    }

    // Build tree structure
    for (const [path, node] of nodeMap.entries()) {
      const parentPath = path.split('/').slice(0, -1).join('/') || null;

      if (parentPath && nodeMap.has(parentPath)) {
        nodeMap.get(parentPath)!.children.push(node);
      } else if (node.depth === 0) {
        roots.push(node);
      }
    }

    // Add root page if exists
    const rootPage = this.discoveredPages.find((p) => p.path === '/');
    if (rootPage) {
      roots.unshift({
        url: this.baseUrl,
        title: rootPage.title || 'Home',
        children: roots.length > 0 ? [...roots] : [],
        depth: 0,
      });
    }

    return roots.length > 0 ? roots : [{ url: this.baseUrl, title: 'Home', children: [], depth: 0 }];
  }

  /**
   * URL helpers
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url, this.baseUrl);
      urlObj.hash = '';
      return urlObj.href.replace(/\/$/, '');
    } catch {
      return url;
    }
  }

  private resolveUrl(url: string): string {
    try {
      return new URL(url, this.baseUrl).href;
    } catch {
      return url;
    }
  }

  /**
   * Print discovery summary
   */
  private printDiscoverySummary(result: DiscoveryResult): void {
    console_log.divider();
    console_log.title('Discovery Summary');
    console_log.bullet(`Pages discovered: ${result.statistics.totalPages}`);
    console_log.bullet(`Elements found: ${result.statistics.totalElements}`);
    console_log.bullet(`Forms found: ${result.statistics.totalForms}`);
    console_log.bullet(`Links found: ${result.statistics.totalLinks}`);
    console_log.bullet(`Interactions found: ${result.statistics.totalInteractions}`);
    console_log.bullet(`Test cases generated: ${result.suggestedTestCases.length}`);
    console_log.bullet(`Framework detected: ${result.framework}`);
    console_log.bullet(`Duration: ${result.statistics.duration}ms`);
    console_log.bullet(`Errors: ${result.errors.length}`);
    console_log.divider();
  }

  /**
   * Cleanup
   */
  async close(): Promise<void> {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    console_log.info('Web crawler closed');
  }
}

export default WebCrawler;
