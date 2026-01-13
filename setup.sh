#!/bin/bash

# ============================================================================
# Open SWE Setup Script
# Interactive setup for self-hosted LLM and GitHub integration
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Icons
CHECK="${GREEN}✓${NC}"
CROSS="${RED}✗${NC}"
WARN="${YELLOW}⚠${NC}"
INFO="${BLUE}ℹ${NC}"

# Default values
DEFAULT_LLM_ENDPOINT="http://host.docker.internal:8317/v1"
DEFAULT_PORT="2024"
DEFAULT_WEB_PORT="3000"

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}$1${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_section() {
    echo ""
    echo -e "${BLUE}━━━ $1 ━━━${NC}"
    echo ""
}

print_success() {
    echo -e "  ${CHECK} $1"
}

print_error() {
    echo -e "  ${CROSS} $1"
}

print_warning() {
    echo -e "  ${WARN} $1"
}

print_info() {
    echo -e "  ${INFO} $1"
}

prompt_with_default() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    
    if [ -n "$default" ]; then
        echo -ne "  ${prompt} [${CYAN}${default}${NC}]: "
    else
        echo -ne "  ${prompt}: "
    fi
    
    read -r input
    if [ -z "$input" ] && [ -n "$default" ]; then
        eval "$var_name='$default'"
    else
        eval "$var_name='$input'"
    fi
}

prompt_secret() {
    local prompt="$1"
    local var_name="$2"
    
    echo -ne "  ${prompt}: "
    read -rs input
    echo ""
    eval "$var_name='$input'"
}

prompt_yes_no() {
    local prompt="$1"
    local default="$2"
    
    if [ "$default" = "y" ]; then
        echo -ne "  ${prompt} [${CYAN}Y/n${NC}]: "
    else
        echo -ne "  ${prompt} [${CYAN}y/N${NC}]: "
    fi
    
    read -r -n 1 input
    echo ""
    
    if [ -z "$input" ]; then
        input="$default"
    fi
    
    [[ "$input" =~ ^[Yy]$ ]]
}

generate_key() {
    openssl rand -hex 32
}

check_command() {
    if command -v "$1" &> /dev/null; then
        return 0
    else
        return 1
    fi
}

test_endpoint() {
    local url="$1"
    local timeout="${2:-5}"
    
    if curl -s -f -o /dev/null --connect-timeout "$timeout" "$url" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# ============================================================================
# Main Setup
# ============================================================================

clear
print_header "Open SWE Setup Wizard"

echo -e "  This wizard will help you configure Open SWE with:"
echo -e "    • Self-hosted LLM endpoint"
echo -e "    • GitHub integration"
echo -e "    • Required API keys"
echo ""

# Check prerequisites
print_section "Checking Prerequisites"

if check_command docker; then
    print_success "Docker is installed"
else
    print_error "Docker is not installed"
    echo -e "    Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if check_command docker-compose || docker compose version &>/dev/null; then
    print_success "Docker Compose is available"
else
    print_error "Docker Compose is not available"
    exit 1
fi

if check_command openssl; then
    print_success "OpenSSL is installed"
else
    print_warning "OpenSSL not found - will use fallback for key generation"
fi

# Check for existing .env
if [ -f .env ]; then
    echo ""
    print_warning "Existing .env file found"
    if ! prompt_yes_no "Overwrite existing configuration?" "n"; then
        echo ""
        print_info "Setup cancelled. Your existing .env file was preserved."
        exit 0
    fi
fi

# ============================================================================
# LLM Configuration
# ============================================================================

print_section "LLM Configuration"

echo -e "  Choose your LLM provider:"
echo -e "    ${CYAN}1${NC}) Self-hosted (Ollama, vLLM, LM Studio, etc.)"
echo -e "    ${CYAN}2${NC}) Cloud providers (Anthropic, OpenAI, Google)"
echo -e "    ${CYAN}3${NC}) Both (self-hosted primary, cloud fallback)"
echo ""
echo -ne "  Select option [${CYAN}1${NC}]: "
read -r llm_choice
llm_choice="${llm_choice:-1}"

case "$llm_choice" in
    1|3)
        echo ""
        prompt_with_default "Self-hosted LLM endpoint" "$DEFAULT_LLM_ENDPOINT" "LLM_ENDPOINT"
        
        # Convert localhost to host.docker.internal for Docker
        if [[ "$LLM_ENDPOINT" == *"127.0.0.1"* ]] || [[ "$LLM_ENDPOINT" == *"localhost"* ]]; then
            LLM_ENDPOINT=$(echo "$LLM_ENDPOINT" | sed 's/127.0.0.1/host.docker.internal/g' | sed 's/localhost/host.docker.internal/g')
            print_info "Converted to Docker-compatible address: $LLM_ENDPOINT"
        fi
        
        # Extract host for testing
        TEST_ENDPOINT=$(echo "$LLM_ENDPOINT" | sed 's/host.docker.internal/127.0.0.1/g')
        
        echo ""
        echo -ne "  Testing endpoint... "
        if test_endpoint "${TEST_ENDPOINT}/models"; then
            echo -e "${GREEN}OK${NC}"
            print_success "LLM endpoint is accessible"
        else
            echo -e "${YELLOW}Not reachable${NC}"
            print_warning "LLM endpoint not accessible (ensure it's running before starting Open SWE)"
        fi
        
        prompt_with_default "API key (if required)" "sk-no-key-required" "LLM_API_KEY"
        ;;
