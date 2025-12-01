/**
 * AgentQA Test Runner - Tests the demo application
 */

import { StrategyEngine } from './src/core/intelligence/strategy-engine';
import { WebCrawler } from './src/core/crawler/web-crawler';
import { ScriptGenerator } from './src/core/generator/script-generator';
import { TestExecutor } from './src/core/executor/test-executor';
import { DashboardReporter } from './src/core/reporter/dashboard-reporter';
import { CSVParser } from './src/core/parser/csv-parser';
import { ProjectConfig } from './src/types';
import * as fs from 'fs';
import * as path from 'path';

const TEST_APP_URL = 'http://localhost:4000';

// Define the test application project
const projectConfig: ProjectConfig = {
  id: 'testapp-001',
  name: 'TestApp E-Commerce Demo',
  description: 'A comprehensive demo application with authentication, products, orders, and admin features',
  baseUrl: TEST_APP_URL,
  applicationInfo: {
    type: 'web',
    framework: 'other',
    industry: 'E-commerce',
    version: '1.0.0',
  },
  userRoles: [
    {
      id: 'role-admin',
      name: 'Admin',
      description: 'Administrator with full access',
      permissions: ['view_dashboard', 'manage_users', 'manage_products', 'view_orders', 'delete_users', 'add_products'],
      accessLevel: 'admin',
      credentials: { username: 'admin@test.com', password: 'admin123' },
      restrictions: [],
      expectedBehaviors: ['Can access admin panel', 'Can manage all users', 'Can add/delete products'],
    },
    {
      id: 'role-user',
      name: 'Regular User',
      description: 'Standard user with basic access',
      permissions: ['view_dashboard', 'view_products', 'place_orders', 'edit_profile'],
      accessLevel: 'user',
      credentials: { username: 'user@test.com', password: 'user123' },
      restrictions: ['admin_panel', 'manage_users', 'manage_products'],
      expectedBehaviors: ['Can browse products', 'Can place orders', 'Cannot access admin'],
    },
    {
      id: 'role-guest',
      name: 'Guest',
      description: 'Guest user with limited access',
      permissions: ['view_products'],
      accessLevel: 'guest',
      credentials: { username: 'guest@test.com', password: 'guest123' },
      restrictions: ['admin_panel', 'manage_users', 'manage_products', 'place_orders'],
      expectedBehaviors: ['Can only view products'],
    },
  ],
  userStories: [
    {
      id: 'story-login',
      title: 'User Login',
      description: 'User can log into the system',
      asA: 'user',
      iWant: 'log into the system',
      soThat: 'I can access my dashboard and place orders',
      acceptanceCriteria: [
        'User can enter email and password',
        'System validates credentials',
        'User is redirected to dashboard on success',
        'Error message shown on invalid credentials',
        'Empty fields show validation error',
      ],
      priority: 'critical',
      tags: ['authentication', 'login'],
      estimatedComplexity: 'simple',
    },
    {
      id: 'story-register',
      title: 'User Registration',
      description: 'New user can create an account',
      asA: 'visitor',
      iWant: 'create a new account',
      soThat: 'I can start using the platform',
      acceptanceCriteria: [
        'User can enter name, email, and password',
        'Passwords must match',
        'Email must be unique',
        'Terms must be accepted',
        'User is logged in after registration',
      ],
      priority: 'high',
      tags: ['authentication', 'registration'],
      estimatedComplexity: 'medium',
    },
    {
      id: 'story-browse-products',
      title: 'Browse Products',
      description: 'User can view and search products',
      asA: 'user',
      iWant: 'browse and search products',
      soThat: 'I can find items to purchase',
      acceptanceCriteria: [
        'Products are displayed in a table',
        'Can search by name',
        'Can filter by category',
        'Product details are visible',
        'Order button is shown for in-stock items',
      ],
      priority: 'high',
      tags: ['products', 'search'],
      estimatedComplexity: 'simple',
    },
    {
      id: 'story-place-order',
      title: 'Place Order',
      description: 'User can place an order for a product',
      asA: 'user',
      iWant: 'order a product',
      soThat: 'I can purchase items',
      acceptanceCriteria: [
        'User can select quantity',
        'User must enter shipping address',
        'Total price is calculated',
        'Order is created on submit',
        'Stock is reduced after order',
      ],
      priority: 'critical',
      tags: ['orders', 'checkout'],
      estimatedComplexity: 'medium',
    },
    {
      id: 'story-admin-products',
      title: 'Admin Manage Products',
      description: 'Admin can manage products',
      asA: 'admin',
      iWant: 'add, edit, and delete products',
      soThat: 'I can maintain the product catalog',
      acceptanceCriteria: [
        'Admin can access product management',
        'Admin can add new products',
        'Admin can delete products',
        'Non-admins cannot access this feature',
      ],
      priority: 'high',
      tags: ['admin', 'products'],
      estimatedComplexity: 'medium',
    },
  ],
  features: [
    {
      id: 'feature-login',
      name: 'Login',
      description: 'User authentication via email and password',
      module: 'Authentication',
      userStories: [],
      businessRules: [
        { id: 'br-1', name: 'Valid credentials', description: 'Email and password must match stored values', condition: 'credentials match', action: 'allow login', priority: 'critical', category: 'validation' },
      ],
      inputs: [
        { name: 'email', type: 'email', required: true, description: 'User email address' },
        { name: 'password', type: 'password', required: true, minLength: 6, description: 'User password' },
      ],
      outputs: [
        { name: 'redirect', type: 'navigation', description: 'Redirect to dashboard', successIndicator: '/dashboard' },
      ],
      validations: [
        { field: 'email', type: 'required', rule: 'not empty', errorMessage: 'Email is required' },
        { field: 'email', type: 'format', rule: 'valid email', errorMessage: 'Invalid email format' },
        { field: 'password', type: 'required', rule: 'not empty', errorMessage: 'Password is required' },
      ],
      status: 'active',
    },
    {
      id: 'feature-register',
      name: 'Registration',
      description: 'New user registration form',
      module: 'Authentication',
      userStories: [],
      businessRules: [
        { id: 'br-2', name: 'Unique email', description: 'Email must not already exist', condition: 'email is unique', action: 'allow registration', priority: 'high', category: 'validation' },
        { id: 'br-3', name: 'Password match', description: 'Passwords must match', condition: 'password === confirm_password', action: 'allow registration', priority: 'high', category: 'validation' },
      ],
      inputs: [
        { name: 'name', type: 'text', required: true, minLength: 2, maxLength: 50, description: 'Full name' },
        { name: 'email', type: 'email', required: true, description: 'Email address' },
        { name: 'password', type: 'password', required: true, minLength: 6, maxLength: 20, description: 'Password' },
        { name: 'confirm_password', type: 'password', required: true, description: 'Confirm password' },
        { name: 'phone', type: 'text', required: false, pattern: '[0-9]{10}', description: 'Phone number' },
        { name: 'terms', type: 'checkbox', required: true, description: 'Terms acceptance' },
      ],
      outputs: [
        { name: 'redirect', type: 'navigation', description: 'Redirect to dashboard', successIndicator: '/dashboard' },
      ],
      validations: [
        { field: 'name', type: 'length', rule: '2-50 characters', errorMessage: 'Name must be between 2 and 50 characters' },
        { field: 'password', type: 'length', rule: 'min 6 characters', errorMessage: 'Password must be at least 6 characters' },
        { field: 'terms', type: 'required', rule: 'must be checked', errorMessage: 'You must agree to the Terms of Service' },
      ],
      status: 'active',
    },
    {
      id: 'feature-order',
      name: 'Place Order',
      description: 'Order placement form',
      module: 'Orders',
      userStories: [],
      businessRules: [
        { id: 'br-4', name: 'Stock check', description: 'Quantity must not exceed stock', condition: 'quantity <= stock', action: 'allow order', priority: 'critical', category: 'validation' },
      ],
      inputs: [
        { name: 'quantity', type: 'number', required: true, minValue: 1, description: 'Order quantity' },
        { name: 'shipping_address', type: 'textarea', required: true, minLength: 10, maxLength: 200, description: 'Shipping address' },
        { name: 'notes', type: 'textarea', required: false, maxLength: 500, description: 'Order notes' },
      ],
      outputs: [
        { name: 'order_confirmation', type: 'display', description: 'Order success message', successIndicator: 'Order placed successfully' },
      ],
      validations: [
        { field: 'quantity', type: 'range', rule: '1 to stock', errorMessage: 'Invalid quantity' },
        { field: 'shipping_address', type: 'length', rule: 'min 10 characters', errorMessage: 'Address must be at least 10 characters' },
      ],
      status: 'active',
    },
    {
      id: 'feature-add-product',
      name: 'Add Product (Admin)',
      description: 'Admin product creation form',
      module: 'Admin',
      userStories: [],
      businessRules: [
        { id: 'br-5', name: 'Admin only', description: 'Only admins can add products', condition: 'user.role === admin', action: 'allow access', priority: 'critical', category: 'authorization' },
      ],
      inputs: [
        { name: 'name', type: 'text', required: true, minLength: 2, maxLength: 100, description: 'Product name' },
        { name: 'category', type: 'text', required: true, description: 'Product category' },
        { name: 'price', type: 'number', required: true, minValue: 0.01, description: 'Product price' },
        { name: 'stock', type: 'number', required: true, minValue: 0, description: 'Stock quantity' },
        { name: 'description', type: 'textarea', required: false, maxLength: 500, description: 'Product description' },
      ],
      outputs: [
        { name: 'success_message', type: 'display', description: 'Product added confirmation', successIndicator: 'Product added successfully' },
      ],
      validations: [
        { field: 'name', type: 'length', rule: 'min 2 characters', errorMessage: 'Product name must be at least 2 characters' },
        { field: 'price', type: 'range', rule: '> 0', errorMessage: 'Price must be greater than 0' },
      ],
      status: 'active',
    },
  ],
  criticalFlows: [
    {
      id: 'flow-login-order',
      name: 'Login and Place Order',
      description: 'Complete flow from login to order placement',
      priority: 'critical',
      steps: [
        'Navigate to login page',
        'Enter valid credentials',
        'Click login button',
        'Verify redirect to dashboard',
        'Navigate to products',
        'Click order button on a product',
        'Enter quantity and shipping address',
        'Submit order',
        'Verify order confirmation',
      ],
      expectedOutcome: 'Order is created and user sees confirmation',
      userRole: 'user',
      frequency: 'very-high',
      businessImpact: 'critical',
    },
    {
      id: 'flow-admin-product',
      name: 'Admin Add Product',
      description: 'Admin creates a new product',
      priority: 'high',
      steps: [
        'Login as admin',
        'Navigate to admin panel',
        'Go to product management',
        'Fill in product details',
        'Submit product form',
        'Verify product appears in list',
      ],
      expectedOutcome: 'New product is created and visible',
      userRole: 'admin',
      frequency: 'medium',
      businessImpact: 'high',
    },
  ],
  performanceBenchmarks: [
    { metric: 'Page Load Time', target: 3000, unit: 'ms', tolerance: 500, critical: true },
    { metric: 'Form Submit Response', target: 1000, unit: 'ms', tolerance: 200, critical: false },
  ],
  environments: [
    { name: 'Local', url: TEST_APP_URL, type: 'development' },
  ],
  testingScope: {
    includePositive: true,
    includeNegative: true,
    includeBoundary: true,
    includeEdgeCases: true,
    includeAccessibility: false,
    includeSecurity: true,
    includePerformance: false,
    includeCrossBrowser: false,
    includeMobile: false,
    browsers: ['chromium'],
    viewports: [{ name: 'Desktop', width: 1920, height: 1080 }],
    testDepth: 'deep',
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

async function runTests() {
  console.log('\n🧠 AgentQA Intelligent Test Runner');
  console.log('═'.repeat(50));

  try {
    // Step 1: Generate intelligent test suite
    console.log('\n📋 Step 1: Generating intelligent test suite...');
    const engine = new StrategyEngine();

    const strategy = engine.generateStrategy(projectConfig);
    console.log(`   ✓ Generated test strategy: ${strategy.name}`);
    console.log(`   ✓ Test phases: ${strategy.testPhases.map(p => p.name).join(' → ')}`);
    console.log(`   ✓ Risk areas identified: ${strategy.riskAreas.length}`);

    const suite = engine.generateIntelligentSuite(projectConfig);
    console.log(`   ✓ Generated ${suite.scenarios.length} test scenarios`);
    console.log(`   ✓ Generated ${suite.testCases.length} test cases`);
    console.log(`   ✓ Positive tests: ${suite.coverage.positiveTests}`);
    console.log(`   ✓ Negative tests: ${suite.coverage.negativeTests}`);

    const report = engine.generateReport(suite, projectConfig);
    console.log(`   ✓ Coverage: ${report.summary.coveragePercentage}%`);

    // Save generated files
    const outputDir = path.join(process.cwd(), 'test-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(path.join(outputDir, 'test-strategy.json'), JSON.stringify(strategy, null, 2));
    fs.writeFileSync(path.join(outputDir, 'test-suite.json'), JSON.stringify(suite, null, 2));
    fs.writeFileSync(path.join(outputDir, 'generation-report.json'), JSON.stringify(report, null, 2));

    // Export to CSV
    const csvParser = new CSVParser();
    await csvParser.exportToCSV({
      id: suite.id,
      name: suite.name,
      description: suite.description,
      baseUrl: suite.baseUrl,
      testCases: suite.testCases,
    }, path.join(outputDir, 'test-cases.csv'));

    console.log(`   ✓ Saved results to ${outputDir}`);

    // Step 2: Discover the application
    console.log('\n🔍 Step 2: Discovering application...');
    const crawler = new WebCrawler();
    await crawler.initialize({ headless: true });

    // Login first
    const authConfig = {
      type: 'form' as const,
      loginUrl: `${TEST_APP_URL}/login`,
      usernameSelector: '#email',
      passwordSelector: '#password',
      submitSelector: 'button[type="submit"]',
      successIndicator: '/dashboard',
    };

    await crawler.authenticate(authConfig, { username: 'admin@test.com', password: 'admin123' });
    console.log('   ✓ Authenticated as admin');

    const discovery = await crawler.discover(TEST_APP_URL, {
      depth: 3,
      maxPages: 20,
      screenshot: true,
    });

    await crawler.close();

    console.log(`   ✓ Discovered ${discovery.statistics.totalPages} pages`);
    console.log(`   ✓ Found ${discovery.statistics.totalElements} elements`);
    console.log(`   ✓ Found ${discovery.statistics.totalForms} forms`);
    console.log(`   ✓ Generated ${discovery.suggestedTestCases.length} additional test cases`);

    fs.writeFileSync(path.join(outputDir, 'discovery.json'), JSON.stringify(discovery, null, 2));

    // Step 3: Execute tests
    console.log('\n▶️ Step 3: Executing tests...');

    // Combine test cases from intelligent generation and discovery
    const allTestCases = [...suite.testCases.slice(0, 20), ...discovery.suggestedTestCases.slice(0, 10)];

    const testSuite = {
      id: 'combined-suite',
      name: 'Combined Test Suite',
      description: 'Combined intelligent + discovered tests',
      baseUrl: TEST_APP_URL,
      testCases: allTestCases,
      credentials: { username: 'admin@test.com', password: 'admin123' },
      config: { baseUrl: TEST_APP_URL, auth: authConfig },
    };

    // Generate Playwright scripts
    const generator = new ScriptGenerator({ template: 'typescript' });
    await generator.generateFromSuite(testSuite as any);
    console.log('   ✓ Generated Playwright scripts');

    const executor = new TestExecutor({
      url: TEST_APP_URL,
      headless: true,
      video: true,
    });

    executor.setCredentials({ username: 'admin@test.com', password: 'admin123' });
    executor.setAuthConfig(authConfig);

    await executor.initialize();
    console.log(`   ✓ Executing ${allTestCases.length} test cases...`);

    const result = await executor.executeSuite(testSuite as any);
    await executor.close();

    console.log(`\n📊 Test Results:`);
    console.log(`   Total: ${result.passed + result.failed + result.skipped}`);
    console.log(`   ✅ Passed: ${result.passed}`);
    console.log(`   ❌ Failed: ${result.failed}`);
    console.log(`   ⏭️ Skipped: ${result.skipped}`);
    console.log(`   Pass Rate: ${result.passRate.toFixed(1)}%`);
    console.log(`   Duration: ${(result.duration / 1000).toFixed(1)}s`);

    // Generate final report
    console.log('\n📈 Step 4: Generating final report...');
    const reporter = new DashboardReporter({
      openAfterGeneration: false,
      outputDir: outputDir,
    });

    await reporter.generateReport(result, discovery, executor.getIssues());

    fs.writeFileSync(path.join(outputDir, 'execution-result.json'), JSON.stringify(result, null, 2));

    console.log(`   ✓ Reports generated in ${outputDir}`);

    // Summary
    console.log('\n' + '═'.repeat(50));
    console.log('📋 FINAL SUMMARY');
    console.log('═'.repeat(50));
    console.log(`Project: ${projectConfig.name}`);
    console.log(`URL: ${TEST_APP_URL}`);
    console.log(`\nTest Generation:`);
    console.log(`  - Scenarios: ${suite.scenarios.length}`);
    console.log(`  - Test Cases: ${suite.testCases.length}`);
    console.log(`  - Positive: ${suite.coverage.positiveTests}`);
    console.log(`  - Negative: ${suite.coverage.negativeTests}`);
    console.log(`\nDiscovery:`);
    console.log(`  - Pages: ${discovery.statistics.totalPages}`);
    console.log(`  - Elements: ${discovery.statistics.totalElements}`);
    console.log(`  - Forms: ${discovery.statistics.totalForms}`);
    console.log(`\nExecution:`);
    console.log(`  - Passed: ${result.passed}/${result.passed + result.failed + result.skipped}`);
    console.log(`  - Pass Rate: ${result.passRate.toFixed(1)}%`);
    console.log(`\nRecommendations (${report.recommendations.length}):`);
    report.recommendations.forEach(rec => {
      console.log(`  - [${rec.impact.toUpperCase()}] ${rec.title}`);
    });

    if (report.gaps.length > 0) {
      console.log(`\nCoverage Gaps (${report.gaps.length}):`);
      report.gaps.forEach(gap => {
        console.log(`  - ${gap.area}: ${gap.description}`);
      });
    }

    console.log('\n✅ Test run completed successfully!');
    console.log(`\nView the full report at: ${path.join(outputDir, 'reports', 'dashboard.html')}`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

runTests();
