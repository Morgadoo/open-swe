/**
 * Task Decomposition Module
 *
 * Provides functionality for analyzing task complexity, decomposing complex tasks
 * into manageable subtasks, and tracking subtask progress. Supports both heuristic
 * and LLM-assisted decomposition strategies.
 */

import { randomBytes } from "crypto";

// ============================================================================
// Types
// ============================================================================

/**
 * Description of a task to be analyzed or decomposed.
 */
export interface TaskDescription {
  /** Unique identifier for the task */
  id: string;
  /** Short title of the task */
  title: string;
  /** Detailed description of what needs to be done */
  description: string;
  /** Additional context about the task environment */
  context?: string;
  /** Constraints that must be respected */
  constraints?: string[];
  /** Expected output or deliverable */
  expectedOutput?: string;
}

/**
 * Result of analyzing task complexity.
 */
export interface ComplexityAnalysis {
  /** Numeric complexity score (0-100) */
  score: number;
  /** Categorical complexity level */
  level: "trivial" | "simple" | "moderate" | "complex" | "very_complex";
  /** Factors contributing to complexity */
  factors: ComplexityFactor[];
  /** Estimated number of steps to complete */
  estimatedSteps: number;
  /** Estimated duration in minutes */
  estimatedDurationMinutes: number;
  /** Risk level for the task */
  riskLevel: "low" | "medium" | "high";
  /** Recommendations for handling the task */
  recommendations: string[];
}

/**
 * A single factor contributing to task complexity.
 */
export interface ComplexityFactor {
  /** Name of the factor */
  name: string;
  /** Weight of this factor in overall score (0-1) */
  weight: number;
  /** Score for this factor (0-100) */
  score: number;
  /** Description of why this factor applies */
  description: string;
}

/**
 * Configuration for task decomposition.
 */
export interface DecompositionConfig {
  /** Maximum complexity score before decomposition is recommended */
  maxComplexityScore: number;
  /** Minimum number of subtasks to create */
  minSubtasks: number;
  /** Maximum number of subtasks to create */
  maxSubtasks: number;
  /** Maximum depth of nested decomposition */
  maxDepth: number;
  /** Preferred size of subtasks */
  preferredSubtaskSize: "small" | "medium" | "large";
}

/**
 * Result of decomposing a task.
 */
export interface TaskDecomposition {
  /** The original task that was decomposed */
  originalTask: TaskDescription;
  /** Generated subtasks */
  subtasks: SubTask[];
  /** Dependencies between subtasks */
  dependencies: DependencyGraph;
  /** Total estimated effort */
  estimatedTotalEffort: EffortEstimate;
  /** Strategy used for decomposition */
  decompositionStrategy: string;
  /** Confidence in the decomposition quality (0-1) */
  confidence: number;
}

/**
 * A subtask created from decomposition.
 */
export interface SubTask {
  /** Unique identifier for the subtask */
  id: string;
  /** ID of the parent task */
  parentId: string;
  /** Short title of the subtask */
  title: string;
  /** Detailed description */
  description: string;
  /** Order in the execution sequence */
  order: number;
  /** IDs of subtasks this depends on */
  dependencies: string[];
  /** Estimated effort for this subtask */
  estimatedEffort: EffortEstimate;
  /** Current status of the subtask */
  status: "pending" | "in_progress" | "completed" | "blocked" | "skipped";
  /** Result of executing the subtask */
  result?: SubTaskResult;
}

/**
 * Result of executing a subtask.
 */
export interface SubTaskResult {
  /** ID of the subtask */
  subtaskId: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Output produced by the subtask */
  output?: string;
  /** Error message if failed */
  error?: string;
  /** Duration of execution in milliseconds */
  durationMs: number;
  /** Artifacts produced (file paths, etc.) */
  artifacts?: string[];
}

/**
 * Estimate of effort required.
 */
export interface EffortEstimate {
  /** Number of steps */
  steps: number;
  /** Duration in minutes */
  durationMinutes: number;
  /** Confidence in the estimate (0-1) */
  confidence: number;
  /** Breakdown by category */
  breakdown?: Record<string, number>;
}

/**
 * Graph of dependencies between subtasks.
 */
export interface DependencyGraph {
  /** Node IDs (subtask IDs) */
  nodes: string[];
  /** Edges representing dependencies */
  edges: DependencyEdge[];
  /** Whether the graph contains cycles */
  hasCycles: boolean;
  /** Valid execution order (topological sort) */
  executionOrder: string[];
}

/**
 * An edge in the dependency graph.
 */
export interface DependencyEdge {
  /** Source subtask ID */
  from: string;
  /** Target subtask ID */
  to: string;
  /** Type of dependency */
  type: "requires" | "blocks" | "suggests";
}

/**
 * Context for LLM-assisted decomposition.
 */
export interface DecompositionContext {
  /** Tools available for task execution */
  availableTools: string[];
  /** Previous decomposition attempts */
  previousAttempts?: string[];
  /** Additional constraints */
  constraints?: string[];
  /** User preferences */
  preferences?: Record<string, unknown>;
}

