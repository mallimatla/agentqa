/**
 * AgentQA Type Definitions
 * Comprehensive types for autonomous web testing platform
 */

// ============================================================================
// TEST CASE TYPES
// ============================================================================

/**
 * Supported action types for test steps
 */
export type ActionType =
  | 'navigate'      // Navigate to URL
  | 'click'         // Click element
  | 'doubleClick'   // Double click element
  | 'rightClick'    // Right click element
  | 'type'          // Type text into input
  | 'clear'         // Clear input field
  | 'select'        // Select dropdown option
  | 'check'         // Check checkbox
  | 'uncheck'       // Uncheck checkbox
  | 'hover'         // Hover over element
  | 'scroll'        // Scroll to element or position
  | 'dragDrop'      // Drag and drop
  | 'upload'        // File upload
  | 'keyPress'      // Press keyboard key
  | 'wait'          // Wait for condition
  | 'screenshot'    // Take screenshot
  | 'assert'        // Make assertion
  | 'executeScript' // Execute custom JavaScript
  | 'iframe'        // Switch to iframe
  | 'switchTab'     // Switch browser tab
  | 'closeTab'      // Close browser tab
  | 'refresh'       // Refresh page
  | 'goBack'        // Go back in history
  | 'goForward'     // Go forward in history
  | 'login'         // Perform login (compound action)
  | 'logout'        // Perform logout (compound action)
  | 'apiCall';      // Make API call

/**
 * Assertion types for validations
 */
export type AssertionType =
  | 'visible'           // Element is visible
  | 'hidden'            // Element is hidden
  | 'enabled'           // Element is enabled
  | 'disabled'          // Element is disabled
  | 'checked'           // Checkbox is checked
  | 'unchecked'         // Checkbox is unchecked
  | 'textEquals'        // Text equals expected
  | 'textContains'      // Text contains expected
  | 'textMatches'       // Text matches regex
  | 'valueEquals'       // Input value equals
  | 'valueContains'     // Input value contains
  | 'attributeEquals'   // Attribute equals expected
  | 'attributeContains' // Attribute contains expected
  | 'urlEquals'         // URL equals expected
  | 'urlContains'       // URL contains expected
  | 'titleEquals'       // Page title equals
  | 'titleContains'     // Page title contains
  | 'elementCount'      // Element count equals
  | 'elementExists'     // Element exists in DOM
  | 'elementNotExists'  // Element not in DOM
  | 'hasClass'          // Element has CSS class
  | 'cssProperty'       // CSS property value
  | 'screenshot'        // Visual comparison
  | 'apiResponse';      // API response validation

/**
 * Selector strategies
 */
export type SelectorStrategy =
  | 'css'           // CSS selector
  | 'xpath'         // XPath selector
  | 'text'          // Text content
  | 'testId'        // data-testid attribute
  | 'role'          // ARIA role
  | 'label'         // Form label
  | 'placeholder'   // Input placeholder
  | 'altText'       // Image alt text
  | 'title'         // Title attribute
  | 'id'            // Element ID
  | 'name'          // Element name
  | 'class';        // CSS class

/**
 * Wait conditions
 */
export type WaitCondition =
  | 'visible'       // Wait for element visible
  | 'hidden'        // Wait for element hidden
  | 'enabled'       // Wait for element enabled
  | 'stable'        // Wait for element stable
  | 'networkIdle'   // Wait for network idle
  | 'domLoaded'     // Wait for DOM loaded
  | 'timeout'       // Wait for fixed time
  | 'function';     // Wait for custom function

/**
 * Test priority levels
 */
export type Priority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Test categories
 */
export type TestCategory =
  | 'smoke'
  | 'regression'
  | 'functional'
  | 'ui'
  | 'integration'
  | 'e2e'
  | 'accessibility'
  | 'security';

/**
 * Individual test step
 */
export interface TestStep {
  id: string;
  order: number;
  action: ActionType;
  description: string;
  selector?: string;
  selectorStrategy?: SelectorStrategy;
  value?: string;
  assertion?: {
    type: AssertionType;
    expected?: string;
    attribute?: string;
    timeout?: number;
  };
  wait?: {
    condition: WaitCondition;
    timeout?: number;
    value?: string;
  };
  dragDrop?: {
    sourceSelector: string;
    targetSelector: string;
  };
  options?: {
    force?: boolean;
    timeout?: number;
    delay?: number;
    noWaitAfter?: boolean;
    position?: { x: number; y: number };
    modifiers?: Array<'Alt' | 'Control' | 'Meta' | 'Shift'>;
    button?: 'left' | 'right' | 'middle';
    clickCount?: number;
  };
  conditionalExecution?: {
    condition: string;
    skipIfFalse?: boolean;
  };
  screenshot?: boolean;
  continueOnError?: boolean;
}

