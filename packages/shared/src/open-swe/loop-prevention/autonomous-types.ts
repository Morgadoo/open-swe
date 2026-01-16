/**
 * Autonomous Operation Types
 *
 * Types and interfaces for autonomous operation capabilities including
 * checkpointing, metrics tracking, and long-term context preservation.
 */

/**
 * Execution checkpoint for state snapshots and recovery.
 */
export interface ExecutionCheckpoint {
  id: string;
  timestamp: number;
  actionIndex: number;
  stateSnapshot: {
    taskPlanSnapshot: string;
    branchName: string;
    completedActions: number;
    loopDetectionSnapshot: string;
  };
  gitCommitHash?: string;
  description: string;
}

/**
 * Metrics tracking autonomous operation health.
 */
export interface AutonomousOperationMetrics {
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  recoveredErrors: number;
  strategySwitches: number;
  humanEscalations: number;
  checkpointsCreated: number;
  startTime: number;
}

/**
 * Configurable limits for autonomous operations.
 */
export interface AutonomousOperationLimits {
  maxTotalActions: number;
  maxActionsPerTask: number;
  maxConsecutiveErrors: number;
  maxExecutionTimeMs: number;
  maxTokensPerSession: number;
  checkpointInterval: number;
}

/**
 * Default limits for autonomous operations.
 */
export const DEFAULT_AUTONOMOUS_LIMITS: AutonomousOperationLimits = {
  maxTotalActions: 500,
  maxActionsPerTask: 100,
  maxConsecutiveErrors: 10,
  maxExecutionTimeMs: 3600000, // 1 hour
  maxTokensPerSession: 500000,
  checkpointInterval: 25,
};

/**
 * Long-term context preserved across operations.
 */
export interface LongTermContext {
  keyInsights: string[];
  importantFiles: string[];
  learnedPatterns: string[];
  avoidedApproaches: string[];
}

/**
 * Default long-term context.
 */
export const DEFAULT_LONG_TERM_CONTEXT: LongTermContext = {
  keyInsights: [],
  importantFiles: [],
  learnedPatterns: [],
  avoidedApproaches: [],
};

/**
 * Default autonomous operation metrics.
 */
export const DEFAULT_AUTONOMOUS_METRICS: AutonomousOperationMetrics = {
  totalActions: 0,
  successfulActions: 0,
  failedActions: 0,
  recoveredErrors: 0,
  strategySwitches: 0,
  humanEscalations: 0,
  checkpointsCreated: 0,
  startTime: 0,
};
