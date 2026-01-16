# Loop Prevention Configuration Guide

## Overview

The loop prevention system in open-swe provides comprehensive cycle detection, graceful degradation, and autonomous recovery capabilities. This guide explains all configuration options and provides examples for common use cases.

## Configuration Structure

Loop prevention is configured via the `LoopPreventionConfig` interface, which can be provided in the graph configuration:

```typescript
interface LoopPreventionConfig {
  enabled: boolean;
  exactMatchThreshold: number;
  semanticSimilarityThreshold: number;
  semanticMatchThreshold: number;
  patternDetectionEnabled: boolean;
  minPatternLength: number;
  maxPatternLength: number;
  patternRepetitionThreshold: number;
  toolSpecificConfig: Record<string, ToolLoopConfig>;
  degradationLevels: DegradationLevelConfig[];
  autoEscalationEnabled: boolean;
  escalationCooldownMs: number;
  historyWindowSize: number;
}
```

## Default Configuration

```typescript
const DEFAULT_LOOP_PREVENTION_CONFIG: LoopPreventionConfig = {
  enabled: true,
  exactMatchThreshold: 3,
  semanticSimilarityThreshold: 0.85,
  semanticMatchThreshold: 5,
  patternDetectionEnabled: true,
  minPatternLength: 2,
  maxPatternLength: 5,
  patternRepetitionThreshold: 2,
  toolSpecificConfig: {},
  degradationLevels: [
    {
      level: 0,
      name: "NORMAL",
      description: "Standard operation with full tool access",
      allowedTools: null,
      requiresApproval: false,
    },
    {
      level: 1,
      name: "WARNING",
      description: "Increased monitoring, strategy switching suggested",
      allowedTools: null,
      requiresApproval: false,
    },
    {
      level: 2,
      name: "RESTRICTED",
      description: "Limited tool access, clarification requests enabled",
      allowedTools: ["grep", "glob", "text_editor"],
      requiresApproval: true,
    },
    {
      level: 3,
      name: "MINIMAL",
      description: "Minimal operations only, human escalation triggered",
      allowedTools: ["grep", "glob"],
      requiresApproval: true,
    },
    {
      level: 4,
      name: "HALTED",
      description: "Execution paused, requires human intervention",
      allowedTools: [],
      requiresApproval: true,
    },
  ],
  autoEscalationEnabled: true,
  escalationCooldownMs: 300000,
  historyWindowSize: 100,
};
```

## Configuration Options

### Global Settings

#### `enabled` (boolean)
- **Default**: `true`
- **Description**: Master switch for the loop prevention system
- **Example**:
  ```typescript
  { enabled: false } // Disable loop prevention entirely
  ```

#### `historyWindowSize` (number)
- **Default**: `100`
- **Description**: Maximum number of execution history entries to maintain
- **Example**:
  ```typescript
  { historyWindowSize: 200 } // Track last 200 actions
  ```

### Exact Match Detection

#### `exactMatchThreshold` (number)
- **Default**: `3`
- **Description**: Number of exact matches (same tool + same args) before triggering loop detection
- **Example**:
  ```typescript
  { exactMatchThreshold: 5 } // Allow 5 exact matches before triggering
  ```

### Semantic Similarity Detection

#### `semanticSimilarityThreshold` (number)
- **Default**: `0.85`
- **Description**: Similarity score threshold (0-1) for considering two actions semantically similar
- **Example**:
  ```typescript
  { semanticSimilarityThreshold: 0.9 } // Require 90% similarity
  ```

#### `semanticMatchThreshold` (number)
- **Default**: `5`
- **Description**: Number of semantically similar actions before triggering loop detection
- **Example**:
  ```typescript
  { semanticMatchThreshold: 7 } // Allow 7 similar actions
  ```

### Pattern Detection

#### `patternDetectionEnabled` (boolean)
- **Default**: `true`
- **Description**: Enable detection of cyclic patterns (e.g., A→B→C→A)
- **Example**:
  ```typescript
  { patternDetectionEnabled: false } // Disable pattern detection
  ```

#### `minPatternLength` (number)
- **Default**: `2`
- **Description**: Minimum length of patterns to detect
- **Example**:
  ```typescript
  { minPatternLength: 3 } // Only detect patterns of 3+ actions
  ```

#### `maxPatternLength` (number)
- **Default**: `5`
- **Description**: Maximum length of patterns to detect
- **Example**:
  ```typescript
  { maxPatternLength: 10 } // Detect patterns up to 10 actions
  ```

#### `patternRepetitionThreshold` (number)
- **Default**: `2`
- **Description**: Number of times a pattern must repeat before triggering
- **Example**:
  ```typescript
  { patternRepetitionThreshold: 3 } // Require 3 repetitions
  ```

