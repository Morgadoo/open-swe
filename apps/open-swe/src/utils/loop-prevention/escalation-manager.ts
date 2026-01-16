/**
 * Escalation Manager for Loop Prevention
 *
 * Handles escalating issues to human operators when automated recovery fails.
 * Provides context preservation, fallback strategies, and escalation tracking.
 */

import {
  type LoopDetectionState,
  type LoopPreventionConfig,
} from "@openswe/shared/open-swe/loop-prevention/types";
import { type LoopPattern, DegradationLevel } from "./types.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Priority levels for escalation requests.
 */
export type EscalationPriority = "low" | "medium" | "high" | "critical";

/**
 * Types of triggers that can cause an escalation.
 */
export type EscalationTriggerType =
  | "degradation_level"
  | "time_stuck"
  | "error_pattern"
  | "loop_detected"
  | "manual_request";

/**
 * A trigger that contributed to the escalation decision.
 */
export interface EscalationTrigger {
  /** Type of trigger */
  type: EscalationTriggerType;
  /** Human-readable description of the trigger */
  description: string;
  /** Severity score (0-1) */
  severity: number;
}

/**
 * Decision about whether to escalate and why.
 */
export interface EscalationDecision {
  /** Whether escalation is recommended */
  shouldEscalate: boolean;
  /** Priority level if escalation is needed */
  priority: EscalationPriority;
  /** Human-readable reason for the decision */
  reason: string;
  /** Triggers that contributed to this decision */
  triggers: EscalationTrigger[];
}

/**
 * Context information for an escalation request.
 */
export interface EscalationContext {
  /** Description of the current task */
  taskDescription: string;
  /** Current step being attempted */
  currentStep: string;
  /** List of actions that were attempted */
  attemptedActions: string[];
  /** Error messages encountered */
  errorMessages: string[];
  /** Files that were modified during the task */
  filesModified: string[];
  /** Time elapsed since task started (ms) */
  timeElapsedMs: number;
}

/**
 * Summary of the issue for human review.
 */
export interface IssueSummary {
  /** Brief title describing the issue */
  title: string;
  /** Detailed description of the issue */
  description: string;
  /** List of what was attempted */
  whatWasAttempted: string[];
  /** List of what failed */
  whatFailed: string[];
  /** Possible causes of the issue */
  possibleCauses: string[];
  /** Suggested fixes for the human to try */
  suggestedFixes: string[];
}

/**
 * A complete escalation request with all context.
 */
export interface EscalationRequest {
  /** Unique identifier for this escalation */
  id: string;
  /** Priority level of the escalation */
  priority: EscalationPriority;
  /** Summary of the issue */
  summary: IssueSummary;
  /** Context information */
  context: EscalationContext;
  /** Suggested actions for the human */
  suggestedActions: string[];
  /** Timestamp when the escalation was created */
  timestamp: number;
  /** Timestamp when the escalation expires */
  expiresAt: number;
}

/**
 * Fallback strategy while waiting for human response.
 */
export interface FallbackStrategy {
  /** Action to take while waiting */
  action: "wait" | "safe_mode" | "partial_complete" | "rollback";
  /** Description of the fallback strategy */
  description: string;
  /** Operations allowed during fallback */
  allowedOperations: string[];
  /** Maximum time to wait for human response (ms) */
  maxWaitTimeMs: number;
}

/**
 * Status of an escalation request.
 */
export type EscalationStatus =
  | "pending"
  | "acknowledged"
  | "resolved"
  | "expired";

/**
 * Tracks the status of an escalation request.
 */
export interface EscalationTracker {
  /** The escalation request being tracked */
  request: EscalationRequest;
  /** Current status of the escalation */
  status: EscalationStatus;
  /** Timestamp when the tracker was created */
  createdAt: number;
  /** Timestamp when the escalation was acknowledged */
  acknowledgedAt?: number;
  /** Timestamp when the escalation was resolved */
  resolvedAt?: number;
  /** Timeout duration (ms) */
  timeoutMs: number;
}

