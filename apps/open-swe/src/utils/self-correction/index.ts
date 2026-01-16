/**
 * Self-Correction Module
 *
 * Provides proactive error prevention capabilities including pre-execution checks,
 * learned pattern matching, and suggestion generation to prevent errors before they occur.
 */

// Types
export type {
  PreExecutionContext,
  PreExecutionResult,
  PreExecutionWarning,
  PreExecutionBlocker,
  LearnedErrorPattern,
  ArgPattern,
  PatternMatchContext,
  PatternMatchResult,
  PreventionSuggestion,
  ArgumentValidationResult,
  ArgumentError,
  ArgumentWarning,
  PrerequisiteContext,
  PrerequisiteCheckResult,
  Prerequisite,
  ActionResult,
  LearningContext,
  RiskContext,
  RiskAssessment,
  RiskFactor,
} from "./proactive-prevention.js";

// Functions
export {
  performPreExecutionChecks,
  registerErrorPattern,
  matchErrorPatterns,
  generatePreventionSuggestions,
  validateToolArguments,
  checkPrerequisites,
  learnFromAction,
  assessActionRisk,
  getErrorPatterns,
  clearErrorPatterns,
} from "./proactive-prevention.js";
