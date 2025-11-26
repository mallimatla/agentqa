# AgentQA - Autonomous Web Application Testing Platform

<div align="center">

```
    _                    _    ___    _
   / \   __ _  ___ _ __ | |_ / _ \  / \
  / _ \ / _` |/ _ \ '_ \| __| | | |/ _ \
 / ___ \ (_| |  __/ | | | |_| |_| / ___ \
/_/   \_\__, |\___|_| |_|\__|\__\_\/_/   \_\
        |___/
```

**Zero-Configuration • Auto-Discovery • Intelligent Test Generation**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.40-green.svg)](https://playwright.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## Overview

AgentQA is a **world-class, autonomous web application testing platform** that eliminates the need for manual test creation. Simply provide a URL, and AgentQA will:

1. **Auto-discover** all pages, forms, buttons, and interactive elements
2. **Generate** comprehensive Playwright test scripts
3. **Execute** tests with intelligent credential management
4. **Report** results in beautiful dashboards with detailed issue tracking

### Supported Frameworks
- Angular
- React
- Next.js
- Vue.js
- Any web application

---

## Features

| Feature | Description |
|---------|-------------|
| **Auto-Discovery** | Crawl web apps and discover all interactive elements |
| **Smart Test Generation** | AI-powered test case creation from discovered elements |
| **CSV Import/Export** | Define tests in a standardized CSV format |
| **Playwright Scripts** | Generate production-ready TypeScript/JavaScript tests |
| **Credential Management** | Secure handling of authentication (form, basic, token) |
| **Drag & Drop Support** | Full support for complex interactions |
| **Live Dashboard** | Real-time test execution monitoring |
| **JSON Reports** | Downloadable, machine-readable results |
| **Screenshot/Video** | Automatic capture on failure |
| **Multi-Browser** | Chrome, Firefox, Safari, mobile viewports |

---

## Quick Start

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd agentqa

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install
```

### Basic Usage

#### 1. Complete Workflow (Recommended)
```bash
# Discover, generate, and execute tests for any web app
npm run dev -- run https://your-app.com
```

#### 2. Discovery Only
```bash
# Discover and analyze a web application
npm run dev -- discover https://your-app.com
```

#### 3. Generate Tests from CSV
```bash
# Generate Playwright tests from your CSV test cases
npm run dev -- generate ./test-cases.csv https://your-app.com
```

#### 4. Execute Tests
```bash
# Execute tests from CSV
npm run dev -- execute https://your-app.com --csv ./test-cases.csv

# Execute generated tests
npm run dev -- execute https://your-app.com --generated
```

#### 5. Interactive Mode
```bash
# Start interactive CLI wizard
npm run dev -- interactive
```

---

## CSV Test Case Format

AgentQA uses a standardized CSV format for test cases:

### Columns

| Column | Description | Required |
|--------|-------------|----------|
| `test_id` | Unique test identifier (e.g., TC001) | Yes |
| `test_name` | Human-readable test name | Yes |
| `description` | Test description | Yes |
| `category` | smoke, regression, functional, ui, e2e, etc. | Yes |
| `priority` | critical, high, medium, low | Yes |
| `tags` | Comma-separated tags | No |
| `step_order` | Step execution order (1, 2, 3...) | Yes |
| `action` | Action type (see below) | Yes |
| `step_description` | Human-readable step description | Yes |
| `selector` | Element selector | Conditional |
| `selector_strategy` | css, xpath, testId, text, role, etc. | No |
| `value` | Input value or URL | Conditional |
| `assertion_type` | Type of assertion (see below) | Conditional |
| `expected_value` | Expected value for assertion | Conditional |
| `wait_condition` | Wait condition before action | No |
| `wait_timeout` | Timeout in milliseconds | No |
| `drag_source` | Source selector for drag-drop | Conditional |
| `drag_target` | Target selector for drag-drop | Conditional |
| `continue_on_error` | Continue if step fails (true/false) | No |
| `screenshot` | Take screenshot after step (true/false) | No |
| `expected_result` | Expected test outcome | Yes |

### Supported Actions

| Action | Description | Required Fields |
|--------|-------------|-----------------|
| `navigate` | Navigate to URL | `value` (URL) |
| `click` | Click element | `selector` |
| `doubleClick` | Double-click element | `selector` |
| `rightClick` | Right-click element | `selector` |
| `type` | Type text | `selector`, `value` |
| `clear` | Clear input field | `selector` |
| `select` | Select dropdown option | `selector`, `value` |
| `check` | Check checkbox | `selector` |
| `uncheck` | Uncheck checkbox | `selector` |
| `hover` | Hover over element | `selector` |
| `scroll` | Scroll to element | `selector` (optional) |
| `dragDrop` | Drag and drop | `drag_source`, `drag_target` |
| `upload` | File upload | `selector`, `value` (file path) |
| `keyPress` | Press keyboard key | `value` (key name) |
| `wait` | Wait for condition | `wait_condition`, `wait_timeout` |
| `screenshot` | Take screenshot | `value` (filename) |
| `assert` | Make assertion | `assertion_type`, `expected_value` |
| `refresh` | Refresh page | - |
| `goBack` | Go back in history | - |
| `goForward` | Go forward in history | - |

### Supported Assertions

| Type | Description |
|------|-------------|
| `visible` | Element is visible |
| `hidden` | Element is hidden |
| `enabled` | Element is enabled |
| `disabled` | Element is disabled |
| `checked` | Checkbox is checked |
| `textEquals` | Text equals expected |
| `textContains` | Text contains expected |
| `valueEquals` | Input value equals expected |
| `urlEquals` | URL equals expected |
| `urlContains` | URL contains expected |
| `titleEquals` | Page title equals expected |
| `titleContains` | Page title contains expected |
| `elementExists` | Element exists in DOM |
| `elementNotExists` | Element does not exist |