/**
 * Resolution of an escalation request.
 */
export interface EscalationResolution {
  /** Whether the escalation was resolved */
  resolved: boolean;
  /** Action to take after resolution */
  action: "continue" | "retry" | "abort" | "modify_approach";
  /** Instructions from the human (if any) */
  instructions?: string;
  /** New context to use (if any) */
  newContext?: Record<string, unknown>;
}

/**
 * Thresholds for escalation triggers.
 */
const ESCALATION_THRESHOLDS = {
  degradationLevel: {
    low: DegradationLevel.RESTRICTED,
    medium: DegradationLevel.MINIMAL,
    high: DegradationLevel.HALTED,
  },
  timeStuckMs: {
    low: 300000, // 5 minutes
    medium: 600000, // 10 minutes
    high: 900000, // 15 minutes
    critical: 1800000, // 30 minutes
  },
  consecutiveErrors: {
    low: 5,
    medium: 8,
    high: 12,
    critical: 15,
  },
  loopOccurrences: {
    low: 5,
    medium: 8,
    high: 10,
    critical: 15,
  },
};

/**
 * Default timeout for escalation requests (ms).
 */
const DEFAULT_ESCALATION_TIMEOUT_MS = 3600000; // 1 hour

/**
 * Determines if escalation to human is needed based on current state.
 *
 * @param state - Current loop detection state
 * @param degradationLevel - Current degradation level
 * @param config - Loop prevention configuration
 * @returns Decision about whether to escalate
 */
export function shouldEscalate(
  state: LoopDetectionState,
  degradationLevel: number,
  config: LoopPreventionConfig,
): EscalationDecision {
  if (!config.autoEscalationEnabled) {
    return {
      shouldEscalate: false,
      priority: "low",
      reason: "Auto-escalation is disabled",
      triggers: [],
    };
  }

  const triggers: EscalationTrigger[] = [];

  const degradationTrigger = checkDegradationTrigger(degradationLevel);
  if (degradationTrigger) {
    triggers.push(degradationTrigger);
  }

  const timeStuckTrigger = checkTimeStuckTrigger(state);
  if (timeStuckTrigger) {
    triggers.push(timeStuckTrigger);
  }

  const errorPatternTrigger = checkErrorPatternTrigger(state);
  if (errorPatternTrigger) {
    triggers.push(errorPatternTrigger);
  }

  const loopTrigger = checkLoopTrigger(state);
  if (loopTrigger) {
    triggers.push(loopTrigger);
  }

  if (triggers.length === 0) {
    return {
      shouldEscalate: false,
      priority: "low",
      reason: "No escalation triggers detected",
      triggers: [],
    };
  }

  const priority = calculatePriority(triggers);
  const reason = generateEscalationReason(triggers);

  const shouldEscalateNow =
    priority === "critical" ||
    priority === "high" ||
    (priority === "medium" && triggers.length >= 2);

  return {
    shouldEscalate: shouldEscalateNow,
    priority,
    reason,
    triggers,
  };
}

/**
 * Checks if degradation level triggers escalation.
 */
function checkDegradationTrigger(
  degradationLevel: number,
): EscalationTrigger | null {
  if (degradationLevel >= ESCALATION_THRESHOLDS.degradationLevel.high) {
    return {
      type: "degradation_level",
      description: `Degradation level is at ${degradationLevel} (HALTED)`,
      severity: 1.0,
    };
  }
  if (degradationLevel >= ESCALATION_THRESHOLDS.degradationLevel.medium) {
    return {
      type: "degradation_level",
      description: `Degradation level is at ${degradationLevel} (MINIMAL)`,
      severity: 0.7,
    };
  }
  if (degradationLevel >= ESCALATION_THRESHOLDS.degradationLevel.low) {
    return {
      type: "degradation_level",
      description: `Degradation level is at ${degradationLevel} (RESTRICTED)`,
      severity: 0.4,
    };
  }
  return null;
}

