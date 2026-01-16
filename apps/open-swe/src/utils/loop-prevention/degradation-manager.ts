/**
 * Degradation Manager for Loop Prevention
 *
 * Handles graceful degradation of agent capabilities when issues are detected.
 * Determines degradation levels, manages strategy switching, and generates
 * clarification requests when needed.
 */

import {
  type LoopDetectionState,
  type LoopPreventionConfig,
} from "@openswe/shared/open-swe/loop-prevention/types";
import { type LoopPattern, DegradationLevel } from "./types.js";
import { type ToolCategory, getToolCategory } from "./config-manager.js";

/**
 * Factor contributing to degradation level calculation.
 */
export interface DegradationFactor {
  /** Name of the factor */
  name: string;
  /** Weight of this factor in the calculation (0-1) */
  weight: number;
  /** Current value of the factor */
  value: number;
  /** Contribution to the final degradation score */
  contribution: number;
}

/**
 * Result of degradation level calculation.
 */
export interface DegradationLevelResult {
  /** Calculated degradation level (0-4) */
  level: number;
  /** Human-readable reason for this level */
  reason: string;
  /** Factors that contributed to this level */
  factors: DegradationFactor[];
  /** Suggested actions to take at this level */
  suggestedActions: string[];
}

/**
 * Strategy configuration for a degradation level.
 */
export interface DegradationStrategy {
  /** The degradation level this strategy applies to */
  level: number;
  /** Human-readable name of the strategy */
  name: string;
  /** Description of what this strategy does */
  description: string;
  /** Tool categories allowed at this level */
  allowedToolCategories: ToolCategory[];
  /** Specific tools that are blocked at this level */
  blockedTools: string[];
  /** Whether actions require user confirmation */
  requiresConfirmation: boolean;
  /** Whether to add delays between actions */
  addDelay: boolean;
  /** Delay in milliseconds between actions */
  delayMs: number;
  /** Maximum actions allowed per minute */
  maxActionsPerMinute: number;
}

/**
 * Result of checking if a tool is allowed.
 */
export interface ToolAllowedResult {
  /** Whether the tool is allowed */
  allowed: boolean;
  /** Reason for the decision */
  reason: string;
  /** Alternative tools that could be used instead */
  alternatives?: string[];
  /** Whether the tool requires confirmation even if allowed */
  requiresConfirmation?: boolean;
}

/**
 * Context for generating clarification requests.
 */
export interface ClarificationContext {
  /** Description of the current task */
  currentTask: string;
  /** Recent actions taken */
  recentActions: string[];
  /** Error messages encountered */
  errorMessages: string[];
}

/**
 * A request for clarification from the user.
 */
export interface ClarificationRequest {
  /** The question to ask the user */
  question: string;
  /** Context explaining why clarification is needed */
  context: string;
  /** Suggested responses the user can choose from */
  suggestedResponses: string[];
  /** Urgency level of the clarification request */
  urgency: "low" | "medium" | "high" | "critical";
}

/**
 * Effects to apply based on degradation level.
 */
export interface DegradationEffects {
  /** Delay to add before executing the action (ms) */
  delayMs: number;
  /** Whether user confirmation is required */
  requiresConfirmation: boolean;
  /** Warning message to display */
  warningMessage?: string;
  /** Reason if the action is blocked */
  blockedReason?: string;
}

/**
 * Predefined degradation strategies for each level.
 */
