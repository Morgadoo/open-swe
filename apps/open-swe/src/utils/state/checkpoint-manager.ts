/**
 * Checkpoint Manager
 *
 * Provides functionality for creating, validating, and restoring checkpoints
 * of agent state. Enables recovery from errors and rollback of changes.
 */

import { createHash, randomBytes } from "crypto";
import type { LoopDetectionState } from "../loop-prevention/types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * State that can be captured in a checkpoint.
 */
export interface CheckpointableState {
  /** Loop detection state from the loop-prevention module */
  loopDetectionState: LoopDetectionState;
  /** Current task being executed */
  currentTask?: string;
  /** Current step within the task */
  currentStep?: string;
  /** Progress through the plan (0-100) */
  planProgress?: number;
  /** List of files modified during execution */
  modifiedFiles?: string[];
  /** Custom data for extensibility */
  customData?: Record<string, unknown>;
}

/**
 * Metadata describing why and how a checkpoint was created.
 */
export interface CheckpointMetadata {
  /** Reason for creating the checkpoint */
  reason:
    | "manual"
    | "auto"
    | "before_risky_action"
    | "milestone"
    | "error_recovery";
  /** Human-readable description */
  description: string;
  /** Tags for categorization and filtering */
  tags?: string[];
  /** Priority level for retention decisions */
  priority?: "low" | "normal" | "high";
}

/**
 * A complete checkpoint containing state and metadata.
 */
export interface Checkpoint {
  /** Unique identifier for this checkpoint */
  id: string;
  /** Timestamp when the checkpoint was created */
  timestamp: number;
  /** Captured state */
  state: CheckpointableState;
  /** Metadata about the checkpoint */
  metadata: CheckpointMetadata;
  /** Hash for integrity verification */
  hash: string;
  /** ID of the parent checkpoint (for checkpoint chains) */
  parentId?: string;
  /** File state checkpoint for git-based rollback */
  fileCheckpoint?: FileCheckpoint;
}

/**
 * Captures the state of files at a checkpoint.
 */
export interface FileCheckpoint {
  /** Individual file states */
  files: FileState[];
  /** Git commit hash if available */
  gitCommit?: string;
  /** Working directory path */
  workingDirectory: string;
}

/**
 * State of a single file at checkpoint time.
 */
export interface FileState {
  /** File path relative to working directory */
  path: string;
  /** Hash of file contents */
  hash: string;
  /** Status of the file */
  status: "created" | "modified" | "deleted";
  /** Original content for rollback (optional, for small files) */
  originalContent?: string;
}

/**
 * Result of attempting to restore from a checkpoint.
 */
export interface RestorationResult {
  /** Whether restoration succeeded */
  success: boolean;
  /** Restored state if successful */
  restoredState: CheckpointableState | null;
  /** Non-fatal issues encountered */
  warnings: string[];
  /** Fatal errors that prevented restoration */
  errors: string[];
  /** Actions needed to complete rollback */
  rollbackActions?: RollbackAction[];
}

/**
 * Result of validating a checkpoint.
 */
export interface ValidationResult {
  /** Whether the checkpoint is valid */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
}

/**
 * Differences between a checkpoint and current state.
 */
export interface CheckpointDiff {
  /** Changes to state fields */
  stateChanges: StateChange[];
  /** Changes to files */
  fileChanges: FileChange[];
  /** Human-readable summary */
  summary: string;
}

/**
 * A single state field change.
 */
export interface StateChange {
  /** Field path (dot notation for nested) */
  field: string;
  /** Value at checkpoint time */
  oldValue: unknown;
  /** Current value */
  newValue: unknown;
}

/**
 * A single file change.
 */
export interface FileChange {
  /** File path */
  path: string;
  /** Type of change */
  type: "created" | "modified" | "deleted";
  /** Lines added (if available) */
  linesAdded?: number;
  /** Lines removed (if available) */
  linesRemoved?: number;
}

/**
 * Filter criteria for listing checkpoints.
 */
export interface CheckpointFilter {
  /** Filter by creation reason */
  reason?: CheckpointMetadata["reason"];
  /** Filter by tags (any match) */
  tags?: string[];
  /** Filter by minimum timestamp */
  afterTimestamp?: number;
  /** Filter by maximum timestamp */
  beforeTimestamp?: number;
}