/**
 * Checks if time stuck triggers escalation.
 */
function checkTimeStuckTrigger(
  state: LoopDetectionState,
): EscalationTrigger | null {
  const history = state.executionHistory;
  if (history.length === 0) return null;

  const lastSuccess = history
    .slice()
    .reverse()
    .find((e) => e.result === "success");

  let timeStuck: number;
  if (lastSuccess) {
    timeStuck = Date.now() - lastSuccess.timestamp;
  } else {
    timeStuck = Date.now() - history[0].timestamp;
  }

  if (timeStuck >= ESCALATION_THRESHOLDS.timeStuckMs.critical) {
    return {
      type: "time_stuck",
      description: `No progress for ${Math.round(timeStuck / 60000)} minutes`,
      severity: 1.0,
    };
  }
  if (timeStuck >= ESCALATION_THRESHOLDS.timeStuckMs.high) {
    return {
      type: "time_stuck",
      description: `No progress for ${Math.round(timeStuck / 60000)} minutes`,
      severity: 0.8,
    };
  }
  if (timeStuck >= ESCALATION_THRESHOLDS.timeStuckMs.medium) {
    return {
      type: "time_stuck",
      description: `No progress for ${Math.round(timeStuck / 60000)} minutes`,
      severity: 0.5,
    };
  }
  if (timeStuck >= ESCALATION_THRESHOLDS.timeStuckMs.low) {
    return {
      type: "time_stuck",
      description: `No progress for ${Math.round(timeStuck / 60000)} minutes`,
      severity: 0.3,
    };
  }
  return null;
}

/**
 * Checks if error patterns trigger escalation.
 */
function checkErrorPatternTrigger(
  state: LoopDetectionState,
): EscalationTrigger | null {
  const errorCount = state.consecutiveErrorCount;

  if (errorCount >= ESCALATION_THRESHOLDS.consecutiveErrors.critical) {
    return {
      type: "error_pattern",
      description: `${errorCount} consecutive errors detected`,
      severity: 1.0,
    };
  }
  if (errorCount >= ESCALATION_THRESHOLDS.consecutiveErrors.high) {
    return {
      type: "error_pattern",
      description: `${errorCount} consecutive errors detected`,
      severity: 0.8,
    };
  }
  if (errorCount >= ESCALATION_THRESHOLDS.consecutiveErrors.medium) {
    return {
      type: "error_pattern",
      description: `${errorCount} consecutive errors detected`,
      severity: 0.5,
    };
  }
  if (errorCount >= ESCALATION_THRESHOLDS.consecutiveErrors.low) {
    return {
      type: "error_pattern",
      description: `${errorCount} consecutive errors detected`,
      severity: 0.3,
    };
  }
  return null;
}

/**
 * Checks if loop detection triggers escalation.
 */
function checkLoopTrigger(state: LoopDetectionState): EscalationTrigger | null {
  const similarCount = state.similarActionCount;

  if (similarCount >= ESCALATION_THRESHOLDS.loopOccurrences.critical) {
    return {
      type: "loop_detected",
      description: `${similarCount} similar actions detected (likely stuck in loop)`,
      severity: 1.0,
    };
  }
  if (similarCount >= ESCALATION_THRESHOLDS.loopOccurrences.high) {
    return {
      type: "loop_detected",
      description: `${similarCount} similar actions detected`,
      severity: 0.8,
    };
  }
  if (similarCount >= ESCALATION_THRESHOLDS.loopOccurrences.medium) {
    return {
      type: "loop_detected",
      description: `${similarCount} similar actions detected`,
      severity: 0.5,
    };
  }
  if (similarCount >= ESCALATION_THRESHOLDS.loopOccurrences.low) {
    return {
      type: "loop_detected",
      description: `${similarCount} similar actions detected`,
      severity: 0.3,
    };
  }
  return null;
}