const DEGRADATION_STRATEGIES: Record<number, DegradationStrategy> = {
  [DegradationLevel.NORMAL]: {
    level: DegradationLevel.NORMAL,
    name: "Normal",
    description: "Full capabilities with standard monitoring",
    allowedToolCategories: [
      "file_operations",
      "shell_commands",
      "search_tools",
      "code_modification",
      "communication",
      "other",
    ],
    blockedTools: [],
    requiresConfirmation: false,
    addDelay: false,
    delayMs: 0,
    maxActionsPerMinute: 60,
  },
  [DegradationLevel.WARNING]: {
    level: DegradationLevel.WARNING,
    name: "Warning",
    description: "Increased monitoring with minor delays",
    allowedToolCategories: [
      "file_operations",
      "shell_commands",
      "search_tools",
      "code_modification",
      "communication",
      "other",
    ],
    blockedTools: [],
    requiresConfirmation: false,
    addDelay: true,
    delayMs: 500,
    maxActionsPerMinute: 30,
  },
  [DegradationLevel.RESTRICTED]: {
    level: DegradationLevel.RESTRICTED,
    name: "Restricted",
    description: "Limited tools, confirmation required for risky operations",
    allowedToolCategories: [
      "file_operations",
      "search_tools",
      "communication",
      "other",
    ],
    blockedTools: ["shell", "bash", "execute_command"],
    requiresConfirmation: true,
    addDelay: true,
    delayMs: 1000,
    maxActionsPerMinute: 15,
  },
  [DegradationLevel.MINIMAL]: {
    level: DegradationLevel.MINIMAL,
    name: "Minimal",
    description: "Only safe operations, clarification requested",
    allowedToolCategories: ["search_tools", "communication"],
    blockedTools: [
      "shell",
      "bash",
      "execute_command",
      "write_file",
      "str_replace_editor",
      "apply_patch",
      "edit_file",
    ],
    requiresConfirmation: true,
    addDelay: true,
    delayMs: 2000,
    maxActionsPerMinute: 5,
  },
  [DegradationLevel.HALTED]: {
    level: DegradationLevel.HALTED,
    name: "Halted",
    description: "Execution stopped, human intervention required",
    allowedToolCategories: ["communication"],
    blockedTools: [
      "shell",
      "bash",
      "execute_command",
      "write_file",
      "str_replace_editor",
      "apply_patch",
      "edit_file",
      "read_file",
      "list_files",
      "grep",
      "search",
    ],
    requiresConfirmation: true,
    addDelay: true,
    delayMs: 5000,
    maxActionsPerMinute: 1,
  },
};

/**
 * Alternative tools mapping for when certain tools are blocked.
 */
const TOOL_ALTERNATIVES: Record<string, string[]> = {
  shell: ["ask_followup_question", "request_human_help"],
  bash: ["ask_followup_question", "request_human_help"],
  execute_command: ["ask_followup_question", "request_human_help"],
  write_file: ["ask_followup_question", "update_plan"],
  str_replace_editor: ["ask_followup_question", "update_plan"],
  apply_patch: ["ask_followup_question", "update_plan"],
  edit_file: ["ask_followup_question", "update_plan"],
};

/**
 * Hysteresis thresholds to prevent rapid level changes.
 * Level can only increase if score exceeds upper threshold,
 * and can only decrease if score falls below lower threshold.
 */
const HYSTERESIS_THRESHOLDS: Record<number, { lower: number; upper: number }> =
  {
    0: { lower: 0, upper: 0.2 },
    1: { lower: 0.15, upper: 0.4 },
    2: { lower: 0.35, upper: 0.6 },
    3: { lower: 0.55, upper: 0.8 },
    4: { lower: 0.75, upper: 1.0 },
  };

/**
 * Calculates the appropriate degradation level based on current state.
 *
 * @param state - Current loop detection state
 * @param config - Loop prevention configuration
 * @param currentLevel - Current degradation level
 * @returns Degradation level result with factors and suggestions
 */
export function calculateDegradationLevel(
  state: LoopDetectionState,
  config: LoopPreventionConfig,
  currentLevel: number,
): DegradationLevelResult {
  const factors: DegradationFactor[] = [];

  const consecutiveErrorFactor = calculateConsecutiveErrorFactor(state);
  factors.push(consecutiveErrorFactor);

  const similarActionFactor = calculateSimilarActionFactor(state, config);
  factors.push(similarActionFactor);

  const timeSinceSuccessFactor = calculateTimeSinceSuccessFactor(state);
  factors.push(timeSinceSuccessFactor);

  const errorRateFactor = calculateErrorRateFactor(state);
  factors.push(errorRateFactor);

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const normalizedScore =
    totalWeight > 0
      ? factors.reduce((sum, f) => sum + f.contribution, 0) / totalWeight
      : 0;

  const rawLevel = scoreToLevel(normalizedScore);
  const level = applyHysteresis(rawLevel, currentLevel, normalizedScore);

  const reason = generateLevelReason(level, factors);
  const suggestedActions = generateSuggestedActions(level, state);

  return {
    level,
    reason,
    factors,
    suggestedActions,
  };
}

