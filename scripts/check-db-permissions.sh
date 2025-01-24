#!/bin/bash

# Create data directory if it doesn't exist
mkdir -p data

# Set permissions for data directory
chmod 755 data

# Create or update permissions for database file
touch data/twitter.db
chmod 664 data/twitter.db

# Create cookies directory
mkdir -p data/cookies
chmod 755 data/cookies

# Print current permissions
echo "Current permissions:"
ls -la data/
ls -la data/twitter.db
ls -la data/cookies/

echo "Current directory: $(pwd)"
echo "Current user: $(whoami)"
echo "Process user: $(id)" 