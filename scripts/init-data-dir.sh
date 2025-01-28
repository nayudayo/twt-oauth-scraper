#!/bin/bash

# Create data directory if it doesn't exist
mkdir -p data

# Set permissions that match the container's appuser (1001:1001)
sudo chown -R 1001:1001 data
sudo chmod 755 data

echo "Data directory initialized with correct permissions!" 