/**
 * Calculates the consecutive error factor contribution.
 */
function calculateConsecutiveErrorFactor(
  state: LoopDetectionState,
): DegradationFactor {
  const maxErrors = 5;
  const value = Math.min(state.consecutiveErrorCount / maxErrors, 1);
  const weight = 0.35;

  return {
    name: "consecutive_errors",
    weight,
    value: state.consecutiveErrorCount,
    contribution: value * weight,
  };
}

/**
 * Calculates the similar action count factor contribution.
 */
function calculateSimilarActionFactor(
  state: LoopDetectionState,
  config: LoopPreventionConfig,
): DegradationFactor {
  const threshold = config.semanticMatchThreshold;
  const value = Math.min(state.similarActionCount / threshold, 1);
  const weight = 0.3;

  return {
    name: "similar_actions",
    weight,
    value: state.similarActionCount,
    contribution: value * weight,
  };
}

/**
 * Calculates the time since last successful action factor.
 */
function calculateTimeSinceSuccessFactor(
  state: LoopDetectionState,
): DegradationFactor {
  const history = state.executionHistory;
  const lastSuccess = history
    .slice()
    .reverse()
    .find((e) => e.result === "success");

  let timeSinceSuccess = 0;
  if (lastSuccess) {
    timeSinceSuccess = Date.now() - lastSuccess.timestamp;
  } else if (history.length > 0) {
    timeSinceSuccess = Date.now() - history[0].timestamp;
  }

  const maxTime = 300000;
  const value = Math.min(timeSinceSuccess / maxTime, 1);
  const weight = 0.2;

  return {
    name: "time_since_success",
    weight,
    value: timeSinceSuccess,
    contribution: value * weight,
  };
}

/**
 * Calculates the overall error rate factor.
 */
function calculateErrorRateFactor(
  state: LoopDetectionState,
): DegradationFactor {
  const history = state.executionHistory;
  const recentWindow = 10;
  const recentHistory = history.slice(-recentWindow);

  let errorRate = 0;
  if (recentHistory.length > 0) {
    const errorCount = recentHistory.filter((e) => e.result === "error").length;
    errorRate = errorCount / recentHistory.length;
  }

  const weight = 0.15;

  return {
    name: "error_rate",
    weight,
    value: errorRate,
    contribution: errorRate * weight,
  };
}

/**
 * Converts a normalized score to a degradation level.
 */
function scoreToLevel(score: number): number {
  if (score >= 0.8) return DegradationLevel.HALTED;
  if (score >= 0.6) return DegradationLevel.MINIMAL;
  if (score >= 0.4) return DegradationLevel.RESTRICTED;
  if (score >= 0.2) return DegradationLevel.WARNING;
  return DegradationLevel.NORMAL;
}

/**
 * Applies hysteresis to prevent rapid level oscillation.
 */
function applyHysteresis(
  rawLevel: number,
  currentLevel: number,
  score: number,
): number {
  if (rawLevel === currentLevel) {
    return currentLevel;
  }

  if (rawLevel > currentLevel) {
    const threshold = HYSTERESIS_THRESHOLDS[rawLevel];
    if (threshold && score >= threshold.lower) {
      return rawLevel;
    }
    return currentLevel;
  }

  const threshold = HYSTERESIS_THRESHOLDS[currentLevel];
  if (threshold && score < threshold.lower) {
    return rawLevel;
  }
  return currentLevel;
}

/**
 * Generates a human-readable reason for the degradation level.
 */
