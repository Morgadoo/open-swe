/**
 * Loop Prevention Module
 * Provides utilities for detecting and preventing infinite loops in agent execution
 */

// Types
export type {
  ExecutionHistoryEntry,
  LoopDetectionConfig,
  LoopDetectionState,
  LoopPattern,
  LoopDetectionResult,
  ToolLoopConfig,
  DegradationLevelConfig,
  LoopPreventionConfig,
  CycleDetectionResult,
  BasicCycleDetectionResult,
} from "./types.js";

export {
  DegradationLevel,
  DEFAULT_LOOP_DETECTION_CONFIG,
  DEFAULT_LOOP_PREVENTION_CONFIG,
} from "./types.js";

// Config Manager types
export type {
  ToolCategory,
  EffectiveToolConfig,
  ConfigValidationError,
  ConfigValidationResult,
} from "./config-manager.js";

// Config Manager utilities
export {
  getToolCategory,
  validateConfig,
  parseLoopPreventionConfig,
  mergeConfigs,
  getEffectiveToolConfig,
  getConfigPreset,
  serializeConfig,
  createToolOverride,
  createCategoryOverride,
  isDefaultConfig,
  getAllToolCategories,
  getToolsInCategory,
} from "./config-manager.js";

// Execution History utilities
export {
  hashToolArgs,
  createExecutionEntry,
  addToHistory,
  getToolHistory,
  getIdenticalCallCount,
  getConsecutiveErrorCount,
  getToolErrorCounts,
  pruneHistory,
} from "./execution-history.js";

// Cycle Detection utilities
export {
  findExactMatches,
  detectPatternCycles,
  detectCycle,
  shouldEscalate,
  getToolConfig,
  detectExactRepeatCycle,
  detectErrorCycle,
  detectCycles,
  updateLoopDetectionState,
} from "./cycle-detector.js";

// Similarity Analysis types
export type {
  SimilarEntry,
  OscillationPattern,
  GradualChangePattern,
  SimilarityLoopResult,
  SimilarityCheckResult,
} from "./similarity-analyzer.js";

// Similarity Analysis utilities
export {
  normalizeArgs,
  calculateArgsSimilarity,
  findSimilarEntries,
  detectOscillationPattern,
  detectGradualChangePattern,
  detectSimilarityBasedLoop,
  checkForSimilarActions,
} from "./similarity-analyzer.js";

// History Tracker types
export type {
  HistorySummary,
  ToolFrequency,
  PauseRecommendation,
} from "./history-tracker.js";

// History Tracker utilities
export {
  recordToolExecution,
  createTrackedToolExecutor,
  getHistorySummary,
  getMostFrequentTools,
  getToolErrorRates,
  shouldPauseExecution,
  pruneExecutionHistory,
  createInitialState,
} from "./history-tracker.js";

// Degradation Manager types
export type {
  DegradationFactor,
  DegradationLevelResult,
  DegradationStrategy,
  ToolAllowedResult,
  ClarificationContext,
  ClarificationRequest,
  DegradationEffects,
} from "./degradation-manager.js";

// Degradation Manager utilities
export {
  calculateDegradationLevel,
  getDegradationStrategy,
  isToolAllowed,
  generateClarificationRequest,
  applyDegradation,
  shouldReduceDegradation,
  getDegradationDescription,
} from "./degradation-manager.js";

// Escalation Manager types
export type {
  EscalationPriority,
  EscalationTriggerType,
  EscalationTrigger,
  EscalationDecision,
  EscalationContext,
  IssueSummary,
  EscalationRequest,
  FallbackStrategy,
  EscalationStatus,
  EscalationTracker,
  EscalationResolution,
} from "./escalation-manager.js";

// Escalation Manager utilities
export {
  shouldEscalate as shouldEscalateToHuman,
  createEscalationRequest,
  generateIssueSummary,
  getFallbackStrategy,
  formatGitHubEscalation,
  createEscalationTracker,
  updateEscalationStatus,
  isEscalationResolved,
  hasEscalationTimedOut,
  getEscalationRemainingTime,
} from "./escalation-manager.js";

// Self-Healing types
export type {
  ErrorPattern,
  RecoveryAction,
  RecoveryStrategy,
  ErrorContext,
  RecoveryResult,
  HealthMetrics,
  HealthIssue,
  HealthStatus,
  PreventiveAction,
} from "./self-healing.js";

// Self-Healing utilities
export {
  registerRecoveryStrategy,
  unregisterRecoveryStrategy,
  getAllRecoveryStrategies,
  clearRecoveryStrategies,
  getRecoveryStrategies,
  isRecoverable,
  attemptRecovery,
  createInitialHealthMetrics,
  updateHealthMetrics,
  addErrorToMetrics,
  recordRecoveryAttempt,
  getHealthStatus,
  needsPreventiveAction,
  resetRecoveryAttempts,
  resetAllRecoveryAttempts,
  getRecoveryStatistics,
  registerBuiltInStrategies,
  FILE_NOT_FOUND_STRATEGY,
  PERMISSION_DENIED_STRATEGY,
  TIMEOUT_STRATEGY,
  SYNTAX_ERROR_STRATEGY,
  RATE_LIMIT_STRATEGY,
  CONNECTION_ERROR_STRATEGY,
} from "./self-healing.js";

// Integration Module types
export type {
  BeforeExecutionResult,
  ToolExecutionResult,
  AfterExecutionResult,
  RoutingDecision,
  ErrorHandlingResult,
  LoopPreventionStatus,
  GraphState,
  GraphConfiguration,
} from "./integration.js";

// Integration Module utilities
export {
  beforeToolExecution,
  afterToolExecution,
  determineNextAction,
  handleErrorWithRecovery,
  initializeLoopPreventionState,
  getLoopPreventionStatus,
  parseGraphConfig,
  createStateCheckpoint,
  restoreFromStateCheckpoint,
  createHumanEscalation,
} from "./integration.js";