/**
 * Test case definition
 */
export interface TestCase {
  id: string;
  name: string;
  description: string;
  category: TestCategory;
  priority: Priority;
  tags: string[];
  preconditions?: string[];
  steps: TestStep[];
  expectedResult: string;
  cleanup?: TestStep[];
  timeout?: number;
  retries?: number;
  skip?: boolean;
  only?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Test suite containing multiple test cases
 */
export interface TestSuite {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  testCases: TestCase[];
  setup?: TestStep[];
  teardown?: TestStep[];
  credentials?: Credentials;
  variables?: Record<string, string>;
  config?: TestConfig;
}

// ============================================================================
// CSV FORMAT TYPES
// ============================================================================

/**
 * CSV row structure for test cases
 */
export interface CSVTestRow {
  test_id: string;
  test_name: string;
  description: string;
  category: TestCategory;
  priority: Priority;
  tags: string;                    // Comma-separated
  step_order: number;
  action: ActionType;
  step_description: string;
  selector: string;
  selector_strategy: SelectorStrategy;
  value: string;
  assertion_type: AssertionType;
  expected_value: string;
  wait_condition: WaitCondition;
  wait_timeout: number;
  drag_source: string;
  drag_target: string;
  continue_on_error: boolean;
  screenshot: boolean;
  expected_result: string;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * Credentials for authentication
 */
export interface Credentials {
  username?: string;
  password?: string;
  email?: string;
  token?: string;
  apiKey?: string;
  custom?: Record<string, string>;
}

/**
 * Authentication configuration
 */
export interface AuthConfig {
  type: 'form' | 'basic' | 'oauth' | 'token' | 'saml' | 'custom';
  loginUrl?: string;
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  successIndicator?: string;
  mfaEnabled?: boolean;
  mfaHandler?: string;
  cookies?: Array<{ name: string; value: string; domain: string }>;
  headers?: Record<string, string>;
  storageState?: string;
}

/**
 * Test execution configuration
 */
export interface TestConfig {
  baseUrl: string;
  browser?: 'chromium' | 'firefox' | 'webkit' | 'all';
  headless?: boolean;
  slowMo?: number;
  viewport?: { width: number; height: number };
  timeout?: number;
  retries?: number;
  parallel?: boolean;
  workers?: number;
  video?: 'on' | 'off' | 'on-first-retry' | 'retain-on-failure';
  screenshot?: 'on' | 'off' | 'only-on-failure';
  trace?: 'on' | 'off' | 'on-first-retry' | 'retain-on-failure';
  locale?: string;
  timezone?: string;
  geolocation?: { latitude: number; longitude: number };
  permissions?: string[];
  auth?: AuthConfig;
  credentials?: Credentials;
}

// ============================================================================
// DISCOVERY TYPES
// ============================================================================

/**
 * Discovered page element
 */
export interface DiscoveredElement {
  tagName: string;
  selector: string;
  selectorStrategy: SelectorStrategy;
  alternativeSelectors: string[];
  type: ElementType;
  text?: string;
  placeholder?: string;
  name?: string;
  id?: string;
  classes: string[];
  attributes: Record<string, string>;
  isInteractive: boolean;
  isVisible: boolean;
  boundingBox?: { x: number; y: number; width: number; height: number };
  parentInfo?: string;
}

/**
 * Types of discoverable elements
 */
export type ElementType =
  | 'button'
  | 'link'
  | 'input'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'form'
  | 'image'
  | 'video'
  | 'iframe'
  | 'modal'
  | 'dropdown'
  | 'menu'
  | 'tab'
  | 'accordion'
  | 'table'
  | 'list'
  | 'card'
  | 'navigation'
  | 'header'
  | 'footer'
  | 'sidebar'
  | 'dialog'
  | 'tooltip'
  | 'datepicker'
  | 'slider'
  | 'toggle'
  | 'draggable'
  | 'droppable'
  | 'custom';

/**
 * Discovered page information
 */
export interface DiscoveredPage {
  url: string;
  title: string;
  path: string;
  elements: DiscoveredElement[];
  forms: DiscoveredForm[];
  links: DiscoveredLink[];
  interactions: DiscoveredInteraction[];
  screenshot?: string;
  timestamp: Date;
  loadTime: number;
  errors: string[];
}

/**
 * Discovered form
 */
export interface DiscoveredForm {
  selector: string;
  action?: string;
  method?: string;
  fields: DiscoveredElement[];
  submitButton?: DiscoveredElement;
}

/**
 * Discovered link
 */
export interface DiscoveredLink {
  href: string;
  text: string;
  selector: string;
  isInternal: boolean;
  isNavigable: boolean;
}

/**
 * Discovered interaction pattern
 */
export interface DiscoveredInteraction {
  type: 'dragDrop' | 'hover' | 'scroll' | 'swipe' | 'longPress';
  source?: DiscoveredElement;
  target?: DiscoveredElement;
  description: string;
}

/**
 * Discovery result
 */
export interface DiscoveryResult {
  baseUrl: string;
  startTime: Date;
  endTime: Date;
  pages: DiscoveredPage[];
  sitemap: SitemapNode[];
  suggestedTestCases: TestCase[];
  framework?: 'angular' | 'react' | 'nextjs' | 'vue' | 'unknown';
  errors: DiscoveryError[];
  statistics: DiscoveryStatistics;
}

/**
 * Sitemap node for discovered pages
 */
export interface SitemapNode {
  url: string;
  title: string;
  children: SitemapNode[];
  depth: number;
}

/**
 * Discovery error
 */
export interface DiscoveryError {
  url: string;
  error: string;
  timestamp: Date;
}

/**
 * Discovery statistics
 */
export interface DiscoveryStatistics {
  totalPages: number;
  totalElements: number;
  totalForms: number;
  totalLinks: number;
  totalInteractions: number;
  duration: number;
  coverage: number;
}

// ============================================================================
// EXECUTION TYPES
// ============================================================================

/**
 * Test step result
 */
export interface StepResult {
  stepId: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration: number;
  error?: string;
  screenshot?: string;
  logs: string[];
  retries: number;
}

/**
 * Test case result
 */
export interface TestCaseResult {
  testId: string;
  testName: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  steps: StepResult[];
  error?: string;
  screenshot?: string;
  video?: string;
  trace?: string;
  browser: string;
  startTime: Date;
  endTime: Date;
}

/**
 * Test suite result
 */
export interface TestSuiteResult {
  suiteId: string;
  suiteName: string;
  status: 'passed' | 'failed' | 'partial';
  testResults: TestCaseResult[];
  duration: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
  startTime: Date;
  endTime: Date;
  environment: {
    browser: string;
    os: string;
    nodeVersion: string;
    playwrightVersion: string;
  };
}

// ============================================================================
// REPORTING TYPES
// ============================================================================

/**
 * Issue found during testing
 */
export interface Issue {
  id: string;
  testId: string;
  testName: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: 'functional' | 'ui' | 'performance' | 'accessibility' | 'security';
  title: string;
  description: string;
  steps: string[];
  expected: string;
  actual: string;
  screenshot?: string;
  video?: string;
  selector?: string;
  url: string;
  browser: string;
  timestamp: Date;
  stackTrace?: string;
  suggestions?: string[];
}

/**
 * Dashboard data
 */
export interface DashboardData {
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
    duration: number;
    lastRun: Date;
  };
  trends: Array<{
    date: Date;
    passed: number;
    failed: number;
    passRate: number;
  }>;
  testResults: TestSuiteResult[];
  issues: Issue[];
  coverage: {
    pages: number;
    elements: number;
    forms: number;
    percentage: number;
  };
}

/**
 * Report configuration
 */
export interface ReportConfig {
  format: 'html' | 'json' | 'both';
  outputDir: string;
  includeScreenshots: boolean;
  includeVideos: boolean;
  includeTraces: boolean;
  openAfterGeneration: boolean;
  title?: string;
  logo?: string;
}

// ============================================================================
// CLI TYPES
// ============================================================================

/**
 * CLI command options
 */
export interface CLIOptions {
  url?: string;
  csv?: string;
  output?: string;
  browser?: 'chromium' | 'firefox' | 'webkit' | 'all';
  headless?: boolean;
  workers?: number;
  timeout?: number;
  retries?: number;
  config?: string;
  verbose?: boolean;
  debug?: boolean;
}

/**
 * Discovery command options
 */
export interface DiscoverOptions extends CLIOptions {
  depth?: number;
  maxPages?: number;
  includeExternal?: boolean;
  screenshot?: boolean;
  auth?: string;
}

/**
 * Generate command options
 */
export interface GenerateOptions extends CLIOptions {
  template?: 'typescript' | 'javascript';
  pageObject?: boolean;
  includeComments?: boolean;
}

/**
 * Execute command options
 */
export interface ExecuteOptions extends CLIOptions {
  suite?: string;
  tag?: string;
  grep?: string;
  parallel?: boolean;
  video?: boolean;
  trace?: boolean;
}

/**
 * Report command options
 */
export interface ReportOptions extends CLIOptions {
  format?: 'html' | 'json' | 'both';
  open?: boolean;
  serve?: boolean;
  port?: number;
}

// ============================================================================
// INTELLIGENT TEST GENERATION TYPES (World-Class AgentQA)
// ============================================================================

/**
 * User role for multi-persona testing
 */
export interface UserRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  accessLevel: 'admin' | 'manager' | 'user' | 'guest' | 'readonly' | 'custom';
  credentials?: Credentials;
  restrictions?: string[];
  expectedBehaviors?: string[];
}