/**
 * Report on subtask progress.
 */
export interface ProgressReport {
  /** Total number of subtasks */
  totalSubtasks: number;
  /** Number of completed subtasks */
  completedSubtasks: number;
  /** Number of in-progress subtasks */
  inProgressSubtasks: number;
  /** Number of blocked subtasks */
  blockedSubtasks: number;
  /** Percentage complete (0-100) */
  percentComplete: number;
  /** Estimated remaining time in minutes */
  estimatedRemainingMinutes: number;
  /** IDs of next subtasks to execute */
  nextSubtasks: string[];
}

/**
 * Result of merging subtask results.
 */
export interface MergedResult {
  /** Overall success status */
  success: boolean;
  /** Summary of the merged results */
  summary: string;
  /** Combined outputs */
  outputs: string[];
  /** Combined errors */
  errors: string[];
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** All artifacts produced */
  artifacts: string[];
}

/**
 * Result of validating a decomposition.
 */
export interface ValidationResult {
  /** Whether the decomposition is valid */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Suggestions for improvement */
  suggestions: string[];
}

// ============================================================================
// Constants
// ============================================================================

/** Default decomposition configuration */
const DEFAULT_DECOMPOSITION_CONFIG: DecompositionConfig = {
  maxComplexityScore: 60,
  minSubtasks: 2,
  maxSubtasks: 10,
  maxDepth: 3,
  preferredSubtaskSize: "medium",
};

/** Complexity level thresholds */
const COMPLEXITY_THRESHOLDS = {
  trivial: 20,
  simple: 40,
  moderate: 60,
  complex: 80,
  very_complex: 100,
};

/** Keywords indicating high complexity */
const HIGH_COMPLEXITY_KEYWORDS = [
  "refactor",
  "migrate",
  "integrate",
  "architecture",
  "redesign",
  "optimize",
  "security",
  "authentication",
  "authorization",
  "database",
  "schema",
  "api",
  "distributed",
  "concurrent",
  "parallel",
  "async",
  "performance",
  "scalability",
];

/** Keywords indicating low complexity */
const LOW_COMPLEXITY_KEYWORDS = [
  "fix",
  "typo",
  "rename",
  "update",
  "add",
  "remove",
  "simple",
  "minor",
  "small",
  "quick",
  "trivial",
  "comment",
  "documentation",
  "readme",
];

/** Operation type weights for complexity calculation */
const OPERATION_WEIGHTS: Record<string, number> = {
  read: 0.1,
  write: 0.3,
  create: 0.4,
  delete: 0.5,
  modify: 0.3,
  test: 0.4,
  deploy: 0.6,
  configure: 0.3,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generates a unique subtask ID.
 * @returns A unique identifier string
 */
function generateSubtaskId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString("hex");
  return `sub_${timestamp}_${random}`;
}

/**
 * Counts keyword occurrences in text.
 * @param text - Text to search
 * @param keywords - Keywords to count
 * @returns Number of keyword matches
 */
function countKeywords(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase();
  return keywords.filter((keyword) => lowerText.includes(keyword)).length;
}

/**
 * Estimates the number of files affected based on description.
 * @param description - Task description
 * @returns Estimated file count
 */
function estimateFileCount(description: string): number {
  const lowerDesc = description.toLowerCase();

  const filePatterns = [
    /\d+\s*files?/gi,
    /multiple\s*files?/gi,
    /several\s*files?/gi,
    /all\s*files?/gi,
  ];

  for (const pattern of filePatterns) {
    const match = lowerDesc.match(pattern);
    if (match) {
      const numMatch = match[0].match(/\d+/);
      if (numMatch) {
        return parseInt(numMatch[0], 10);
      }
      if (match[0].includes("multiple") || match[0].includes("several")) {
        return 5;
      }
      if (match[0].includes("all")) {
        return 10;
      }
    }
  }

  const fileExtensions = description.match(/\.\w{2,4}\b/g);
  if (fileExtensions) {
    return Math.min(fileExtensions.length, 10);
  }

  return 1;
}

/**
 * Detects operation types mentioned in description.
 * @param description - Task description
 * @returns Array of detected operation types
 */
function detectOperationTypes(description: string): string[] {
  const lowerDesc = description.toLowerCase();
  const operations: string[] = [];

  const operationPatterns: Record<string, RegExp[]> = {
    read: [/read/i, /view/i, /inspect/i, /analyze/i, /review/i],
    write: [/write/i, /save/i, /store/i, /persist/i],
    create: [/create/i, /add/i, /new/i, /implement/i, /build/i],
    delete: [/delete/i, /remove/i, /drop/i, /clean/i],
    modify: [/modify/i, /update/i, /change/i, /edit/i, /fix/i, /refactor/i],
    test: [/test/i, /verify/i, /validate/i, /check/i],
    deploy: [/deploy/i, /release/i, /publish/i, /ship/i],
    configure: [/configure/i, /setup/i, /config/i, /settings/i],
  };

  for (const [operation, patterns] of Object.entries(operationPatterns)) {
    if (patterns.some((pattern) => pattern.test(lowerDesc))) {
      operations.push(operation);
    }
  }

  return operations.length > 0 ? operations : ["modify"];
}