function generateLevelReason(
  level: number,
  factors: DegradationFactor[],
): string {
  const topFactors = factors
    .filter((f) => f.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2);

  const strategy = DEGRADATION_STRATEGIES[level];
  const strategyName = strategy?.name ?? "Unknown";

  if (topFactors.length === 0) {
    return `${strategyName} level: No significant issues detected`;
  }

  const factorDescriptions = topFactors.map((f) => {
    switch (f.name) {
      case "consecutive_errors":
        return `${f.value} consecutive errors`;
      case "similar_actions":
        return `${f.value} similar actions detected`;
      case "time_since_success":
        return `${Math.round(f.value / 1000)}s since last success`;
      case "error_rate":
        return `${Math.round(f.value * 100)}% recent error rate`;
      default:
        return f.name;
    }
  });

  return `${strategyName} level due to: ${factorDescriptions.join(", ")}`;
}

/**
 * Generates suggested actions based on degradation level.
 */
function generateSuggestedActions(
  level: number,
  state: LoopDetectionState,
): string[] {
  const actions: string[] = [];

  switch (level) {
    case DegradationLevel.NORMAL:
      actions.push("Continue normal operation");
      break;
    case DegradationLevel.WARNING:
      actions.push("Review recent actions for patterns");
      actions.push("Consider alternative approaches");
      break;
    case DegradationLevel.RESTRICTED:
      actions.push("Use only read-only operations");
      actions.push("Request clarification on the task");
      actions.push("Review error messages for root cause");
      break;
    case DegradationLevel.MINIMAL:
      actions.push("Stop making changes");
      actions.push("Request human assistance");
      actions.push("Summarize current state for handoff");
      break;
    case DegradationLevel.HALTED:
      actions.push("Halt all operations");
      actions.push("Escalate to human operator");
      actions.push("Provide detailed status report");
      break;
  }

  if (state.consecutiveErrorCount > 0) {
    actions.push("Analyze error patterns before retrying");
  }

  return actions;
}

/**
 * Gets the strategy for a given degradation level.
 *
 * @param level - The degradation level (0-4)
 * @returns The strategy configuration for that level
 */
export function getDegradationStrategy(level: number): DegradationStrategy {
  const clampedLevel = Math.max(0, Math.min(4, level));
  return { ...DEGRADATION_STRATEGIES[clampedLevel] };
}

/**
 * Determines if a tool is allowed at the current degradation level.
 *
 * @param toolName - Name of the tool to check
 * @param level - Current degradation level
 * @param config - Loop prevention configuration
 * @returns Result indicating if the tool is allowed and why
 */
export function isToolAllowed(
  toolName: string,
  level: number,
  config: LoopPreventionConfig,
): ToolAllowedResult {
  if (!config.enabled) {
    return {
      allowed: true,
      reason: "Loop prevention is disabled",
    };
  }

  const strategy = getDegradationStrategy(level);

  if (strategy.blockedTools.includes(toolName)) {
    return {
      allowed: false,
      reason: `Tool "${toolName}" is blocked at ${strategy.name} level`,
      alternatives: TOOL_ALTERNATIVES[toolName],
      requiresConfirmation: false,
    };
  }

  const toolCategory = getToolCategory(toolName);
  if (!strategy.allowedToolCategories.includes(toolCategory)) {
    return {
      allowed: false,
      reason: `Tool category "${toolCategory}" is not allowed at ${strategy.name} level`,
      alternatives: TOOL_ALTERNATIVES[toolName],
      requiresConfirmation: false,
    };
  }

  return {
    allowed: true,
    reason: `Tool "${toolName}" is allowed at ${strategy.name} level`,
    requiresConfirmation: strategy.requiresConfirmation,
  };
}

/**
 * Generates a clarification request based on detected issues.
 *
 * @param state - Current loop detection state
 * @param patterns - Detected loop patterns
 * @param context - Context for generating the clarification
 * @returns A clarification request to present to the user
 */
