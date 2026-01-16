/**
 * Tests for config-manager module
 */

import {
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
} from "../config-manager.js";
import { DEFAULT_LOOP_PREVENTION_CONFIG } from "@openswe/shared/open-swe/loop-prevention/types";
import type {
  LoopPreventionConfig,
  ToolLoopConfig,
} from "@openswe/shared/open-swe/loop-prevention/types";

describe("ConfigManager", () => {
  describe("getToolCategory", () => {
    it("should categorize file operations tools", () => {
      expect(getToolCategory("read_file")).toBe("file_operations");
      expect(getToolCategory("write_file")).toBe("file_operations");
      expect(getToolCategory("list_files")).toBe("file_operations");
      expect(getToolCategory("view")).toBe("file_operations");
      expect(getToolCategory("str_replace_editor")).toBe("file_operations");
      expect(getToolCategory("text_editor")).toBe("file_operations");
    });

    it("should categorize shell command tools", () => {
      expect(getToolCategory("shell")).toBe("shell_commands");
      expect(getToolCategory("execute_command")).toBe("shell_commands");
      expect(getToolCategory("bash")).toBe("shell_commands");
    });

    it("should categorize search tools", () => {
      expect(getToolCategory("grep")).toBe("search_tools");
      expect(getToolCategory("search")).toBe("search_tools");
      expect(getToolCategory("find")).toBe("search_tools");
      expect(getToolCategory("search_documents_for")).toBe("search_tools");
    });

    it("should categorize code modification tools", () => {
      expect(getToolCategory("apply_patch")).toBe("code_modification");
      expect(getToolCategory("edit_file")).toBe("code_modification");
      expect(getToolCategory("insert")).toBe("code_modification");
      expect(getToolCategory("replace")).toBe("code_modification");
    });

    it("should categorize communication tools", () => {
      expect(getToolCategory("ask_followup_question")).toBe("communication");
      expect(getToolCategory("attempt_completion")).toBe("communication");
      expect(getToolCategory("request_human_help")).toBe("communication");
      expect(getToolCategory("update_plan")).toBe("communication");
    });

    it("should categorize unknown tools as 'other'", () => {
      expect(getToolCategory("unknown_tool")).toBe("other");
      expect(getToolCategory("custom_tool")).toBe("other");
    });

    it("should handle case-insensitive tool names", () => {
      expect(getToolCategory("READ_FILE")).toBe("file_operations");
      expect(getToolCategory("Shell")).toBe("shell_commands");
    });

    it("should handle hyphenated tool names", () => {
      expect(getToolCategory("ask-followup-question")).toBe("communication");
      expect(getToolCategory("attempt-completion")).toBe("communication");
    });
  });

  describe("validateConfig", () => {
    it("should return valid for default config", () => {
      const result = validateConfig(DEFAULT_LOOP_PREVENTION_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("should detect out-of-range values", () => {
      const config: Partial<LoopPreventionConfig> = {
        exactMatchThreshold: 150, // exceeds max of 100
        exactMatchLookbackWindow: 2000, // exceeds max of 1000
        semanticSimilarityThreshold: 1.5, // exceeds max of 1
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      expect(result.errors.some((e) => e.field === "exactMatchThreshold")).toBe(
        true,
      );
      expect(
        result.errors.some((e) => e.field === "exactMatchLookbackWindow"),
      ).toBe(true);
      expect(
        result.errors.some((e) => e.field === "semanticSimilarityThreshold"),
      ).toBe(true);
    });

    it("should detect values below minimum", () => {
      const config: Partial<LoopPreventionConfig> = {
        exactMatchThreshold: 0, // below min of 1
        exactMatchLookbackWindow: 2, // below min of 5
        semanticMatchThreshold: 0, // below min of 1
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it("should detect minPatternLength > maxPatternLength", () => {
      const config: Partial<LoopPreventionConfig> = {
        minPatternLength: 10,
        maxPatternLength: 5,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe("minPatternLength");
      expect(result.errors[0].message).toContain("cannot be greater than");
    });

    it("should validate degradation levels", () => {
      const config: Partial<LoopPreventionConfig> = {
        degradationLevels: [
          {
            level: 1,
            triggerCondition: "exactMatch >= 2",
            action: "switch-strategy",
            cooldownMs: 30000,
          },
          {
            level: -1, // invalid: negative level
            triggerCondition: "exactMatch >= 3",
            action: "request-clarification",
            cooldownMs: 60000,
          },
        ],
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field.includes("degradationLevels")),
      ).toBe(true);
    });

    it("should validate degradation level actions", () => {
      const config: Partial<LoopPreventionConfig> = {
        degradationLevels: [
          {
            level: 1,
            triggerCondition: "exactMatch >= 2",
            action: "invalid_action" as any,
            cooldownMs: 30000,
          },
        ],
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field.includes("action"))).toBe(true);
    });

    it("should validate cooldownMs is non-negative", () => {
      const config: Partial<LoopPreventionConfig> = {
        degradationLevels: [
          {
            level: 1,
            triggerCondition: "exactMatch >= 2",
            action: "switch-strategy",
            cooldownMs: -1000,
          },
        ],
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field.includes("cooldownMs"))).toBe(
        true,
      );
    });

    it("should generate warnings for missing semantic similarity threshold", () => {
      const config: Partial<LoopPreventionConfig> = {
        semanticSimilarityEnabled: true,
        semanticSimilarityThreshold: undefined,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("semanticSimilarityEnabled is true");
    });

    it("should generate warnings for missing pattern length bounds", () => {
      const config: Partial<LoopPreventionConfig> = {
        patternDetectionEnabled: true,
        minPatternLength: 2,
        maxPatternLength: undefined,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("patternDetectionEnabled is true");
    });

    it("should handle empty config", () => {
      const result = validateConfig({});
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("parseLoopPreventionConfig", () => {
    it("should return default config for null input", () => {
      const result = parseLoopPreventionConfig(null);
      expect(result).toEqual(DEFAULT_LOOP_PREVENTION_CONFIG);
    });

    it("should return default config for undefined input", () => {
      const result = parseLoopPreventionConfig(undefined);
      expect(result).toEqual(DEFAULT_LOOP_PREVENTION_CONFIG);
    });

    it("should parse valid JSON string", () => {
      const jsonConfig = JSON.stringify({
        exactMatchThreshold: 5,
        semanticSimilarityThreshold: 0.8,
      });

      const result = parseLoopPreventionConfig(jsonConfig);
      expect(result.exactMatchThreshold).toBe(5);
      expect(result.semanticSimilarityThreshold).toBe(0.8);
    });

    it("should return default config for invalid JSON string", () => {
      const result = parseLoopPreventionConfig("invalid json");
      expect(result).toEqual(DEFAULT_LOOP_PREVENTION_CONFIG);
    });

    it("should parse partial config object", () => {
      const partialConfig: Partial<LoopPreventionConfig> = {
        exactMatchThreshold: 3,
        semanticSimilarityEnabled: false,
      };

      const result = parseLoopPreventionConfig(partialConfig);
      expect(result.exactMatchThreshold).toBe(3);
      expect(result.semanticSimilarityEnabled).toBe(false);
    });

    it("should sanitize out-of-range values", () => {
      const config: Partial<LoopPreventionConfig> = {
        exactMatchThreshold: 200, // exceeds max
        semanticSimilarityThreshold: 0.5,
      };

      const result = parseLoopPreventionConfig(config);
      expect(result.exactMatchThreshold).toBe(100); // sanitized to max
      expect(result.semanticSimilarityThreshold).toBe(0.5);
    });

    it("should sanitize values below minimum", () => {
      const config: Partial<LoopPreventionConfig> = {
        exactMatchThreshold: 0, // below min
        semanticSimilarityThreshold: 0.5,
      };

      const result = parseLoopPreventionConfig(config);
      expect(result.exactMatchThreshold).toBe(1); // sanitized to min
      expect(result.semanticSimilarityThreshold).toBe(0.5);
    });

    it("should merge with defaults", () => {
      const config: Partial<LoopPreventionConfig> = {
        exactMatchThreshold: 5,
      };

      const result = parseLoopPreventionConfig(config);
      expect(result.exactMatchThreshold).toBe(5);
      expect(result.semanticSimilarityEnabled).toBe(
        DEFAULT_LOOP_PREVENTION_CONFIG.semanticSimilarityEnabled,
      );
    });
  });

  describe("mergeConfigs", () => {
    it("should merge with override taking precedence", () => {
      const base: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 5,
      };

      const override: Partial<LoopPreventionConfig> = {
        exactMatchThreshold: 10,
      };

      const result = mergeConfigs(base, override);
      expect(result.exactMatchThreshold).toBe(10);
    });

    it("should preserve base values when override is undefined", () => {
      const base: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 5,
      };

      const override: Partial<LoopPreventionConfig> = {
        semanticSimilarityEnabled: false,
      };

      const result = mergeConfigs(base, override);
      expect(result.exactMatchThreshold).toBe(5);
      expect(result.semanticSimilarityEnabled).toBe(false);
    });

    it("should merge toolSpecificConfig", () => {
      const base: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        toolSpecificConfig: {
          shell: { exactMatchThreshold: 2 },
        },
      };

      const override: Partial<LoopPreventionConfig> = {
        toolSpecificConfig: {
          read_file: { exactMatchThreshold: 3 },
        },
      };

      const result = mergeConfigs(base, override);
      expect(result.toolSpecificConfig.shell?.exactMatchThreshold).toBe(2);
      expect(result.toolSpecificConfig.read_file?.exactMatchThreshold).toBe(3);
    });

    it("should override toolSpecificConfig when same tool", () => {
      const base: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        toolSpecificConfig: {
          shell: { exactMatchThreshold: 2 },
        },
      };

      const override: Partial<LoopPreventionConfig> = {
        toolSpecificConfig: {
          shell: { exactMatchThreshold: 5 },
        },
      };

      const result = mergeConfigs(base, override);
      expect(result.toolSpecificConfig.shell?.exactMatchThreshold).toBe(5);
    });

    it("should merge degradationLevels", () => {
      const base: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        degradationLevels: [
          {
            level: 1,
            triggerCondition: "exactMatch >= 2",
            action: "switch-strategy",
            cooldownMs: 30000,
          },
        ],
      };

      const override: Partial<LoopPreventionConfig> = {
        degradationLevels: [
          {
            level: 2,
            triggerCondition: "exactMatch >= 3",
            action: "request-clarification",
            cooldownMs: 60000,
          },
        ],
      };

      const result = mergeConfigs(base, override);
      expect(result.degradationLevels).toHaveLength(1);
      expect(result.degradationLevels[0].level).toBe(2);
    });

    it("should handle empty override", () => {
      const base: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 5,
      };

      const result = mergeConfigs(base, {});
      expect(result.exactMatchThreshold).toBe(5);
    });
  });

  describe("getEffectiveToolConfig", () => {
    it("should return base config for unknown tool", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 5,
        semanticMatchThreshold: 8,
        semanticSimilarityThreshold: 0.8,
      };

      const result = getEffectiveToolConfig(config, "unknown_tool");
      expect(result.maxIdenticalCalls).toBe(5);
      expect(result.maxSimilarCalls).toBe(8);
      expect(result.maxConsecutiveErrors).toBe(3);
      expect(result.similarityThreshold).toBe(0.8);
      expect(result.timeWindowMs).toBe(60000);
    });

    it("should apply category defaults for file operations", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 10,
        semanticMatchThreshold: 15,
      };

      const result = getEffectiveToolConfig(config, "read_file");
      expect(result.maxIdenticalCalls).toBe(3); // category default
      expect(result.maxSimilarCalls).toBe(5); // category default
      expect(result.maxConsecutiveErrors).toBe(3); // category default
    });

    it("should apply category defaults for shell commands", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 10,
        semanticMatchThreshold: 15,
      };

      const result = getEffectiveToolConfig(config, "shell");
      expect(result.maxIdenticalCalls).toBe(2); // category default
      expect(result.maxSimilarCalls).toBe(4); // category default
      expect(result.maxConsecutiveErrors).toBe(2); // category default
    });

    it("should apply category defaults for search tools", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 10,
        semanticMatchThreshold: 15,
      };

      const result = getEffectiveToolConfig(config, "grep");
      expect(result.maxIdenticalCalls).toBe(3); // category default
      expect(result.maxSimilarCalls).toBe(8); // category default
      expect(result.maxConsecutiveErrors).toBe(5); // category default
    });

    it("should apply category defaults for code modification", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 10,
        semanticMatchThreshold: 15,
      };

      const result = getEffectiveToolConfig(config, "apply_patch");
      expect(result.maxIdenticalCalls).toBe(2); // category default
      expect(result.maxSimilarCalls).toBe(4); // category default
      expect(result.maxConsecutiveErrors).toBe(3); // category default
    });

    it("should apply category defaults for communication", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 10,
        semanticMatchThreshold: 15,
      };

      const result = getEffectiveToolConfig(config, "ask_followup_question");
      expect(result.maxIdenticalCalls).toBe(2); // category default
      expect(result.maxSimilarCalls).toBe(3); // category default
      expect(result.maxConsecutiveErrors).toBe(2); // category default
    });

    it("should apply tool-specific overrides", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 10,
        semanticMatchThreshold: 15,
        toolSpecificConfig: {
          shell: {
            exactMatchThreshold: 5,
            semanticMatchThreshold: 8,
            allowedConsecutiveErrors: 1,
          },
        },
      };

      const result = getEffectiveToolConfig(config, "shell");
      expect(result.maxIdenticalCalls).toBe(5); // tool override
      expect(result.maxSimilarCalls).toBe(8); // tool override
      expect(result.maxConsecutiveErrors).toBe(1); // tool override
    });

    it("should use category defaults when tool override is partial", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 10,
        semanticMatchThreshold: 15,
        toolSpecificConfig: {
          shell: {
            exactMatchThreshold: 5,
          },
        },
      };

      const result = getEffectiveToolConfig(config, "shell");
      expect(result.maxIdenticalCalls).toBe(5); // tool override
      expect(result.maxSimilarCalls).toBe(4); // category default
      expect(result.maxConsecutiveErrors).toBe(2); // category default
    });
  });

  describe("getConfigPreset", () => {
    it("should return strict preset", () => {
      const result = getConfigPreset("strict");
      expect(result.exactMatchThreshold).toBe(2);
      expect(result.semanticSimilarityThreshold).toBe(0.75);
      expect(result.patternDetectionEnabled).toBe(true);
      expect(result.autoEscalationEnabled).toBe(true);
    });

    it("should return balanced preset", () => {
      const result = getConfigPreset("balanced");
      expect(result).toEqual(DEFAULT_LOOP_PREVENTION_CONFIG);
    });

    it("should return permissive preset", () => {
      const result = getConfigPreset("permissive");
      expect(result.exactMatchThreshold).toBe(5);
      expect(result.semanticSimilarityThreshold).toBe(0.95);
      expect(result.patternDetectionEnabled).toBe(true);
      expect(result.autoEscalationEnabled).toBe(true);
    });

    it("should return development preset", () => {
      const result = getConfigPreset("development");
      expect(result.exactMatchThreshold).toBe(10);
      expect(result.semanticSimilarityEnabled).toBe(false);
      expect(result.patternDetectionEnabled).toBe(false);
      expect(result.autoEscalationEnabled).toBe(false);
    });

    it("should return default config for unknown preset", () => {
      const result = getConfigPreset("unknown" as any);
      expect(result).toEqual(DEFAULT_LOOP_PREVENTION_CONFIG);
    });

    it("should return a copy, not a reference", () => {
      const result1 = getConfigPreset("strict");
      const result2 = getConfigPreset("strict");
      expect(result1).not.toBe(result2);
      expect(result1).toEqual(result2);
    });
  });

  describe("serializeConfig", () => {
    it("should serialize config to JSON string", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 5,
      };

      const result = serializeConfig(config);
      expect(typeof result).toBe("string");
      expect(result).toContain('"exactMatchThreshold": 5');
    });

    it("should format with indentation", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 5,
      };

      const result = serializeConfig(config);
      expect(result).toContain("\n");
      expect(result).toContain("  ");
    });

    it("should handle config with toolSpecificConfig", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        toolSpecificConfig: {
          shell: { exactMatchThreshold: 2 },
        },
      };

      const result = serializeConfig(config);
      expect(result).toContain('"toolSpecificConfig"');
      expect(result).toContain('"shell"');
    });
  });

  describe("createToolOverride", () => {
    it("should create tool-specific override", () => {
      const overrides: Partial<ToolLoopConfig> = {
        exactMatchThreshold: 5,
        semanticMatchThreshold: 8,
      };

      const result = createToolOverride("shell", overrides);
      expect(result.toolSpecificConfig).toBeDefined();
      expect(result.toolSpecificConfig?.shell).toEqual(overrides);
    });

    it("should handle empty overrides", () => {
      const result = createToolOverride("shell", {});
      expect(result.toolSpecificConfig).toBeDefined();
      expect(result.toolSpecificConfig?.shell).toEqual({});
    });

    it("should handle partial overrides", () => {
      const overrides: Partial<ToolLoopConfig> = {
        exactMatchThreshold: 5,
      };

      const result = createToolOverride("shell", overrides);
      expect(result.toolSpecificConfig?.shell?.exactMatchThreshold).toBe(5);
      expect(
        result.toolSpecificConfig?.shell?.semanticMatchThreshold,
      ).toBeUndefined();
    });
  });

  describe("createCategoryOverride", () => {
    it("should create override for all tools in file_operations category", () => {
      const overrides: Partial<ToolLoopConfig> = {
        exactMatchThreshold: 5,
      };

      const result = createCategoryOverride("file_operations", overrides);
      expect(result.toolSpecificConfig).toBeDefined();
      expect(result.toolSpecificConfig?.read_file).toEqual(overrides);
      expect(result.toolSpecificConfig?.write_file).toEqual(overrides);
      expect(result.toolSpecificConfig?.list_files).toEqual(overrides);
    });

    it("should create override for all tools in shell_commands category", () => {
      const overrides: Partial<ToolLoopConfig> = {
        exactMatchThreshold: 3,
      };

      const result = createCategoryOverride("shell_commands", overrides);
      expect(result.toolSpecificConfig).toBeDefined();
      expect(result.toolSpecificConfig?.shell).toEqual(overrides);
      expect(result.toolSpecificConfig?.execute_command).toEqual(overrides);
      expect(result.toolSpecificConfig?.bash).toEqual(overrides);
    });

    it("should create override for all tools in search_tools category", () => {
      const overrides: Partial<ToolLoopConfig> = {
        exactMatchThreshold: 4,
      };

      const result = createCategoryOverride("search_tools", overrides);
      expect(result.toolSpecificConfig).toBeDefined();
      expect(result.toolSpecificConfig?.grep).toEqual(overrides);
      expect(result.toolSpecificConfig?.search).toEqual(overrides);
      expect(result.toolSpecificConfig?.find).toEqual(overrides);
    });

    it("should create override for all tools in code_modification category", () => {
      const overrides: Partial<ToolLoopConfig> = {
        exactMatchThreshold: 2,
      };

      const result = createCategoryOverride("code_modification", overrides);
      expect(result.toolSpecificConfig).toBeDefined();
      expect(result.toolSpecificConfig?.apply_patch).toEqual(overrides);
      expect(result.toolSpecificConfig?.edit_file).toEqual(overrides);
    });

    it("should create override for all tools in communication category", () => {
      const overrides: Partial<ToolLoopConfig> = {
        exactMatchThreshold: 2,
      };

      const result = createCategoryOverride("communication", overrides);
      expect(result.toolSpecificConfig).toBeDefined();
      expect(result.toolSpecificConfig?.ask_followup_question).toEqual(
        overrides,
      );
      expect(result.toolSpecificConfig?.attempt_completion).toEqual(overrides);
    });

    it("should handle empty overrides", () => {
      const result = createCategoryOverride("file_operations", {});
      expect(result.toolSpecificConfig).toBeDefined();
      expect(Object.keys(result.toolSpecificConfig || {})).toHaveLength(6);
    });
  });

  describe("isDefaultConfig", () => {
    it("should return true for default config", () => {
      const result = isDefaultConfig(DEFAULT_LOOP_PREVENTION_CONFIG);
      expect(result).toBe(true);
    });

    it("should return false when exactMatchThreshold differs", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 5,
      };

      const result = isDefaultConfig(config);
      expect(result).toBe(false);
    });

    it("should return false when semanticSimilarityEnabled differs", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        semanticSimilarityEnabled: false,
      };

      const result = isDefaultConfig(config);
      expect(result).toBe(false);
    });

    it("should return false when toolSpecificConfig is not empty", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        toolSpecificConfig: {
          shell: { exactMatchThreshold: 2 },
        },
      };

      const result = isDefaultConfig(config);
      expect(result).toBe(false);
    });

    it("should return false when degradationLevels differs", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        degradationLevels: [
          {
            level: 1,
            triggerCondition: "exactMatch >= 2",
            action: "switch-strategy",
            cooldownMs: 30000,
          },
        ],
      };

      const result = isDefaultConfig(config);
      expect(result).toBe(false);
    });

    it("should return true when toolSpecificConfig is empty object", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        toolSpecificConfig: {},
      };

      const result = isDefaultConfig(config);
      expect(result).toBe(true);
    });
  });

  describe("getAllToolCategories", () => {
    it("should return all tool categories", () => {
      const result = getAllToolCategories();
      expect(result).toHaveLength(6);
      expect(result).toContain("file_operations");
      expect(result).toContain("shell_commands");
      expect(result).toContain("search_tools");
      expect(result).toContain("code_modification");
      expect(result).toContain("communication");
      expect(result).toContain("other");
    });

    it("should return array in expected order", () => {
      const result = getAllToolCategories();
      expect(result[0]).toBe("file_operations");
      expect(result[1]).toBe("shell_commands");
      expect(result[2]).toBe("search_tools");
      expect(result[3]).toBe("code_modification");
      expect(result[4]).toBe("communication");
      expect(result[5]).toBe("other");
    });
  });

  describe("getToolsInCategory", () => {
    it("should return tools in file_operations category", () => {
      const result = getToolsInCategory("file_operations");
      expect(result).toContain("read_file");
      expect(result).toContain("write_file");
      expect(result).toContain("list_files");
      expect(result).toContain("view");
      expect(result).toContain("str_replace_editor");
      expect(result).toContain("text_editor");
    });

    it("should return tools in shell_commands category", () => {
      const result = getToolsInCategory("shell_commands");
      expect(result).toContain("shell");
      expect(result).toContain("execute_command");
      expect(result).toContain("bash");
    });

    it("should return tools in search_tools category", () => {
      const result = getToolsInCategory("search_tools");
      expect(result).toContain("grep");
      expect(result).toContain("search");
      expect(result).toContain("find");
      expect(result).toContain("search_documents_for");
    });

    it("should return tools in code_modification category", () => {
      const result = getToolsInCategory("code_modification");
      expect(result).toContain("apply_patch");
      expect(result).toContain("edit_file");
      expect(result).toContain("insert");
      expect(result).toContain("replace");
    });

    it("should return tools in communication category", () => {
      const result = getToolsInCategory("communication");
      expect(result).toContain("ask_followup_question");
      expect(result).toContain("attempt_completion");
      expect(result).toContain("request_human_help");
      expect(result).toContain("update_plan");
    });

    it("should return empty array for other category", () => {
      const result = getToolsInCategory("other");
      expect(result).toHaveLength(0);
    });
  });
});