/**
 * Calculates ambiguity score based on description clarity.
 * @param description - Task description
 * @returns Ambiguity score (0-100)
 */
function calculateAmbiguityScore(description: string): number {
  let score = 0;

  const vagueTerms = [
    "maybe",
    "possibly",
    "might",
    "could",
    "should",
    "somehow",
    "something",
    "somewhere",
    "etc",
    "and so on",
    "or something",
    "kind of",
    "sort of",
  ];

  const vagueCount = countKeywords(description, vagueTerms);
  score += vagueCount * 10;

  if (description.length < 50) {
    score += 20;
  } else if (description.length < 100) {
    score += 10;
  }

  const questionMarks = (description.match(/\?/g) || []).length;
  score += questionMarks * 5;

  const hasSpecificFiles = /\.\w{2,4}\b/.test(description);
  const hasSpecificFunctions = /\w+\(\)/.test(description);
  const hasSpecificPaths = /\/\w+/.test(description);

  if (!hasSpecificFiles && !hasSpecificFunctions && !hasSpecificPaths) {
    score += 15;
  }

  return Math.min(score, 100);
}

/**
 * Performs topological sort on dependency graph.
 * @param nodes - Node IDs
 * @param edges - Dependency edges
 * @returns Sorted node IDs or empty array if cycle detected
 */
function topologicalSort(nodes: string[], edges: DependencyEdge[]): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node, 0);
    adjacency.set(node, []);
  }

  for (const edge of edges) {
    if (edge.type === "requires") {
      const current = inDegree.get(edge.to) || 0;
      inDegree.set(edge.to, current + 1);
      adjacency.get(edge.from)?.push(edge.to);
    }
  }

  const queue: string[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) {
      queue.push(node);
    }
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);

    for (const neighbor of adjacency.get(node) || []) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  return result.length === nodes.length ? result : [];
}

/**
 * Detects cycles in dependency graph.
 * @param nodes - Node IDs
 * @param edges - Dependency edges
 * @returns Whether cycles exist
 */
