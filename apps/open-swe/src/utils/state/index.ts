/**
 * State Management Module
 *
 * Provides utilities for managing agent state, including checkpointing
 * and state restoration capabilities.
 */

// Checkpoint Manager Types
export type {
  CheckpointableState,
  CheckpointMetadata,
  Checkpoint,
  FileCheckpoint,
  FileState,
  RestorationResult,
  ValidationResult,
  CheckpointDiff,
  StateChange,
  FileChange,
  CheckpointFilter,
  RetentionPolicy,
  RollbackPlan,
  RollbackAction,
} from "./checkpoint-manager.js";

// Checkpoint Manager Functions
export {
  createCheckpoint,
  restoreFromCheckpoint,
  validateCheckpoint,
  getCheckpointDiff,
  listCheckpoints,
  pruneCheckpoints,
  createFileCheckpoint,
  generateRollbackPlan,
  serializeCheckpoint,
  deserializeCheckpoint,
  createCheckpointWithFiles,
  findLatestCheckpoint,
  getCheckpointChain,
  hasFieldChanged,
  createInitialCheckpointableState,
  mergeCheckpointState,
} from "./checkpoint-manager.js";