### Example CSV

```csv
test_id,test_name,description,category,priority,tags,step_order,action,step_description,selector,selector_strategy,value,assertion_type,expected_value,wait_condition,wait_timeout,drag_source,drag_target,continue_on_error,screenshot,expected_result
TC001,User Login,Verify login,functional,critical,"smoke,auth",1,navigate,Open login page,/login,css,,urlContains,/login,domLoaded,5000,,,false,true,User logs in successfully
TC001,User Login,Verify login,functional,critical,"smoke,auth",2,type,Enter username,[data-testid="username"],testId,{{username}},,,visible,3000,,,false,false,User logs in successfully
TC001,User Login,Verify login,functional,critical,"smoke,auth",3,type,Enter password,[data-testid="password"],testId,{{password}},,,visible,3000,,,false,false,User logs in successfully
TC001,User Login,Verify login,functional,critical,"smoke,auth",4,click,Click login,[data-testid="login-btn"],testId,,,,networkIdle,10000,,,false,true,User logs in successfully
TC001,User Login,Verify login,functional,critical,"smoke,auth",5,assert,Verify dashboard,,css,,urlContains,/dashboard,stable,5000,,,false,true,User logs in successfully
```

### Generate Template

```bash
npm run dev -- template
```

---

## Authentication

AgentQA supports multiple authentication methods:

### Form-Based Authentication
```bash
npm run dev -- run https://app.com --auth form
```
You'll be prompted for:
- Username/email
- Password
- Login page URL
- Form field selectors

### Token Authentication
```bash
npm run dev -- run https://app.com --auth token
```
Token is stored in localStorage automatically.

### Basic HTTP Authentication
```bash
npm run dev -- run https://app.com --auth basic
```

### Using Variables in Tests
Use `{{variable}}` syntax in your CSV:
- `{{username}}` - Replaced with authenticated username
- `{{password}}` - Replaced with authenticated password
- `{{email}}` - Replaced with email
- `{{token}}` - Replaced with auth token

---

## Programmatic Usage

```typescript
import { quickStart } from 'agentqa';

// Full workflow
const result = await quickStart({
  url: 'https://your-app.com',
  mode: 'full',
  credentials: {
    username: 'testuser',
    password: 'testpass',
  },
  authConfig: {
    type: 'form',
    loginUrl: 'https://your-app.com/login',
    usernameSelector: '#username',
    passwordSelector: '#password',
    submitSelector: 'button[type="submit"]',
  },
  options: {
    headless: true,
    depth: 3,
  },
});

console.log(`Tests passed: ${result.result.passed}`);
console.log(`Tests failed: ${result.result.failed}`);
```

### Individual Modules

```typescript
import {
  WebCrawler,
  CSVParser,
  ScriptGenerator,
  TestExecutor,
  DashboardReporter
} from 'agentqa';

// Discovery
const crawler = new WebCrawler();
await crawler.initialize({ headless: true });
const discovery = await crawler.discover('https://app.com');

// Parse CSV
const parser = new CSVParser();
const suite = await parser.parseFile('./tests.csv', 'https://app.com');

// Generate scripts
const generator = new ScriptGenerator({ template: 'typescript' });
await generator.generateFromSuite(suite);

// Execute
const executor = new TestExecutor({ headless: true, video: true });
const results = await executor.executeSuite(suite);

// Report
const reporter = new DashboardReporter();
await reporter.generateReport(results);
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `agentqa discover <url>` | Discover web app and generate test cases |
| `agentqa generate <csv> <url>` | Generate Playwright tests from CSV |
| `agentqa execute <url>` | Execute tests |
| `agentqa run <url>` | Complete workflow (discover + generate + execute) |
| `agentqa template` | Generate CSV template |
| `agentqa serve` | Start live dashboard server |
| `agentqa interactive` | Interactive mode wizard |

### Common Options

| Option | Description |
|--------|-------------|
| `--headless` | Run browser in headless mode |
| `--browser <type>` | Browser: chromium, firefox, webkit |
| `--auth <type>` | Authentication: form, basic, token |
| `--depth <n>` | Discovery depth |
| `--workers <n>` | Parallel workers |
| `--video` | Record video |
| `--trace` | Capture trace |
| `--tag <tag>` | Run tests with specific tag |
| `--grep <pattern>` | Run tests matching pattern |

---

## Reports

### HTML Dashboard
- Interactive summary with charts
- Test case details with status
- Issue tracking with screenshots
- Environment information
- Downloadable JSON

### JSON Report
```json
{
  "metadata": {
    "title": "AgentQA Test Report",
    "generatedAt": "2024-01-15T10:30:00Z"
  },
  "summary": {
    "totalTests": 25,
    "passed": 23,
    "failed": 2,
    "passRate": 92
  },
  "testResults": [...],
  "issues": [...]
}
```

### Live Dashboard
```bash
npm run dev -- serve --port 3000
```

---

## Project Structure

```
agentqa/
├── src/
│   ├── cli/                 # CLI entry point
│   │   └── index.ts
│   ├── core/
│   │   ├── crawler/         # Web discovery engine
│   │   ├── parser/          # CSV parser
│   │   ├── generator/       # Script generator
│   │   ├── executor/        # Test executor
│   │   └── reporter/        # Dashboard reporter
│   ├── types/               # TypeScript types
│   └── utils/               # Utilities
├── examples/                # Example CSV files
├── generated/               # Generated test scripts
├── reports/                 # Test reports
└── playwright.config.ts     # Playwright configuration
```

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">
<p><strong>Built with precision for the testing community</strong></p>
<p>AgentQA - Making automated testing accessible to everyone</p>
</div>
