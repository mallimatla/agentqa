/**
 * AgentQA Intelligent Test Strategy Engine
 * Generates comprehensive test strategies from project configuration
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ProjectConfig,
  TestStrategy,
  TestScenario,
  TestCase,
  TestStep,
  TestData,
  IntelligentTestSuite,
  TestGenerationReport,
  RiskArea,
  TestPhase,
  UserStory,
  Feature,
  UserRole,
  CriticalFlow,
  Recommendation,
  CoverageGap,
  Priority,
  TestCategory,
  ActionType,
  AssertionType,
  ScenarioStep,
  NegativeTestSpec,
  FeatureInput,
  BusinessRule,
} from '../../types';

export class StrategyEngine {
  /**
   * Generate comprehensive test strategy from project configuration
   */
  generateStrategy(project: ProjectConfig): TestStrategy {
    const riskAreas = this.identifyRiskAreas(project);
    const testPhases = this.defineTestPhases(project);
    const estimatedTests = this.estimateTestCount(project);

    const strategy: TestStrategy = {
      id: uuidv4(),
      projectId: project.id,
      name: `${project.name} Test Strategy`,
      description: this.generateStrategyDescription(project),
      objectives: this.defineObjectives(project),
      approach: this.defineApproach(project),
      scope: project.testingScope,
      riskAreas,
      testPhases,
      estimatedTestCount: estimatedTests,
      prioritization: {
        byBusinessImpact: true,
        byUserFrequency: true,
        byRiskLevel: true,
        byDependencies: true,
        customRules: this.generatePrioritizationRules(project),
      },
      resources: this.allocateResources(project),
      createdAt: new Date(),
    };

    return strategy;
  }

  /**
   * Generate test scenarios from project features and user stories
   */
  generateScenarios(project: ProjectConfig, strategy: TestStrategy): TestScenario[] {
    const scenarios: TestScenario[] = [];

    // Generate scenarios from user stories
    for (const story of project.userStories) {
      scenarios.push(...this.generateScenariosFromStory(story, project));
    }

    // Generate scenarios from features
    for (const feature of project.features) {
      scenarios.push(...this.generateScenariosFromFeature(feature, project));
    }

    // Generate scenarios from critical flows
    for (const flow of project.criticalFlows) {
      scenarios.push(...this.generateScenariosFromFlow(flow, project));
    }

    // Generate cross-role scenarios
    scenarios.push(...this.generateCrossRoleScenarios(project));

    // Generate negative scenarios if enabled
    if (project.testingScope.includeNegative) {
      scenarios.push(...this.generateNegativeScenarios(project));
    }

    // Generate boundary scenarios if enabled
    if (project.testingScope.includeBoundary) {
      scenarios.push(...this.generateBoundaryScenarios(project));
    }

    // Generate edge case scenarios if enabled
    if (project.testingScope.includeEdgeCases) {
      scenarios.push(...this.generateEdgeCaseScenarios(project));
    }

    return scenarios;
  }

  /**
   * Generate test cases from scenarios
   */
  generateTestCases(scenarios: TestScenario[], project: ProjectConfig): TestCase[] {
    const testCases: TestCase[] = [];

    for (const scenario of scenarios) {
      testCases.push(...this.generateTestCasesFromScenario(scenario, project));
    }

    return testCases;
  }

  /**
   * Generate complete intelligent test suite
   */
  generateIntelligentSuite(project: ProjectConfig): IntelligentTestSuite {
    const startTime = Date.now();

    const strategy = this.generateStrategy(project);
    const scenarios = this.generateScenarios(project, strategy);
    const testCases = this.generateTestCases(scenarios, project);
    const testData = this.generateTestData(project, testCases);

    const suite: IntelligentTestSuite = {
      id: uuidv4(),
      projectId: project.id,
      strategyId: strategy.id,
      name: `${project.name} - Intelligent Test Suite`,
      description: `Comprehensive test suite generated from ${project.userStories.length} user stories, ${project.features.length} features, and ${project.criticalFlows.length} critical flows`,
      baseUrl: project.baseUrl,
      scenarios,
      testCases,
      testData,
      coverage: {
        features: project.features.length,
        userStories: project.userStories.length,
        businessRules: this.countBusinessRules(project),
        userRoles: project.userRoles.length,
        positiveTests: testCases.filter(tc => !tc.tags.includes('negative')).length,
        negativeTests: testCases.filter(tc => tc.tags.includes('negative')).length,
        totalTests: testCases.length,
      },
      metadata: {
        generatedAt: new Date(),
        generationTime: Date.now() - startTime,
        version: '1.0.0',
      },
    };

    return suite;
  }

  /**
   * Generate test generation report
   */
  generateReport(suite: IntelligentTestSuite, project: ProjectConfig): TestGenerationReport {
    const byType: Record<string, number> = {
      positive: 0,
      negative: 0,
      boundary: 0,
      'edge-case': 0,
      security: 0,
      accessibility: 0,
    };

    const byPriority: Record<Priority, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    const byCategory: Record<TestCategory, number> = {
      smoke: 0,
      regression: 0,
      functional: 0,
      ui: 0,
      integration: 0,
      e2e: 0,
      accessibility: 0,
      security: 0,
    };

    for (const scenario of suite.scenarios) {
      byType[scenario.type] = (byType[scenario.type] || 0) + 1;
    }

    for (const testCase of suite.testCases) {
      byPriority[testCase.priority]++;
      byCategory[testCase.category]++;
    }

    return {
      projectName: project.name,
      strategyName: `${project.name} Test Strategy`,
      summary: {
        totalScenarios: suite.scenarios.length,
        totalTestCases: suite.testCases.length,
        byType,
        byPriority,
        byCategory,
        coveragePercentage: this.calculateCoverage(suite, project),
      },
      recommendations: this.generateRecommendations(suite, project),
      gaps: this.identifyCoverageGaps(suite, project),
      generatedAt: new Date(),
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private generateStrategyDescription(project: ProjectConfig): string {
    return `Comprehensive testing strategy for ${project.name}, covering ${project.features.length} features across ${project.userRoles.length} user roles. This strategy includes ${project.testingScope.includePositive ? 'positive' : ''} ${project.testingScope.includeNegative ? 'negative' : ''} ${project.testingScope.includeBoundary ? 'boundary' : ''} testing approaches.`;
  }

  private defineObjectives(project: ProjectConfig): string[] {
    const objectives = [
      'Validate all critical business flows function correctly',
      'Ensure all user roles have appropriate access and restrictions',
      'Verify data integrity across all features',
    ];

    if (project.testingScope.includeNegative) {
      objectives.push('Validate proper error handling for invalid inputs');
      objectives.push('Ensure graceful degradation under failure conditions');
    }

    if (project.testingScope.includeSecurity) {
      objectives.push('Verify authentication and authorization mechanisms');
      objectives.push('Test for common security vulnerabilities');
    }

    if (project.testingScope.includeAccessibility) {
      objectives.push('Ensure WCAG 2.1 compliance for accessibility');
    }

    if (project.testingScope.includePerformance) {
      objectives.push('Validate performance benchmarks are met');
    }

    return objectives;
  }

  private defineApproach(project: ProjectConfig): string {
    const approaches = [];

    approaches.push('Risk-based testing prioritizing critical business flows');

    if (project.testingScope.testDepth === 'exhaustive') {
      approaches.push('Exhaustive test coverage with combinatorial testing');
    } else if (project.testingScope.testDepth === 'deep') {
      approaches.push('Deep test coverage with pairwise testing');
    }

    if (project.testingScope.includeCrossBrowser) {
      approaches.push(`Cross-browser testing on ${project.testingScope.browsers.join(', ')}`);
    }

    if (project.testingScope.includeMobile) {
      approaches.push('Responsive testing across mobile viewports');
    }

    return approaches.join('. ');
  }

  private identifyRiskAreas(project: ProjectConfig): RiskArea[] {
    const riskAreas: RiskArea[] = [];

    // High-frequency flows are high risk
    const highFrequencyFlows = project.criticalFlows.filter(f => f.frequency === 'very-high' || f.frequency === 'high');
    if (highFrequencyFlows.length > 0) {
      riskAreas.push({
        id: uuidv4(),
        name: 'High-Frequency User Flows',
        description: `${highFrequencyFlows.length} critical flows with high user frequency`,
        likelihood: 'high',
        impact: 'critical',
        mitigationStrategy: 'Implement comprehensive positive and negative tests with automated regression',
        relatedFeatures: highFrequencyFlows.map(f => f.name),
      });
    }

    // Authentication is always a risk area
    const authFeatures = project.features.filter(f =>
      f.name.toLowerCase().includes('login') ||
      f.name.toLowerCase().includes('auth') ||
      f.name.toLowerCase().includes('password')
    );
    if (authFeatures.length > 0) {
      riskAreas.push({
        id: uuidv4(),
        name: 'Authentication & Security',
        description: 'User authentication and session management',
        likelihood: 'medium',
        impact: 'critical',
        mitigationStrategy: 'Extensive security testing including injection, session handling, and authorization bypass attempts',
        relatedFeatures: authFeatures.map(f => f.name),
      });
    }

    // Data entry forms are risk areas
    const formFeatures = project.features.filter(f => f.inputs.length > 3);
    if (formFeatures.length > 0) {
      riskAreas.push({
        id: uuidv4(),
        name: 'Data Entry Forms',
        description: `${formFeatures.length} complex forms with multiple inputs`,
        likelihood: 'high',
        impact: 'high',
        mitigationStrategy: 'Boundary testing, validation testing, and negative input testing',
        relatedFeatures: formFeatures.map(f => f.name),
      });
    }

    // Third-party integrations
    const integrationFeatures = project.features.filter(f =>
      f.integrations && f.integrations.some(i => i.type === 'thirdParty' || i.type === 'api')
    );
    if (integrationFeatures.length > 0) {
      riskAreas.push({
        id: uuidv4(),
        name: 'External Integrations',
        description: 'Third-party service and API dependencies',
        likelihood: 'medium',
        impact: 'high',
        mitigationStrategy: 'Integration testing with mock services and error handling verification',
        relatedFeatures: integrationFeatures.map(f => f.name),
      });
    }

    return riskAreas;
  }

  private defineTestPhases(project: ProjectConfig): TestPhase[] {
    return [
      {
        name: 'Smoke Testing',
        description: 'Quick validation of critical paths',
        order: 1,
        testTypes: ['smoke'],
        entryConditions: ['Build successfully deployed', 'Environment accessible'],
        exitCriteria: ['All smoke tests pass', 'No critical defects'],
      },
      {
        name: 'Functional Testing',
        description: 'Comprehensive feature validation',
        order: 2,
        testTypes: ['functional', 'ui'],
        entryConditions: ['Smoke tests passed'],
        exitCriteria: ['All functional tests pass', 'No high severity defects'],
      },
      {
        name: 'Integration Testing',
        description: 'End-to-end workflow validation',
        order: 3,
        testTypes: ['integration', 'e2e'],
        entryConditions: ['Functional tests passed'],
        exitCriteria: ['All integration tests pass', 'Data flows correctly'],
      },
      {
        name: 'Regression Testing',
        description: 'Full regression suite execution',
        order: 4,
        testTypes: ['regression'],
        entryConditions: ['Integration tests passed'],
        exitCriteria: ['No regression defects', 'Pass rate > 95%'],
      },
    ];
  }

  private estimateTestCount(project: ProjectConfig): TestStrategy['estimatedTestCount'] {
    const baseCount = project.features.length * 5;
    const storyCount = project.userStories.length * 3;
    const flowCount = project.criticalFlows.length * 2;
    const roleMultiplier = project.userRoles.length;

    let negativeMultiplier = 1;
    if (project.testingScope.includeNegative) negativeMultiplier += 0.5;
    if (project.testingScope.includeBoundary) negativeMultiplier += 0.3;
    if (project.testingScope.includeEdgeCases) negativeMultiplier += 0.2;

    const total = Math.ceil((baseCount + storyCount + flowCount) * roleMultiplier * negativeMultiplier);

    return {
      smoke: Math.ceil(total * 0.1),
      regression: Math.ceil(total * 0.3),
      functional: Math.ceil(total * 0.35),
      integration: Math.ceil(total * 0.15),
      e2e: Math.ceil(total * 0.1),
      total,
    };
  }

  private generatePrioritizationRules(project: ProjectConfig): string[] {
    const rules = [];

    // Add rules based on critical flows
    for (const flow of project.criticalFlows) {
      if (flow.businessImpact === 'critical') {
        rules.push(`Critical priority for ${flow.name} tests`);
      }
    }

    return rules;
  }

  private allocateResources(project: ProjectConfig) {
    const resources = [];

    for (const browser of project.testingScope.browsers) {
      resources.push({
        type: 'browser' as const,
        name: browser,
        allocation: 'parallel execution',
      });
    }

    for (const env of project.environments) {
      resources.push({
        type: 'environment' as const,
        name: env.name,
        allocation: env.type === 'production' ? 'read-only tests' : 'full testing',
      });
    }

    return resources;
  }

  private generateScenariosFromStory(story: UserStory, project: ProjectConfig): TestScenario[] {
    const scenarios: TestScenario[] = [];
    const role = project.userRoles.find(r => r.name.toLowerCase() === story.asA.toLowerCase()) || project.userRoles[0];

    // Positive scenario
    scenarios.push({
      id: uuidv4(),
      name: `${story.title} - Happy Path`,
      description: story.description,
      feature: story.relatedFeatures?.[0] || 'General',
      userStory: story.id,
      userRole: role?.name || 'User',
      type: 'positive',
      preconditions: [`User is logged in as ${role?.name || 'User'}`, ...this.extractPreconditions(story)],
      flow: this.generateFlowSteps(story, 'positive'),
      expectedBehavior: story.acceptanceCriteria.join('; '),
      priority: story.priority,
      tags: ['positive', ...story.tags],
      coverage: {
        businessRules: [],
        validations: [],
        integrations: [],
      },
    });

    return scenarios;
  }

  private generateScenariosFromFeature(feature: Feature, project: ProjectConfig): TestScenario[] {
    const scenarios: TestScenario[] = [];

    // Generate positive scenarios for each user role
    for (const role of project.userRoles) {
      scenarios.push({
        id: uuidv4(),
        name: `${feature.name} - ${role.name} Access`,
        description: `Verify ${feature.name} functionality for ${role.name} role`,
        feature: feature.name,
        userRole: role.name,
        type: 'positive',
        preconditions: [`User is logged in as ${role.name}`],
        flow: this.generateFeatureFlowSteps(feature, role),
        expectedBehavior: `${role.name} can successfully use ${feature.name}`,
        priority: this.determineFeaturePriority(feature),
        tags: ['positive', feature.module, role.name.toLowerCase()],
        coverage: {
          businessRules: feature.businessRules.map(r => r.id),
          validations: feature.validations.map(v => v.field),
          integrations: feature.integrations?.map(i => i.name) || [],
        },
      });
    }

    return scenarios;
  }

  private generateScenariosFromFlow(flow: CriticalFlow, project: ProjectConfig): TestScenario[] {
    const scenarios: TestScenario[] = [];
    const role = project.userRoles.find(r => r.name === flow.userRole) || project.userRoles[0];

    scenarios.push({
      id: uuidv4(),
      name: `Critical Flow: ${flow.name}`,
      description: flow.description,
      feature: 'Critical Flows',
      userRole: role?.name || 'User',
      type: 'positive',
      preconditions: [`User is logged in as ${role?.name || flow.userRole}`],
      flow: flow.steps.map((step, index) => ({
        order: index + 1,
        description: step,
        action: 'execute',
        expectedResult: index === flow.steps.length - 1 ? flow.expectedOutcome : 'Step completes successfully',
      })),
      expectedBehavior: flow.expectedOutcome,
      priority: flow.priority,
      tags: ['critical-flow', 'e2e', flow.frequency],
      coverage: {
        businessRules: [],
        validations: [],
        integrations: [],
      },
    });

    return scenarios;
  }

  private generateCrossRoleScenarios(project: ProjectConfig): TestScenario[] {
    const scenarios: TestScenario[] = [];

    // Test role restrictions
    for (const role of project.userRoles) {
      if (role.restrictions && role.restrictions.length > 0) {
        scenarios.push({
          id: uuidv4(),
          name: `Authorization: ${role.name} Restrictions`,
          description: `Verify ${role.name} cannot access restricted features`,
          feature: 'Authorization',
          userRole: role.name,
          type: 'negative',
          preconditions: [`User is logged in as ${role.name}`],
          flow: role.restrictions.map((restriction, index) => ({
            order: index + 1,
            description: `Attempt to access ${restriction}`,
            action: 'navigate',
            expectedResult: 'Access denied or redirect to authorized page',
          })),
          expectedBehavior: 'User cannot access restricted features',
          priority: 'high',
          tags: ['negative', 'authorization', 'security'],
          coverage: {
            businessRules: [],
            validations: [],
            integrations: [],
          },
        });
      }
    }

    return scenarios;
  }

  private generateNegativeScenarios(project: ProjectConfig): TestScenario[] {
    const scenarios: TestScenario[] = [];

    for (const feature of project.features) {
      // Generate negative scenarios for each input
      for (const input of feature.inputs) {
        const negativeSpecs = this.generateNegativeSpecs(input);

        for (const spec of negativeSpecs) {
          scenarios.push({
            id: uuidv4(),
            name: `${feature.name} - ${spec.type}: ${input.name}`,
            description: `Verify error handling for ${spec.type} on ${input.name}`,
            feature: feature.name,
            userRole: project.userRoles[0]?.name || 'User',
            type: 'negative',
            preconditions: ['User is on the feature page'],
            flow: [
              {
                order: 1,
                description: `Enter ${spec.type} value in ${input.name}`,
                action: 'type',
                input: spec.invalidValue,
                expectedResult: 'Value is entered',
              },
              {
                order: 2,
                description: 'Submit the form',
                action: 'click',
                expectedResult: spec.expectedError,
              },
            ],
            expectedBehavior: spec.expectedError,
            priority: spec.severity === 'critical' ? 'critical' : spec.severity,
            tags: ['negative', spec.type, input.name],
            coverage: {
              businessRules: [],
              validations: [input.name],
              integrations: [],
            },
          });
        }
      }
    }

    return scenarios;
  }

  private generateBoundaryScenarios(project: ProjectConfig): TestScenario[] {
    const scenarios: TestScenario[] = [];

    for (const feature of project.features) {
      for (const input of feature.inputs) {
        if (this.hasBoundaryValues(input)) {
          const boundaryValues = this.getBoundaryValues(input);

          scenarios.push({
            id: uuidv4(),
            name: `${feature.name} - Boundary: ${input.name}`,
            description: `Test boundary values for ${input.name}`,
            feature: feature.name,
            userRole: project.userRoles[0]?.name || 'User',
            type: 'boundary',
            preconditions: ['User is on the feature page'],
            flow: boundaryValues.map((value, index) => ({
              order: index + 1,
              description: `Enter boundary value: ${value.description}`,
              action: 'type',
              input: String(value.value),
              expectedResult: value.expected,
            })),
            expectedBehavior: 'All boundary values handled correctly',
            priority: 'medium',
            tags: ['boundary', input.name],
            coverage: {
              businessRules: [],
              validations: [input.name],
              integrations: [],
            },
          });
        }
      }
    }

    return scenarios;
  }

  private generateEdgeCaseScenarios(project: ProjectConfig): TestScenario[] {
    const scenarios: TestScenario[] = [];

    // Empty state scenarios
    scenarios.push({
      id: uuidv4(),
      name: 'Edge Case: Empty State',
      description: 'Verify application handles empty data state',
      feature: 'General',
      userRole: project.userRoles[0]?.name || 'User',
      type: 'edge-case',
      preconditions: ['New user with no data'],
      flow: [
        {
          order: 1,
          description: 'Navigate to main dashboard',
          action: 'navigate',
          expectedResult: 'Empty state message displayed',
        },
      ],
      expectedBehavior: 'Graceful empty state handling with helpful messages',
      priority: 'medium',
      tags: ['edge-case', 'empty-state'],
      coverage: {
        businessRules: [],
        validations: [],
        integrations: [],
      },
    });

    // Session timeout scenario
    scenarios.push({
      id: uuidv4(),
      name: 'Edge Case: Session Timeout',
      description: 'Verify session timeout handling',
      feature: 'Authentication',
      userRole: project.userRoles[0]?.name || 'User',
      type: 'edge-case',
      preconditions: ['User is logged in'],
      flow: [
        {
          order: 1,
          description: 'Wait for session to expire',
          action: 'wait',
          expectedResult: 'Session expires',
        },
        {
          order: 2,
          description: 'Attempt to perform action',
          action: 'click',
          expectedResult: 'Redirect to login with appropriate message',
        },
      ],
      expectedBehavior: 'User is redirected to login with session expired message',
      priority: 'high',
      tags: ['edge-case', 'session', 'security'],
      coverage: {
        businessRules: [],
        validations: [],
        integrations: [],
      },
    });

    // Network error scenario
    scenarios.push({
      id: uuidv4(),
      name: 'Edge Case: Network Error',
      description: 'Verify network error handling',
      feature: 'General',
      userRole: project.userRoles[0]?.name || 'User',
      type: 'edge-case',
      preconditions: ['User is logged in'],
      flow: [
        {
          order: 1,
          description: 'Simulate network disconnection',
          action: 'executeScript',
          expectedResult: 'Network is disconnected',
        },
        {
          order: 2,
          description: 'Attempt to save data',
          action: 'click',
          expectedResult: 'Appropriate error message displayed',
        },
      ],
      expectedBehavior: 'User sees clear error message about network issues',
      priority: 'high',
      tags: ['edge-case', 'network', 'error-handling'],
      coverage: {
        businessRules: [],
        validations: [],
        integrations: [],
      },
    });

    return scenarios;
  }

  private generateTestCasesFromScenario(scenario: TestScenario, project: ProjectConfig): TestCase[] {
    const testCases: TestCase[] = [];
    let testIdCounter = 1;

    const testCase: TestCase = {
      id: `TC-${scenario.id.substring(0, 8)}-${testIdCounter++}`,
      name: scenario.name,
      description: scenario.description,
      category: this.mapScenarioTypeToCategory(scenario.type),
      priority: scenario.priority,
      tags: scenario.tags,
      preconditions: scenario.preconditions,
      steps: this.convertScenarioStepsToTestSteps(scenario.flow, project),
      expectedResult: scenario.expectedBehavior,
      timeout: 60000,
      retries: 1,
    };

    testCases.push(testCase);

    return testCases;
  }

  private generateTestData(project: ProjectConfig, testCases: TestCase[]): TestData[] {
    const testData: TestData[] = [];

    // Generate valid test data
    for (const feature of project.features) {
      const validData: Record<string, string | number | boolean> = {};

      for (const input of feature.inputs) {
        validData[input.name] = this.generateValidValue(input);
      }

      testData.push({
        id: uuidv4(),
        name: `${feature.name} - Valid Data`,
        description: `Valid test data for ${feature.name}`,
        type: 'valid',
        values: validData,
        expectedOutcome: 'success',
      });

      // Generate invalid test data
      if (project.testingScope.includeNegative) {
        for (const input of feature.inputs) {
          const invalidData = { ...validData };
          invalidData[input.name] = this.generateInvalidValue(input);

          testData.push({
            id: uuidv4(),
            name: `${feature.name} - Invalid ${input.name}`,
            description: `Invalid ${input.name} for ${feature.name}`,
            type: 'invalid',
            values: invalidData,
            expectedOutcome: 'error',
            errorMessage: `Invalid ${input.name}`,
          });
        }
      }

      // Generate boundary test data
      if (project.testingScope.includeBoundary) {
        for (const input of feature.inputs) {
          if (this.hasBoundaryValues(input)) {
            const boundaries = this.getBoundaryValues(input);
            for (const boundary of boundaries) {
              const boundaryData = { ...validData };
              boundaryData[input.name] = boundary.value;

              testData.push({
                id: uuidv4(),
                name: `${feature.name} - ${boundary.description}`,
                description: `Boundary value ${boundary.description} for ${input.name}`,
                type: 'boundary',
                values: boundaryData,
                expectedOutcome: boundary.isValid ? 'success' : 'error',
                errorMessage: boundary.isValid ? undefined : `Value out of range for ${input.name}`,
              });
            }
          }
        }
      }
    }

    return testData;
  }

  private countBusinessRules(project: ProjectConfig): number {
    return project.features.reduce((count, feature) => count + feature.businessRules.length, 0);
  }

  private calculateCoverage(suite: IntelligentTestSuite, project: ProjectConfig): number {
    const totalFeatures = project.features.length || 1;
    const totalStories = project.userStories.length || 1;
    const totalRoles = project.userRoles.length || 1;

    const featureCoverage = suite.coverage.features / totalFeatures;
    const storyCoverage = suite.coverage.userStories / totalStories;
    const roleCoverage = suite.coverage.userRoles / totalRoles;

    return Math.round(((featureCoverage + storyCoverage + roleCoverage) / 3) * 100);
  }

  private generateRecommendations(suite: IntelligentTestSuite, project: ProjectConfig): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Check for missing negative tests
    if (suite.coverage.negativeTests < suite.coverage.positiveTests * 0.5) {
      recommendations.push({
        type: 'coverage',
        title: 'Increase Negative Test Coverage',
        description: 'Current negative test coverage is below recommended 50% ratio',
        action: 'Add more negative test cases for input validation and error handling',
        impact: 'high',
      });
    }

    // Check for missing role coverage
    const testedRoles = new Set(suite.scenarios.map(s => s.userRole));
    const missingRoles = project.userRoles.filter(r => !testedRoles.has(r.name));
    if (missingRoles.length > 0) {
      recommendations.push({
        type: 'coverage',
        title: 'Missing User Role Coverage',
        description: `${missingRoles.length} user roles not covered in tests`,
        action: `Add tests for: ${missingRoles.map(r => r.name).join(', ')}`,
        impact: 'high',
      });
    }

    // Check for critical flow coverage
    const criticalFlows = project.criticalFlows.filter(f => f.businessImpact === 'critical');
    if (criticalFlows.length > 0 && suite.scenarios.filter(s => s.tags.includes('critical-flow')).length < criticalFlows.length) {
      recommendations.push({
        type: 'risk',
        title: 'Critical Flow Coverage Gap',
        description: 'Some critical business flows may not have adequate test coverage',
        action: 'Review and add comprehensive tests for all critical flows',
        impact: 'high',
      });
    }

    return recommendations;
  }

  private identifyCoverageGaps(suite: IntelligentTestSuite, project: ProjectConfig): CoverageGap[] {
    const gaps: CoverageGap[] = [];

    // Check feature coverage
    const testedFeatures = new Set(suite.scenarios.map(s => s.feature));
    const untestedFeatures = project.features.filter(f => !testedFeatures.has(f.name));

    for (const feature of untestedFeatures) {
      gaps.push({
        area: feature.name,
        type: 'feature',
        description: `Feature ${feature.name} has no test coverage`,
        suggestedTests: [
          `${feature.name} - Happy Path`,
          `${feature.name} - Validation Tests`,
          `${feature.name} - Error Handling`,
        ],
      });
    }

    return gaps;
  }

  // Helper methods for generating values and steps
  private extractPreconditions(story: UserStory): string[] {
    const preconditions: string[] = [];

    if (story.dependencies && story.dependencies.length > 0) {
      preconditions.push(`Completed: ${story.dependencies.join(', ')}`);
    }

    return preconditions;
  }

  private generateFlowSteps(story: UserStory, type: 'positive' | 'negative'): ScenarioStep[] {
    return story.acceptanceCriteria.map((criteria, index) => ({
      order: index + 1,
      description: criteria,
      action: 'verify',
      expectedResult: type === 'positive' ? 'Criteria met' : 'Error displayed',
    }));
  }

  private generateFeatureFlowSteps(feature: Feature, role: UserRole): ScenarioStep[] {
    const steps: ScenarioStep[] = [];
    let order = 1;

    // Navigate to feature
    steps.push({
      order: order++,
      description: `Navigate to ${feature.name}`,
      action: 'navigate',
      expectedResult: `${feature.name} page loads successfully`,
    });

    // Fill in inputs
    for (const input of feature.inputs) {
      steps.push({
        order: order++,
        description: `Enter ${input.name}`,
        action: input.type === 'select' ? 'select' : 'type',
        input: `{{${input.name}}}`,
        expectedResult: `${input.name} is filled`,
      });
    }

    // Submit
    steps.push({
      order: order++,
      description: 'Submit the form',
      action: 'click',
      expectedResult: 'Form submitted successfully',
    });

    // Verify outputs
    for (const output of feature.outputs) {
      steps.push({
        order: order++,
        description: `Verify ${output.name}`,
        action: 'assert',
        expectedResult: output.successIndicator || `${output.name} displayed correctly`,
      });
    }

    return steps;
  }

  private determineFeaturePriority(feature: Feature): Priority {
    if (feature.businessRules.some(r => r.priority === 'critical')) return 'critical';
    if (feature.businessRules.some(r => r.priority === 'high')) return 'high';
    return 'medium';
  }

  private generateNegativeSpecs(input: FeatureInput): NegativeTestSpec[] {
    const specs: NegativeTestSpec[] = [];

    if (input.required) {
      specs.push({
        type: 'missing-required',
        field: input.name,
        invalidValue: '',
        expectedError: `${input.name} is required`,
        severity: 'high',
      });
    }

    if (input.type === 'email') {
      specs.push({
        type: 'format-error',
        field: input.name,
        invalidValue: 'invalid-email',
        expectedError: 'Invalid email format',
        severity: 'medium',
      });
    }

    if (input.maxLength) {
      specs.push({
        type: 'boundary-violation',
        field: input.name,
        invalidValue: 'x'.repeat(input.maxLength + 1),
        expectedError: `${input.name} exceeds maximum length`,
        severity: 'medium',
      });
    }

    if (input.type === 'number') {
      specs.push({
        type: 'invalid-input',
        field: input.name,
        invalidValue: 'abc',
        expectedError: `${input.name} must be a number`,
        severity: 'medium',
      });
    }

    // SQL injection test
    specs.push({
      type: 'injection',
      field: input.name,
      invalidValue: "'; DROP TABLE users; --",
      expectedError: 'Input sanitized or rejected',
      severity: 'critical',
    });

    // XSS test
    specs.push({
      type: 'injection',
      field: input.name,
      invalidValue: '<script>alert("xss")</script>',
      expectedError: 'Input sanitized or rejected',
      severity: 'critical',
    });

    return specs;
  }

  private hasBoundaryValues(input: FeatureInput): boolean {
    return !!(input.minLength || input.maxLength || input.minValue !== undefined || input.maxValue !== undefined);
  }

  private getBoundaryValues(input: FeatureInput): Array<{ value: string | number; description: string; expected: string; isValid: boolean }> {
    const values: Array<{ value: string | number; description: string; expected: string; isValid: boolean }> = [];

    if (input.minLength !== undefined) {
      values.push({
        value: 'x'.repeat(input.minLength - 1),
        description: `Min length - 1 (${input.minLength - 1})`,
        expected: 'Validation error',
        isValid: false,
      });
      values.push({
        value: 'x'.repeat(input.minLength),
        description: `Min length (${input.minLength})`,
        expected: 'Accepted',
        isValid: true,
      });
    }

    if (input.maxLength !== undefined) {
      values.push({
        value: 'x'.repeat(input.maxLength),
        description: `Max length (${input.maxLength})`,
        expected: 'Accepted',
        isValid: true,
      });
      values.push({
        value: 'x'.repeat(input.maxLength + 1),
        description: `Max length + 1 (${input.maxLength + 1})`,
        expected: 'Validation error',
        isValid: false,
      });
    }

    if (input.minValue !== undefined) {
      values.push({
        value: input.minValue - 1,
        description: `Min value - 1 (${input.minValue - 1})`,
        expected: 'Validation error',
        isValid: false,
      });
      values.push({
        value: input.minValue,
        description: `Min value (${input.minValue})`,
        expected: 'Accepted',
        isValid: true,
      });
    }

    if (input.maxValue !== undefined) {
      values.push({
        value: input.maxValue,
        description: `Max value (${input.maxValue})`,
        expected: 'Accepted',
        isValid: true,
      });
      values.push({
        value: input.maxValue + 1,
        description: `Max value + 1 (${input.maxValue + 1})`,
        expected: 'Validation error',
        isValid: false,
      });
    }

    return values;
  }

  private mapScenarioTypeToCategory(type: TestScenario['type']): TestCategory {
    switch (type) {
      case 'positive':
        return 'functional';
      case 'negative':
        return 'functional';
      case 'boundary':
        return 'functional';
      case 'edge-case':
        return 'regression';
      case 'security':
        return 'security';
      case 'accessibility':
        return 'accessibility';
      default:
        return 'functional';
    }
  }

  private convertScenarioStepsToTestSteps(flow: ScenarioStep[], project: ProjectConfig): TestStep[] {
    return flow.map(step => ({
      id: uuidv4(),
      order: step.order,
      action: this.mapActionStringToType(step.action),
      description: step.description,
      value: step.input,
      assertion: {
        type: 'textContains' as AssertionType,
        expected: step.expectedResult,
      },
    }));
  }

  private mapActionStringToType(action: string): ActionType {
    const actionMap: Record<string, ActionType> = {
      navigate: 'navigate',
      click: 'click',
      type: 'type',
      select: 'select',
      verify: 'assert',
      assert: 'assert',
      execute: 'click',
      wait: 'wait',
      executeScript: 'executeScript',
    };
    return actionMap[action] || 'assert';
  }

  private generateValidValue(input: FeatureInput): string | number | boolean {
    switch (input.type) {
      case 'email':
        return 'test@example.com';
      case 'password':
        return 'SecureP@ss123';
      case 'number':
        return input.minValue !== undefined ? input.minValue : 0;
      case 'text':
        return input.defaultValue || 'Test Value';
      case 'checkbox':
        return true;
      case 'select':
        return input.validValues?.[0] || 'option1';
      case 'date':
        return new Date().toISOString().split('T')[0];
      default:
        return input.defaultValue || 'test';
    }
  }

  private generateInvalidValue(input: FeatureInput): string | number | boolean {
    switch (input.type) {
      case 'email':
        return 'invalid-email';
      case 'password':
        return 'a';
      case 'number':
        return 'not-a-number';
      case 'text':
        return input.maxLength ? 'x'.repeat(input.maxLength + 10) : '';
      default:
        return '';
    }
  }
}

export default StrategyEngine;