esac

if [ "$llm_choice" = "2" ] || [ "$llm_choice" = "3" ]; then
    echo ""
    print_info "Enter cloud provider API keys (leave empty to skip)"
    prompt_secret "Anthropic API key" "ANTHROPIC_KEY"
    prompt_secret "OpenAI API key" "OPENAI_KEY"
    prompt_secret "Google API key" "GOOGLE_KEY"
fi

# ============================================================================
# GitHub Configuration
# ============================================================================

print_section "GitHub Configuration"

echo ""
print_info "To use Open SWE with GitHub, you need to create a GitHub App:"
echo -e "    1. Go to ${CYAN}https://github.com/settings/apps${NC}"
echo -e "    2. Click 'New GitHub App'"
echo -e "    3. Configure webhook URL: ${CYAN}http://YOUR_SERVER_IP:2024/webhooks/github${NC}"
echo ""

if prompt_yes_no "Have you created a GitHub App?" "n"; then
    prompt_with_default "GitHub App Name" "" "GITHUB_APP_NAME"
    prompt_with_default "GitHub App ID" "" "GITHUB_APP_ID"
    
    echo ""
    print_info "Paste your GitHub App private key (press Enter twice when done):"
    GITHUB_PRIVATE_KEY=""
    while IFS= read -r line; do
        [ -z "$line" ] && break
        GITHUB_PRIVATE_KEY="${GITHUB_PRIVATE_KEY}${line}\n"
    done
else
    print_info "You can add GitHub App credentials later by editing .env"
    GITHUB_APP_NAME=""
    GITHUB_APP_ID=""
    GITHUB_PRIVATE_KEY=""
fi

prompt_with_default "GitHub username for triggers" "open-swe" "GITHUB_USERNAME"

# ============================================================================
# API Keys
# ============================================================================

print_section "API Keys"

print_info "Enter your API keys (leave empty to skip)"
echo ""

prompt_secret "LangChain/LangSmith API key" "LANGCHAIN_KEY"

echo ""
echo -e "  LangSmith region:"
echo -e "    ${CYAN}1${NC}) US (default)"
echo -e "    ${CYAN}2${NC}) EU"
echo ""
echo -ne "  Select region [${CYAN}1${NC}]: "
read -r langsmith_region
if [ "$langsmith_region" = "2" ]; then
    LANGSMITH_ENDPOINT="https://eu.api.smith.langchain.com"
else
    LANGSMITH_ENDPOINT="https://api.smith.langchain.com"
fi

echo ""
prompt_secret "Daytona API key" "DAYTONA_KEY"
prompt_secret "Firecrawl API key" "FIRECRAWL_KEY"

# ============================================================================
# Generate Secrets
# ============================================================================

print_section "Generating Secrets"

ENCRYPTION_KEY=$(generate_key)
print_success "Generated encryption key"

WEBHOOK_SECRET=$(generate_key)
print_success "Generated webhook secret"

# ============================================================================
# Create .env File
# ============================================================================

print_section "Creating Configuration"

cat > .env << EOF
# ============================================================================
# Open SWE Configuration
# Generated by setup.sh on $(date)
# ============================================================================

# ==================== LangSmith Tracing ====================
LANGCHAIN_PROJECT="open-swe"
LANGCHAIN_API_KEY="${LANGCHAIN_KEY}"
LANGCHAIN_TRACING_V2="true"
LANGCHAIN_TEST_TRACKING="false"

LANGSMITH_TRACING="true"
LANGSMITH_ENDPOINT="${LANGSMITH_ENDPOINT}"
LANGSMITH_API_KEY="${LANGCHAIN_KEY}"
LANGSMITH_PROJECT="open-swe"