/**
 * Policy for pruning old checkpoints.
 */
export interface RetentionPolicy {
  /** Maximum number of checkpoints to keep */
  maxCheckpoints: number;
  /** Maximum age in milliseconds */
  maxAgeMs: number;
  /** Whether to keep milestone checkpoints regardless of age */
  keepMilestones: boolean;
  /** Whether to keep high-priority checkpoints regardless of age */
  keepHighPriority: boolean;
}

/**
 * Plan for rolling back to a checkpoint.
 */
export interface RollbackPlan {
  /** Ordered steps to execute */
  steps: RollbackAction[];
  /** Estimated time to complete in milliseconds */
  estimatedDuration: number;
  /** Potential risks of the rollback */
  risks: string[];
  /** Whether the rollback can be executed automatically */
  canAutoExecute: boolean;
}

/**
 * A single action in a rollback plan.
 */
export interface RollbackAction {
  /** Type of action */
  type: "restore_state" | "restore_file" | "run_command" | "notify";
  /** Human-readable description */
  description: string;
  /** Target of the action (file path, state field, etc.) */
  target?: string;
  /** Additional data for the action */
  data?: unknown;
}

// ============================================================================
// Constants
// ============================================================================

/** Default retention policy */
const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  maxCheckpoints: 50,
  maxAgeMs: 24 * 60 * 60 * 1000, // 24 hours
  keepMilestones: true,
  keepHighPriority: true,
};

/** Estimated time per rollback action type in milliseconds */
const ACTION_DURATION_ESTIMATES: Record<RollbackAction["type"], number> = {
  restore_state: 10,
  restore_file: 100,
  run_command: 1000,
  notify: 50,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generates a unique checkpoint ID.
 * @returns A unique identifier string
 */
function generateCheckpointId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString("hex");
  return `chk_${timestamp}_${random}`;
}

/**
 * Computes a hash of the checkpoint state for integrity verification.
 * @param state - The state to hash
 * @returns SHA-256 hash of the state
 */
function computeStateHash(state: CheckpointableState): string {
  const normalized = JSON.stringify(state, Object.keys(state).sort());
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Computes a hash of file contents.
 * @param content - File content to hash
 * @returns SHA-256 hash of the content
 */
function computeFileHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").substring(0, 16);
}

/**
 * Deep compares two values for equality.
 * @param a - First value
 * @param b - Second value
 * @returns Whether the values are deeply equal
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
}

/**
 * Gets a nested value from an object using dot notation.
 * @param obj - Object to traverse
 * @param path - Dot-notation path
 * @returns The value at the path, or undefined
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Compares two states and returns the differences.
 * @param oldState - Previous state
 * @param newState - Current state
 * @param prefix - Path prefix for nested fields
 * @returns Array of state changes
 */
function compareStates(
  oldState: unknown,
  newState: unknown,
  prefix = "",
): StateChange[] {
  const changes: StateChange[] = [];

  if (typeof oldState !== "object" || typeof newState !== "object") {
    if (!deepEqual(oldState, newState)) {
      changes.push({
        field: prefix || "root",
        oldValue: oldState,
        newValue: newState,
      });
    }
    return changes;
  }

  if (oldState === null || newState === null) {
    if (oldState !== newState) {
      changes.push({
        field: prefix || "root",
        oldValue: oldState,
        newValue: newState,
      });
    }
    return changes;
  }

  const oldObj = oldState as Record<string, unknown>;
  const newObj = newState as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    const oldValue = oldObj[key];
    const newValue = newObj[key];

    if (!(key in oldObj)) {
      changes.push({ field: fieldPath, oldValue: undefined, newValue });
    } else if (!(key in newObj)) {
      changes.push({ field: fieldPath, oldValue, newValue: undefined });
    } else if (!deepEqual(oldValue, newValue)) {
      if (
        typeof oldValue === "object" &&
        typeof newValue === "object" &&
        oldValue !== null &&
        newValue !== null &&
        !Array.isArray(oldValue) &&
        !Array.isArray(newValue)
      ) {
        changes.push(...compareStates(oldValue, newValue, fieldPath));
      } else {
        changes.push({ field: fieldPath, oldValue, newValue });
      }
    }
  }

  return changes;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Creates a new checkpoint from the current state.
 *
 * @param state - The current state to checkpoint
 * @param metadata - Metadata describing the checkpoint
 * @param parentId - Optional ID of the parent checkpoint
 * @returns A new Checkpoint object
 *
 * @example
 * ```typescript
 * const checkpoint = createCheckpoint(
 *   currentState,
 *   { reason: 'milestone', description: 'Completed phase 1' }
 * );
 * ```
 */
