/**
 * Proactive Error Prevention Module
 *
 * Provides pre-execution checks, learned pattern matching, and suggestion generation
 * to prevent errors before they occur. This module learns from past errors and
 * validates actions against known constraints.
 */

import { createLogger, LogLevel } from "../logger.js";
import type { ExecutionHistoryEntry } from "../loop-prevention/types.js";

const logger = createLogger(LogLevel.DEBUG, "proactive-prevention");

// ============================================================================
// Types
// ============================================================================

/**
 * Context for pre-execution checks
 */
export interface PreExecutionContext {
  /** History of previous executions */
  executionHistory: ExecutionHistoryEntry[];
  /** Current task description */
  currentTask?: string;
  /** Recent error messages */
  recentErrors?: string[];
  /** Files modified in current session */
  modifiedFiles?: string[];
}

/**
 * Result of pre-execution checks
 */
export interface PreExecutionResult {
  /** Whether the action can proceed */
  canProceed: boolean;
  /** Warnings that don't block execution */
  warnings: PreExecutionWarning[];
  /** Blockers that prevent execution */
  blockers: PreExecutionBlocker[];
  /** Suggestions for improvement */
  suggestions: PreventionSuggestion[];
  /** Overall risk level */
  riskLevel: "low" | "medium" | "high" | "critical";
}

/**
 * Warning from pre-execution check
 */
export interface PreExecutionWarning {
  /** Type of warning */
  type: string;
  /** Warning message */
  message: string;
  /** Severity level */
  severity: "low" | "medium" | "high";
  /** Related pattern ID if applicable */
  relatedPattern?: string;
}

/**
 * Blocker that prevents execution
 */
export interface PreExecutionBlocker {
  /** Type of blocker */
  type: string;
  /** Blocker message */
  message: string;
  /** Reason for blocking */
  reason: string;
  /** Suggested resolution */
  resolution?: string;
}

/**
 * Learned error pattern from past executions
 */
export interface LearnedErrorPattern {
  /** Unique identifier */
  id: string;
  /** Tool name this pattern applies to */
  toolName: string;
  /** Argument patterns that trigger this error */
  argPatterns: ArgPattern[];
  /** Type of error */
  errorType: string;
  /** Error message pattern */
  errorMessage: string;
  /** How often this pattern has occurred */
  frequency: number;
  /** Last time this pattern was seen */
  lastOccurrence: number;
  /** Strategy to prevent this error */
  preventionStrategy: string;
  /** Confidence in this pattern (0-1) */
  confidence: number;
}

/**
 * Pattern for matching tool arguments
 */
export interface ArgPattern {
  /** Field name to match */
  field: string;
  /** Type of pattern matching */
  pattern: "exact" | "contains" | "regex" | "type";
  /** Value to match against */
  value: string | RegExp;
}

/**
 * Context for pattern matching
 */
export interface PatternMatchContext {
  /** Recent execution history */
  recentHistory?: ExecutionHistoryEntry[];
  /** Current state information */
  currentState?: Record<string, unknown>;
}

/**
 * Result of pattern matching
 */
export interface PatternMatchResult {
  /** Matched pattern */
  pattern: LearnedErrorPattern;
  /** Match score (0-1) */
  matchScore: number;
  /** Fields that matched */
  matchedFields: string[];
  /** Predicted error message */
  predictedError: string;
}

/**
 * Suggestion for preventing errors
 */
export interface PreventionSuggestion {
  /** Type of suggestion */
  type: "modify_args" | "use_alternative" | "add_check" | "skip" | "warn";
  /** Suggestion message */
  message: string;
  /** Priority level */
  priority: "low" | "medium" | "high";
  /** Suggested argument modifications */
  modification?: Record<string, unknown>;
  /** Alternative tool to use */
  alternativeTool?: string;
}

/**
 * Result of argument validation
 */
export interface ArgumentValidationResult {
  /** Whether arguments are valid */
  valid: boolean;
  /** Validation errors */
  errors: ArgumentError[];
  /** Validation warnings */
  warnings: ArgumentWarning[];
}

/**
 * Argument validation error
 */
export interface ArgumentError {
  /** Field with error */
  field: string;
  /** Error message */
  message: string;
  /** Expected type */
  expectedType?: string;
  /** Actual value */
  actualValue?: unknown;
}