function detectCycles(nodes: string[], edges: DependencyEdge[]): boolean {
  const sorted = topologicalSort(nodes, edges);
  return sorted.length !== nodes.length;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Analyzes the complexity of a task.
 *
 * @param task - The task to analyze
 * @returns Complexity analysis with score, level, and recommendations
 *
 * @example
 * ```typescript
 * const analysis = analyzeTaskComplexity({
 *   id: 'task-1',
 *   title: 'Refactor authentication module',
 *   description: 'Refactor the auth module to use JWT tokens'
 * });
 * console.log(`Complexity: ${analysis.level} (${analysis.score})`);
 * ```
 */
export function analyzeTaskComplexity(
  task: TaskDescription,
): ComplexityAnalysis {
  const factors: ComplexityFactor[] = [];
  const fullText = `${task.title} ${task.description} ${task.context || ""}`;

  const highKeywordCount = countKeywords(fullText, HIGH_COMPLEXITY_KEYWORDS);
  const lowKeywordCount = countKeywords(fullText, LOW_COMPLEXITY_KEYWORDS);
  const keywordScore = Math.min(
    100,
    Math.max(0, 50 + highKeywordCount * 10 - lowKeywordCount * 10),
  );
  factors.push({
    name: "keyword_complexity",
    weight: 0.3,
    score: keywordScore,
    description: `Found ${highKeywordCount} high-complexity and ${lowKeywordCount} low-complexity keywords`,
  });

  const fileCount = estimateFileCount(fullText);
  const fileScore = Math.min(100, fileCount * 15);
  factors.push({
    name: "file_scope",
    weight: 0.3,
    score: fileScore,
    description: `Estimated ${fileCount} file(s) affected`,
  });

  const operations = detectOperationTypes(fullText);
  const operationScore =
    operations.reduce((sum, op) => sum + (OPERATION_WEIGHTS[op] || 0.3), 0) *
    50;
  factors.push({
    name: "operation_complexity",
    weight: 0.2,
    score: Math.min(100, operationScore),
    description: `Operations detected: ${operations.join(", ")}`,
  });

  const ambiguityScore = calculateAmbiguityScore(task.description);
  factors.push({
    name: "ambiguity",
    weight: 0.15,
    score: ambiguityScore,
    description:
      ambiguityScore > 50
        ? "Task description is vague or unclear"
        : "Task description is reasonably clear",
  });

  const constraintScore = task.constraints
    ? Math.min(100, task.constraints.length * 15)
    : 0;
  factors.push({
    name: "constraints",
    weight: 0.1,
    score: constraintScore,
    description: task.constraints
      ? `${task.constraints.length} constraint(s) specified`
      : "No constraints specified",
  });

  const hasExpectedOutput = task.expectedOutput ? 0 : 20;
  const hasContext = task.context ? 0 : 10;
  const specificationScore = hasExpectedOutput + hasContext;
  factors.push({
    name: "specification_completeness",
    weight: 0.15,
    score: specificationScore,
    description:
      specificationScore > 0
        ? "Missing expected output or context"
        : "Well-specified task",
  });

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const weightedScore =
    factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight;
  const score = Math.round(weightedScore);

  let level: ComplexityAnalysis["level"];
  if (score <= COMPLEXITY_THRESHOLDS.trivial) {
    level = "trivial";
  } else if (score <= COMPLEXITY_THRESHOLDS.simple) {
    level = "simple";
  } else if (score <= COMPLEXITY_THRESHOLDS.moderate) {
    level = "moderate";
  } else if (score <= COMPLEXITY_THRESHOLDS.complex) {
    level = "complex";
  } else {
    level = "very_complex";
  }

  const estimatedSteps = Math.max(1, Math.ceil(score / 15));
  const estimatedDurationMinutes = estimatedSteps * 10;

  let riskLevel: ComplexityAnalysis["riskLevel"];
  if (score <= 40 && ambiguityScore <= 30) {
    riskLevel = "low";
  } else if (score <= 70 || ambiguityScore <= 50) {
    riskLevel = "medium";
  } else {
    riskLevel = "high";
  }

  const recommendations: string[] = [];
  if (score > 60) {
    recommendations.push("Consider breaking this task into smaller subtasks");
  }
  if (ambiguityScore > 50) {
    recommendations.push("Clarify task requirements before proceeding");
  }
  if (fileCount > 5) {
    recommendations.push("Create checkpoints before modifying multiple files");
  }
  if (operations.includes("delete")) {
    recommendations.push("Backup affected files before deletion");
  }
  if (riskLevel === "high") {
    recommendations.push("Implement thorough testing for this task");
  }

  return {
    score,
    level,
    factors,
    estimatedSteps,
    estimatedDurationMinutes,
    riskLevel,
    recommendations,
  };
}

/**
 * Determines if a task should be decomposed based on complexity analysis.
 *
 * @param analysis - Complexity analysis of the task
 * @param config - Decomposition configuration
 * @returns Whether the task should be decomposed
 *
 * @example
 * ```typescript
 * const analysis = analyzeTaskComplexity(task);
 * if (shouldDecomposeTask(analysis, config)) {
 *   const decomposition = decomposeTask(task, analysis);
 * }
 * ```
 */
export function shouldDecomposeTask(
  analysis: ComplexityAnalysis,
  config: DecompositionConfig = DEFAULT_DECOMPOSITION_CONFIG,
): boolean {
  if (analysis.score > config.maxComplexityScore) {
    return true;
  }

  if (analysis.level === "complex" || analysis.level === "very_complex") {
    return true;
  }

  if (analysis.estimatedSteps > 5) {
    return true;
  }

  if (analysis.riskLevel === "high") {
    return true;
  }

  return false;
}

/**
 * Decomposes a task into subtasks using heuristic analysis.
 *
 * @param task - The task to decompose
 * @param analysis - Complexity analysis of the task
 * @returns Task decomposition with subtasks and dependencies
 *
 * @example
 * ```typescript
 * const decomposition = decomposeTask(task, analysis);
 * for (const subtask of decomposition.subtasks) {
 *   console.log(`${subtask.order}. ${subtask.title}`);
 * }
 * ```
 */
export function decomposeTask(
  task: TaskDescription,
  analysis: ComplexityAnalysis,
): TaskDecomposition {
  const subtasks: SubTask[] = [];
  const operations = detectOperationTypes(task.description);
  const fileCount = estimateFileCount(task.description);

  let order = 0;

  if (analysis.riskLevel !== "low" || fileCount > 1) {
    subtasks.push(
      createSubtask(task.id, ++order, "Analyze and understand requirements", {
        description: `Review the task requirements and identify affected components. Task: ${task.title}`,
        estimatedMinutes: 5,
      }),
    );
  }

  if (operations.includes("create") || operations.includes("modify")) {
    subtasks.push(
      createSubtask(task.id, ++order, "Create backup/checkpoint", {
        description:
          "Create a checkpoint of current state before making changes",
        estimatedMinutes: 2,
        dependencies: subtasks.length > 0 ? [subtasks[0].id] : [],
      }),
    );
  }

  const mainTaskSubtasks = generateMainTaskSubtasks(
    task,
    operations,
    fileCount,
    order,
  );
  for (const subtask of mainTaskSubtasks) {
    subtask.order = ++order;
    if (subtasks.length > 0) {
      subtask.dependencies = [subtasks[subtasks.length - 1].id];
    }
    subtasks.push(subtask);
  }

  if (operations.includes("test") || analysis.riskLevel !== "low") {
    subtasks.push(
      createSubtask(task.id, ++order, "Verify and test changes", {
        description: "Run tests and verify that changes work as expected",
        estimatedMinutes: 10,
        dependencies:
          subtasks.length > 0 ? [subtasks[subtasks.length - 1].id] : [],
      }),
    );
  }

  subtasks.push(
    createSubtask(task.id, ++order, "Review and finalize", {
      description: "Review all changes and ensure task completion",
      estimatedMinutes: 5,
      dependencies:
        subtasks.length > 0 ? [subtasks[subtasks.length - 1].id] : [],
    }),
  );

  const dependencies = identifyDependencies(subtasks);
  const estimatedTotalEffort = estimateTotalEffort({
    originalTask: task,
    subtasks,
    dependencies,
    estimatedTotalEffort: { steps: 0, durationMinutes: 0, confidence: 0 },
    decompositionStrategy: "heuristic",
    confidence: 0,
  });

  const confidence = calculateDecompositionConfidence(analysis, subtasks);

  return {
    originalTask: task,
    subtasks,
    dependencies,
    estimatedTotalEffort,
    decompositionStrategy: "heuristic",
    confidence,
  };
}

/**
 * Creates a subtask with default values.
 */
function createSubtask(
  parentId: string,
  order: number,
  title: string,
  options: {
    description?: string;
    estimatedMinutes?: number;
    dependencies?: string[];
  } = {},
): SubTask {
  return {
    id: generateSubtaskId(),
    parentId,
    title,
    description: options.description || title,
    order,
    dependencies: options.dependencies || [],
    estimatedEffort: {
      steps: 1,
      durationMinutes: options.estimatedMinutes || 10,
      confidence: 0.7,
    },
    status: "pending",
  };
}

/**
 * Generates main task subtasks based on operations and scope.
 */
function generateMainTaskSubtasks(
  task: TaskDescription,
  operations: string[],
  fileCount: number,
  _startOrder: number,
): SubTask[] {
  const subtasks: SubTask[] = [];

  if (operations.includes("read") || operations.includes("modify")) {
    subtasks.push(
      createSubtask(task.id, 0, "Locate and examine target files", {
        description: `Find and review the ${fileCount} file(s) that need to be modified`,
        estimatedMinutes: 5,
      }),
    );
  }

  if (operations.includes("create")) {
    subtasks.push(
      createSubtask(task.id, 0, "Create new files/components", {
        description:
          "Create the new files or components required for this task",
        estimatedMinutes: 15,
      }),
    );
  }

  if (operations.includes("modify")) {
    subtasks.push(
      createSubtask(task.id, 0, "Implement required changes", {
        description: `Make the necessary modifications to implement: ${task.title}`,
        estimatedMinutes: 20,
      }),
    );
  }

  if (operations.includes("delete")) {
    subtasks.push(
      createSubtask(task.id, 0, "Remove deprecated code/files", {
        description: "Safely remove files or code that is no longer needed",
        estimatedMinutes: 5,
      }),
    );
  }

  if (operations.includes("configure")) {
    subtasks.push(
      createSubtask(task.id, 0, "Update configuration", {
        description: "Update configuration files and settings as needed",
        estimatedMinutes: 10,
      }),
    );
  }

  if (subtasks.length === 0) {
    subtasks.push(
      createSubtask(task.id, 0, "Execute main task", {
        description: task.description,
        estimatedMinutes: 15,
      }),
    );
  }

  return subtasks;
}

/**
 * Calculates confidence in decomposition quality.
 */
function calculateDecompositionConfidence(
  analysis: ComplexityAnalysis,
  subtasks: SubTask[],
): number {
  let confidence = 0.8;

  const ambiguityFactor = analysis.factors.find((f) => f.name === "ambiguity");
  if (ambiguityFactor && ambiguityFactor.score > 50) {
    confidence -= 0.2;
  }

  if (subtasks.length < 2 || subtasks.length > 8) {
    confidence -= 0.1;
  }

  if (analysis.level === "very_complex") {
    confidence -= 0.1;
  }

  return Math.max(0.3, Math.min(1.0, confidence));
}

/**
 * Generates a prompt for LLM-assisted task decomposition.
 *
 * @param task - The task to decompose
 * @param context - Context for decomposition
 * @returns Prompt string for LLM
 *
 * @example
 * ```typescript
 * const prompt = generateDecompositionPrompt(task, {
 *   availableTools: ['read_file', 'write_file', 'execute_command']
 * });
 * const response = await llm.invoke(prompt);
 * ```
 */
export function generateDecompositionPrompt(
  task: TaskDescription,
  context: DecompositionContext,
): string {
  const toolList = context.availableTools.join(", ");
  const constraintList = context.constraints?.join("\n- ") || "None specified";
  const previousAttemptsList = context.previousAttempts?.join("\n- ") || "None";

  return `You are a task decomposition expert. Break down the following task into clear, actionable subtasks.

## Task Information
**Title:** ${task.title}
**Description:** ${task.description}
${task.context ? `**Context:** ${task.context}` : ""}
${task.expectedOutput ? `**Expected Output:** ${task.expectedOutput}` : ""}

## Constraints
- ${constraintList}

## Available Tools
${toolList}

## Previous Attempts (if any)
- ${previousAttemptsList}

## Instructions
1. Analyze the task and identify logical steps
2. Create 3-7 subtasks that together accomplish the main task
3. Each subtask should be independently executable
4. Identify dependencies between subtasks
5. Estimate effort for each subtask

## Output Format
Provide your response in the following JSON format:
\`\`\`json
{
  "subtasks": [
    {
      "title": "Subtask title",
      "description": "Detailed description of what to do",
      "dependencies": ["id of dependent subtask if any"],
      "estimatedMinutes": 10
    }
  ],
  "reasoning": "Brief explanation of your decomposition strategy"
}
\`\`\`

Ensure subtasks are ordered logically and dependencies are correctly identified.`;
}

/**
 * Parses an LLM response into structured subtasks.
 *
 * @param response - LLM response string
 * @param originalTask - The original task being decomposed
 * @returns Array of parsed subtasks
 *
 * @example
 * ```typescript
 * const subtasks = parseDecompositionResponse(llmResponse, task);
 * ```
 */
export function parseDecompositionResponse(
  response: string,
  originalTask: TaskDescription,
): SubTask[] {
  const subtasks: SubTask[] = [];

  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) {
    const directJsonMatch = response.match(/\{[\s\S]*"subtasks"[\s\S]*\}/);
    if (!directJsonMatch) {
      return subtasks;
    }
    response = directJsonMatch[0];
  } else {
    response = jsonMatch[1];
  }

  try {
    const parsed = JSON.parse(response) as {
      subtasks?: Array<{
        title?: string;
        description?: string;
        dependencies?: string[];
        estimatedMinutes?: number;
      }>;
    };

    if (!parsed.subtasks || !Array.isArray(parsed.subtasks)) {
      return subtasks;
    }

    const idMap = new Map<number, string>();

    for (let i = 0; i < parsed.subtasks.length; i++) {
      const rawSubtask = parsed.subtasks[i];
      const id = generateSubtaskId();
      idMap.set(i, id);

      subtasks.push({
        id,
        parentId: originalTask.id,
        title: rawSubtask.title || `Subtask ${i + 1}`,
        description: rawSubtask.description || rawSubtask.title || "",
        order: i + 1,
        dependencies: [],
        estimatedEffort: {
          steps: 1,
          durationMinutes: rawSubtask.estimatedMinutes || 10,
          confidence: 0.6,
        },
        status: "pending",
      });
    }

    for (let i = 0; i < parsed.subtasks.length; i++) {
      const rawSubtask = parsed.subtasks[i];
      if (rawSubtask.dependencies && Array.isArray(rawSubtask.dependencies)) {
        for (const dep of rawSubtask.dependencies) {
          const depIndex = parseInt(dep, 10);
          if (!isNaN(depIndex) && idMap.has(depIndex)) {
            subtasks[i].dependencies.push(idMap.get(depIndex)!);
          } else if (typeof dep === "string") {
            const matchingSubtask = subtasks.find(
              (s) =>
                s.title.toLowerCase().includes(dep.toLowerCase()) ||
                dep.toLowerCase().includes(s.title.toLowerCase()),
            );
            if (matchingSubtask) {
              subtasks[i].dependencies.push(matchingSubtask.id);
            }
          }
        }
      }
    }
  } catch {
    return subtasks;
  }

  return subtasks;
}