export function createCheckpoint(
  state: CheckpointableState,
  metadata: CheckpointMetadata,
  parentId?: string,
): Checkpoint {
  const id = generateCheckpointId();
  const timestamp = Date.now();
  const hash = computeStateHash(state);

  const checkpoint: Checkpoint = {
    id,
    timestamp,
    state: structuredClone(state),
    metadata: {
      ...metadata,
      priority: metadata.priority ?? "normal",
    },
    hash,
  };

  if (parentId) {
    checkpoint.parentId = parentId;
  }

  return checkpoint;
}

/**
 * Restores state from a checkpoint.
 *
 * @param checkpoint - The checkpoint to restore from
 * @param currentState - The current state (for comparison)
 * @returns Result of the restoration attempt
 *
 * @example
 * ```typescript
 * const result = restoreFromCheckpoint(checkpoint, currentState);
 * if (result.success) {
 *   applyState(result.restoredState);
 * }
 * ```
 */
export function restoreFromCheckpoint(
  checkpoint: Checkpoint,
  currentState: CheckpointableState,
): RestorationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const rollbackActions: RollbackAction[] = [];

  // Validate checkpoint first
  const validation = validateCheckpoint(checkpoint);
  if (!validation.valid) {
    return {
      success: false,
      restoredState: null,
      warnings: validation.warnings,
      errors: validation.errors,
      rollbackActions: [],
    };
  }

  warnings.push(...validation.warnings);

  // Check for file changes that need rollback
  if (checkpoint.fileCheckpoint && currentState.modifiedFiles) {
    const currentFiles = new Set(currentState.modifiedFiles);
    const checkpointFiles = new Set(
      checkpoint.fileCheckpoint.files.map((f) => f.path),
    );

    // Files modified after checkpoint
    for (const file of currentFiles) {
      if (!checkpointFiles.has(file)) {
        rollbackActions.push({
          type: "restore_file",
          description: `Revert changes to ${file}`,
          target: file,
        });
      }
    }

    // Files from checkpoint that may need restoration
    for (const fileState of checkpoint.fileCheckpoint.files) {
      if (fileState.status === "created") {
        rollbackActions.push({
          type: "restore_file",
          description: `Remove file created after checkpoint: ${fileState.path}`,
          target: fileState.path,
          data: { action: "delete" },
        });
      } else if (fileState.status === "modified" && fileState.originalContent) {
        rollbackActions.push({
          type: "restore_file",
          description: `Restore original content of ${fileState.path}`,
          target: fileState.path,
          data: { content: fileState.originalContent },
        });
      }
    }
  }

  // Add state restoration action
  rollbackActions.unshift({
    type: "restore_state",
    description: "Restore agent state from checkpoint",
    data: checkpoint.state,
  });

  // Clone the state to avoid mutations
  const restoredState = structuredClone(checkpoint.state);

  return {
    success: true,
    restoredState,
    warnings,
    errors,
    rollbackActions,
  };
}

/**
 * Validates a checkpoint's integrity.
 *
 * @param checkpoint - The checkpoint to validate
 * @returns Validation result with any errors or warnings
 *
 * @example
 * ```typescript
 * const result = validateCheckpoint(checkpoint);
 * if (!result.valid) {
 *   console.error('Invalid checkpoint:', result.errors);
 * }
 * ```
 */