export function generateClarificationRequest(
  state: LoopDetectionState,
  patterns: LoopPattern[],
  context: ClarificationContext,
): ClarificationRequest {
  const urgency = determineUrgency(state, patterns);
  const question = generateQuestion(state, patterns, context);
  const contextDescription = generateContextDescription(
    state,
    patterns,
    context,
  );
  const suggestedResponses = generateSuggestedResponses(patterns, context);

  return {
    question,
    context: contextDescription,
    suggestedResponses,
    urgency,
  };
}

/**
 * Determines the urgency level of a clarification request.
 */
function determineUrgency(
  state: LoopDetectionState,
  patterns: LoopPattern[],
): "low" | "medium" | "high" | "critical" {
  if (state.degradationLevel >= 3) return "critical";
  if (state.consecutiveErrorCount >= 5) return "high";
  if (patterns.some((p) => p.confidence > 0.9)) return "high";
  if (state.degradationLevel >= 2) return "medium";
  if (patterns.length > 0) return "medium";
  return "low";
}

/**
 * Generates the clarification question.
 */
function generateQuestion(
  state: LoopDetectionState,
  patterns: LoopPattern[],
  context: ClarificationContext,
): string {
  if (patterns.length > 0) {
    const primaryPattern = patterns[0];
    switch (primaryPattern.type) {
      case "exact_repeat":
        return `I've been repeating the same action (${primaryPattern.toolNames.join(", ")}) ${primaryPattern.occurrences} times. Should I try a different approach?`;
      case "similar_args":
        return `I've been making similar attempts that aren't succeeding. Can you provide more specific guidance?`;
      case "error_cycle":
        return `I'm encountering repeated errors. Would you like me to try a different strategy or need more information about the issue?`;
      case "oscillation":
        return `I seem to be going back and forth between approaches. Can you help clarify the expected outcome?`;
    }
  }

  if (state.consecutiveErrorCount > 0) {
    return `I've encountered ${state.consecutiveErrorCount} consecutive errors. Should I continue trying or take a different approach?`;
  }

  return `I'm having difficulty making progress on "${context.currentTask}". Can you provide additional guidance?`;
}

/**
 * Generates context description for the clarification request.
 */
function generateContextDescription(
  state: LoopDetectionState,
  patterns: LoopPattern[],
  context: ClarificationContext,
): string {
  const parts: string[] = [];

  parts.push(`Current task: ${context.currentTask}`);

  if (context.recentActions.length > 0) {
    const recentActionsStr = context.recentActions.slice(-3).join(", ");
    parts.push(`Recent actions: ${recentActionsStr}`);
  }

  if (context.errorMessages.length > 0) {
    const lastError = context.errorMessages[context.errorMessages.length - 1];
    parts.push(`Last error: ${lastError}`);
  }

  if (patterns.length > 0) {
    const patternDescriptions = patterns.map((p) => p.description).join("; ");
    parts.push(`Detected patterns: ${patternDescriptions}`);
  }

  parts.push(`Current degradation level: ${state.degradationLevel}`);

  return parts.join("\n");
}

/**
 * Generates suggested responses for the clarification request.
 */
function generateSuggestedResponses(
  patterns: LoopPattern[],
  _context: ClarificationContext,
): string[] {
  const responses: string[] = [];

  responses.push("Continue with the current approach");
  responses.push("Try a different strategy");

  if (patterns.some((p) => p.type === "error_cycle")) {
    responses.push("Skip this step and move on");
    responses.push("Provide more details about the expected behavior");
  }

  if (patterns.some((p) => p.type === "exact_repeat")) {
    responses.push("The previous attempts were correct, keep trying");
    responses.push("Stop and explain what you've tried");
  }

  responses.push("Escalate to human assistance");

  return responses.slice(0, 4);
}

/**
 * Applies degradation effects to the execution flow.
 *
 * @param level - Current degradation level
 * @param toolName - Name of the tool being executed
 * @param config - Loop prevention configuration
 * @returns Effects to apply to the execution
 */