/**
 * Validates a task decomposition for correctness and completeness.
 *
 * @param decomposition - The decomposition to validate
 * @param originalTask - The original task
 * @returns Validation result with errors, warnings, and suggestions
 *
 * @example
 * ```typescript
 * const validation = validateDecomposition(decomposition, task);
 * if (!validation.valid) {
 *   console.error('Validation errors:', validation.errors);
 * }
 * ```
 */
export function validateDecomposition(
  decomposition: TaskDecomposition,
  originalTask: TaskDescription,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  if (decomposition.subtasks.length === 0) {
    errors.push("Decomposition has no subtasks");
  }

  if (decomposition.subtasks.length === 1) {
    warnings.push("Decomposition has only one subtask - may not be useful");
  }

  if (decomposition.subtasks.length > 10) {
    warnings.push(
      "Decomposition has many subtasks - consider grouping related tasks",
    );
  }

  const subtaskIds = new Set(decomposition.subtasks.map((s) => s.id));
  for (const subtask of decomposition.subtasks) {
    if (subtask.parentId !== originalTask.id) {
      errors.push(`Subtask ${subtask.id} has incorrect parent ID`);
    }

    for (const depId of subtask.dependencies) {
      if (!subtaskIds.has(depId)) {
        errors.push(
          `Subtask ${subtask.id} depends on non-existent subtask ${depId}`,
        );
      }
    }

    if (!subtask.title || subtask.title.trim().length === 0) {
      errors.push(`Subtask ${subtask.id} has empty title`);
    }

    if (!subtask.description || subtask.description.trim().length === 0) {
      warnings.push(`Subtask ${subtask.id} has empty description`);
    }
  }

  if (decomposition.dependencies.hasCycles) {
    errors.push(
      "Dependency graph contains cycles - cannot determine execution order",
    );
  }

  const orders = decomposition.subtasks.map((s) => s.order);
  const uniqueOrders = new Set(orders);
  if (uniqueOrders.size !== orders.length) {
    warnings.push("Some subtasks have duplicate order values");
  }

  if (decomposition.confidence < 0.5) {
    suggestions.push(
      "Low confidence decomposition - consider manual review or LLM-assisted refinement",
    );
  }

  const totalMinutes = decomposition.subtasks.reduce(
    (sum, s) => sum + s.estimatedEffort.durationMinutes,
    0,
  );
  if (totalMinutes > 120) {
    suggestions.push(
      "Total estimated time exceeds 2 hours - consider further decomposition",
    );
  }

  const hasVerificationStep = decomposition.subtasks.some(
    (s) =>
      s.title.toLowerCase().includes("test") ||
      s.title.toLowerCase().includes("verify") ||
      s.title.toLowerCase().includes("review"),
  );
  if (!hasVerificationStep) {
    suggestions.push("Consider adding a verification or testing subtask");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  };
}

