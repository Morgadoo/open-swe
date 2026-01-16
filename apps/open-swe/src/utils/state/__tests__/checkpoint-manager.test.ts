/**
 * Tests for checkpoint-manager module
 */

import {
  createCheckpoint,
  restoreFromCheckpoint,
  validateCheckpoint,
  getCheckpointDiff,
  listCheckpoints,
  pruneCheckpoints,
  generateRollbackPlan,
  serializeCheckpoint,
  deserializeCheckpoint,
  createInitialCheckpointableState,
  mergeCheckpointState,
} from "../checkpoint-manager.js";
import type {
  CheckpointableState,
  CheckpointMetadata,
} from "../checkpoint-manager.js";

describe("CheckpointManager", () => {
  const initialState: CheckpointableState = createInitialCheckpointableState();
  const metadata: CheckpointMetadata = {
    reason: "milestone",
    description: "Test checkpoint",
    priority: "normal",
  };

  describe("createCheckpoint", () => {
    it("should create a valid checkpoint", () => {
      const checkpoint = createCheckpoint(initialState, metadata);

      expect(checkpoint.id).toMatch(/^chk_/);
      expect(checkpoint.timestamp).toBeLessThanOrEqual(Date.now());
      expect(checkpoint.state).toEqual(initialState);
      expect(checkpoint.metadata).toEqual(metadata);
      expect(checkpoint.hash).toBeDefined();
    });

    it("should handle parent ID", () => {
      const checkpoint = createCheckpoint(initialState, metadata, "parent-id");
      expect(checkpoint.parentId).toBe("parent-id");
    });
  });

  describe("restoreFromCheckpoint", () => {
    it("should restore state from a valid checkpoint", () => {
      const checkpoint = createCheckpoint(initialState, metadata);
      const result = restoreFromCheckpoint(checkpoint, initialState);

      expect(result.success).toBe(true);
      expect(result.restoredState).toEqual(initialState);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail restoration for corrupted checkpoint", () => {
      const checkpoint = createCheckpoint(initialState, metadata);
      checkpoint.hash = "wrong-hash";

      const result = restoreFromCheckpoint(checkpoint, initialState);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("hash mismatch"))).toBe(true);
    });
  });

  describe("validateCheckpoint", () => {
    it("should return valid for a correct checkpoint", () => {
      const checkpoint = createCheckpoint(initialState, metadata);
      const result = validateCheckpoint(checkpoint);
      expect(result.valid).toBe(true);
    });

    it("should detect missing fields", () => {
      const checkpoint = createCheckpoint(initialState, metadata);
      delete (checkpoint as any).id;
      const result = validateCheckpoint(checkpoint);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Checkpoint missing required field: id");
    });
  });

  describe("getCheckpointDiff", () => {
    it("should detect state changes", () => {
      const checkpoint = createCheckpoint(initialState, metadata);
      const currentState: CheckpointableState = {
        ...initialState,
        currentTask: "New task",
      };

      const diff = getCheckpointDiff(checkpoint, currentState);

      expect(diff.stateChanges).toHaveLength(1);
      expect(diff.stateChanges[0].field).toBe("currentTask");
      expect(diff.stateChanges[0].newValue).toBe("New task");
    });

    it("should detect file changes", () => {
      const stateWithFiles: CheckpointableState = {
        ...initialState,
        modifiedFiles: ["file1.ts"],
      };
      const checkpoint = createCheckpoint(stateWithFiles, metadata);
      checkpoint.fileCheckpoint = {
        files: [{ path: "file1.ts", hash: "h1", status: "modified" }],
        workingDirectory: "/tmp",
      };

      const currentState: CheckpointableState = {
        ...stateWithFiles,
        modifiedFiles: ["file1.ts", "file2.ts"],
      };

      const diff = getCheckpointDiff(checkpoint, currentState);

      expect(
        diff.fileChanges.some(
          (f) => f.path === "file2.ts" && f.type === "created",
        ),
      ).toBe(true);
    });
  });

  describe("listCheckpoints", () => {
    it("should filter checkpoints by reason", () => {
      const c1 = createCheckpoint(initialState, {
        ...metadata,
        reason: "milestone",
      });
      const c2 = createCheckpoint(initialState, {
        ...metadata,
        reason: "manual",
      });

      const filtered = listCheckpoints([c1, c2], { reason: "milestone" });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(c1.id);
    });
  });

  describe("pruneCheckpoints", () => {
    it("should respect maxCheckpoints limit", () => {
      const checkpoints = [];
      for (let i = 0; i < 10; i++) {
        checkpoints.push(
          createCheckpoint(initialState, { ...metadata, reason: "auto" }),
        );
      }

      const pruned = pruneCheckpoints(checkpoints, {
        maxCheckpoints: 5,
        maxAgeMs: 1000000,
        keepMilestones: false,
        keepHighPriority: false,
      });

      expect(pruned).toHaveLength(5);
    });

    it("should keep milestones if configured", () => {
      const c1 = createCheckpoint(initialState, {
        ...metadata,
        reason: "milestone",
      });
      const c2 = createCheckpoint(initialState, {
        ...metadata,
        reason: "auto",
      });

      const pruned = pruneCheckpoints([c1, c2], {
        maxCheckpoints: 1,
        maxAgeMs: 1000000,
        keepMilestones: true,
        keepHighPriority: false,
      });

      expect(pruned).toContain(c1);
    });
  });

  describe("generateRollbackPlan", () => {
    it("should generate plan for state changes", () => {
      const checkpoint = createCheckpoint(initialState, metadata);
      const currentState = { ...initialState, currentTask: "Changed" };

      const plan = generateRollbackPlan(checkpoint, currentState);

      expect(plan.steps.some((s) => s.type === "restore_state")).toBe(true);
    });
  });

  describe("Serialization", () => {
    it("should serialize and deserialize correctly", () => {
      const checkpoint = createCheckpoint(initialState, metadata);
      const json = serializeCheckpoint(checkpoint);
      const deserialized = deserializeCheckpoint(json);

      expect(deserialized).toEqual(checkpoint);
    });
  });

  describe("mergeCheckpointState", () => {
    it("should merge states and preserve specified fields", () => {
      const checkpointState: CheckpointableState = {
        ...initialState,
        currentTask: "Old task",
      };
      const currentState: CheckpointableState = {
        ...initialState,
        currentTask: "New task",
      };

      const merged = mergeCheckpointState(checkpointState, currentState, [
        "currentTask",
      ]);

      expect(merged.currentTask).toBe("New task");
    });
  });
});