/**
 * Calculates the overall priority based on triggers.
 */
function calculatePriority(triggers: EscalationTrigger[]): EscalationPriority {
  if (triggers.length === 0) return "low";

  const maxSeverity = Math.max(...triggers.map((t) => t.severity));
  const avgSeverity =
    triggers.reduce((sum, t) => sum + t.severity, 0) / triggers.length;

  const combinedScore = maxSeverity * 0.7 + avgSeverity * 0.3;

  if (combinedScore >= 0.9) return "critical";
  if (combinedScore >= 0.7) return "high";
  if (combinedScore >= 0.4) return "medium";
  return "low";
}

/**
 * Generates a human-readable reason for escalation.
 */
function generateEscalationReason(triggers: EscalationTrigger[]): string {
  if (triggers.length === 0) return "No issues detected";

  const descriptions = triggers
    .sort((a, b) => b.severity - a.severity)
    .map((t) => t.description);

  if (descriptions.length === 1) {
    return descriptions[0];
  }

  return `Multiple issues: ${descriptions.join("; ")}`;
}

/**
 * Creates an escalation request with full context.
 *
 * @param state - Current loop detection state
 * @param context - Context information for the escalation
 * @param priority - Priority level of the escalation
 * @returns Complete escalation request
 */
export function createEscalationRequest(
  state: LoopDetectionState,
  context: EscalationContext,
  priority: EscalationPriority,
): EscalationRequest {
  const patterns = extractPatternsFromState(state);
  const summary = generateIssueSummary(state, patterns, context.errorMessages);

  const suggestedActions = generateSuggestedActionsForHuman(
    state,
    context,
    priority,
  );

  const timeoutMs = getTimeoutForPriority(priority);

  return {
    id: uuidv4(),
    priority,
    summary,
    context,
    suggestedActions,
    timestamp: Date.now(),
    expiresAt: Date.now() + timeoutMs,
  };
}

/**
 * Extracts loop patterns from the current state.
 */
function extractPatternsFromState(state: LoopDetectionState): LoopPattern[] {
  const patterns: LoopPattern[] = [];
  const history = state.executionHistory;

  if (history.length < 2) return patterns;

  const toolCounts: Record<string, number> = {};
  for (const entry of history.slice(-20)) {
    toolCounts[entry.toolName] = (toolCounts[entry.toolName] || 0) + 1;
  }

  for (const [toolName, count] of Object.entries(toolCounts)) {
    if (count >= 3) {
      patterns.push({
        type: "exact_repeat",
        toolNames: [toolName],
        occurrences: count,
        confidence: Math.min(count / 5, 1),
        firstDetected:
          history.find((e) => e.toolName === toolName)?.timestamp || Date.now(),
        description: `Tool "${toolName}" called ${count} times in recent history`,
      });
    }
  }

  const errorEntries = history.filter((e) => e.result === "error").slice(-10);
  if (errorEntries.length >= 3) {
    const errorTools = [...new Set(errorEntries.map((e) => e.toolName))];
    patterns.push({
      type: "error_cycle",
      toolNames: errorTools,
      occurrences: errorEntries.length,
      confidence: Math.min(errorEntries.length / 5, 1),
      firstDetected: errorEntries[0].timestamp,
      description: `${errorEntries.length} errors in recent history`,
    });
  }

  return patterns;
}

/**
 * Generates suggested actions for the human operator.
 */
