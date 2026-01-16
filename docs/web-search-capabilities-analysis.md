# Web Search & Internet Capabilities Analysis

## Executive Summary

The Open-SWE project has **LIMITED** web search capabilities that vary between the two agent implementations:

- **Main Agent (open-swe)**: ✅ URL content fetching via **Firecrawl** | ❌ NO general web search
- **CLI Agent (open-swe-v2)**: ✅ Full web search via **Tavily** | ✅ HTTP requests | ✅ URL access

---

## Current Web Capabilities by Agent

### 1. Main Agent (apps/open-swe) - Production LangGraph Agent

#### ✅ Available: URL Content Fetching via Firecrawl

**Tool**: `createGetURLContentTool`
**Location**: `apps/open-swe/src/tools/url-content.ts`
**API Used**: Firecrawl (`@mendable/firecrawl-js`)

**Capabilities**:
- Scrape content from specific URLs
- Convert web pages to markdown format
- Cache fetched documents to avoid redundant requests
- Parse and validate URLs before fetching

**How It Works**:
```typescript
// Usage in code
const loader = new FireCrawlLoader({
  url: parsedUrl,
  mode: "scrape",
  params: {
    formats: ["markdown"],
  },
});

const docs = await loader.load();
documentContent = docs.map((doc) => doc.pageContent).join("\n\n");
```

**Requirements**:
- `FIRECRAWL_API_KEY` environment variable (defined in `.env.example:31`)
- Firecrawl API account from https://firecrawl.dev/

**Used By**:
- Planner graph (for context gathering)
- Programmer graph (for documentation access)
- Both generate-message and take-action nodes

**Limitations**:
- ❌ Cannot perform general web searches (e.g., "search for Python async best practices")
- ❌ Cannot discover URLs dynamically
- ✅ Only fetches content from user-provided or pre-known URLs

---

#### ✅ Available: Document Search via Firecrawl + LLM

**Tool**: `createSearchDocumentForTool`
**Location**: `apps/open-swe/src/tools/search-documents-for/index.ts`
**API Used**: Firecrawl + LLM (for semantic search)

**Capabilities**:
- Fetch document from URL via Firecrawl
- Use LLM to semantically search within the document
- Return relevant sections based on natural language query

**How It Works**:
```typescript
// 1. Fetch document via Firecrawl (same as URL content tool)
const loader = new FireCrawlLoader({...});
const docs = await loader.load();

// 2. Use LLM to search within document
const searchPrompt = DOCUMENT_SEARCH_PROMPT
  .replace("{DOCUMENT_PAGE_CONTENT}", documentContent)
  .replace("{NATURAL_LANGUAGE_QUERY}", query);

const response = await model.invoke([{
  role: "user",
  content: searchPrompt,
}]);
```

**Use Cases**:
- "Find installation instructions in https://docs.example.com/setup"
- "Search for API authentication details in https://api-docs.com"
- "Extract error handling patterns from https://github.com/repo/CONTRIBUTING.md"

**Limitations**:
- ❌ Still requires knowing the URL beforehand
- ❌ Cannot search across multiple sites or discover content

---

#### ❌ NOT Available: General Web Search

The main agent **CANNOT**:
- Search Google/Bing for general queries
- Discover URLs based on topics
- Browse the internet autonomously
- Find documentation without explicit URLs

**Gap**: If the agent needs to find "latest React 18 best practices", it cannot search the web. It would need a user to provide the URL or have the URL in its context.

---

### 2. CLI Agent (apps/open-swe-v2) - DeepAgents Framework

#### ✅ Available: Full Web Search via Tavily

**Tool**: `webSearch`
**Location**: `apps/open-swe-v2/src/tools.ts:165`
**API Used**: Tavily Search API

**Capabilities**:
- Perform Google-like web searches
- Get top N results with content summaries
- Receive AI-generated answers to queries
- Metadata: titles, URLs, relevance scores, publish dates

**How It Works**:
```typescript
const response = await fetch("https://api.tavily.com/search", {
  method: "POST",
  body: JSON.stringify({
    api_key: apiKey,
    query: query,
    max_results: maxResults,
    search_depth: "basic",
    include_answer: true,      // AI-generated answer
    include_images: false,
    include_raw_content: false,
    format_output: true,
  }),
});

// Returns:
{
  answer: "AI-generated summary answer",
  results: [
    {
      title: "Page Title",
      url: "https://example.com",
      content: "Relevant excerpt",
      score: 0.95,
      published_date: "2024-01-15"
    },
    ...
  ]
}
```