/**
 * User story for test generation
 */
export interface UserStory {
  id: string;
  title: string;
  description: string;
  asA: string;          // As a [role]
  iWant: string;        // I want [feature]
  soThat: string;       // So that [benefit]
  acceptanceCriteria: string[];
  priority: Priority;
  tags: string[];
  relatedFeatures?: string[];
  dependencies?: string[];
  estimatedComplexity: 'simple' | 'medium' | 'complex' | 'very-complex';
}

/**
 * Feature definition for the application
 */
export interface Feature {
  id: string;
  name: string;
  description: string;
  module: string;
  userStories: UserStory[];
  businessRules: BusinessRule[];
  inputs: FeatureInput[];
  outputs: FeatureOutput[];
  validations: Validation[];
  integrations?: Integration[];
  status: 'active' | 'deprecated' | 'planned';
}

/**
 * Business rule for validation
 */
export interface BusinessRule {
  id: string;
  name: string;
  description: string;
  condition: string;
  action: string;
  priority: Priority;
  category: 'validation' | 'calculation' | 'authorization' | 'workflow' | 'display';
}

/**
 * Feature input specification
 */
export interface FeatureInput {
  name: string;
  type: 'text' | 'number' | 'email' | 'password' | 'date' | 'file' | 'select' | 'checkbox' | 'radio' | 'textarea';
  required: boolean;
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  pattern?: string;
  validValues?: string[];
  defaultValue?: string;
  description?: string;
}