### Tool-Specific Configuration

#### `toolSpecificConfig` (Record<string, ToolLoopConfig>)
- **Default**: `{}`
- **Description**: Override thresholds for specific tools
- **Example**:
  ```typescript
  {
    toolSpecificConfig: {
      grep: {
        exactMatchThreshold: 10,
        semanticMatchThreshold: 15,
        allowedConsecutiveErrors: 5,
      },
      shell: {
        exactMatchThreshold: 5,
        semanticMatchThreshold: 8,
        allowedConsecutiveErrors: 3,
      },
    }
  }
  ```

### Degradation Levels

#### `degradationLevels` (DegradationLevelConfig[])
- **Default**: See default configuration above
- **Description**: Define custom degradation levels and their behavior
- **Example**:
  ```typescript
  {
    degradationLevels: [
      {
        level: 0,
        name: "NORMAL",
        description: "Standard operation",
        allowedTools: null, // All tools allowed
        requiresApproval: false,
      },
      {
        level: 1,
        name: "CAUTIOUS",
        description: "Extra validation",
        allowedTools: null,
        requiresApproval: false,
      },
      {
        level: 2,
        name: "RESTRICTED",
        description: "Limited tools",
        allowedTools: ["grep", "glob", "text_editor"],
        requiresApproval: true,
      },
    ]
  }
  ```

### Escalation Settings

#### `autoEscalationEnabled` (boolean)
- **Default**: `true`
- **Description**: Automatically escalate to human when degradation reaches MINIMAL level
- **Example**:
  ```typescript
  { autoEscalationEnabled: false } // Disable auto-escalation
  ```

#### `escalationCooldownMs` (number)
- **Default**: `300000` (5 minutes)
- **Description**: Minimum time between escalation attempts
- **Example**:
  ```typescript
  { escalationCooldownMs: 600000 } // 10 minute cooldown
  ```

## Common Use Cases

### Use Case 1: Lenient Configuration for Exploratory Tasks

```typescript
const lenientConfig: LoopPreventionConfig = {
  ...DEFAULT_LOOP_PREVENTION_CONFIG,
  exactMatchThreshold: 10,
  semanticMatchThreshold: 15,
  patternRepetitionThreshold: 3,
  toolSpecificConfig: {
    grep: {
      exactMatchThreshold: 20,
      semanticMatchThreshold: 25,
    },
    glob: {
      exactMatchThreshold: 20,
      semanticMatchThreshold: 25,
    },
  },
};
```

### Use Case 2: Strict Configuration for Production Changes

```typescript
const strictConfig: LoopPreventionConfig = {
  ...DEFAULT_LOOP_PREVENTION_CONFIG,
  exactMatchThreshold: 2,
  semanticMatchThreshold: 3,
  patternRepetitionThreshold: 1,
  degradationLevels: [
    {
      level: 0,
      name: "NORMAL",
      description: "Standard operation",
      allowedTools: null,
      requiresApproval: false,
    },
    {
      level: 1,
      name: "WARNING",
      description: "Immediate escalation",
      allowedTools: ["grep", "glob"],
      requiresApproval: true,
    },
  ],
};
```

### Use Case 3: Disable Loop Prevention for Specific Tools

```typescript
const selectiveConfig: LoopPreventionConfig = {
  ...DEFAULT_LOOP_PREVENTION_CONFIG,
  toolSpecificConfig: {
    grep: {
      exactMatchThreshold: 999,
      semanticMatchThreshold: 999,
    },
    glob: {
      exactMatchThreshold: 999,
      semanticMatchThreshold: 999,
    },
  },
};
```

### Use Case 4: Custom Degradation Strategy

```typescript
const customDegradationConfig: LoopPreventionConfig = {
  ...DEFAULT_LOOP_PREVENTION_CONFIG,
  degradationLevels: [
    {
      level: 0,
      name: "NORMAL",
      description: "Full access",
      allowedTools: null,
      requiresApproval: false,
    },
    {
      level: 1,
      name: "READ_ONLY",
      description: "Read operations only",
      allowedTools: ["grep", "glob", "url_content"],
      requiresApproval: false,
    },
    {
      level: 2,
      name: "SUPERVISED",
      description: "All actions require approval",
      allowedTools: null,
      requiresApproval: true,
    },
    {
      level: 3,
      name: "HALTED",
      description: "Execution stopped",
      allowedTools: [],
      requiresApproval: true,
    },
  ],
};
```

## Integration with Graph Configuration

To apply loop prevention configuration to a graph:

```typescript
import { integrateLoopPrevention } from "./utils/loop-prevention/integration";

const graph = new StateGraph(/* ... */);

// Add nodes and edges...

// Integrate loop prevention
integrateLoopPrevention(graph, {
  enabled: true,
  exactMatchThreshold: 3,
  semanticMatchThreshold: 5,
  // ... other config options
});

const compiledGraph = graph.compile();
```