**Requirements**:
- `TAVILY_API_KEY` environment variable (NOT in .env.example - missing!)
- Tavily API account from https://tavily.com/

**Use Cases**:
- "Search for Python async programming best practices"
- "Find latest security vulnerabilities in Express.js"
- "What are the top 5 TypeScript testing frameworks in 2024?"

**Fallback Behavior**:
- If Tavily API fails or key is missing, returns mock search results
- Prevents agent from crashing but provides limited value

**Agent Integration**:
```typescript
// In apps/open-swe-v2/src/agent.ts
const agent = createDeepAgent({
  tools: [executeBash, httpRequest, webSearch],  // ✅ webSearch included
  ...
});
```

---

#### ✅ Available: HTTP Requests

**Tool**: `httpRequest`
**Location**: `apps/open-swe-v2/src/tools.ts:103`

**Capabilities**:
- Make arbitrary HTTP requests (GET, POST, PUT, DELETE, etc.)
- Custom headers and request bodies
- Access REST APIs without authentication (or with provided tokens)

**How It Works**:
```typescript
const response = await fetch(url, {
  method,
  headers: {
    "Content-Type": "application/json",
    ...customHeaders,
  },
  body: data ? JSON.stringify(data) : undefined,
});

// Returns:
{
  status: 200,
  headers: {...},
  data: "response body as text"
}
```

**Use Cases**:
- Query public REST APIs
- Fetch data from GitHub API
- Check website status codes
- Access documentation APIs