export function validateCheckpoint(checkpoint: Checkpoint): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!checkpoint.id) {
    errors.push("Checkpoint missing required field: id");
  }

  if (!checkpoint.timestamp || typeof checkpoint.timestamp !== "number") {
    errors.push("Checkpoint missing or invalid timestamp");
  }

  if (!checkpoint.state) {
    errors.push("Checkpoint missing required field: state");
  }

  if (!checkpoint.metadata) {
    errors.push("Checkpoint missing required field: metadata");
  }

  if (!checkpoint.hash) {
    errors.push("Checkpoint missing required field: hash");
  }

  // Verify hash integrity
  if (checkpoint.state && checkpoint.hash) {
    const computedHash = computeStateHash(checkpoint.state);
    if (computedHash !== checkpoint.hash) {
      errors.push("Checkpoint hash mismatch - state may have been corrupted");
    }
  }

  // Check for stale checkpoint
  if (checkpoint.timestamp) {
    const age = Date.now() - checkpoint.timestamp;
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    if (age > oneDay) {
      warnings.push(
        `Checkpoint is ${Math.floor(age / oneHour)} hours old - state may be significantly outdated`,
      );
    }
  }

  // Validate metadata
  if (checkpoint.metadata) {
    const validReasons = [
      "manual",
      "auto",
      "before_risky_action",
      "milestone",
      "error_recovery",
    ];
    if (!validReasons.includes(checkpoint.metadata.reason)) {
      warnings.push(`Unknown checkpoint reason: ${checkpoint.metadata.reason}`);
    }
  }

  // Validate file checkpoint if present
  if (checkpoint.fileCheckpoint) {
    if (!checkpoint.fileCheckpoint.workingDirectory) {
      warnings.push("File checkpoint missing working directory");
    }

    for (const file of checkpoint.fileCheckpoint.files) {
      if (!file.path) {
        errors.push("File state missing path");
      }
      if (!file.hash) {
        warnings.push(`File ${file.path} missing hash`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Gets the differences between a checkpoint and current state.
 *
 * @param checkpoint - The checkpoint to compare against
 * @param currentState - The current state
 * @returns Diff object describing all changes
 *
 * @example
 * ```typescript
 * const diff = getCheckpointDiff(checkpoint, currentState);
 * console.log(`Changes since checkpoint: ${diff.summary}`);
 * ```
 */
export function getCheckpointDiff(
  checkpoint: Checkpoint,
  currentState: CheckpointableState,
): CheckpointDiff {
  const stateChanges = compareStates(checkpoint.state, currentState);

  const fileChanges: FileChange[] = [];

  // Compare file states if available
  if (checkpoint.fileCheckpoint && currentState.modifiedFiles) {
    const checkpointFiles = new Map(
      checkpoint.fileCheckpoint.files.map((f) => [f.path, f]),
    );
    const currentFiles = new Set(currentState.modifiedFiles);

    // Files in current but not in checkpoint (new files)
    for (const file of currentFiles) {
      if (!checkpointFiles.has(file)) {
        fileChanges.push({ path: file, type: "created" });
      }
    }

    // Files in checkpoint
    for (const [path, fileState] of checkpointFiles) {
      if (!currentFiles.has(path)) {
        if (fileState.status === "created") {
          // File was created at checkpoint but no longer tracked
          fileChanges.push({ path, type: "deleted" });
        }
      } else {
        // File exists in both - mark as potentially modified
        fileChanges.push({ path, type: "modified" });
      }
    }
  }

  // Generate summary
  const summaryParts: string[] = [];
  if (stateChanges.length > 0) {
    summaryParts.push(`${stateChanges.length} state field(s) changed`);
  }
  if (fileChanges.length > 0) {
    const created = fileChanges.filter((f) => f.type === "created").length;
    const modified = fileChanges.filter((f) => f.type === "modified").length;
    const deleted = fileChanges.filter((f) => f.type === "deleted").length;
    const parts: string[] = [];
    if (created > 0) parts.push(`${created} created`);
    if (modified > 0) parts.push(`${modified} modified`);
    if (deleted > 0) parts.push(`${deleted} deleted`);
    summaryParts.push(`Files: ${parts.join(", ")}`);
  }

  const summary =
    summaryParts.length > 0
      ? summaryParts.join("; ")
      : "No changes since checkpoint";

  return {
    stateChanges,
    fileChanges,
    summary,
  };
}

/**
 * Lists checkpoints matching the given filter criteria.
 *
 * @param checkpoints - Array of checkpoints to filter
 * @param filter - Optional filter criteria
 * @returns Filtered array of checkpoints, sorted by timestamp descending
 *
 * @example
 * ```typescript
 * const milestones = listCheckpoints(allCheckpoints, { reason: 'milestone' });
 * ```
 */
export function listCheckpoints(
  checkpoints: Checkpoint[],
  filter?: CheckpointFilter,
): Checkpoint[] {
  let result = [...checkpoints];

  if (filter) {
    if (filter.reason) {
      result = result.filter((c) => c.metadata.reason === filter.reason);
    }

    if (filter.tags && filter.tags.length > 0) {
      const filterTags = new Set(filter.tags);
      result = result.filter((c) =>
        c.metadata.tags?.some((t) => filterTags.has(t)),
      );
    }

    if (filter.afterTimestamp !== undefined) {
      result = result.filter((c) => c.timestamp >= filter.afterTimestamp!);
    }

    if (filter.beforeTimestamp !== undefined) {
      result = result.filter((c) => c.timestamp <= filter.beforeTimestamp!);
    }
  }

  // Sort by timestamp descending (newest first)
  return result.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Prunes old checkpoints based on a retention policy.
 *
 * @param checkpoints - Array of checkpoints to prune
 * @param policy - Retention policy to apply
 * @returns Array of checkpoints that should be kept
 *
 * @example
 * ```typescript
 * const retained = pruneCheckpoints(allCheckpoints, {
 *   maxCheckpoints: 20,
 *   maxAgeMs: 12 * 60 * 60 * 1000, // 12 hours
 *   keepMilestones: true,
 *   keepHighPriority: true
 * });
 * ```
 */
export function pruneCheckpoints(
  checkpoints: Checkpoint[],
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): Checkpoint[] {
  const now = Date.now();
  const cutoffTime = now - policy.maxAgeMs;

  // Separate protected and pruneable checkpoints
  const protected_: Checkpoint[] = [];
  const pruneable: Checkpoint[] = [];

  for (const checkpoint of checkpoints) {
    const isProtected =
      (policy.keepMilestones && checkpoint.metadata.reason === "milestone") ||
      (policy.keepHighPriority && checkpoint.metadata.priority === "high");

    if (isProtected) {
      protected_.push(checkpoint);
    } else {
      pruneable.push(checkpoint);
    }
  }

  // Filter pruneable by age
  const withinAge = pruneable.filter((c) => c.timestamp >= cutoffTime);

  // Sort by timestamp descending and take up to maxCheckpoints
  const sorted = withinAge.sort((a, b) => b.timestamp - a.timestamp);
  const remaining = policy.maxCheckpoints - protected_.length;
  const kept = sorted.slice(0, Math.max(0, remaining));

  // Combine protected and kept checkpoints
  return [...protected_, ...kept].sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Creates a file checkpoint for tracking file state.
 *
 * @param modifiedFiles - List of modified file paths
 * @param workingDirectory - Working directory path
 * @param fileContents - Optional map of file paths to their contents
 * @returns FileCheckpoint object
 *
 * @example
 * ```typescript
 * const fileCheckpoint = createFileCheckpoint(
 *   ['src/index.ts', 'package.json'],
 *   '/workspace/project',
 *   { 'src/index.ts': 'export const x = 1;' }
 * );
 * ```
 */
export function createFileCheckpoint(
  modifiedFiles: string[],
  workingDirectory: string,
  fileContents?: Record<string, string>,
): FileCheckpoint {
  const files: FileState[] = modifiedFiles.map((path) => {
    const content = fileContents?.[path];
    const fileState: FileState = {
      path,
      hash: content ? computeFileHash(content) : "",
      status: "modified",
    };

    // Store original content for small files (< 10KB)
    if (content && content.length < 10240) {
      fileState.originalContent = content;
    }

    return fileState;
  });

  return {
    files,
    workingDirectory,
  };
}

/**
 * Generates a rollback plan from a checkpoint.
 *
 * @param checkpoint - The checkpoint to roll back to
 * @param currentState - The current state
 * @returns A plan describing how to roll back
 *
 * @example
 * ```typescript
 * const plan = generateRollbackPlan(checkpoint, currentState);
 * if (plan.canAutoExecute) {
 *   executeRollback(plan);
 * }
 * ```
 */
export function generateRollbackPlan(
  checkpoint: Checkpoint,
  currentState: CheckpointableState,
): RollbackPlan {
  const steps: RollbackAction[] = [];
  const risks: string[] = [];
  let canAutoExecute = true;

  // Get the diff to understand what needs to be rolled back
  const diff = getCheckpointDiff(checkpoint, currentState);

  // State restoration step
  if (diff.stateChanges.length > 0) {
    steps.push({
      type: "restore_state",
      description: `Restore ${diff.stateChanges.length} state field(s) to checkpoint values`,
      data: { changes: diff.stateChanges },
    });
  }

  // File restoration steps
  for (const fileChange of diff.fileChanges) {
    if (fileChange.type === "created") {
      // File was created after checkpoint - may need to delete
      steps.push({
        type: "restore_file",
        description: `Consider removing file created after checkpoint: ${fileChange.path}`,
        target: fileChange.path,
        data: { action: "review_delete" },
      });
      risks.push(
        `Deleting ${fileChange.path} may cause issues if other code depends on it`,
      );
      canAutoExecute = false;
    } else if (fileChange.type === "modified") {
      const checkpointFile = checkpoint.fileCheckpoint?.files.find(
        (f) => f.path === fileChange.path,
      );

      if (checkpointFile?.originalContent) {
        steps.push({
          type: "restore_file",
          description: `Restore ${fileChange.path} to checkpoint state`,
          target: fileChange.path,
          data: { content: checkpointFile.originalContent },
        });
      } else {
        steps.push({
          type: "run_command",
          description: `Manually restore ${fileChange.path} (no original content stored)`,
          target: fileChange.path,
        });
        risks.push(
          `Cannot auto-restore ${fileChange.path} - original content not available`,
        );
        canAutoExecute = false;
      }
    } else if (fileChange.type === "deleted") {
      const checkpointFile = checkpoint.fileCheckpoint?.files.find(
        (f) => f.path === fileChange.path,
      );

      if (checkpointFile?.originalContent) {
        steps.push({
          type: "restore_file",
          description: `Recreate deleted file: ${fileChange.path}`,
          target: fileChange.path,
          data: { content: checkpointFile.originalContent, action: "create" },
        });
      } else {
        steps.push({
          type: "run_command",
          description: `Manually recreate ${fileChange.path} (no original content stored)`,
          target: fileChange.path,
        });
        risks.push(
          `Cannot auto-recreate ${fileChange.path} - original content not available`,
        );
        canAutoExecute = false;
      }
    }
  }

  // Add notification step
  steps.push({
    type: "notify",
    description: "Rollback completed - verify system state",
  });

  // Calculate estimated duration
  const estimatedDuration = steps.reduce(
    (total, step) => total + ACTION_DURATION_ESTIMATES[step.type],
    0,
  );

  // Add general risks
  if (checkpoint.timestamp < Date.now() - 60 * 60 * 1000) {
    risks.push(
      "Checkpoint is over an hour old - significant changes may have occurred",
    );
  }

  if (diff.fileChanges.length > 5) {
    risks.push(
      `Rolling back ${diff.fileChanges.length} files - review changes carefully`,
    );
  }

  return {
    steps,
    estimatedDuration,
    risks,
    canAutoExecute,
  };
}

/**
 * Serializes a checkpoint to a JSON string for storage.
 *
 * @param checkpoint - The checkpoint to serialize
 * @returns JSON string representation
 *
 * @example
 * ```typescript
 * const json = serializeCheckpoint(checkpoint);
 * await fs.writeFile('checkpoint.json', json);
 * ```
 */
export function serializeCheckpoint(checkpoint: Checkpoint): string {
  return JSON.stringify(checkpoint, null, 2);
}

/**
 * Deserializes a checkpoint from a JSON string.
 *
 * @param data - JSON string to parse
 * @returns Checkpoint object or null if parsing fails
 *
 * @example
 * ```typescript
 * const json = await fs.readFile('checkpoint.json', 'utf-8');
 * const checkpoint = deserializeCheckpoint(json);
 * if (checkpoint) {
 *   const validation = validateCheckpoint(checkpoint);
 * }
 * ```
 */
export function deserializeCheckpoint(data: string): Checkpoint | null {
  try {
    const parsed = JSON.parse(data) as Checkpoint;

    // Basic structure validation
    if (
      !parsed.id ||
      !parsed.timestamp ||
      !parsed.state ||
      !parsed.metadata ||
      !parsed.hash
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

// ============================================================================
// Additional Utility Functions
// ============================================================================

/**
 * Creates a checkpoint with file state included.
 *
 * @param state - The current state to checkpoint
 * @param metadata - Metadata describing the checkpoint
 * @param workingDirectory - Working directory for file tracking
 * @param fileContents - Optional map of file paths to contents
 * @param parentId - Optional parent checkpoint ID
 * @returns A checkpoint with file state
 */
export function createCheckpointWithFiles(
  state: CheckpointableState,
  metadata: CheckpointMetadata,
  workingDirectory: string,
  fileContents?: Record<string, string>,
  parentId?: string,
): Checkpoint {
  const checkpoint = createCheckpoint(state, metadata, parentId);

  if (state.modifiedFiles && state.modifiedFiles.length > 0) {
    checkpoint.fileCheckpoint = createFileCheckpoint(
      state.modifiedFiles,
      workingDirectory,
      fileContents,
    );
  }

  return checkpoint;
}

/**
 * Finds the most recent checkpoint matching criteria.
 *
 * @param checkpoints - Array of checkpoints to search
 * @param filter - Optional filter criteria
 * @returns The most recent matching checkpoint or undefined
 */
export function findLatestCheckpoint(
  checkpoints: Checkpoint[],
  filter?: CheckpointFilter,
): Checkpoint | undefined {
  const filtered = listCheckpoints(checkpoints, filter);
  return filtered[0];
}

/**
 * Gets the checkpoint chain (ancestry) for a checkpoint.
 *
 * @param checkpoint - The checkpoint to get ancestry for
 * @param allCheckpoints - All available checkpoints
 * @returns Array of checkpoints from oldest ancestor to the given checkpoint
 */
export function getCheckpointChain(
  checkpoint: Checkpoint,
  allCheckpoints: Checkpoint[],
): Checkpoint[] {
  const chain: Checkpoint[] = [checkpoint];
  const checkpointMap = new Map(allCheckpoints.map((c) => [c.id, c]));

  let current = checkpoint;
  while (current.parentId) {
    const parent = checkpointMap.get(current.parentId);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }

  return chain;
}

/**
 * Checks if a state field has changed since a checkpoint.
 *
 * @param checkpoint - The checkpoint to compare against
 * @param currentState - The current state
 * @param fieldPath - Dot-notation path to the field
 * @returns Whether the field has changed
 */
export function hasFieldChanged(
  checkpoint: Checkpoint,
  currentState: CheckpointableState,
  fieldPath: string,
): boolean {
  const oldValue = getNestedValue(checkpoint.state, fieldPath);
  const newValue = getNestedValue(currentState, fieldPath);
  return !deepEqual(oldValue, newValue);
}

/**
 * Creates an initial empty checkpointable state.
 *
 * @returns A new CheckpointableState with default values
 */
export function createInitialCheckpointableState(): CheckpointableState {
  return {
    loopDetectionState: {
      executionHistory: [],
      consecutiveErrorCount: 0,
      toolSpecificErrorCounts: {},
      similarActionCount: 0,
      lastStrategySwitch: 0,
      degradationLevel: 0,
    },
    modifiedFiles: [],
    customData: {},
  };
}

/**
 * Merges checkpoint state with current state, preferring checkpoint values.
 *
 * @param checkpointState - State from the checkpoint
 * @param currentState - Current state
 * @param fieldsToPreserve - Fields to keep from current state
 * @returns Merged state
 */
export function mergeCheckpointState(
  checkpointState: CheckpointableState,
  currentState: CheckpointableState,
  fieldsToPreserve: string[] = [],
): CheckpointableState {
  const merged = structuredClone(checkpointState);

  for (const field of fieldsToPreserve) {
    const currentValue = getNestedValue(currentState, field);
    if (currentValue !== undefined) {
      // Set the preserved field value
      const parts = field.split(".");
      let target: Record<string, unknown> = merged as unknown as Record<
        string,
        unknown
      >;

      for (let i = 0; i < parts.length - 1; i++) {
        if (!(parts[i] in target)) {
          target[parts[i]] = {};
        }
        target = target[parts[i]] as Record<string, unknown>;
      }

      target[parts[parts.length - 1]] = currentValue;
    }
  }

  return merged;
}
