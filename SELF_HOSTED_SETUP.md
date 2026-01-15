# Self-Hosted Open SWE Setup Guide

Complete guide for deploying Open SWE with Docker and self-hosted LLM endpoints.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Configuration](#configuration)
4. [Deployment](#deployment)
5. [Post-Deployment](#post-deployment)
6. [GitHub Webhooks](#github-webhooks)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Run the interactive setup script
./setup.sh

# 2. Build and start services
docker compose build
docker compose up -d

# 3. Access the application
# Web UI: http://localhost:3000
# Agent API: http://localhost:2024
```

---

## Prerequisites

| Requirement | Minimum Version |
|-------------|-----------------|
| Docker Engine | 20.10+ |
| Docker Compose | 2.0+ |
| RAM | 4GB available |

**Optional:**
- Self-hosted LLM endpoint (Ollama, vLLM, LM Studio, etc.)

---

## Configuration

### Environment Variables

Create a `.env` file with the following configuration:

```bash
# ==================== LangSmith Tracing ====================
LANGCHAIN_PROJECT="open-swe"
LANGCHAIN_API_KEY="lsv2_pt_..."
LANGCHAIN_TRACING_V2="true"

# For EU users, add:
LANGSMITH_ENDPOINT="https://eu.api.smith.langchain.com"

# ==================== LLM Configuration ====================
# Option 1: Self-hosted (OpenAI-compatible API)
OPENAI_API_BASE="http://host.docker.internal:8317/v1"
OPENAI_API_KEY="sk-no-key-required"

# Option 2: Cloud providers (leave empty if using self-hosted)
ANTHROPIC_API_KEY=""
OPENAI_API_KEY=""
GOOGLE_API_KEY=""

# ==================== Infrastructure ====================
DAYTONA_API_KEY="your_daytona_key"
FIRECRAWL_API_KEY="your_firecrawl_key"

# ==================== GitHub Configuration ====================
GITHUB_APP_NAME="your-app-name"
GITHUB_APP_ID="your_app_id"
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET="$(openssl rand -hex 32)"
GITHUB_TRIGGER_USERNAME="open-swe"

# ==================== Application ====================
PORT="2024"
OPEN_SWE_APP_URL="http://localhost:3000"
SECRETS_ENCRYPTION_KEY="$(openssl rand -hex 32)"
NEXT_PUBLIC_AGENT_URL="http://agent:2024"
```

### Self-Hosted LLM Setup

There are two ways to configure self-hosted LLM endpoints:

#### Option 1: Environment Variable (Simple)

Set `OPENAI_API_BASE` in your `.env` file:

| LLM Server | Default Port | Example Configuration |
|------------|--------------|----------------------|
| Ollama | 11434 | `http://host.docker.internal:11434/v1` |
| vLLM | 8000 | `http://host.docker.internal:8000/v1` |
| LM Studio | 1234 | `http://host.docker.internal:1234/v1` |
| LocalAI | 8080 | `http://host.docker.internal:8080/v1` |

**Note:** Use `host.docker.internal` to access services running on your host machine from within Docker containers.

#### Option 2: UI Configuration (Recommended)

The UI provides a more flexible way to configure OpenAI-compatible endpoints:

1. Open http://localhost:3000
2. Go to **Settings** → **API Keys** tab
3. Scroll to **OpenAI-Compatible API** section
4. Configure:
   - **Base URL**: Your LLM server endpoint (e.g., `http://host.docker.internal:8317/v1`)
   - **API Key**: Optional for local endpoints
   - **Advanced Options**: Custom headers, timeout, max retries
5. Click **Test Connection** to verify connectivity
6. Click **Fetch Models** to discover available models
7. Select a default model from the list or enter manually
8. Enable the toggle to activate the provider

**Benefits of UI Configuration:**
- Dynamic model discovery
- Connection testing
- Custom headers support
- No restart required to change settings
- Visual feedback on connection status

#### Supported OpenAI-Compatible Services

| Service | Default Port | Notes |
|---------|--------------|-------|
| [OpenRouter](https://openrouter.ai) | 443 | `https://openrouter.ai/api/v1` (requires API key) |
| [Ollama](https://ollama.ai) | 11434 | Local, `http://localhost:11434/v1` |
| [LM Studio](https://lmstudio.ai) | 1234 | Local, `http://localhost:1234/v1` |
| [LocalAI](https://localai.io) | 8080 | Local, `http://localhost:8080/v1` |
| [vLLM](https://vllm.ai) | 8000 | Local, `http://localhost:8000/v1` |
| [Text Gen WebUI](https://github.com/oobabooga/text-generation-webui) | 5000 | Local, `http://localhost:5000/v1` |
| [LiteLLM](https://litellm.ai) | 4000 | Proxy, `http://localhost:4000/v1` |

### GitHub App Setup

Follow these steps to create and configure your GitHub App:

#### Step 1: Create the App

1. Go to [GitHub Settings → Developer settings → GitHub Apps](https://github.com/settings/apps)
2. Click **Register new GitHub App**

#### Step 2: Basic Information

| Field | Value |
|-------|-------|
| **GitHub App name** | `open-swe` (or your preferred unique name) |
| **Homepage URL** | `http://localhost:3000` (or your server URL) |

#### Step 3: Identifying and Authorizing Users

| Field | Value |
|-------|-------|
| **Callback URL** | `http://localhost:3000/api/auth/github/callback` |
| **Expire user authorization tokens** | ✅ Checked (recommended) |
| **Request user authorization during installation** | ❌ Unchecked |
| **Enable Device Flow** | ❌ Unchecked |

#### Step 4: Post Installation (Optional)

| Field | Value |
|-------|-------|
| **Setup URL** | Leave empty |
| **Redirect on update** | ❌ Unchecked |

#### Step 5: Webhook Configuration

| Field | Value |
|-------|-------|
| **Active** | ✅ Checked |
| **Webhook URL** | `http://YOUR_SERVER_IP:2024/webhooks/github` |
| **Secret** | Generate with `openssl rand -hex 32` |

**Important:** Replace `YOUR_SERVER_IP` with your actual server IP or domain. For local development, you may need to use a tunnel service like ngrok.

#### Step 6: Repository Permissions

Set these permissions under **Repository permissions**:

| Permission | Access Level |
|------------|--------------|
| **Contents** | Read and write |
| **Issues** | Read and write |
| **Metadata** | Read-only |
| **Pull requests** | Read and write |
| **Commit statuses** | Read and write |

#### Step 7: Subscribe to Events

Check these events under **Subscribe to events**:

- ✅ **Issues** - Issue opened, edited, deleted, etc.
- ✅ **Issue comment** - Comment created, edited, or deleted
- ✅ **Pull request** - PR opened, closed, reopened, etc.
- ✅ **Pull request review** - PR review submitted
- ✅ **Pull request review comment** - Comment on PR diff
- ✅ **Push** - Git push to repository

#### Step 8: Installation Target

| Option | Recommendation |
|--------|----------------|
| **Only on this account** | ✅ Select this for personal use |
| **Any account** | Select if you want others to install your app |

#### Step 9: Create the App

Click **Create GitHub App**

#### Step 10: Generate Private Key

After creating the app:

1. Scroll down to **Private keys** section
2. Click **Generate a private key**
3. A `.pem` file will be downloaded
4. Keep this file secure - you'll need it for the `.env` file

#### Step 11: Get Your App Credentials

From your GitHub App settings page, note:

- **App ID** - Shown at the top of the page
- **Client ID** - Under "About" section
- **Private Key** - The `.pem` file you downloaded

#### Step 12: Install the App

1. Go to your GitHub App settings
2. Click **Install App** in the left sidebar
3. Select your account
4. Choose **All repositories** or select specific ones
5. Click **Install**

#### Step 13: Configure `.env`

Add these values to your `.env` file:

```bash
# GitHub App Configuration
GITHUB_APP_NAME="open-swe"
GITHUB_APP_ID="123456"  # Your App ID
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
...your private key content...
-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET="your_generated_webhook_secret"
GITHUB_TRIGGER_USERNAME="open-swe"

# GitHub OAuth (from your GitHub App settings page)
NEXT_PUBLIC_GITHUB_APP_CLIENT_ID="Iv1.abc123..."  # Client ID from "About" section
GITHUB_APP_CLIENT_SECRET="your_client_secret"     # Generate in "Client secrets" section
GITHUB_APP_REDIRECT_URI="http://localhost:3000/api/auth/github/callback"
```

**Important:** You need to generate a **Client Secret** in your GitHub App settings:
1. Go to your GitHub App settings page
2. Scroll to **Client secrets** section
3. Click **Generate a new client secret**
4. Copy the secret immediately (it won't be shown again)

**Note:** For the private key, you can either:
- Paste the entire key content (including BEGIN/END lines)
- Or use `\n` for newlines: `"-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"`

---

## Deployment

### Build and Start

```bash
# Build Docker images
docker compose build

# Start services in background
docker compose up -d

# View logs
docker compose logs -f
```

### Service Endpoints

| Service | URL | Description |
|---------|-----|-------------|
| Web UI | http://localhost:3000 | User interface |
| Agent API | http://localhost:2024 | LangGraph agent |
| LangSmith Studio | https://smith.langchain.com/studio | Tracing dashboard |

### Docker Commands

```bash
# Stop services
docker compose down

# Restart services
docker compose restart

# View running containers
docker compose ps

# Rebuild without cache
docker compose build --no-cache
```

---

## Post-Deployment

### Configure LLM Provider

After starting Open SWE, configure your LLM provider in the UI:

#### Using OpenAI-Compatible Endpoint (Recommended for Self-Hosted)

1. Open http://localhost:3000
2. Go to **Settings** → **API Keys** tab
3. Find **OpenAI-Compatible API** section
4. Enter your **Base URL** (e.g., `http://host.docker.internal:8317/v1`)
5. Click **Test Connection** to verify
6. Click **Fetch Models** to discover available models
7. Select a default model or enter one manually
8. Toggle **Enable** to activate

#### Using Standard Providers

If using cloud providers (Anthropic, OpenAI, Google):

1. Go to **Settings** → **API Keys** tab
2. Enter your API key for the desired provider
3. Go to **Settings** → **Configuration** tab
4. Update model names for each task

| Task | Example Model Name |
|------|-------------------|
| Planner | `anthropic:claude-3-5-sonnet-latest` |
| Programmer | `anthropic:claude-3-5-sonnet-latest` |
| Router | `anthropic:claude-3-5-haiku-latest` |
| Summarizer | `anthropic:claude-3-5-haiku-latest` |

#### Using Self-Hosted with OpenAI Provider

If using `OPENAI_API_BASE` environment variable:

| Task | Example Model Name |
|------|-------------------|
| Planner | `openai:llama-3.1-70b-instruct` |
| Programmer | `openai:llama-3.1-70b-instruct` |
| Router | `openai:llama-3.1-8b-instruct` |
| Summarizer | `openai:llama-3.1-70b-instruct` |

**Format:** `provider:model-name` where provider is `openai` for OpenAI-compatible APIs, or `openai-compatible` for UI-configured endpoints.

### Test Connectivity

```bash
# Test LLM endpoint from host
curl http://127.0.0.1:8317/v1/models

# Test LLM endpoint from container
docker exec -it open-swe-agent curl http://host.docker.internal:8317/v1/models

# Test chat completion
curl -X POST http://127.0.0.1:8317/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"your-model","messages":[{"role":"user","content":"Hello"}]}'
```

---

## GitHub Webhooks

### Configuration Steps

1. Go to your GitHub App settings
2. Update the **Webhook URL** to: `http://YOUR_SERVER_IP:2024/webhooks/github`
3. Ensure the **Webhook secret** matches `GITHUB_WEBHOOK_SECRET` in your `.env`
4. Enable the following events:
   - Issues
   - Pull request
   - Push
   - Issue comment
   - Pull request review
   - Pull request review comment

### Test Webhook

1. Go to your GitHub App → Advanced → Recent Deliveries
2. Click **Redeliver** on any recent delivery
3. Check for a green checkmark (200 OK response)
4. Monitor logs: `docker compose logs -f agent | grep webhook`

---

## Troubleshooting

### Common Issues

#### Container Won't Start

```bash
# Check logs
docker compose logs agent
docker compose logs web

# Verify environment
docker compose config

# Check port availability
netstat -tuln | grep -E '2024|3000'
```

#### LLM Connection Failed

```bash
# Test from host
curl http://127.0.0.1:8317/v1/models

# Test from container
docker exec -it open-swe-agent ping host.docker.internal
docker exec -it open-swe-agent curl http://host.docker.internal:8317/v1/models

# Try using machine IP instead
OPENAI_API_BASE="http://192.168.1.X:8317/v1"
```

#### Webhook Not Working

```bash
# Check webhook deliveries in GitHub App settings
# App Settings → Advanced → Recent Deliveries

# View agent logs
docker compose logs -f agent | grep -i webhook

# Test webhook endpoint
curl -X POST http://localhost:2024/webhooks/github
```

#### LangSmith 403 Error

For EU users, add to `.env`:
```bash
LANGSMITH_ENDPOINT="https://eu.api.smith.langchain.com"
```

### Useful Commands

```bash
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f agent

# Check resource usage
docker stats

# Clean up
docker compose down -v
docker system prune -a

# Backup agent data
docker run --rm -v open-swe_agent-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/agent-data-backup.tar.gz /data
```

---

## Security Best Practices

1. **Never commit `.env` file** - Contains sensitive API keys
2. **Use strong encryption key** - Generate with `openssl rand -hex 32`
3. **Restrict network access** - Use firewall rules
4. **Enable HTTPS** - Use reverse proxy (Nginx/Traefik) with SSL
5. **Rotate API keys** - Update keys periodically
6. **Monitor logs** - Watch for suspicious activity

---

## Production Deployment

For production environments, consider:

1. **Reverse Proxy** - Nginx or Traefik with SSL certificates
2. **Domain Names** - Configure proper DNS
3. **Monitoring** - Prometheus/Grafana for metrics
4. **Backups** - Automated backup strategy
5. **Secrets Management** - Docker secrets or external vault

### Example Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name openswe.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Additional Resources

- [Open SWE Documentation](https://github.com/langchain-ai/open-swe/tree/main/apps/docs)
- [LangGraph Documentation](https://docs.langchain.com/oss/javascript/langgraph/overview)
- [GitHub Apps Documentation](https://docs.github.com/en/apps)
- [Docker Documentation](https://docs.docker.com/)
