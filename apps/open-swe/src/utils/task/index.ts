/**
 * Task Module
 *
 * Exports task decomposition functionality for analyzing complexity,
 * breaking down complex tasks, and tracking subtask progress.
 */

export {
  // Core functions
  analyzeTaskComplexity,
  shouldDecomposeTask,
  decomposeTask,
  generateDecompositionPrompt,
  parseDecompositionResponse,
  validateDecomposition,
  trackSubtaskProgress,
  mergeSubtaskResults,
  estimateTotalEffort,
  identifyDependencies,
  // Utility functions
  createTaskDescription,
  getDefaultDecompositionConfig,
  updateSubtaskStatus,
  getReadySubtasks,
  isDecompositionComplete,
  // Types
  type TaskDescription,
  type ComplexityAnalysis,
  type ComplexityFactor,
  type DecompositionConfig,
  type TaskDecomposition,
  type SubTask,
  type SubTaskResult,
  type EffortEstimate,
  type DependencyGraph,
  type DependencyEdge,
  type DecompositionContext,
  type ProgressReport,
  type MergedResult,
  type ValidationResult,
} from "./task-decomposition.js";