function generateSuggestedActionsForHuman(
  state: LoopDetectionState,
  context: EscalationContext,
  priority: EscalationPriority,
): string[] {
  const actions: string[] = [];

  actions.push("Review the error messages and attempted actions");

  if (state.consecutiveErrorCount > 0) {
    actions.push("Check if the task requirements are clear and achievable");
    actions.push("Verify that necessary permissions and access are available");
  }

  if (state.similarActionCount > 0) {
    actions.push("Consider if the approach needs to be fundamentally changed");
    actions.push("Check if there are missing dependencies or prerequisites");
  }

  if (context.filesModified.length > 0) {
    actions.push("Review the modified files for any issues");
    actions.push("Consider rolling back changes if they caused problems");
  }

  if (priority === "critical" || priority === "high") {
    actions.push("Provide specific guidance on how to proceed");
    actions.push("Consider breaking the task into smaller steps");
  }

  return actions.slice(0, 6);
}

/**
 * Gets the timeout duration based on priority.
 */
function getTimeoutForPriority(priority: EscalationPriority): number {
  switch (priority) {
    case "critical":
      return DEFAULT_ESCALATION_TIMEOUT_MS / 4; // 15 minutes
    case "high":
      return DEFAULT_ESCALATION_TIMEOUT_MS / 2; // 30 minutes
    case "medium":
      return DEFAULT_ESCALATION_TIMEOUT_MS; // 1 hour
    case "low":
      return DEFAULT_ESCALATION_TIMEOUT_MS * 2; // 2 hours
  }
}

/**
 * Generates a human-readable summary of the issue.
 *
 * @param state - Current loop detection state
 * @param patterns - Detected loop patterns
 * @param recentErrors - Recent error messages
 * @returns Summary of the issue for human review
 */
export function generateIssueSummary(
  state: LoopDetectionState,
  patterns: LoopPattern[],
  recentErrors: string[],
): IssueSummary {
  const title = generateIssueTitle(state, patterns);
  const description = generateIssueDescription(state, patterns);
  const whatWasAttempted = extractAttemptedActions(state);
  const whatFailed = extractFailedActions(state, recentErrors);
  const possibleCauses = analyzePossibleCauses(state, patterns, recentErrors);
  const suggestedFixes = generateSuggestedFixes(state, patterns);

  return {
    title,
    description,
    whatWasAttempted,
    whatFailed,
    possibleCauses,
    suggestedFixes,
  };
}

/**
 * Generates a title for the issue.
 */
function generateIssueTitle(
  state: LoopDetectionState,
  patterns: LoopPattern[],
): string {
  if (state.degradationLevel >= DegradationLevel.HALTED) {
    return "Agent Halted: Human Intervention Required";
  }

  if (patterns.some((p) => p.type === "error_cycle")) {
    return "Agent Stuck: Repeated Errors Detected";
  }

  if (patterns.some((p) => p.type === "exact_repeat")) {
    return "Agent Stuck: Repetitive Actions Detected";
  }

  if (state.consecutiveErrorCount >= 5) {
    return `Agent Struggling: ${state.consecutiveErrorCount} Consecutive Errors`;
  }

  return "Agent Needs Assistance";
}

/**
 * Generates a description of the issue.
 */
function generateIssueDescription(
  state: LoopDetectionState,
  patterns: LoopPattern[],
): string {
  const parts: string[] = [];

  parts.push(
    `The agent has encountered difficulties and requires human assistance.`,
  );

  if (state.degradationLevel > 0) {
    const levelNames = ["Normal", "Warning", "Restricted", "Minimal", "Halted"];
    parts.push(
      `Current degradation level: ${levelNames[state.degradationLevel]}`,
    );
  }

  if (state.consecutiveErrorCount > 0) {
    parts.push(`Consecutive errors: ${state.consecutiveErrorCount}`);
  }

  if (patterns.length > 0) {
    const patternDescriptions = patterns.map((p) => p.description).join("; ");
    parts.push(`Detected patterns: ${patternDescriptions}`);
  }

  const history = state.executionHistory;
  if (history.length > 0) {
    const recentHistory = history.slice(-10);
    const errorCount = recentHistory.filter((e) => e.result === "error").length;
    const errorRate = Math.round((errorCount / recentHistory.length) * 100);
    parts.push(`Recent error rate: ${errorRate}%`);
  }

  return parts.join("\n\n");
}