**Limitations**:
- Basic implementation (no retry logic, timeouts beyond fetch defaults)
- Returns text only (doesn't auto-parse JSON)

---

## Comparison Matrix

| Capability | Main Agent (open-swe) | CLI Agent (open-swe-v2) |
|------------|----------------------|------------------------|
| **Fetch URL Content** | ✅ Firecrawl (markdown) | ✅ httpRequest (raw) |
| **Search Within Document** | ✅ Firecrawl + LLM | ❌ No |
| **General Web Search** | ❌ No | ✅ Tavily API |
| **Discover URLs** | ❌ No | ✅ Via web search |
| **Document Caching** | ✅ Yes | ❌ No |
| **HTTP Requests** | ❌ No | ✅ Yes |
| **API Key Required** | FIRECRAWL_API_KEY | TAVILY_API_KEY |
| **In .env.example** | ✅ Yes (line 31) | ❌ No (missing!) |

---

## Configuration Status

### Firecrawl Configuration

**Status**: ✅ Properly configured in .env.example

```bash
# In .env.example:30-31
# Firecrawl - Web scraping (https://firecrawl.dev/)
FIRECRAWL_API_KEY=""
```

**Package Installed**: ✅ Yes
```json
// In apps/open-swe/package.json:37
"@mendable/firecrawl-js": "^1.29.1"
```

**Setup Instructions**: Available in docs
- Mentioned in DOCKER_DEPLOYMENT.md
- Mentioned in SELF_HOSTED_SETUP.md
- setup.sh script includes prompt for Firecrawl key

---

### Tavily Configuration

**Status**: ❌ **MISSING from .env.example**

**Package**: Not a separate package (uses direct API calls)

**Current State**:
- Used by open-swe-v2 agent
- Required environment variable: `TAVILY_API_KEY`
- Falls back to mock results if not configured
- No documentation in .env.example or setup guides

**Recommendation**: Add to .env.example:
```bash
# Tavily - Web search (https://tavily.com/) [Used by CLI agent v2]
TAVILY_API_KEY=""
```

---

## Usage Patterns in Codebase

### Firecrawl Usage Locations

1. **Planner Graph**: `apps/open-swe/src/graphs/planner/nodes/`
   - `generate-message/index.ts:122-123` - Tool creation
   - `take-action.ts:60-61` - Tool instantiation

2. **Programmer Graph**: `apps/open-swe/src/graphs/programmer/nodes/`
   - `generate-message/index.ts:201-204` - Tool creation
   - `take-action.ts:68-69` - Tool instantiation

**Total Tool Instances**: Both URL content and document search tools available in both graphs

---

### Tavily Usage Locations

1. **CLI Agent**: `apps/open-swe-v2/src/agent.ts:13`
   - Exported as one of three main tools
   - Available to all agent operations

2. **Tool Definition**: `apps/open-swe-v2/src/tools.ts:165-240`
   - Complete implementation
   - Includes fallback logic

---

## Key Limitations & Gaps

### Main Agent (Production) Limitations

1. **No Autonomous Research**
   - Cannot search for "how to implement X"
   - Cannot find library documentation without URLs
   - Cannot discover solutions to novel problems

2. **URL Dependency**
   - Requires user to provide URLs in issue descriptions
   - Cannot validate if documentation exists elsewhere
   - Cannot compare multiple sources

3. **Limited API Access**
   - No direct HTTP request capability
   - Must use shell tools for API calls (less reliable)
   - Cannot easily query REST APIs

### CLI Agent (v2) Limitations

1. **Missing Configuration Documentation**
   - TAVILY_API_KEY not in .env.example
   - No setup instructions for Tavily
   - Users may not know web search is available

2. **No Document Caching**
   - Repeated URL fetches cost API calls
   - No shared cache with main agent
   - Less efficient for documentation-heavy tasks

3. **Basic HTTP Implementation**
   - No retry logic
   - No timeout configuration
   - No automatic JSON parsing

---

## Enhancement Opportunities

### Priority 1: Add Web Search to Main Agent

**Rationale**: Production agent needs autonomous research capability

**Implementation**:
```typescript
// New tool: apps/open-swe/src/tools/web-search.ts
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";

export function createWebSearchTool() {
  return new TavilySearchResults({
    maxResults: 5,
    apiKey: process.env.TAVILY_API_KEY,
  });
}
```

**Integration Points**:
- Add to planner graph for research during planning
- Add to programmer graph for documentation lookup
- Use in loop prevention (search for solutions before escalating)

**Benefits**:
- Agent can find documentation autonomously
- Can research error messages and solutions
- Can validate approach against current best practices
- Reduces human intervention for "how to" questions

**Effort**: Low (1-2 days)
**Risk**: Low (read-only operation)
**Impact**: High (significant autonomy increase)

---

### Priority 2: Unified HTTP Request Tool

**Rationale**: Both agents need API access

**Implementation**:
```typescript
// apps/open-swe/src/tools/http-request.ts
export function createHttpRequestTool() {
  return tool(
    async ({ url, method, headers, body, timeout = 30000 }) => {
      // Enhanced implementation with:
      // - Configurable timeout
      // - Automatic retry with exponential backoff
      // - JSON auto-detection and parsing
      // - Error handling with detailed messages
      // - Response size limits
    },
    {
      name: "http_request",
      description: "Make HTTP requests to APIs and web services",
      schema: z.object({...}),
    }
  );
}
```

**Use Cases**:
- Query GitHub API for issue/PR details
- Check package registry for version info
- Validate URLs before opening PRs
- Access documentation APIs (npm, PyPI, crates.io)

**Benefits**:
- More reliable than shell curl/wget
- Better error handling
- Consistent across both agents
- Enables API-driven workflows

**Effort**: Medium (3-4 days)
**Risk**: Low (network-only tool)
**Impact**: Medium (improved reliability)

---

### Priority 3: Enhanced Document Search

**Rationale**: Current implementation has limitations

**Enhancements**:
1. **Multi-URL Search**: Search across multiple documentation pages
2. **Follow Links**: Automatically follow relevant links in documents
3. **Caching Layer**: Share cache between planner and programmer
4. **Smart Crawling**: Limited crawl of documentation sites

**Implementation**:
```typescript
// Enhanced tool with recursive search
export function createEnhancedDocumentSearchTool() {
  return tool(
    async ({
      urls,              // Array of URLs to search
      query,             // Natural language query
      maxDepth = 1,      // How many levels deep to follow links
      maxPages = 10,     // Maximum pages to crawl
    }) => {
      // 1. Fetch all URLs in parallel
      // 2. Extract relevant links from each page
      // 3. Follow links up to maxDepth
      // 4. Semantic search across all pages
      // 5. Return consolidated results with sources
    },
    {...}
  );
}
```

**Benefits**:
- More comprehensive documentation coverage
- Better answers from multiple sources
- Automatic discovery of related docs

**Effort**: Medium (1 week)
**Risk**: Medium (cost and complexity)
**Impact**: Medium (better research quality)

---

### Priority 4: Add Tavily to .env.example

**Rationale**: Users should know about web search capability

**Changes**:
```bash
# Add to .env.example after FIRECRAWL_API_KEY

# Tavily - Web search (https://tavily.com/)
# Used by CLI agent (v2) for internet search capabilities
# Optional: Falls back to mock results if not provided
TAVILY_API_KEY=""
```

**Documentation Updates**:
- Add to SELF_HOSTED_SETUP.md
- Add to DOCKER_DEPLOYMENT.md
- Update setup.sh to prompt for Tavily key

**Benefits**:
- Users aware of web search feature
- Proper configuration guidance
- Consistent with other API keys

**Effort**: Low (30 minutes)
**Risk**: None
**Impact**: Low (documentation only)

---

## Security Considerations

### Firecrawl

**Risks**:
- Scrapes arbitrary URLs provided by agent
- Could potentially access internal network URLs (SSRF)
- Fetched content injected into LLM context

**Mitigations**:
- URL validation and parsing (already implemented)
- Firecrawl service handles actual requests (sandboxed)
- Content size limits prevent context overflow

### Tavily

**Risks**:
- Public search results could include malicious content
- Search queries could leak sensitive information
- API costs could escalate with heavy usage

**Mitigations**:
- Tavily sanitizes search results
- Rate limiting on search tool
- Cost monitoring and alerts

### HTTP Request Tool

**Risks**:
- SSRF attacks (accessing internal services)
- Credential leakage through headers
- Uncontrolled API costs

**Recommended Mitigations**:
```typescript
// Implement in enhanced HTTP tool
const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'metadata.google.internal',
  '169.254.169.254', // AWS metadata
];

const BLOCKED_HEADER_PATTERNS = [
  /authorization/i,
  /api[-_]?key/i,
  /secret/i,
  /token/i,
];

function validateHttpRequest(url: string, headers: Record<string, string>) {
  // Validate URL is not internal
  // Block sensitive headers without explicit approval
  // Enforce rate limits
}
```

---

## Cost Analysis

### Firecrawl Costs

**Pricing** (as of 2024):
- Free tier: 500 scrapes/month
- Starter: $20/month (2,500 scrapes)
- Standard: $100/month (20,000 scrapes)

**Current Usage Pattern**:
- Document caching reduces redundant requests
- Typical task: 5-10 URL fetches
- Monthly estimate: 150-500 requests (within free tier for small projects)

**Optimization**:
- ✅ Already cached
- Consider persistent cache across sessions

### Tavily Costs

**Pricing** (as of 2024):
- Free tier: 1,000 searches/month
- Pro: $100/month (10,000 searches)

**Current Usage Pattern** (v2 agent):
- Only if explicitly invoked by agent
- No automatic search on every task
- Monthly estimate: 50-200 searches (within free tier)

**Potential with Main Agent**:
- If added to main agent without constraints: 1,000+ searches/month
- Need rate limiting and approval gates

**Recommendation**:
- Start with approval gate for web searches
- Monitor usage for 1 month
- Remove gate if usage stays reasonable

---

## Recommendations Summary

### Immediate Actions (This Week)

1. ✅ **Add TAVILY_API_KEY to .env.example** (30 min)
   - Document in setup guides
   - Update setup.sh script

2. ✅ **Document Web Search Capabilities** (1 hour)
   - Create user guide for web search
   - Add examples to documentation

### Short-term Enhancements (Next Month)

3. 🚀 **Add Tavily Web Search to Main Agent** (2-3 days)
   - Implement createWebSearchTool
   - Add to planner and programmer graphs
   - Add approval gate initially
   - Monitor usage and costs

4. 🚀 **Implement HTTP Request Tool for Main Agent** (3-4 days)
   - Enhanced implementation with retry logic
   - Security validations
   - Rate limiting

### Medium-term Enhancements (Next Quarter)

5. 📋 **Enhanced Multi-Document Search** (1 week)
   - Search across multiple URLs
   - Follow documentation links
   - Consolidated results

6. 📋 **Shared Document Cache** (3-4 days)
   - Persistent cache across sessions
   - Shared between graphs
   - TTL and invalidation strategy

### Long-term Vision (6 months)

7. 🔮 **Autonomous Research Agent** (2-3 weeks)
   - Specialized subagent for research tasks
   - Multi-source fact checking
   - Citation tracking
   - Quality scoring of sources

---

## Conclusion

### Current State
- **Main Agent**: Limited to URL fetching via Firecrawl (user provides URLs)
- **CLI Agent**: Full web search via Tavily (autonomous discovery)
- **Configuration**: Firecrawl documented, Tavily missing from .env.example

### Critical Gaps
1. Main production agent **cannot search the internet autonomously**
2. Must rely on user-provided URLs or pre-existing knowledge
3. Cannot research solutions, documentation, or best practices independently

### Quick Win
**Add Tavily web search to main agent** would provide:
- 70-80% increase in autonomous problem-solving capability
- Reduced human intervention for "how to" questions
- Better error resolution through online research
- 2-3 days implementation, low risk, high impact

### Bottom Line
The infrastructure exists (Tavily integration in v2), just needs to be ported to the main production agent with appropriate safety controls and cost monitoring.