/**
 * Argument validation warning
 */
export interface ArgumentWarning {
  /** Field with warning */
  field: string;
  /** Warning message */
  message: string;
  /** Suggestion for improvement */
  suggestion?: string;
}

/**
 * Context for prerequisite checking
 */
export interface PrerequisiteContext {
  /** Available files in workspace */
  availableFiles?: string[];
  /** Environment variables */
  environmentVariables?: Record<string, string>;
  /** Previously executed actions */
  previousActions?: string[];
}

/**
 * Result of prerequisite check
 */
export interface PrerequisiteCheckResult {
  /** Whether all prerequisites are met */
  met: boolean;
  /** Missing prerequisites */
  missingPrerequisites: Prerequisite[];
  /** Suggestions for meeting prerequisites */
  suggestions: string[];
}

/**
 * A prerequisite for tool execution
 */
export interface Prerequisite {
  /** Type of prerequisite */
  type: "file" | "environment" | "action" | "state";
  /** Name of the prerequisite */
  name: string;
  /** Description of what's needed */
  description: string;
  /** Whether this is required or optional */
  required: boolean;
}

/**
 * Result of an action execution
 */
export interface ActionResult {
  /** Whether the action succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Error type if failed */
  errorType?: string;
  /** Output from the action */
  output?: string;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Context for learning from actions
 */
export interface LearningContext {
  /** Description of the task */
  taskDescription?: string;
  /** Which attempt this is */
  attemptNumber: number;
  /** Results of previous attempts */
  previousAttempts?: ActionResult[];
}

/**
 * Context for risk assessment
 */
export interface RiskContext {
  /** Files that have been modified */
  modifiedFiles?: string[];
  /** Whether the action is destructive */
  isDestructive?: boolean;
  /** Whether rollback is available */
  hasRollback?: boolean;
}

/**
 * Risk assessment result
 */
export interface RiskAssessment {
  /** Overall risk level */
  level: "low" | "medium" | "high" | "critical";
  /** Numeric risk score (0-100) */
  score: number;
  /** Factors contributing to risk */
  factors: RiskFactor[];
  /** Suggested mitigations */
  mitigations: string[];
}

/**
 * A factor contributing to risk
 */
export interface RiskFactor {
  /** Name of the factor */
  name: string;
  /** Weight of this factor (0-1) */
  weight: number;
  /** Score for this factor (0-100) */
  score: number;
  /** Description of the risk */
  description: string;
}

// ============================================================================
// Error Pattern Registry
// ============================================================================

/** Registry of learned error patterns */
const errorPatternRegistry: Map<string, LearnedErrorPattern> = new Map();

// ============================================================================
// Built-in Validation Rules
// ============================================================================

/** Dangerous shell commands that should be blocked or warned about */
const DANGEROUS_COMMANDS = [
  "rm -rf /",
  "rm -rf /*",
  "rm -rf ~",
  "rm -rf $HOME",
  "mkfs",
  "dd if=/dev/zero",
  ":(){ :|:& };:",
  "> /dev/sda",
  "chmod -R 777 /",
  "chown -R",
];

/** Commands that require extra caution */
const CAUTION_COMMANDS = [
  "rm -rf",
  "rm -r",
  "git push --force",
  "git reset --hard",
  "drop database",
  "drop table",
  "truncate",
  "delete from",
  "sudo",
  "chmod",
  "chown",
];

/** File path patterns that are dangerous to modify */
const DANGEROUS_PATHS = [
  /^\/$/,
  /^\/etc\//,
  /^\/usr\//,
  /^\/bin\//,
  /^\/sbin\//,
  /^\/boot\//,
  /^\/dev\//,
  /^\/proc\//,
  /^\/sys\//,
  /^~\/?$/,
  /^\$HOME\/?$/,
];

/** Tool-specific argument requirements */
const TOOL_REQUIREMENTS: Record<
  string,
  { required: string[]; optional: string[] }
> = {
  shell: { required: ["command"], optional: ["cwd", "timeout"] },
  read_file: { required: ["path"], optional: ["encoding"] },
  write_file: { required: ["path", "content"], optional: ["encoding"] },
  edit_file: {
    required: ["path", "old_string", "new_string"],
    optional: ["expected_replacements"],
  },
  search_files: { required: ["path", "regex"], optional: ["file_pattern"] },
  list_files: { required: ["path"], optional: ["recursive"] },
  apply_patch: { required: ["patch"], optional: ["path"] },
  grep: { required: ["pattern"], optional: ["path", "include", "exclude"] },
};

/** Tool prerequisites */
const TOOL_PREREQUISITES: Record<string, Prerequisite[]> = {
  edit_file: [
    {
      type: "file",
      name: "target_file",
      description: "The file to edit must exist",
      required: true,
    },
  ],
  apply_patch: [
    {
      type: "file",
      name: "target_file",
      description: "The file to patch must exist",
      required: true,
    },
  ],
  read_file: [
    {
      type: "file",
      name: "target_file",
      description: "The file to read must exist",
      required: true,
    },
  ],
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Performs pre-execution checks on a tool call
 * @param toolName - Name of the tool to execute
 * @param toolArgs - Arguments for the tool
 * @param context - Execution context
 * @returns Pre-execution check result
 */
export function performPreExecutionChecks(
  toolName: string,
  toolArgs: Record<string, unknown>,
  context: PreExecutionContext,
): PreExecutionResult {
  logger.debug("Performing pre-execution checks", { toolName, toolArgs });

  const warnings: PreExecutionWarning[] = [];
  const blockers: PreExecutionBlocker[] = [];
  const suggestions: PreventionSuggestion[] = [];

  // Validate tool arguments
  const validationResult = validateToolArguments(toolName, toolArgs);
  if (!validationResult.valid) {
    for (const error of validationResult.errors) {
      blockers.push({
        type: "invalid_argument",
        message: error.message,
        reason: `Field '${error.field}' is invalid`,
        resolution: error.expectedType
          ? `Provide a valid ${error.expectedType}`
          : undefined,
      });
    }
  }
  for (const warning of validationResult.warnings) {
    warnings.push({
      type: "argument_warning",
      message: warning.message,
      severity: "low",
    });
    if (warning.suggestion) {
      suggestions.push({
        type: "modify_args",
        message: warning.suggestion,
        priority: "low",
      });
    }
  }

  // Check prerequisites
  const prereqContext: PrerequisiteContext = {
    availableFiles: context.modifiedFiles,
    previousActions: context.executionHistory.map((e) => e.toolName),
  };
  const prereqResult = checkPrerequisites(toolName, prereqContext);
  if (!prereqResult.met) {
    for (const prereq of prereqResult.missingPrerequisites) {
      if (prereq.required) {
        blockers.push({
          type: "missing_prerequisite",
          message: `Missing required prerequisite: ${prereq.name}`,
          reason: prereq.description,
          resolution: prereqResult.suggestions[0],
        });
      } else {
        warnings.push({
          type: "missing_optional_prerequisite",
          message: `Missing optional prerequisite: ${prereq.name}`,
          severity: "low",
        });
      }
    }
  }

  // Match against learned error patterns
  const matchContext: PatternMatchContext = {
    recentHistory: context.executionHistory.slice(-10),
  };
  const matchedPatterns = matchErrorPatterns(toolName, toolArgs, matchContext);
  for (const match of matchedPatterns) {
    if (match.matchScore >= 0.8) {
      warnings.push({
        type: "pattern_match",
        message: `This action matches a known error pattern: ${match.predictedError}`,
        severity: match.matchScore >= 0.95 ? "high" : "medium",
        relatedPattern: match.pattern.id,
      });
      suggestions.push({
        type: "warn",
        message: match.pattern.preventionStrategy,
        priority: "high",
      });
    }
  }

  // Generate prevention suggestions
  const patternSuggestions = generatePreventionSuggestions(
    toolName,
    toolArgs,
    matchedPatterns,
  );
  suggestions.push(...patternSuggestions);

  // Assess risk
  const riskContext: RiskContext = {
    modifiedFiles: context.modifiedFiles,
    isDestructive: isDestructiveAction(toolName, toolArgs),
    hasRollback: false,
  };
  const riskAssessment = assessActionRisk(toolName, toolArgs, riskContext);

  // Add risk-based warnings
  if (riskAssessment.level === "high" || riskAssessment.level === "critical") {
    for (const factor of riskAssessment.factors) {
      if (factor.score >= 70) {
        warnings.push({
          type: "high_risk",
          message: factor.description,
          severity: riskAssessment.level === "critical" ? "high" : "medium",
        });
      }
    }
    for (const mitigation of riskAssessment.mitigations) {
      suggestions.push({
        type: "add_check",
        message: mitigation,
        priority: "high",
      });
    }
  }

  // Check for recent similar errors
  const recentSimilarErrors = findRecentSimilarErrors(
    toolName,
    toolArgs,
    context,
  );
  if (recentSimilarErrors.length > 0) {
    warnings.push({
      type: "recent_similar_error",
      message: `Similar action failed recently: ${recentSimilarErrors[0]}`,
      severity: "medium",
    });
    suggestions.push({
      type: "use_alternative",
      message:
        "Consider a different approach since similar actions have failed",
      priority: "medium",
    });
  }

  const canProceed = blockers.length === 0;

  logger.debug("Pre-execution checks complete", {
    canProceed,
    warningCount: warnings.length,
    blockerCount: blockers.length,
    riskLevel: riskAssessment.level,
  });

  return {
    canProceed,
    warnings,
    blockers,
    suggestions,
    riskLevel: riskAssessment.level,
  };
}

/**
 * Registers a learned error pattern
 * @param pattern - The error pattern to register
 */
export function registerErrorPattern(pattern: LearnedErrorPattern): void {
  logger.debug("Registering error pattern", {
    id: pattern.id,
    toolName: pattern.toolName,
  });

  const existing = errorPatternRegistry.get(pattern.id);
  if (existing) {
    // Update existing pattern
    existing.frequency += 1;
    existing.lastOccurrence = pattern.lastOccurrence;
    existing.confidence = Math.min(
      1,
      existing.confidence + 0.1 * (1 - existing.confidence),
    );
    errorPatternRegistry.set(pattern.id, existing);
  } else {
    errorPatternRegistry.set(pattern.id, pattern);
  }
}

/**
 * Matches current action against known error patterns
 * @param toolName - Name of the tool
 * @param toolArgs - Tool arguments
 * @param context - Pattern match context
 * @returns Array of matched patterns with scores
 */
export function matchErrorPatterns(
  toolName: string,
  toolArgs: Record<string, unknown>,
  context: PatternMatchContext,
): PatternMatchResult[] {
  const results: PatternMatchResult[] = [];

  for (const pattern of errorPatternRegistry.values()) {
    if (pattern.toolName !== toolName) {
      continue;
    }

    const matchResult = matchPattern(pattern, toolArgs, context);
    if (matchResult.matchScore > 0.5) {
      results.push(matchResult);
    }
  }

  // Sort by match score descending
  results.sort((a, b) => b.matchScore - a.matchScore);

  return results;
}

/**
 * Generates suggestions for avoiding errors
 * @param toolName - Name of the tool
 * @param toolArgs - Tool arguments
 * @param matchedPatterns - Patterns that matched
 * @returns Array of prevention suggestions
 */
export function generatePreventionSuggestions(
  toolName: string,
  toolArgs: Record<string, unknown>,
  matchedPatterns: PatternMatchResult[],
): PreventionSuggestion[] {
  const suggestions: PreventionSuggestion[] = [];

  // Add suggestions based on matched patterns
  for (const match of matchedPatterns) {
    if (match.matchScore >= 0.7) {
      suggestions.push({
        type: "warn",
        message: match.pattern.preventionStrategy,
        priority: match.matchScore >= 0.9 ? "high" : "medium",
      });
    }
  }

  // Add tool-specific suggestions
  const toolSuggestions = getToolSpecificSuggestions(toolName, toolArgs);
  suggestions.push(...toolSuggestions);

  // Deduplicate suggestions
  const seen = new Set<string>();
  return suggestions.filter((s) => {
    const key = `${s.type}:${s.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Validates tool arguments against known constraints
 * @param toolName - Name of the tool
 * @param toolArgs - Tool arguments
 * @returns Validation result
 */
export function validateToolArguments(
  toolName: string,
  toolArgs: Record<string, unknown>,
): ArgumentValidationResult {
  const errors: ArgumentError[] = [];
  const warnings: ArgumentWarning[] = [];

  // Check required arguments
  const requirements = TOOL_REQUIREMENTS[toolName];
  if (requirements) {
    for (const required of requirements.required) {
      if (!(required in toolArgs) || toolArgs[required] === undefined) {
        errors.push({
          field: required,
          message: `Required argument '${required}' is missing`,
          expectedType: "string",
          actualValue: undefined,
        });
      }
    }
  }

  // Tool-specific validation
  switch (toolName) {
    case "shell":
      validateShellCommand(toolArgs, errors, warnings);
      break;
    case "read_file":
    case "write_file":
    case "edit_file":
      validateFilePath(toolArgs, errors, warnings);
      break;
    case "search_files":
      validateSearchPattern(toolArgs, errors, warnings);
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Checks if prerequisites for a tool are met
 * @param toolName - Name of the tool
 * @param context - Prerequisite context
 * @returns Prerequisite check result
 */
export function checkPrerequisites(
  toolName: string,
  context: PrerequisiteContext,
): PrerequisiteCheckResult {
  const prerequisites = TOOL_PREREQUISITES[toolName] || [];
  const missingPrerequisites: Prerequisite[] = [];
  const suggestions: string[] = [];

  for (const prereq of prerequisites) {
    let met = false;

    switch (prereq.type) {
      case "file":
        // Check if file exists in available files
        // If availableFiles is not provided, we are optimistic
        if (!context.availableFiles) {
          met = true;
        } else {
          met = context.availableFiles.some((f) =>
            f.includes(prereq.name.replace("target_file", "")),
          );
        }
        if (!met) {
          suggestions.push(`Ensure the target file exists before this action`);
        }
        break;
      case "environment":
        met = prereq.name in (context.environmentVariables || {});
        if (!met) {
          suggestions.push(`Set environment variable: ${prereq.name}`);
        }
        break;
      case "action":
        met = context.previousActions?.includes(prereq.name) ?? false;
        if (!met) {
          suggestions.push(`Execute '${prereq.name}' first`);
        }
        break;
      case "state":
        // State prerequisites require external validation
        met = true;
        break;
    }

    if (!met) {
      missingPrerequisites.push(prereq);
    }
  }

  return {
    met: missingPrerequisites.filter((p) => p.required).length === 0,
    missingPrerequisites,
    suggestions,
  };
}

/**
 * Learns from a completed action (success or failure)
 * @param toolName - Name of the tool
 * @param toolArgs - Tool arguments
 * @param result - Result of the action
 * @param context - Learning context
 */
export function learnFromAction(
  toolName: string,
  toolArgs: Record<string, unknown>,
  result: ActionResult,
  context: LearningContext,
): void {
  if (!result.success && result.error) {
    // Create a pattern from the error
    const patternId = generatePatternId(
      toolName,
      result.errorType || "unknown",
    );
    const argPatterns = extractArgPatterns(toolArgs);

    const pattern: LearnedErrorPattern = {
      id: patternId,
      toolName,
      argPatterns,
      errorType: result.errorType || "unknown",
      errorMessage: result.error,
      frequency: 1,
      lastOccurrence: Date.now(),
      preventionStrategy: generatePreventionStrategy(
        toolName,
        result.errorType,
        result.error,
      ),
      confidence: calculateInitialConfidence(context),
    };

    registerErrorPattern(pattern);

    logger.debug("Learned from failed action", {
      patternId,
      toolName,
      errorType: result.errorType,
    });
  }
}

/**
 * Gets risk assessment for an action
 * @param toolName - Name of the tool
 * @param toolArgs - Tool arguments
 * @param context - Risk context
 * @returns Risk assessment
 */
export function assessActionRisk(
  toolName: string,
  toolArgs: Record<string, unknown>,
  context: RiskContext,
): RiskAssessment {
  const factors: RiskFactor[] = [];
  let totalScore = 0;
  let totalWeight = 0;

  // Factor 1: Destructive action
  const destructiveFactor = assessDestructiveFactor(toolName, toolArgs);
  factors.push(destructiveFactor);
  totalScore += destructiveFactor.score * destructiveFactor.weight;
  totalWeight += destructiveFactor.weight;

  // Factor 2: File modification scope
  const scopeFactor = assessScopeFactor(toolName, toolArgs, context);
  factors.push(scopeFactor);
  totalScore += scopeFactor.score * scopeFactor.weight;
  totalWeight += scopeFactor.weight;

  // Factor 3: Rollback availability
  const rollbackFactor = assessRollbackFactor(context);
  factors.push(rollbackFactor);
  totalScore += rollbackFactor.score * rollbackFactor.weight;
  totalWeight += rollbackFactor.weight;

  // Factor 4: Historical error rate
  const historyFactor = assessHistoryFactor(toolName);
  factors.push(historyFactor);
  totalScore += historyFactor.score * historyFactor.weight;
  totalWeight += historyFactor.weight;

  const score = totalWeight > 0 ? totalScore / totalWeight : 0;
  const level = scoreToRiskLevel(score);
  const mitigations = generateMitigations(factors, level);

  return {
    level,
    score,
    factors,
    mitigations,
  };
}

/**
 * Gets all registered error patterns
 * @returns Array of all error patterns
 */
export function getErrorPatterns(): LearnedErrorPattern[] {
  return Array.from(errorPatternRegistry.values());
}

/**
 * Clears learned patterns (for testing)
 */
export function clearErrorPatterns(): void {
  errorPatternRegistry.clear();
  logger.debug("Cleared all error patterns");
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Matches a single pattern against tool arguments
 */
function matchPattern(
  pattern: LearnedErrorPattern,
  toolArgs: Record<string, unknown>,
  _context: PatternMatchContext,
): PatternMatchResult {
  const matchedFields: string[] = [];
  let totalScore = 0;

  for (const argPattern of pattern.argPatterns) {
    const value = toolArgs[argPattern.field];
    if (value === undefined) {
      continue;
    }

    const matches = matchArgPattern(argPattern, value);
    if (matches) {
      matchedFields.push(argPattern.field);
      totalScore += 1;
    }
  }

  const matchScore =
    pattern.argPatterns.length > 0
      ? (totalScore / pattern.argPatterns.length) * pattern.confidence
      : 0;

  return {
    pattern,
    matchScore,
    matchedFields,
    predictedError: pattern.errorMessage,
  };
}

/**
 * Matches a single argument pattern
 */
function matchArgPattern(pattern: ArgPattern, value: unknown): boolean {
  const stringValue = String(value);

  switch (pattern.pattern) {
    case "exact":
      return stringValue === String(pattern.value);
    case "contains":
      return stringValue.includes(String(pattern.value));
    case "regex":
      if (pattern.value instanceof RegExp) {
        return pattern.value.test(stringValue);
      }
      return new RegExp(String(pattern.value)).test(stringValue);
    case "type":
      return typeof value === String(pattern.value);
    default:
      return false;
  }
}

/**
 * Validates shell command arguments
 */
function validateShellCommand(
  toolArgs: Record<string, unknown>,
  errors: ArgumentError[],
  warnings: ArgumentWarning[],
): void {
  const command = String(toolArgs.command || "");

  // Check for dangerous commands
  for (const dangerous of DANGEROUS_COMMANDS) {
    if (command.includes(dangerous)) {
      errors.push({
        field: "command",
        message: `Dangerous command detected: ${dangerous}`,
        actualValue: command,
      });
      return;
    }
  }

  // Check for caution commands
  for (const caution of CAUTION_COMMANDS) {
    if (command.includes(caution)) {
      warnings.push({
        field: "command",
        message: `Command requires caution: ${caution}`,
        suggestion: "Verify the command is safe before execution",
      });
    }
  }

  // Check for empty command
  if (!command.trim()) {
    errors.push({
      field: "command",
      message: "Command cannot be empty",
      expectedType: "non-empty string",
      actualValue: command,
    });
  }
}

/**
 * Validates file path arguments
 */
function validateFilePath(
  toolArgs: Record<string, unknown>,
  errors: ArgumentError[],
  warnings: ArgumentWarning[],
): void {
  const path = String(toolArgs.path || "");

  // Check for dangerous paths
  for (const dangerousPattern of DANGEROUS_PATHS) {
    if (dangerousPattern.test(path)) {
      errors.push({
        field: "path",
        message: `Dangerous path detected: ${path}`,
        actualValue: path,
      });
      return;
    }
  }

  // Check for empty path
  if (!path.trim()) {
    errors.push({
      field: "path",
      message: "Path cannot be empty",
      expectedType: "non-empty string",
      actualValue: path,
    });
  }

  // Check for absolute paths outside workspace
  if (path.startsWith("/") && !path.startsWith("/workspace")) {
    warnings.push({
      field: "path",
      message: "Absolute path detected - ensure this is intentional",
      suggestion: "Consider using relative paths",
    });
  }
}

/**
 * Validates search pattern arguments
 */
function validateSearchPattern(
  toolArgs: Record<string, unknown>,
  errors: ArgumentError[],
  warnings: ArgumentWarning[],
): void {
  const regex = String(toolArgs.regex || "");

  // Check for empty pattern
  if (!regex.trim()) {
    errors.push({
      field: "regex",
      message: "Search pattern cannot be empty",
      expectedType: "non-empty string",
      actualValue: regex,
    });
    return;
  }

  // Check for overly broad patterns
  if (regex === ".*" || regex === ".+" || regex === ".") {
    warnings.push({
      field: "regex",
      message: "Very broad search pattern may return too many results",
      suggestion: "Consider a more specific pattern",
    });
  }

  // Validate regex syntax
  try {
    new RegExp(regex);
  } catch {
    errors.push({
      field: "regex",
      message: "Invalid regular expression syntax",
      actualValue: regex,
    });
  }
}

/**
 * Gets tool-specific suggestions
 */
function getToolSpecificSuggestions(
  toolName: string,
  toolArgs: Record<string, unknown>,
): PreventionSuggestion[] {
  const suggestions: PreventionSuggestion[] = [];

  switch (toolName) {
    case "shell":
      if (String(toolArgs.command || "").includes("rm")) {
        suggestions.push({
          type: "add_check",
          message: "Consider using --dry-run or -i flag for rm commands",
          priority: "medium",
        });
      }
      break;
    case "write_file":
      suggestions.push({
        type: "add_check",
        message: "Consider reading the file first to verify content",
        priority: "low",
      });
      break;
    case "edit_file":
      suggestions.push({
        type: "add_check",
        message: "Verify the old_string matches exactly before editing",
        priority: "medium",
      });
      break;
  }

  return suggestions;
}

/**
 * Checks if an action is destructive
 */
function isDestructiveAction(
  toolName: string,
  toolArgs: Record<string, unknown>,
): boolean {
  if (toolName === "shell") {
    const command = String(toolArgs.command || "");
    return CAUTION_COMMANDS.some((c) => command.includes(c));
  }
  if (toolName === "write_file" || toolName === "edit_file") {
    return true;
  }
  return false;
}

/**
 * Finds recent similar errors in context
 */
function findRecentSimilarErrors(
  toolName: string,
  _toolArgs: Record<string, unknown>,
  context: PreExecutionContext,
): string[] {
  const recentErrors: string[] = [];

  // Check execution history for recent errors with same tool
  const recentHistory = context.executionHistory.slice(-10);
  for (const entry of recentHistory) {
    if (entry.toolName === toolName && entry.result === "error") {
      recentErrors.push(entry.errorMessage || "Unknown error");
    }
  }

  return recentErrors;
}

/**
 * Generates a pattern ID from tool name and error type
 */
function generatePatternId(toolName: string, errorType: string): string {
  return `${toolName}:${errorType}:${Date.now()}`;
}

/**
 * Extracts argument patterns from tool arguments
 */
function extractArgPatterns(toolArgs: Record<string, unknown>): ArgPattern[] {
  const patterns: ArgPattern[] = [];

  for (const [field, value] of Object.entries(toolArgs)) {
    if (typeof value === "string" && value.length < 100) {
      patterns.push({
        field,
        pattern: "contains",
        value: value.slice(0, 50),
      });
    } else if (typeof value === "number" || typeof value === "boolean") {
      patterns.push({
        field,
        pattern: "exact",
        value: String(value),
      });
    }
  }

  return patterns;
}

/**
 * Generates a prevention strategy based on error type
 */
function generatePreventionStrategy(
  toolName: string,
  errorType: string | undefined,
  errorMessage: string,
): string {
  if (errorType === "file_not_found" || errorMessage.includes("not found")) {
    return "Verify the file exists before attempting this operation";
  }
  if (
    errorType === "permission_denied" ||
    errorMessage.includes("permission")
  ) {
    return "Check file permissions before attempting this operation";
  }
  if (errorType === "syntax_error" || errorMessage.includes("syntax")) {
    return "Validate syntax before applying changes";
  }
  if (errorMessage.includes("timeout")) {
    return "Consider breaking this operation into smaller steps";
  }
  return `Review the ${toolName} arguments carefully before retrying`;
}

/**
 * Calculates initial confidence for a new pattern
 */
function calculateInitialConfidence(context: LearningContext): number {
  // Higher confidence if this is a repeated error
  if (context.attemptNumber > 1) {
    return Math.min(0.5 + context.attemptNumber * 0.1, 0.8);
  }
  return 0.5;
}

/**
 * Assesses the destructive factor of an action
 */
function assessDestructiveFactor(
  toolName: string,
  toolArgs: Record<string, unknown>,
): RiskFactor {
  let score = 0;

  if (toolName === "shell") {
    const command = String(toolArgs.command || "");
    if (DANGEROUS_COMMANDS.some((c) => command.includes(c))) {
      score = 100;
    } else if (CAUTION_COMMANDS.some((c) => command.includes(c))) {
      score = 80;
    }
  } else if (toolName === "write_file") {
    score = 60;
  } else if (toolName === "edit_file") {
    score = 50;
  }

  return {
    name: "destructive_potential",
    weight: 0.4,
    score,
    description:
      score > 70
        ? "This action has high destructive potential"
        : score > 30
          ? "This action modifies files"
          : "This action is read-only or low-risk",
  };
}

/**
 * Assesses the scope factor of an action
 */
function assessScopeFactor(
  toolName: string,
  toolArgs: Record<string, unknown>,
  context: RiskContext,
): RiskFactor {
  let score = 0;

  // Check if modifying many files
  const modifiedCount = context.modifiedFiles?.length || 0;
  if (modifiedCount > 10) {
    score += 30;
  } else if (modifiedCount > 5) {
    score += 15;
  }

  // Check for broad operations
  if (toolName === "shell") {
    const command = String(toolArgs.command || "");
    if (command.includes("*") || command.includes("-r")) {
      score += 30;
    }
  }

  return {
    name: "operation_scope",
    weight: 0.3,
    score,
    description:
      score > 40
        ? "This action affects multiple files or has broad scope"
        : "This action has limited scope",
  };
}

/**
 * Assesses the rollback factor
 */
function assessRollbackFactor(context: RiskContext): RiskFactor {
  const hasRollback = context.hasRollback ?? false;

  return {
    name: "rollback_availability",
    weight: 0.2,
    score: hasRollback ? 0 : 50,
    description: hasRollback
      ? "Rollback is available if needed"
      : "No rollback mechanism available",
  };
}

/**
 * Assesses the historical error factor for a tool
 */
function assessHistoryFactor(toolName: string): RiskFactor {
  let errorCount = 0;
  let totalCount = 0;

  for (const pattern of errorPatternRegistry.values()) {
    if (pattern.toolName === toolName) {
      errorCount += pattern.frequency;
      totalCount += 1;
    }
  }

  const score =
    totalCount > 0 ? Math.min((errorCount / totalCount) * 50, 80) : 0;

  return {
    name: "historical_errors",
    weight: 0.1,
    score,
    description:
      score > 40
        ? "This tool has a history of errors"
        : "This tool has a good track record",
  };
}

/**
 * Converts a risk score to a risk level
 */
function scoreToRiskLevel(
  score: number,
): "low" | "medium" | "high" | "critical" {
  if (score >= 80) {
    return "critical";
  }
  if (score >= 60) {
    return "high";
  }
  if (score >= 30) {
    return "medium";
  }
  return "low";
}

/**
 * Generates mitigations based on risk factors
 */
function generateMitigations(
  factors: RiskFactor[],
  level: "low" | "medium" | "high" | "critical",
): string[] {
  const mitigations: string[] = [];

  for (const factor of factors) {
    if (factor.score >= 50) {
      switch (factor.name) {
        case "destructive_potential":
          mitigations.push("Create a backup before proceeding");
          mitigations.push("Consider using --dry-run if available");
          break;
        case "operation_scope":
          mitigations.push("Break the operation into smaller steps");
          mitigations.push("Verify the scope before execution");
          break;
        case "rollback_availability":
          mitigations.push("Create a checkpoint before this action");
          break;
        case "historical_errors":
          mitigations.push("Review previous error patterns for this tool");
          break;
      }
    }
  }

  if (level === "critical") {
    mitigations.unshift("Consider requesting human review before proceeding");
  }

  return [...new Set(mitigations)];
}