## Monitoring and Debugging

### Accessing Loop Detection State

The current loop detection state is available in `GraphState.loopDetectionState`:

```typescript
interface LoopDetectionState {
  executionHistory: ExecutionHistoryEntry[];
  consecutiveErrorCount: number;
  toolSpecificErrorCounts: Record<string, number>;
  similarActionCount: number;
  degradationLevel: 0 | 1 | 2 | 3 | 4;
  lastStrategySwitch: number;
}
```

### Logging Loop Detection Events

Loop detection events are logged using the `createLogger` function:

```typescript
import { createLogger } from "./utils/logger";

const logger = createLogger("loop-prevention");

// Logs are automatically generated for:
// - Loop detection triggers
// - Degradation level changes
// - Strategy switches
// - Escalation events
// - Recovery attempts
```

### Metrics and Analytics

Track loop prevention effectiveness:

```typescript
interface LoopPreventionMetrics {
  totalLoopsDetected: number;
  exactMatchLoops: number;
  semanticSimilarityLoops: number;
  patternCycleLoops: number;
  strategySwtiches: number;
  escalations: number;
  successfulRecoveries: number;
  falsePositives: number;
}
```

## Best Practices

1. **Start with defaults**: The default configuration is tuned for general use cases
2. **Monitor false positives**: Track and adjust thresholds if legitimate actions are being blocked
3. **Tool-specific tuning**: Use `toolSpecificConfig` for tools with expected repetition patterns
4. **Gradual degradation**: Ensure degradation levels provide meaningful intermediate states
5. **Test configuration changes**: Validate configuration changes in development before production
6. **Review escalation logs**: Regularly review escalation events to identify systemic issues
7. **Adjust similarity threshold**: Fine-tune `semanticSimilarityThreshold` based on your use case
8. **Use checkpoints**: Combine loop prevention with checkpoint system for state recovery

## Troubleshooting

### Issue: Too many false positives

**Solution**: Increase thresholds or add tool-specific overrides
```typescript
{
  exactMatchThreshold: 5,
  semanticMatchThreshold: 8,
  toolSpecificConfig: {
    [problematicTool]: {
      exactMatchThreshold: 10,
    },
  },
}
```

### Issue: Loops not being detected

**Solution**: Decrease thresholds or enable pattern detection
```typescript
{
  exactMatchThreshold: 2,
  semanticMatchThreshold: 3,
  patternDetectionEnabled: true,
}
```

### Issue: Degradation too aggressive

**Solution**: Adjust degradation levels or increase cooldown
```typescript
{
  degradationLevels: [
    // Add more intermediate levels
  ],
  escalationCooldownMs: 600000, // 10 minutes
}
```

### Issue: Semantic similarity not working as expected

**Solution**: Adjust similarity threshold
```typescript
{
  semanticSimilarityThreshold: 0.9, // More strict
  // or
  semanticSimilarityThreshold: 0.75, // More lenient
}
```

## Advanced Topics

### Custom Recovery Strategies

Define custom recovery strategies for specific error patterns:

```typescript
import { RecoveryStrategy } from "./utils/loop-prevention/self-healing";

const customStrategy: RecoveryStrategy = {
  name: "custom-recovery",
  applicableTo: ["custom_tool"],
  execute: async (context) => {
    // Custom recovery logic
    return { success: true, action: "recovered" };
  },
};
```

### Dynamic Configuration

Adjust configuration based on runtime conditions:

```typescript
function getLoopPreventionConfig(context: RuntimeContext): LoopPreventionConfig {
  if (context.isProduction) {
    return strictConfig;
  } else if (context.isExperimental) {
    return lenientConfig;
  }
  return DEFAULT_LOOP_PREVENTION_CONFIG;
}
```

### Integration with External Monitoring

Export loop prevention metrics to external monitoring systems:

```typescript
import { getLoopDetectionState } from "./utils/loop-prevention";

function exportMetrics(state: GraphState) {
  const loopState = state.loopDetectionState;
  
  // Export to monitoring system
  metrics.gauge("loop_prevention.degradation_level", loopState.degradationLevel);
  metrics.counter("loop_prevention.consecutive_errors", loopState.consecutiveErrorCount);
  // ... other metrics
}
```

## References

- [Loop Prevention Implementation](../apps/open-swe/src/utils/loop-prevention/)
- [Shared Types](../packages/shared/src/open-swe/loop-prevention/types.ts)
- [Integration Guide](../apps/open-swe/src/utils/loop-prevention/integration.ts)
- [Test Examples](../apps/open-swe/src/utils/loop-prevention/__tests__/)
