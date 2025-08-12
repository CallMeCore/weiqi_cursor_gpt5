# Minimal runtime image: Node server + static web
FROM node:20-bullseye-slim

WORKDIR /app

# System deps used occasionally for debugging / downloads
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl tini \
  && rm -rf /var/lib/apt/lists/*

# Copy project
COPY web ./web
COPY server ./server

WORKDIR /app/server
RUN npm ci || npm install

# Expose web port
EXPOSE 8080

# Use tini as PID 1 for proper signal handling
ENTRYPOINT ["tini", "--"]
CMD ["npm", "start"]



