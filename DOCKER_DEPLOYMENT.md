# Open SWE Docker Deployment Guide

This guide explains how to deploy Open SWE using Docker for autonomous coding on your server.

## Prerequisites

- Docker Engine 20.10 or higher
- Docker Compose 2.0 or higher
- At least 4GB RAM available
- API keys for LLM providers (Anthropic, OpenAI, or Google)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/langchain-ai/open-swe.git
cd open-swe
```

### 2. Configure Environment Variables

Copy the environment template and fill in your values:

```bash
cp .env.docker .env
```

Edit `.env` and add your API keys:

```bash
# Required: At least one LLM provider API key
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key
GOOGLE_API_KEY=your_google_key

# Required: LangSmith for tracing (optional but recommended)
LANGCHAIN_API_KEY=your_langsmith_key

# Required: GitHub App credentials for repo integration
GITHUB_APP_NAME=your_app_name
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Required: Encryption key for secrets (generate with: openssl rand -hex 32)
SECRETS_ENCRYPTION_KEY=$(openssl rand -hex 32)

# Optional: Daytona for cloud sandboxes
DAYTONA_API_KEY=your_daytona_key

# Optional: Firecrawl for web scraping
FIRECRAWL_API_KEY=your_firecrawl_key
```

### 3. Build and Start Services

```bash
# Build the Docker images
docker-compose build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

### 4. Access the Application

- **Web UI**: http://localhost:3000
- **Agent API**: http://localhost:2024

## Architecture

The Docker setup includes two main services:

1. **Agent Service** (Port 2024)
   - LangGraph-based coding agent
   - Handles code understanding, planning, and execution
   - Communicates with GitHub and LLM providers

2. **Web Service** (Port 3000)
   - Next.js web application
   - User interface for managing tasks
   - Connects to the agent service

## Docker Commands

### Start services
```bash
docker-compose up -d
```

### Stop services
```bash
docker-compose down
```

### View logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f agent
docker-compose logs -f web
```

### Rebuild after code changes
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Check service health
```bash
docker-compose ps
```

## Server Deployment

### Using Docker Compose on Remote Server

1. **Transfer files to server:**
```bash
rsync -avz --exclude 'node_modules' --exclude '.git' . user@your-server:/opt/open-swe/
```

2. **SSH into server and start:**
```bash
ssh user@your-server
cd /opt/open-swe
cp .env.docker .env
# Edit .env with your values
docker-compose up -d
```

3. **Configure reverse proxy (optional):**

For production, use Nginx or Traefik to expose the services with SSL:

```nginx
# Nginx example
server {
    listen 443 ssl;
    server_name openswe.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

server {
    listen 443 ssl;
    server_name openswe-api.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:2024;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Using Individual Dockerfiles

If you want to deploy only the agent or web service:

```bash
# Build and run only the agent
docker build --target agent -t open-swe-agent .
docker run -d -p 2024:2024 --env-file .env --name open-swe-agent open-swe-agent

# Build and run only the web
docker build --target web -t open-swe-web .
docker run -d -p 3000:3000 --env-file .env --name open-swe-web open-swe-web
```

## Volumes and Data Persistence

The agent service uses a named volume for persistent data:
- `agent-data`: Stores agent state and temporary files

To backup the volume:
```bash
docker run --rm -v open-swe_agent-data:/data -v $(pwd):/backup alpine tar czf /backup/agent-data-backup.tar.gz /data
```

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs agent
docker-compose logs web

# Verify environment variables
docker-compose config
```

### Out of memory
```bash
# Increase Docker memory limit in Docker Desktop or daemon settings
# Or add memory limits to docker-compose.yml
```

### GitHub integration not working
- Verify GitHub App credentials in `.env`
- Check webhook URL is accessible from GitHub
- Ensure GITHUB_APP_PRIVATE_KEY is properly formatted (including \n for newlines)

### Can't connect to agent from web
- Verify NEXT_PUBLIC_AGENT_URL is set correctly
- Ensure both services are on the same Docker network
- Check firewall rules if deploying on remote server

## Security Considerations

1. **Never commit `.env` file** - It contains sensitive API keys
2. **Use strong encryption key** - Generate with `openssl rand -hex 32`
3. **Restrict network access** - Use firewall rules to limit exposure
4. **Keep images updated** - Regularly rebuild with latest dependencies
5. **Use secrets management** - For production, consider Docker secrets or vault

## Performance Tuning

### Increase build speed
```yaml
# Add to docker-compose.yml under build
services:
  agent:
    build:
      context: .
      cache_from:
        - open-swe-agent:latest
```

### Resource limits
```yaml
# Add to docker-compose.yml
services:
  agent:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

## Additional Resources

- [Open SWE Documentation](https://github.com/langchain-ai/open-swe/tree/main/apps/docs)
- [LangGraph Documentation](https://docs.langchain.com/oss/javascript/langgraph/overview)
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