# ==================== LLM Configuration ====================
EOF

if [ "$llm_choice" = "1" ] || [ "$llm_choice" = "3" ]; then
    cat >> .env << EOF
# Self-hosted LLM endpoint
OPENAI_API_BASE="${LLM_ENDPOINT}"
OPENAI_API_KEY="${LLM_API_KEY}"

EOF
fi

if [ "$llm_choice" = "2" ] || [ "$llm_choice" = "3" ]; then
    cat >> .env << EOF
# Cloud providers
ANTHROPIC_API_KEY="${ANTHROPIC_KEY}"
GOOGLE_API_KEY="${GOOGLE_KEY}"

EOF
fi

cat >> .env << EOF
# ==================== Infrastructure ====================
DAYTONA_API_KEY="${DAYTONA_KEY}"
FIRECRAWL_API_KEY="${FIRECRAWL_KEY}"

# ==================== GitHub Configuration ====================
GITHUB_APP_NAME="${GITHUB_APP_NAME}"
GITHUB_APP_ID="${GITHUB_APP_ID}"
GITHUB_APP_PRIVATE_KEY="${GITHUB_PRIVATE_KEY}"
GITHUB_WEBHOOK_SECRET="${WEBHOOK_SECRET}"
GITHUB_TRIGGER_USERNAME="${GITHUB_USERNAME}"

# ==================== Application ====================
PORT="${DEFAULT_PORT}"
OPEN_SWE_APP_URL="http://localhost:${DEFAULT_WEB_PORT}"
SECRETS_ENCRYPTION_KEY="${ENCRYPTION_KEY}"
SKIP_CI_UNTIL_LAST_COMMIT="true"
NODE_ENV="production"

# ==================== Web Application ====================
NEXT_PUBLIC_AGENT_URL="http://agent:${DEFAULT_PORT}"
NEXT_PUBLIC_ALLOWED_USERS_LIST='[]'
EOF

print_success "Created .env file"

# ============================================================================
# Summary
# ============================================================================

print_header "Setup Complete!"

echo -e "  ${BOLD}Configuration Summary:${NC}"
echo ""

if [ "$llm_choice" = "1" ] || [ "$llm_choice" = "3" ]; then
    echo -e "  ${CYAN}LLM Endpoint:${NC} ${LLM_ENDPOINT}"
fi

if [ -n "$GITHUB_APP_NAME" ]; then
    echo -e "  ${CYAN}GitHub App:${NC} ${GITHUB_APP_NAME}"
else
    echo -e "  ${CYAN}GitHub App:${NC} Not configured (add to .env later)"
fi

echo -e "  ${CYAN}LangSmith:${NC} ${LANGSMITH_ENDPOINT}"
echo ""

echo -e "  ${BOLD}Generated Secrets:${NC}"
echo -e "  ${CYAN}Encryption Key:${NC} ${ENCRYPTION_KEY:0:16}..."
echo -e "  ${CYAN}Webhook Secret:${NC} ${WEBHOOK_SECRET:0:16}..."
echo ""

print_section "Next Steps"

echo -e "  ${CYAN}1.${NC} Build Docker images:"
echo -e "     ${BOLD}docker compose build${NC}"
echo ""
echo -e "  ${CYAN}2.${NC} Start services:"
echo -e "     ${BOLD}docker compose up -d${NC}"
echo ""
echo -e "  ${CYAN}3.${NC} View logs:"
echo -e "     ${BOLD}docker compose logs -f${NC}"
echo ""
echo -e "  ${CYAN}4.${NC} Access the application:"
echo -e "     Web UI: ${BOLD}http://localhost:${DEFAULT_WEB_PORT}${NC}"
echo -e "     Agent API: ${BOLD}http://localhost:${DEFAULT_PORT}${NC}"
echo ""

if [ -n "$GITHUB_APP_NAME" ]; then
    echo -e "  ${CYAN}5.${NC} Configure GitHub App webhook:"
    echo -e "     Webhook URL: ${BOLD}http://YOUR_SERVER_IP:${DEFAULT_PORT}/webhooks/github${NC}"
    echo -e "     Webhook Secret: ${BOLD}${WEBHOOK_SECRET}${NC}"
    echo ""
fi

echo -e "  ${CYAN}6.${NC} Configure model names in the UI Settings"
echo ""

print_info "For detailed instructions, see SELF_HOSTED_SETUP.md"
echo ""