export function applyDegradation(
  level: number,
  toolName: string,
  config: LoopPreventionConfig,
): DegradationEffects {
  if (!config.enabled) {
    return {
      delayMs: 0,
      requiresConfirmation: false,
    };
  }

  const strategy = getDegradationStrategy(level);
  const toolAllowed = isToolAllowed(toolName, level, config);

  if (!toolAllowed.allowed) {
    return {
      delayMs: 0,
      requiresConfirmation: false,
      blockedReason: toolAllowed.reason,
      warningMessage: toolAllowed.alternatives
        ? `Consider using: ${toolAllowed.alternatives.join(", ")}`
        : undefined,
    };
  }

  let warningMessage: string | undefined;
  if (level >= DegradationLevel.WARNING) {
    warningMessage = `Operating at ${strategy.name} level. ${strategy.description}`;
  }

  return {
    delayMs: strategy.addDelay ? strategy.delayMs : 0,
    requiresConfirmation:
      strategy.requiresConfirmation ||
      (toolAllowed.requiresConfirmation ?? false),
    warningMessage,
  };
}

/**
 * Checks if degradation level should be reduced (recovery).
 *
 * @param state - Current loop detection state
 * @param currentLevel - Current degradation level
 * @param config - Loop prevention configuration
 * @returns True if the level should be reduced
 */
export function shouldReduceDegradation(
  state: LoopDetectionState,
  currentLevel: number,
  config: LoopPreventionConfig,
): boolean {
  if (currentLevel === DegradationLevel.NORMAL) {
    return false;
  }

  if (!config.enabled) {
    return true;
  }

  const cooldownMs = getCooldownForLevel(currentLevel, config);
  const timeSinceSwitch = Date.now() - state.lastStrategySwitch;
  if (timeSinceSwitch < cooldownMs) {
    return false;
  }

  if (state.consecutiveErrorCount > 0) {
    return false;
  }

  const recentHistory = state.executionHistory.slice(-5);
  if (recentHistory.length < 3) {
    return false;
  }

  const successCount = recentHistory.filter(
    (e) => e.result === "success",
  ).length;
  const successRate = successCount / recentHistory.length;

  if (successRate >= 0.8) {
    return true;
  }

  if (state.similarActionCount === 0 && successRate >= 0.6) {
    return true;
  }

  return false;
}

/**
 * Gets the cooldown period for a degradation level.
 */
function getCooldownForLevel(
  level: number,
  config: LoopPreventionConfig,
): number {
  const levelConfig = config.degradationLevels.find((l) => l.level === level);
  if (levelConfig) {
    return levelConfig.cooldownMs;
  }
  return config.escalationCooldownMs;
}

/**
 * Gets a human-readable description of the current degradation state.
 *
 * @param level - Current degradation level
 * @param state - Current loop detection state
 * @returns Human-readable description of the degradation state
 */
export function getDegradationDescription(
  level: number,
  state: LoopDetectionState,
): string {
  const strategy = getDegradationStrategy(level);
  const parts: string[] = [];

  parts.push(`Degradation Level: ${level} (${strategy.name})`);
  parts.push(`Description: ${strategy.description}`);

  if (state.consecutiveErrorCount > 0) {
    parts.push(`Consecutive Errors: ${state.consecutiveErrorCount}`);
  }

  if (state.similarActionCount > 0) {
    parts.push(`Similar Actions Detected: ${state.similarActionCount}`);
  }

  const recentHistory = state.executionHistory.slice(-10);
  if (recentHistory.length > 0) {
    const errorCount = recentHistory.filter((e) => e.result === "error").length;
    const errorRate = Math.round((errorCount / recentHistory.length) * 100);
    parts.push(`Recent Error Rate: ${errorRate}%`);
  }

  if (strategy.blockedTools.length > 0) {
    parts.push(`Blocked Tools: ${strategy.blockedTools.join(", ")}`);
  }

  if (strategy.requiresConfirmation) {
    parts.push("Actions require confirmation");
  }

  if (strategy.addDelay) {
    parts.push(`Delay between actions: ${strategy.delayMs}ms`);
  }

  parts.push(`Max actions per minute: ${strategy.maxActionsPerMinute}`);

  return parts.join("\n");
}