/**
 * Extracts a list of attempted actions from history.
 */
function extractAttemptedActions(state: LoopDetectionState): string[] {
  const history = state.executionHistory.slice(-15);
  const actions: string[] = [];

  for (const entry of history) {
    const argsPreview = JSON.stringify(entry.toolArgs).slice(0, 100);
    actions.push(`${entry.toolName}: ${argsPreview}...`);
  }

  return actions;
}

/**
 * Extracts a list of failed actions.
 */
function extractFailedActions(
  state: LoopDetectionState,
  recentErrors: string[],
): string[] {
  const failed: string[] = [];

  const errorEntries = state.executionHistory
    .filter((e) => e.result === "error")
    .slice(-10);

  for (const entry of errorEntries) {
    const errorMsg = entry.errorMessage || "Unknown error";
    failed.push(`${entry.toolName}: ${errorMsg}`);
  }

  for (const error of recentErrors.slice(-5)) {
    if (!failed.some((f) => f.includes(error.slice(0, 50)))) {
      failed.push(error);
    }
  }

  return failed.slice(0, 10);
}

/**
 * Analyzes possible causes of the issue.
 */
function analyzePossibleCauses(
  state: LoopDetectionState,
  patterns: LoopPattern[],
  recentErrors: string[],
): string[] {
  const causes: string[] = [];

  if (patterns.some((p) => p.type === "exact_repeat")) {
    causes.push("The agent may be stuck in a loop trying the same approach");
  }

  if (patterns.some((p) => p.type === "error_cycle")) {
    causes.push("There may be a fundamental issue preventing progress");
  }

  const errorMessages = recentErrors.join(" ").toLowerCase();
  if (
    errorMessages.includes("permission") ||
    errorMessages.includes("access denied")
  ) {
    causes.push("Permission or access issues may be blocking progress");
  }
  if (
    errorMessages.includes("not found") ||
    errorMessages.includes("does not exist")
  ) {
    causes.push("Required files or resources may be missing");
  }
  if (errorMessages.includes("syntax") || errorMessages.includes("parse")) {
    causes.push("There may be syntax errors in the code being modified");
  }
  if (
    errorMessages.includes("timeout") ||
    errorMessages.includes("timed out")
  ) {
    causes.push("Operations may be timing out due to slow responses");
  }

  if (state.similarActionCount > 5) {
    causes.push("The task requirements may be unclear or ambiguous");
  }

  if (causes.length === 0) {
    causes.push("The root cause is unclear and requires investigation");
  }

  return causes;
}

/**
 * Generates suggested fixes for the human.
 */
function generateSuggestedFixes(
  state: LoopDetectionState,
  patterns: LoopPattern[],
): string[] {
  const fixes: string[] = [];

  if (patterns.some((p) => p.type === "exact_repeat")) {
    fixes.push("Provide more specific guidance on the expected approach");
    fixes.push("Break the task into smaller, more manageable steps");
  }

  if (patterns.some((p) => p.type === "error_cycle")) {
    fixes.push("Review and fix the underlying error before retrying");
    fixes.push("Check if prerequisites are met");
  }

  if (state.consecutiveErrorCount >= 5) {
    fixes.push("Investigate the error messages for root cause");
    fixes.push("Consider if the task is achievable with current constraints");
  }

  fixes.push("Provide additional context or clarification");
  fixes.push("Manually complete the problematic step");
  fixes.push("Abort the task if it's no longer needed");

  return fixes.slice(0, 5);
}

/**
 * Gets the fallback strategy while waiting for human response.
 *
 * @param escalationPriority - Priority of the escalation
 * @param currentTask - Description of the current task
 * @returns Fallback strategy to use while waiting
 */