/**
 * Feature output specification
 */
export interface FeatureOutput {
  name: string;
  type: string;
  description: string;
  successIndicator?: string;
  errorIndicator?: string;
}

/**
 * Validation rule
 */
export interface Validation {
  field: string;
  type: 'required' | 'format' | 'range' | 'length' | 'custom' | 'unique' | 'depends';
  rule: string;
  errorMessage: string;
}

/**
 * Integration point
 */
export interface Integration {
  name: string;
  type: 'api' | 'database' | 'thirdParty' | 'internal';
  endpoint?: string;
  description: string;
}

/**
 * Performance benchmark
 */
export interface PerformanceBenchmark {
  metric: string;
  target: number;
  unit: 'ms' | 's' | 'requests/s' | 'concurrent' | 'MB' | '%';
  tolerance: number;
  critical?: boolean;
}

/**
 * Project configuration for intelligent test generation
 */
export interface ProjectConfig {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  applicationInfo: {
    type: 'web' | 'mobile-web' | 'pwa' | 'spa';
    framework?: 'angular' | 'react' | 'nextjs' | 'vue' | 'other';
    industry?: string;
    version?: string;
  };
  userRoles: UserRole[];
  userStories: UserStory[];
  features: Feature[];
  criticalFlows: CriticalFlow[];
  performanceBenchmarks: PerformanceBenchmark[];
  environments: Environment[];
  testingScope: TestingScope;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Critical user flow
 */
export interface CriticalFlow {
  id: string;
  name: string;
  description: string;
  priority: Priority;
  steps: string[];
  expectedOutcome: string;
  userRole: string;
  frequency: 'very-high' | 'high' | 'medium' | 'low';
  businessImpact: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Test environment configuration
 */
export interface Environment {
  name: string;
  url: string;
  type: 'development' | 'staging' | 'production' | 'qa';
  credentials?: Credentials;
}

/**
 * Testing scope definition
 */
export interface TestingScope {
  includePositive: boolean;
  includeNegative: boolean;
  includeBoundary: boolean;
  includeEdgeCases: boolean;
  includeAccessibility: boolean;
  includeSecurity: boolean;
  includePerformance: boolean;
  includeCrossBrowser: boolean;
  includeMobile: boolean;
  browsers: ('chromium' | 'firefox' | 'webkit')[];
  viewports: { name: string; width: number; height: number }[];
  testDepth: 'shallow' | 'moderate' | 'deep' | 'exhaustive';
}

/**
 * Test strategy generated from project config
 */
export interface TestStrategy {
  id: string;
  projectId: string;
  name: string;
  description: string;
  objectives: string[];
  approach: string;
  scope: TestingScope;
  riskAreas: RiskArea[];
  testPhases: TestPhase[];
  estimatedTestCount: {
    smoke: number;
    regression: number;
    functional: number;
    integration: number;
    e2e: number;
    total: number;
  };
  prioritization: TestPrioritization;
  resources: TestResource[];
  timeline?: string;
  createdAt: Date;
}

/**
 * Risk area identified in testing
 */
export interface RiskArea {
  id: string;
  name: string;
  description: string;
  likelihood: 'high' | 'medium' | 'low';
  impact: 'critical' | 'high' | 'medium' | 'low';
  mitigationStrategy: string;
  relatedFeatures: string[];
}

/**
 * Test phase in strategy
 */
export interface TestPhase {
  name: string;
  description: string;
  order: number;
  testTypes: TestCategory[];
  entryConditions: string[];
  exitCriteria: string[];
}

/**
 * Test prioritization rules
 */
export interface TestPrioritization {
  byBusinessImpact: boolean;
  byUserFrequency: boolean;
  byRiskLevel: boolean;
  byDependencies: boolean;
  customRules?: string[];
}

/**
 * Test resource allocation
 */
export interface TestResource {
  type: 'browser' | 'environment' | 'data' | 'tool';
  name: string;
  allocation: string;
}

/**
 * Test scenario (higher level than test case)
 */
export interface TestScenario {
  id: string;
  name: string;
  description: string;
  feature: string;
  userStory?: string;
  userRole: string;
  type: 'positive' | 'negative' | 'boundary' | 'edge-case' | 'security' | 'accessibility';
  preconditions: string[];
  flow: ScenarioStep[];
  expectedBehavior: string;
  alternativeFlows?: AlternativeFlow[];
  testCases?: TestCase[];
  priority: Priority;
  tags: string[];
  coverage: {
    businessRules: string[];
    validations: string[];
    integrations: string[];
  };
}

/**
 * Step within a scenario
 */
export interface ScenarioStep {
  order: number;
  description: string;
  action: string;
  input?: string;
  expectedResult: string;
}

/**
 * Alternative flow in scenario
 */
export interface AlternativeFlow {
  name: string;
  trigger: string;
  steps: ScenarioStep[];
  expectedOutcome: string;
}

/**
 * Negative test case specification
 */
export interface NegativeTestSpec {
  type: 'invalid-input' | 'boundary-violation' | 'missing-required' | 'unauthorized' |
        'format-error' | 'constraint-violation' | 'timeout' | 'network-error' |
        'concurrent-access' | 'injection' | 'overflow';
  field?: string;
  invalidValue: string;
  expectedError: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Test data specification
 */
export interface TestData {
  id: string;
  name: string;
  description: string;
  type: 'valid' | 'invalid' | 'boundary' | 'edge-case';
  values: Record<string, string | number | boolean>;
  expectedOutcome: 'success' | 'error';
  errorMessage?: string;
}

/**
 * Generated test suite with full context
 */
export interface IntelligentTestSuite {
  id: string;
  projectId: string;
  strategyId: string;
  name: string;
  description: string;
  baseUrl: string;
  scenarios: TestScenario[];
  testCases: TestCase[];
  testData: TestData[];
  coverage: {
    features: number;
    userStories: number;
    businessRules: number;
    userRoles: number;
    positiveTests: number;
    negativeTests: number;
    totalTests: number;
  };
  metadata: {
    generatedAt: Date;
    generationTime: number;
    version: string;
  };
}

/**
 * Test generation report
 */
export interface TestGenerationReport {
  projectName: string;
  strategyName: string;
  summary: {
    totalScenarios: number;
    totalTestCases: number;
    byType: Record<string, number>;
    byPriority: Record<Priority, number>;
    byCategory: Record<TestCategory, number>;
    coveragePercentage: number;
  };
  recommendations: Recommendation[];
  gaps: CoverageGap[];
  generatedAt: Date;
}

/**
 * Recommendation for test improvement
 */
export interface Recommendation {
  type: 'coverage' | 'priority' | 'risk' | 'efficiency';
  title: string;
  description: string;
  action: string;
  impact: 'high' | 'medium' | 'low';
}

/**
 * Coverage gap identified
 */
export interface CoverageGap {
  area: string;
  type: 'feature' | 'scenario' | 'validation' | 'integration' | 'role';
  description: string;
  suggestedTests: string[];
}
