FROM node:20-slim

# Install system dependencies including SQLite
RUN apt-get update && apt-get install -y \
    sqlite3 \
    python3 \
    build-essential \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY scripts ./scripts

# Make setup script executable
RUN chmod +x scripts/setup-db.sh

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy the rest of the application
COPY . .

# Create necessary directories and set permissions
RUN mkdir -p data && \
    # Set a specific user ID and group ID for appuser
    groupadd -r appgroup --gid 1001 && \
    useradd -r -g appgroup --uid 1001 appuser && \
    chown -R appuser:appgroup /app && \
    chmod 755 /app && \
    chown appuser:appgroup /app/data && \
    chmod 755 /app/data

# Add build arguments
ARG OPENAI_API_KEY
ARG TWITTER_CLIENT_ID
ARG TWITTER_CLIENT_SECRET
ARG NEXTAUTH_SECRET
ARG NEXTAUTH_URL
ARG SCRAPER_USERNAME
ARG SCRAPER_PASSWORD
ARG APIFY_API_TOKEN

# Build the application
ENV OPENAI_API_KEY=$OPENAI_API_KEY \
    TWITTER_CLIENT_ID=$TWITTER_CLIENT_ID \
    TWITTER_CLIENT_SECRET=$TWITTER_CLIENT_SECRET \
    NEXTAUTH_SECRET=$NEXTAUTH_SECRET \
    NEXTAUTH_URL=$NEXTAUTH_URL \
    SCRAPER_USERNAME=$SCRAPER_USERNAME \
    SCRAPER_PASSWORD=$SCRAPER_PASSWORD \
    APIFY_API_TOKEN=$APIFY_API_TOKEN

RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Switch to appuser
USER appuser:appgroup

# Start the application
CMD ["npm", "start"] 