export function getFallbackStrategy(
  escalationPriority: EscalationPriority,
  _currentTask: string,
): FallbackStrategy {
  switch (escalationPriority) {
    case "critical":
      return {
        action: "wait",
        description:
          "Critical issue detected. Halting all operations until human responds.",
        allowedOperations: [],
        maxWaitTimeMs: 900000, // 15 minutes
      };

    case "high":
      return {
        action: "safe_mode",
        description:
          "High priority issue. Operating in safe mode with read-only operations.",
        allowedOperations: [
          "read_file",
          "list_files",
          "search",
          "grep",
          "ask_followup_question",
        ],
        maxWaitTimeMs: 1800000, // 30 minutes
      };

    case "medium":
      return {
        action: "partial_complete",
        description:
          "Medium priority issue. Attempting to complete safe portions of the task.",
        allowedOperations: [
          "read_file",
          "list_files",
          "search",
          "grep",
          "ask_followup_question",
          "update_plan",
          "scratchpad",
        ],
        maxWaitTimeMs: 3600000, // 1 hour
      };

    case "low":
      return {
        action: "partial_complete",
        description:
          "Low priority issue. Continuing with caution on non-critical operations.",
        allowedOperations: [
          "read_file",
          "list_files",
          "search",
          "grep",
          "ask_followup_question",
          "update_plan",
          "scratchpad",
          "write_file",
        ],
        maxWaitTimeMs: 7200000, // 2 hours
      };
  }
}

/**
 * Formats an escalation request for a GitHub issue comment.
 *
 * @param request - The escalation request to format
 * @returns Formatted markdown string for GitHub
 */
export function formatGitHubEscalation(request: EscalationRequest): string {
  const priorityEmoji = {
    critical: "🚨",
    high: "⚠️",
    medium: "📋",
    low: "ℹ️",
  };

  const lines: string[] = [];

  lines.push(`## ${priorityEmoji[request.priority]} ${request.summary.title}`);
  lines.push("");
  lines.push(`**Priority:** ${request.priority.toUpperCase()}`);
  lines.push(`**Escalation ID:** \`${request.id}\``);
  lines.push(`**Time:** ${new Date(request.timestamp).toISOString()}`);
  lines.push("");

  lines.push("### Description");
  lines.push(request.summary.description);
  lines.push("");

  if (request.context.taskDescription) {
    lines.push("### Current Task");
    lines.push(request.context.taskDescription);
    lines.push("");
  }

  if (request.context.currentStep) {
    lines.push("### Current Step");
    lines.push(request.context.currentStep);
    lines.push("");
  }

  if (request.summary.whatWasAttempted.length > 0) {
    lines.push("### What Was Attempted");
    for (const action of request.summary.whatWasAttempted.slice(0, 10)) {
      lines.push(`- ${action}`);
    }
    lines.push("");
  }

  if (request.summary.whatFailed.length > 0) {
    lines.push("### What Failed");
    for (const failure of request.summary.whatFailed.slice(0, 5)) {
      lines.push(`- ${failure}`);
    }
    lines.push("");
  }

  if (request.summary.possibleCauses.length > 0) {
    lines.push("### Possible Causes");
    for (const cause of request.summary.possibleCauses) {
      lines.push(`- ${cause}`);
    }
    lines.push("");
  }

  if (request.summary.suggestedFixes.length > 0) {
    lines.push("### Suggested Actions");
    for (const fix of request.summary.suggestedFixes) {
      lines.push(`- ${fix}`);
    }
    lines.push("");
  }

  if (request.context.filesModified.length > 0) {
    lines.push("### Files Modified");
    for (const file of request.context.filesModified.slice(0, 10)) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
  }

  lines.push("### How to Respond");
  lines.push("Please reply to this comment with one of the following actions:");
  lines.push("- `continue` - Continue with the current approach");
  lines.push("- `retry` - Retry the failed operation");
  lines.push("- `abort` - Abort the current task");
  lines.push(
    "- `modify: <instructions>` - Modify the approach with specific instructions",
  );
  lines.push("");

  const expiresIn = Math.round((request.expiresAt - Date.now()) / 60000);
  lines.push(
    `> ⏰ This escalation will expire in approximately ${expiresIn} minutes if no response is received.`,
  );

  return lines.join("\n");
}