/**
 * Tracks progress of subtasks and generates a progress report.
 *
 * @param decomposition - The task decomposition
 * @param completedSubtasks - IDs of completed subtasks
 * @returns Progress report with statistics and next steps
 *
 * @example
 * ```typescript
 * const progress = trackSubtaskProgress(decomposition, ['sub_1', 'sub_2']);
 * console.log(`Progress: ${progress.percentComplete}%`);
 * ```
 */
export function trackSubtaskProgress(
  decomposition: TaskDecomposition,
  completedSubtasks: string[],
): ProgressReport {
  const completedSet = new Set(completedSubtasks);
  const total = decomposition.subtasks.length;

  let completed = 0;
  let inProgress = 0;
  let blocked = 0;

  const updatedSubtasks = decomposition.subtasks.map((subtask) => {
    if (completedSet.has(subtask.id)) {
      completed++;
      return { ...subtask, status: "completed" as const };
    }

    const hasUnmetDependencies = subtask.dependencies.some(
      (depId) => !completedSet.has(depId),
    );

    if (hasUnmetDependencies) {
      blocked++;
      return { ...subtask, status: "blocked" as const };
    }

    return subtask;
  });

  inProgress = total - completed - blocked;

  const nextSubtasks = updatedSubtasks
    .filter(
      (s) =>
        s.status === "pending" &&
        s.dependencies.every((depId) => completedSet.has(depId)),
    )
    .sort((a, b) => a.order - b.order)
    .slice(0, 3)
    .map((s) => s.id);

  const remainingSubtasks = updatedSubtasks.filter(
    (s) => s.status !== "completed",
  );
  const estimatedRemainingMinutes = remainingSubtasks.reduce(
    (sum, s) => sum + s.estimatedEffort.durationMinutes,
    0,
  );

  const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    totalSubtasks: total,
    completedSubtasks: completed,
    inProgressSubtasks: inProgress,
    blockedSubtasks: blocked,
    percentComplete,
    estimatedRemainingMinutes,
    nextSubtasks,
  };
}

