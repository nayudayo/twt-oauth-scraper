#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "Starting k6 load tests..."

# Function to run a test and check its exit code
run_test() {
    local test_file=$1
    local test_name=$2
    
    echo -e "\n${GREEN}Running $test_name tests...${NC}"
    k6 run "$test_file"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $test_name tests completed successfully${NC}"
    else
        echo -e "${RED}✗ $test_name tests failed${NC}"
        return 1
    fi
}

# Run all tests
run_test "openai-api.js" "OpenAI API"
run_test "database-ops.js" "Database Operations"
run_test "rate-limit-queue.js" "Rate Limiting and Queue"

# Check if any test failed
if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}All tests completed successfully!${NC}"
    exit 0
else
    echo -e "\n${RED}Some tests failed. Check the logs above for details.${NC}"
    exit 1
fi 