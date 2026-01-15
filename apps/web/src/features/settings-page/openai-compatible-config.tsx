"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Eye,
  EyeOff,
  Server,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useConfigStore, DEFAULT_CONFIG_KEY } from "@/hooks/useConfigStore";
import {
  DiscoveredModel,
  ConnectionTestResult,
  modelIdToLabel,
  validateBaseUrl,
} from "@openswe/shared/open-swe/openai-compatible";

interface OpenAICompatibleConfigState {
  baseUrl: string;
  apiKey: string;
  organizationId: string;
  customHeaders: string;
  timeout: number;
  maxRetries: number;
  defaultModel: string;
  enabled: boolean;
}

interface ValidationState {
  customHeadersError: string | null;
  httpWarning: string | null;
}

const DEFAULT_CONFIG: OpenAICompatibleConfigState = {
  baseUrl: "http://127.0.0.1:8317/v1",
  apiKey: "",
  organizationId: "",
  customHeaders: "{}",
  timeout: 30000,
  maxRetries: 3,
  defaultModel: "",
  enabled: false,
};

export function OpenAICompatibleConfigTab() {
  const { getConfig, updateConfig } = useConfigStore();
  const globalConfig = getConfig(DEFAULT_CONFIG_KEY);

  // Local state derived from global config
  const savedConfig = globalConfig.openaiCompatibleConfig || {};
  const [config, setConfig] = useState<OpenAICompatibleConfigState>({
    ...DEFAULT_CONFIG,
    ...savedConfig,
    customHeaders: savedConfig.customHeaders
      ? JSON.stringify(savedConfig.customHeaders, null, 2)
      : "{}",
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] =
    useState<ConnectionTestResult | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>(
    [],
  );
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [validation, setValidation] = useState<ValidationState>({
    customHeadersError: null,
    httpWarning: null,
  });

  // Validate custom headers JSON
  const validateCustomHeaders = useCallback((value: string): string | null => {
    if (!value || value.trim() === "" || value === "{}") {
      return null;
    }
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        return "Custom headers must be a JSON object";
      }
      return null;
    } catch {
      return "Invalid JSON format";
    }
  }, []);

  // Check for HTTP security warning using shared validation
  const checkHttpWarning = useCallback((url: string): string | null => {
    const result = validateBaseUrl(url);
    return result.warning ?? null;
  }, []);

  // Save config to global store
  const saveConfig = useCallback(
    (newConfig: OpenAICompatibleConfigState) => {
      let customHeadersObj: Record<string, string> = {};
      try {
        customHeadersObj = JSON.parse(newConfig.customHeaders || "{}");
      } catch {
        // Invalid JSON, keep empty
      }

      updateConfig(DEFAULT_CONFIG_KEY, "openaiCompatibleConfig", {
        baseUrl: newConfig.baseUrl,
        apiKey: newConfig.apiKey || undefined,
        organizationId: newConfig.organizationId || undefined,
        customHeaders:
          Object.keys(customHeadersObj).length > 0
            ? customHeadersObj
            : undefined,
        timeout: newConfig.timeout,
        maxRetries: newConfig.maxRetries,
        defaultModel: newConfig.defaultModel || undefined,
        enabled: newConfig.enabled,
      });
    },
    [updateConfig],
  );

  const updateField = <K extends keyof OpenAICompatibleConfigState>(
    field: K,
    value: OpenAICompatibleConfigState[K],
  ) => {
    const newConfig = { ...config, [field]: value };
    setConfig(newConfig);

    // Update validation state based on field
    if (field === "customHeaders") {
      setValidation((prev) => ({
        ...prev,
        customHeadersError: validateCustomHeaders(value as string),
      }));
    } else if (field === "baseUrl") {
      setValidation((prev) => ({
        ...prev,
        httpWarning: checkHttpWarning(value as string),
      }));
    }

    saveConfig(newConfig);
  };

  const testConnection = async () => {
    setIsTestingConnection(true);
    setConnectionResult(null);

    try {
      // Build the models URL
      const baseUrl = config.baseUrl.replace(/\/+$/, "");
      const modelsUrl = `${baseUrl}/models`;

      // Build headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (config.apiKey) {
        headers["Authorization"] = `Bearer ${config.apiKey}`;
      }
      if (config.organizationId) {
        headers["OpenAI-Organization"] = config.organizationId;
      }
      try {
        const customHeaders = JSON.parse(config.customHeaders || "{}");
        Object.assign(headers, customHeaders);
      } catch {
        // Invalid JSON, ignore
      }

      const startTime = Date.now();

      const response = await fetch(modelsUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(config.timeout),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        setConnectionResult({
          success: false,
          latencyMs,
          error: `HTTP ${response.status}: ${errorText.slice(0, 100)}`,
        });
        return;
      }

      const data = await response.json();

      if (!data.data || !Array.isArray(data.data)) {
        setConnectionResult({
          success: false,
          latencyMs,
          error: "Invalid response format - expected { data: [...] }",
        });
        return;
      }

      // Success
      setConnectionResult({
        success: true,
        latencyMs,
        modelCount: data.data.length,
      });

      // Also populate models using shared utility
      const models: DiscoveredModel[] = data.data
        .filter((model: { id?: string }) => model.id && typeof model.id === "string")
        .map((model: { id: string; context_length?: number }) => ({
          id: model.id,
          label: modelIdToLabel(model.id),
          contextLength: model.context_length,
          capabilities: ["chat"] as const, // Default capability
        }));
      setDiscoveredModels(models);
    } catch (error) {
      setConnectionResult({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Connection failed - check URL and network",
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const fetchModels = async () => {
    setIsFetchingModels(true);
    await testConnection();
    setIsFetchingModels(false);
  };

  const clearConfig = () => {
    setConfig(DEFAULT_CONFIG);
    setConnectionResult(null);
    setDiscoveredModels([]);
    updateConfig(DEFAULT_CONFIG_KEY, "openaiCompatibleConfig", undefined);
  };

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Server className="h-5 w-5" />
              OpenAI-Compatible API
            </CardTitle>
            {config.enabled && (
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  "border-green-200 bg-green-50 text-green-700",
                  "dark:border-green-800 dark:bg-green-900/20 dark:text-green-400",
                )}
              >
                Enabled
              </Badge>
            )}
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) => updateField("enabled", checked)}
          />
        </div>
        <CardDescription>
          Connect to any OpenAI-compatible API endpoint (OpenRouter, LM Studio,
          Ollama, LocalAI, vLLM, etc.)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Base URL */}
        <div className="space-y-2">
          <Label htmlFor="baseUrl">Base URL</Label>
          <Input
            id="baseUrl"
            type="text"
            value={config.baseUrl}
            onChange={(e) => updateField("baseUrl", e.target.value)}
            placeholder="http://127.0.0.1:8317/v1"
            className="font-mono text-sm"
          />
          <p className="text-muted-foreground text-xs">
            The base URL of the API endpoint (must include /v1 path if required)
          </p>
          {validation.httpWarning && (
            <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <AlertDescription className="text-yellow-800 dark:text-yellow-300 text-sm">
                {validation.httpWarning}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <Label htmlFor="apiKey">API Key (optional)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="apiKey"
              type={showApiKey ? "text" : "password"}
              value={config.apiKey}
              onChange={(e) => updateField("apiKey", e.target.value)}
              placeholder="sk-... (optional for local endpoints)"
              className="font-mono text-sm"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowApiKey(!showApiKey)}
              className="px-2"
            >
              {showApiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Advanced Options */}
        <Collapsible
          open={showAdvanced}
          onOpenChange={setShowAdvanced}
        >
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
            >
              {showAdvanced ? (
                <ChevronUp className="mr-2 h-4 w-4" />
              ) : (
                <ChevronDown className="mr-2 h-4 w-4" />
              )}
              Advanced Options
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            {/* Organization ID */}
            <div className="space-y-2">
              <Label htmlFor="organizationId">Organization ID</Label>
              <Input
                id="organizationId"
                type="text"
                value={config.organizationId}
                onChange={(e) => updateField("organizationId", e.target.value)}
                placeholder="org-..."
                className="font-mono text-sm"
              />
            </div>

            {/* Timeout */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="timeout">Timeout (ms)</Label>
                <Input
                  id="timeout"
                  type="number"
                  value={config.timeout}
                  onChange={(e) =>
                    updateField("timeout", parseInt(e.target.value) || 30000)
                  }
                  min={1000}
                  max={300000}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxRetries">Max Retries</Label>
                <Input
                  id="maxRetries"
                  type="number"
                  value={config.maxRetries}
                  onChange={(e) =>
                    updateField("maxRetries", parseInt(e.target.value) || 3)
                  }
                  min={0}
                  max={10}
                  className="font-mono text-sm"
                />
              </div>
            </div>

            {/* Custom Headers */}
            <div className="space-y-2">
              <Label htmlFor="customHeaders">Custom Headers (JSON)</Label>
              <Input
                id="customHeaders"
                type="text"
                value={config.customHeaders}
                onChange={(e) => updateField("customHeaders", e.target.value)}
                placeholder='{"X-Custom-Header": "value"}'
                className={cn(
                  "font-mono text-sm",
                  validation.customHeadersError &&
                    "border-red-500 focus-visible:ring-red-500",
                )}
              />
              <p className="text-muted-foreground text-xs">
                Additional headers to include in API requests (JSON format)
              </p>
              {validation.customHeadersError && (
                <p className="text-red-500 text-xs flex items-center gap-1">
                  <XCircle className="h-3 w-3" />
                  {validation.customHeadersError}
                </p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Connection Test & Model Fetch */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={testConnection}
            disabled={isTestingConnection || !config.baseUrl}
          >
            {isTestingConnection ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Test Connection
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchModels}
            disabled={isFetchingModels || !config.baseUrl}
          >
            {isFetchingModels ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Fetching...
              </>
            ) : (
              "Fetch Models"
            )}
          </Button>
          {(config.apiKey || config.baseUrl !== DEFAULT_CONFIG.baseUrl) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearConfig}
              className={cn(
                "ml-auto",
                "text-destructive hover:bg-destructive/10 hover:text-destructive",
              )}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          )}
        </div>

        {/* Connection Result */}
        {connectionResult && (
          <Alert
            className={cn(
              connectionResult.success
                ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20",
            )}
          >
            {connectionResult.success ? (
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            )}
            <AlertDescription
              className={cn(
                connectionResult.success
                  ? "text-green-800 dark:text-green-300"
                  : "text-red-800 dark:text-red-300",
              )}
            >
              {connectionResult.success ? (
                <>
                  Connection successful! Found {connectionResult.modelCount}{" "}
                  models. Latency: {connectionResult.latencyMs}ms
                </>
              ) : (
                <>Connection failed: {connectionResult.error}</>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Discovered Models */}
        {discoveredModels.length > 0 && (
          <div className="space-y-2">
            <Label>Available Models ({discoveredModels.length})</Label>
            <div className="border-border max-h-48 overflow-y-auto rounded-md border p-2">
              {discoveredModels.map((model) => (
                <div
                  key={model.id}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded px-2 py-1",
                    "hover:bg-muted/50",
                    config.defaultModel === model.id && "bg-muted",
                  )}
                  onClick={() => updateField("defaultModel", model.id)}
                >
                  <span className="font-mono text-sm">{model.id}</span>
                  {model.contextLength && (
                    <span className="text-muted-foreground text-xs">
                      {Math.round(model.contextLength / 1000)}K context
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Manual Model ID */}
        <div className="space-y-2">
          <Label htmlFor="defaultModel">Default Model ID</Label>
          <Input
            id="defaultModel"
            type="text"
            value={config.defaultModel}
            onChange={(e) => updateField("defaultModel", e.target.value)}
            placeholder="gpt-4o, claude-3-opus, etc."
            className="font-mono text-sm"
          />
          <p className="text-muted-foreground text-xs">
            Select from discovered models above or enter a model ID manually
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