/**
 * Merges results from multiple subtasks into a final result.
 *
 * @param subtaskResults - Array of subtask results
 * @returns Merged result combining all subtask outputs
 *
 * @example
 * ```typescript
 * const merged = mergeSubtaskResults(results);
 * if (merged.success) {
 *   console.log('All subtasks completed successfully');
 * }
 * ```
 */
export function mergeSubtaskResults(
  subtaskResults: SubTaskResult[],
): MergedResult {
  const outputs: string[] = [];
  const errors: string[] = [];
  const artifacts: string[] = [];
  let totalDurationMs = 0;
  let allSuccess = true;

  for (const result of subtaskResults) {
    totalDurationMs += result.durationMs;

    if (result.success) {
      if (result.output) {
        outputs.push(result.output);
      }
      if (result.artifacts) {
        artifacts.push(...result.artifacts);
      }
    } else {
      allSuccess = false;
      if (result.error) {
        errors.push(`[${result.subtaskId}] ${result.error}`);
      }
    }
  }

  const successCount = subtaskResults.filter((r) => r.success).length;
  const totalCount = subtaskResults.length;

  let summary: string;
  if (allSuccess) {
    summary = `All ${totalCount} subtasks completed successfully`;
  } else if (successCount === 0) {
    summary = `All ${totalCount} subtasks failed`;
  } else {
    summary = `${successCount}/${totalCount} subtasks completed successfully`;
  }

  return {
    success: allSuccess,
    summary,
    outputs,
    errors,
    totalDurationMs,
    artifacts: [...new Set(artifacts)],
  };
}

