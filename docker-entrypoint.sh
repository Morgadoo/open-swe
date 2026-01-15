#!/bin/sh
set -e

# Create .env file from environment variables for langgraph-cli
# This is required because langgraph-cli expects a .env file in the apps/open-swe directory

ENV_FILE="/app/apps/open-swe/.env"

echo "Creating .env file at $ENV_FILE..."

# Create the .env file with all environment variables
cat > "$ENV_FILE" << EOF
# Auto-generated .env file from Docker environment variables
# Generated at: $(date)

# LangSmith tracing
LANGCHAIN_PROJECT=${LANGCHAIN_PROJECT:-default}
LANGCHAIN_API_KEY=${LANGCHAIN_API_KEY:-}
LANGCHAIN_TRACING_V2=${LANGCHAIN_TRACING_V2:-true}
LANGCHAIN_TEST_TRACKING=${LANGCHAIN_TEST_TRACKING:-false}

# LangSmith Configuration (alternative variable names)
LANGSMITH_TRACING=${LANGSMITH_TRACING:-true}
LANGSMITH_ENDPOINT=${LANGSMITH_ENDPOINT:-https://api.smith.langchain.com}
LANGSMITH_API_KEY=${LANGSMITH_API_KEY:-${LANGCHAIN_API_KEY}}
LANGSMITH_PROJECT=${LANGSMITH_PROJECT:-${LANGCHAIN_PROJECT}}

# LLM Provider Keys
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
GOOGLE_API_KEY=${GOOGLE_API_KEY:-}
OPENAI_API_BASE=${OPENAI_API_BASE:-}

# Infrastructure
DAYTONA_API_KEY=${DAYTONA_API_KEY:-}

# Tools
FIRECRAWL_API_KEY=${FIRECRAWL_API_KEY:-}

# GitHub App Configuration
GITHUB_APP_NAME=${GITHUB_APP_NAME:-}
GITHUB_APP_ID=${GITHUB_APP_ID:-}
GITHUB_APP_PRIVATE_KEY=${GITHUB_APP_PRIVATE_KEY:-}
GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET:-}
GITHUB_TRIGGER_USERNAME=${GITHUB_TRIGGER_USERNAME:-open-swe}

# Other Configuration
PORT=${PORT:-2024}
OPEN_SWE_APP_URL=${OPEN_SWE_APP_URL:-http://localhost:3000}
SECRETS_ENCRYPTION_KEY=${SECRETS_ENCRYPTION_KEY:-}
SKIP_CI_UNTIL_LAST_COMMIT=${SKIP_CI_UNTIL_LAST_COMMIT:-true}
NODE_ENV=${NODE_ENV:-production}
EOF

echo ".env file created successfully"

# Execute the main command
exec "$@"
