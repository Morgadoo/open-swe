# Multi-stage Dockerfile for Open SWE monorepo
# This builds both the agent and web applications

# Build stage
FROM node:20-alpine AS builder

# Build arguments for NEXT_PUBLIC_* variables (must be set at build time)
ARG NEXT_PUBLIC_API_URL=http://localhost:3000/api
ARG NEXT_PUBLIC_AGENT_URL=http://agent:2024
ARG NEXT_PUBLIC_GITHUB_APP_CLIENT_ID
ARG NEXT_PUBLIC_ALLOWED_USERS_LIST=[]

# Set as environment variables for the build
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_AGENT_URL=${NEXT_PUBLIC_AGENT_URL}
ENV NEXT_PUBLIC_GITHUB_APP_CLIENT_ID=${NEXT_PUBLIC_GITHUB_APP_CLIENT_ID}
ENV NEXT_PUBLIC_ALLOWED_USERS_LIST=${NEXT_PUBLIC_ALLOWED_USERS_LIST}

# Install dependencies needed for native modules
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copy workspace configuration
COPY package.json yarn.lock .yarnrc.yml turbo.json tsconfig.json ./

# Copy all packages and apps
COPY packages ./packages
COPY apps ./apps
COPY langgraph.json ./

# Install dependencies
RUN corepack enable && corepack prepare yarn@3.5.1 --activate
RUN yarn install --immutable

# Build all packages
RUN yarn build

# Agent production stage
FROM node:20-alpine AS agent

# Install runtime dependencies
RUN apk add --no-cache git openssh-client

WORKDIR /app

# Copy workspace configuration
COPY package.json yarn.lock .yarnrc.yml ./
COPY langgraph.json ./

# Copy built artifacts
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/open-swe ./apps/open-swe
COPY --from=builder /app/apps/open-swe-v2 ./apps/open-swe-v2
COPY --from=builder /app/node_modules ./node_modules

# Enable corepack
RUN corepack enable && corepack prepare yarn@3.5.1 --activate

# Copy and set up entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=2024

EXPOSE 2024

# Use entrypoint to create .env file from environment variables
ENTRYPOINT ["docker-entrypoint.sh"]

# Start the agent
CMD ["yarn", "workspace", "@openswe/agent", "dev", "--host", "0.0.0.0"]

# Web production stage
FROM node:20-alpine AS web

WORKDIR /app

# Copy workspace configuration
COPY package.json yarn.lock .yarnrc.yml ./

# Copy built artifacts
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web ./apps/web
COPY --from=builder /app/node_modules ./node_modules

# Enable corepack
RUN corepack enable && corepack prepare yarn@3.5.1 --activate

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Start the web app
CMD ["yarn", "workspace", "@openswe/web", "start"]