/**
 * Estimates total effort for a task decomposition.
 *
 * @param decomposition - The task decomposition
 * @returns Effort estimate with breakdown
 *
 * @example
 * ```typescript
 * const effort = estimateTotalEffort(decomposition);
 * console.log(`Estimated time: ${effort.durationMinutes} minutes`);
 * ```
 */
export function estimateTotalEffort(
  decomposition: TaskDecomposition,
): EffortEstimate {
  const breakdown: Record<string, number> = {};
  let totalSteps = 0;
  let totalMinutes = 0;
  let totalConfidence = 0;

  for (const subtask of decomposition.subtasks) {
    totalSteps += subtask.estimatedEffort.steps;
    totalMinutes += subtask.estimatedEffort.durationMinutes;
    totalConfidence += subtask.estimatedEffort.confidence;
    breakdown[subtask.title] = subtask.estimatedEffort.durationMinutes;
  }

  const avgConfidence =
    decomposition.subtasks.length > 0
      ? totalConfidence / decomposition.subtasks.length
      : 0.5;

  const overheadFactor = 1.2;
  const adjustedMinutes = Math.ceil(totalMinutes * overheadFactor);

  return {
    steps: totalSteps,
    durationMinutes: adjustedMinutes,
    confidence: avgConfidence * decomposition.confidence,
    breakdown,
  };
}

/**
 * Identifies dependencies between subtasks.
 *
 * @param subtasks - Array of subtasks
 * @returns Dependency graph with execution order
 *
 * @example
 * ```typescript
 * const deps = identifyDependencies(subtasks);
 * console.log('Execution order:', deps.executionOrder);
 * ```
 */
export function identifyDependencies(subtasks: SubTask[]): DependencyGraph {
  const nodes = subtasks.map((s) => s.id);
  const edges: DependencyEdge[] = [];

  for (const subtask of subtasks) {
    for (const depId of subtask.dependencies) {
      edges.push({
        from: depId,
        to: subtask.id,
        type: "requires",
      });
    }
  }

  for (let i = 0; i < subtasks.length - 1; i++) {
    const current = subtasks[i];
    const next = subtasks[i + 1];

    if (!next.dependencies.includes(current.id)) {
      const hasExplicitDep = next.dependencies.length > 0;
      if (!hasExplicitDep) {
        edges.push({
          from: current.id,
          to: next.id,
          type: "suggests",
        });
      }
    }
  }

  const hasCycles = detectCycles(nodes, edges);
  const executionOrder = hasCycles ? [] : topologicalSort(nodes, edges);

  return {
    nodes,
    edges,
    hasCycles,
    executionOrder: executionOrder.length > 0 ? executionOrder : nodes,
  };
}

// ============================================================================
// Additional Utility Functions
// ============================================================================

/**
 * Creates a task description from minimal input.
 *
 * @param title - Task title
 * @param description - Task description
 * @returns Complete TaskDescription object
 */
export function createTaskDescription(
  title: string,
  description: string,
): TaskDescription {
  return {
    id: `task_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`,
    title,
    description,
  };
}

/**
 * Gets the default decomposition configuration.
 *
 * @returns Default DecompositionConfig
 */
export function getDefaultDecompositionConfig(): DecompositionConfig {
  return { ...DEFAULT_DECOMPOSITION_CONFIG };
}

/**
 * Updates subtask status in a decomposition.
 *
 * @param decomposition - The decomposition to update
 * @param subtaskId - ID of the subtask to update
 * @param status - New status
 * @param result - Optional result if completed
 * @returns Updated decomposition
 */
export function updateSubtaskStatus(
  decomposition: TaskDecomposition,
  subtaskId: string,
  status: SubTask["status"],
  result?: SubTaskResult,
): TaskDecomposition {
  const updatedSubtasks = decomposition.subtasks.map((subtask) => {
    if (subtask.id === subtaskId) {
      return {
        ...subtask,
        status,
        result: result || subtask.result,
      };
    }
    return subtask;
  });

  return {
    ...decomposition,
    subtasks: updatedSubtasks,
  };
}

/**
 * Gets subtasks that are ready to execute (no unmet dependencies).
 *
 * @param decomposition - The task decomposition
 * @returns Array of ready subtasks
 */
export function getReadySubtasks(decomposition: TaskDecomposition): SubTask[] {
  const completedIds = new Set(
    decomposition.subtasks
      .filter((s) => s.status === "completed")
      .map((s) => s.id),
  );

  return decomposition.subtasks.filter(
    (subtask) =>
      subtask.status === "pending" &&
      subtask.dependencies.every((depId) => completedIds.has(depId)),
  );
}

/**
 * Checks if all subtasks in a decomposition are complete.
 *
 * @param decomposition - The task decomposition
 * @returns Whether all subtasks are complete
 */
export function isDecompositionComplete(
  decomposition: TaskDecomposition,
): boolean {
  return decomposition.subtasks.every(
    (s) => s.status === "completed" || s.status === "skipped",
  );
}