/**
 * Creates a tracker for an escalation request.
 *
 * @param request - The escalation request to track
 * @param timeoutMs - Timeout duration in milliseconds
 * @returns Escalation tracker
 */
export function createEscalationTracker(
  request: EscalationRequest,
  timeoutMs: number = DEFAULT_ESCALATION_TIMEOUT_MS,
): EscalationTracker {
  return {
    request,
    status: "pending",
    createdAt: Date.now(),
    timeoutMs,
  };
}

/**
 * Updates the status of an escalation tracker.
 *
 * @param tracker - The tracker to update
 * @param status - New status
 * @returns Updated tracker
 */
export function updateEscalationStatus(
  tracker: EscalationTracker,
  status: EscalationStatus,
): EscalationTracker {
  const updated = { ...tracker, status };

  if (status === "acknowledged" && !tracker.acknowledgedAt) {
    updated.acknowledgedAt = Date.now();
  }

  if (status === "resolved" && !tracker.resolvedAt) {
    updated.resolvedAt = Date.now();
  }

  return updated;
}

/**
 * Determines if an escalation has been resolved.
 *
 * @param tracker - The escalation tracker
 * @param humanResponse - Optional response from human
 * @returns Resolution status and action to take
 */
export function isEscalationResolved(
  tracker: EscalationTracker,
  humanResponse?: string,
): EscalationResolution {
  if (tracker.status === "expired") {
    return {
      resolved: false,
      action: "abort",
      instructions: "Escalation expired without response",
    };
  }

  if (tracker.status === "resolved") {
    return {
      resolved: true,
      action: "continue",
    };
  }

  if (Date.now() > tracker.request.expiresAt) {
    return {
      resolved: false,
      action: "abort",
      instructions: "Escalation timed out",
    };
  }

  if (!humanResponse) {
    return {
      resolved: false,
      action: "continue",
      instructions: "Waiting for human response",
    };
  }

  return parseHumanResponse(humanResponse);
}

/**
 * Parses a human response to determine the action to take.
 */
function parseHumanResponse(response: string): EscalationResolution {
  const normalizedResponse = response.trim().toLowerCase();

  if (normalizedResponse === "continue") {
    return {
      resolved: true,
      action: "continue",
      instructions: "Human approved continuing with current approach",
    };
  }

  if (normalizedResponse === "retry") {
    return {
      resolved: true,
      action: "retry",
      instructions: "Human requested retry of failed operation",
    };
  }

  if (normalizedResponse === "abort") {
    return {
      resolved: true,
      action: "abort",
      instructions: "Human requested task abort",
    };
  }

  if (normalizedResponse.startsWith("modify:")) {
    const instructions = response.slice(7).trim();
    return {
      resolved: true,
      action: "modify_approach",
      instructions: instructions || "Modify approach as directed",
      newContext: { humanInstructions: instructions },
    };
  }

  return {
    resolved: true,
    action: "modify_approach",
    instructions: response,
    newContext: { humanInstructions: response },
  };
}

/**
 * Checks if an escalation tracker has timed out.
 *
 * @param tracker - The escalation tracker to check
 * @returns True if the tracker has timed out
 */
export function hasEscalationTimedOut(tracker: EscalationTracker): boolean {
  return Date.now() > tracker.createdAt + tracker.timeoutMs;
}

/**
 * Gets the remaining time before an escalation expires.
 *
 * @param tracker - The escalation tracker
 * @returns Remaining time in milliseconds (0 if expired)
 */
export function getEscalationRemainingTime(tracker: EscalationTracker): number {
  const expiresAt = tracker.createdAt + tracker.timeoutMs;
  const remaining = expiresAt - Date.now();
  return Math.max(0, remaining);
}
