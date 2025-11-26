/**
 * AgentQA CSV Parser
 * Parses CSV test case files into structured test suites
 */

import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  TestCase,
  TestStep,
  TestSuite,
  CSVTestRow,
  ActionType,
  AssertionType,
  SelectorStrategy,
  WaitCondition,
  TestCategory,
  Priority,
} from '../../types';
import { logger, console_log } from '../../utils/logger';

/**
 * CSV Parser class for converting CSV test cases to TestSuite
 */
export class CSVParser {
  private variablePattern = /\{\{(\w+)\}\}/g;

  /**
   * Parse CSV file and return TestSuite
   */
  async parseFile(filePath: string, baseUrl: string): Promise<TestSuite> {
    console_log.info(`Parsing CSV file: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`CSV file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return this.parseContent(content, baseUrl, path.basename(filePath, '.csv'));
  }

  /**
   * Parse CSV content string and return TestSuite
   */
  async parseContent(content: string, baseUrl: string, suiteName: string = 'Test Suite'): Promise<TestSuite> {
    const rows = await this.parseCSV(content);
    const testCases = this.groupRowsIntoTestCases(rows);

    console_log.success(`Parsed ${testCases.length} test cases from CSV`);

    return {
      id: uuidv4(),
      name: suiteName,
      description: `Test suite generated from CSV: ${suiteName}`,
      baseUrl,
      testCases,
      variables: this.extractVariables(rows),
    };
  }

  /**
   * Parse CSV string into row objects
   */
  private parseCSV(content: string): Promise<CSVTestRow[]> {
    return new Promise((resolve, reject) => {
      const rows: CSVTestRow[] = [];

      parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: (value, context) => {
          // Handle boolean fields
          if (context.column === 'continue_on_error' || context.column === 'screenshot') {
            return value.toLowerCase() === 'true';
          }
          // Handle numeric fields
          if (context.column === 'step_order' || context.column === 'wait_timeout') {
            return parseInt(value, 10) || 0;
          }
          return value;
        },
      })
        .on('data', (row: CSVTestRow) => rows.push(row))
        .on('error', (error) => reject(error))
        .on('end', () => resolve(rows));
    });
  }

  /**
   * Group CSV rows into test cases
   */
  private groupRowsIntoTestCases(rows: CSVTestRow[]): TestCase[] {
    const testCaseMap = new Map<string, TestCase>();

    for (const row of rows) {
      const testId = row.test_id;

      if (!testCaseMap.has(testId)) {
        testCaseMap.set(testId, {
          id: testId,
          name: row.test_name,
          description: row.description,
          category: this.validateCategory(row.category),
          priority: this.validatePriority(row.priority),
          tags: this.parseTags(row.tags),
          steps: [],
          expectedResult: row.expected_result,
        });
      }

      const testCase = testCaseMap.get(testId)!;
      const step = this.createTestStep(row);
      testCase.steps.push(step);
    }

    // Sort steps by order within each test case
    for (const testCase of testCaseMap.values()) {
      testCase.steps.sort((a, b) => a.order - b.order);
    }

    return Array.from(testCaseMap.values());
  }

  /**
   * Create a test step from CSV row
   */
  private createTestStep(row: CSVTestRow): TestStep {
    const step: TestStep = {
      id: uuidv4(),
      order: row.step_order,
      action: this.validateAction(row.action),
      description: row.step_description,
      continueOnError: row.continue_on_error,
      screenshot: row.screenshot,
    };

    // Add selector if present
    if (row.selector) {
      step.selector = row.selector;
      step.selectorStrategy = this.validateSelectorStrategy(row.selector_strategy);
    }

    // Add value if present
    if (row.value) {
      step.value = row.value;
    }

    // Add assertion if present
    if (row.assertion_type) {
      step.assertion = {
        type: this.validateAssertionType(row.assertion_type),
        expected: row.expected_value || undefined,
        timeout: row.wait_timeout || 5000,
      };
    }

    // Add wait condition if present
    if (row.wait_condition) {
      step.wait = {
        condition: this.validateWaitCondition(row.wait_condition),
        timeout: row.wait_timeout || 5000,
      };
    }

    // Add drag-drop config if present
    if (row.drag_source && row.drag_target) {
      step.dragDrop = {
        sourceSelector: row.drag_source,
        targetSelector: row.drag_target,
      };
    }

    return step;
  }

  /**
   * Parse comma-separated tags
   */
  private parseTags(tags: string): string[] {
    if (!tags) return [];
    return tags.split(',').map((t) => t.trim()).filter(Boolean);
  }

  /**
   * Extract variables from all rows ({{variable}} patterns)
   */
  private extractVariables(rows: CSVTestRow[]): Record<string, string> {
    const variables: Record<string, string> = {};

    for (const row of rows) {
      const value = row.value || '';
      let match;
      while ((match = this.variablePattern.exec(value)) !== null) {
        variables[match[1]] = '';
      }
    }

    return variables;
  }

  /**
   * Validation helpers
   */
  private validateAction(action: string): ActionType {
    const validActions: ActionType[] = [
      'navigate', 'click', 'doubleClick', 'rightClick', 'type', 'clear',
      'select', 'check', 'uncheck', 'hover', 'scroll', 'dragDrop', 'upload',
      'keyPress', 'wait', 'screenshot', 'assert', 'executeScript', 'iframe',
      'switchTab', 'closeTab', 'refresh', 'goBack', 'goForward', 'login',
      'logout', 'apiCall'
    ];
    if (!validActions.includes(action as ActionType)) {
      logger.warn(`Unknown action type: ${action}, defaulting to 'click'`);
      return 'click';
    }
    return action as ActionType;
  }

  private validateAssertionType(type: string): AssertionType {
    const validTypes: AssertionType[] = [
      'visible', 'hidden', 'enabled', 'disabled', 'checked', 'unchecked',
      'textEquals', 'textContains', 'textMatches', 'valueEquals', 'valueContains',
      'attributeEquals', 'attributeContains', 'urlEquals', 'urlContains',
      'titleEquals', 'titleContains', 'elementCount', 'elementExists',
      'elementNotExists', 'hasClass', 'cssProperty', 'screenshot', 'apiResponse'
    ];
    if (!validTypes.includes(type as AssertionType)) {
      logger.warn(`Unknown assertion type: ${type}, defaulting to 'visible'`);
      return 'visible';
    }
    return type as AssertionType;
  }

  private validateSelectorStrategy(strategy: string): SelectorStrategy {
    const validStrategies: SelectorStrategy[] = [
      'css', 'xpath', 'text', 'testId', 'role', 'label',
      'placeholder', 'altText', 'title', 'id', 'name', 'class'
    ];
    if (!validStrategies.includes(strategy as SelectorStrategy)) {
      return 'css'; // Default to CSS
    }
    return strategy as SelectorStrategy;
  }

  private validateWaitCondition(condition: string): WaitCondition {
    const validConditions: WaitCondition[] = [
      'visible', 'hidden', 'enabled', 'stable', 'networkIdle', 'domLoaded', 'timeout', 'function'
    ];
    if (!validConditions.includes(condition as WaitCondition)) {
      return 'visible'; // Default
    }
    return condition as WaitCondition;
  }

  private validateCategory(category: string): TestCategory {
    const validCategories: TestCategory[] = [
      'smoke', 'regression', 'functional', 'ui', 'integration', 'e2e', 'accessibility', 'security'
    ];
    if (!validCategories.includes(category as TestCategory)) {
      return 'functional'; // Default
    }
    return category as TestCategory;
  }

  private validatePriority(priority: string): Priority {
    const validPriorities: Priority[] = ['critical', 'high', 'medium', 'low'];
    if (!validPriorities.includes(priority as Priority)) {
      return 'medium'; // Default
    }
    return priority as Priority;
  }

  /**
   * Generate empty CSV template
   */
  async generateTemplate(outputPath: string): Promise<void> {
    const headers = [
      'test_id', 'test_name', 'description', 'category', 'priority', 'tags',
      'step_order', 'action', 'step_description', 'selector', 'selector_strategy',
      'value', 'assertion_type', 'expected_value', 'wait_condition', 'wait_timeout',
      'drag_source', 'drag_target', 'continue_on_error', 'screenshot', 'expected_result'
    ];

    const template = [
      headers,
      ['TC001', 'Sample Test', 'Sample test description', 'functional', 'high', 'smoke,e2e',
       '1', 'navigate', 'Open home page', '/', 'css', '', 'urlContains', '/', 'domLoaded', '5000',
       '', '', 'false', 'true', 'Page should load successfully']
    ];

    return new Promise((resolve, reject) => {
      stringify(template, (err, output) => {
        if (err) reject(err);
        fs.writeFileSync(outputPath, output);
        console_log.success(`Template generated: ${outputPath}`);
        resolve();
      });
    });
  }

  /**
   * Export TestSuite to CSV format
   */
  async exportToCSV(suite: TestSuite, outputPath: string): Promise<void> {
    const rows: string[][] = [];

    // Headers
    rows.push([
      'test_id', 'test_name', 'description', 'category', 'priority', 'tags',
      'step_order', 'action', 'step_description', 'selector', 'selector_strategy',
      'value', 'assertion_type', 'expected_value', 'wait_condition', 'wait_timeout',
      'drag_source', 'drag_target', 'continue_on_error', 'screenshot', 'expected_result'
    ]);

    // Data rows
    for (const testCase of suite.testCases) {
      for (const step of testCase.steps) {
        rows.push([
          testCase.id,
          testCase.name,
          testCase.description,
          testCase.category,
          testCase.priority,
          testCase.tags.join(','),
          step.order.toString(),
          step.action,
          step.description,
          step.selector || '',
          step.selectorStrategy || 'css',
          step.value || '',
          step.assertion?.type || '',
          step.assertion?.expected || '',
          step.wait?.condition || '',
          (step.wait?.timeout || step.assertion?.timeout || '').toString(),
          step.dragDrop?.sourceSelector || '',
          step.dragDrop?.targetSelector || '',
          (step.continueOnError || false).toString(),
          (step.screenshot || false).toString(),
          testCase.expectedResult,
        ]);
      }
    }

    return new Promise((resolve, reject) => {
      stringify(rows, (err, output) => {
        if (err) reject(err);
        fs.writeFileSync(outputPath, output);
        console_log.success(`Test suite exported to: ${outputPath}`);
        resolve();
      });
    });
  }
}

export default CSVParser;
