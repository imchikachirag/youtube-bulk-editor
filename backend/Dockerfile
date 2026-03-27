# YouTube Bulk Editor — Docker Configuration
# Deploys to Google Cloud Run
#
# Copyright (c) 2026 Chirag Mehta
# github.com/imchikachirag/youtube-bulk-editor

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first (better Docker layer caching)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy source code
COPY server.js ./

# Cloud Run expects the app to listen on PORT env variable
ENV PORT=8080
EXPOSE 8080

# Run as non-root user for security
USER node

CMD ["node", "server.js"]
