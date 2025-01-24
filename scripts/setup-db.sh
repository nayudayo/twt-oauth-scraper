#!/bin/bash

# Create data directory if it doesn't exist
mkdir -p data

# Set directory permissions
chmod 755 data

# Create database file if it doesn't exist
touch data/twitter.db

# Set file permissions
chmod 664 data/twitter.db

# Set ownership using current user
chown $USER:$USER data/twitter.db

echo "Database setup complete:"
ls -l data/twitter.db 