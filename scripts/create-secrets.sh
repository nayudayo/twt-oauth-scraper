#!/bin/bash

# Create secrets directory if it doesn't exist
mkdir -p secrets

# Create secret files from environment variables
echo "$OPENAI_API_KEY" > secrets/openai_api_key.txt
echo "$TWITTER_CLIENT_ID" > secrets/twitter_client_id.txt
echo "$TWITTER_CLIENT_SECRET" > secrets/twitter_client_secret.txt
echo "$NEXTAUTH_SECRET" > secrets/nextauth_secret.txt
echo "$NEXTAUTH_URL" > secrets/nextauth_url.txt
echo "$SCRAPER_USERNAME" > secrets/scraper_username.txt
echo "$SCRAPER_PASSWORD" > secrets/scraper_password.txt
echo "$APIFY_API_TOKEN" > secrets/apify_api_token.txt

# Set proper permissions
chmod 600 secrets/*.txt

echo "Secret files created successfully!" 