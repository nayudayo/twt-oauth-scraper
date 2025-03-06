# Command Sequence Refactor Analysis

## Summary
Analysis of the current command flow implementation to enable automatic triggering of REFER and GENERATE_REFERRAL commands after SOL_WALLET and SUBMIT_REFERRAL commands respectively.

Core Objectives:
- Streamline user experience by reducing explicit commands
- Maintain existing functionality and data integrity
- Ensure proper error handling and state management

Expected Impact:
- Reduced user friction
- Faster funnel completion
- Maintained security and validation

## Implementation Steps

### Step 1: Command Handler Analysis
Status: [x] Completed

Description:
Analyze current command handler implementation in TerminalModal.tsx

Specifications:
1. Core Operations:
   - Command validation in handleCommand function using REQUIRED_COMMANDS array
   - State management using commandResponses object and useState hooks
   - Message flow control via TerminalLine[] array
   - API interactions for referral validation and generation

2. Input Requirements:
   - User session data (session?.username)
   - Command input validation through Command.validation functions
   - Previous command responses stored in commandResponses state
   - Command sequence tracking via currentCommandIndex

3. Output Expectations:
   - Command success/failure messages via TerminalLine interface
   - Updated command state in commandResponses
   - Generated referral codes from /api/referral-code endpoint
   - System messages from SYSTEM_MESSAGES constant

4. Validation Points:
   - Command sequence integrity through currentCommandIndex
   - User authentication via session checks
   - Input format validation through Command.validation functions
   - State consistency using saveProgress function

Dependencies:
- Session management through useSession hook
- Database operations via API endpoints
- API endpoints for referral operations
- Message templates in SYSTEM_MESSAGES

Key Findings:
1. Command Flow:
   - Commands are defined in REQUIRED_COMMANDS array
   - Each command has validation function
   - Commands are processed sequentially
   - State is saved after each command

2. Integration Points:
   - SOL_WALLET command stores wallet address
   - REFER command displays referral info
   - SUBMIT_REFERRAL validates referral codes
   - GENERATE_REFERRAL creates new codes

3. Modification Strategy:
   - Remove REFER and GENERATE_REFERRAL from REQUIRED_COMMANDS
   - Move REFER logic into SOL_WALLET handler
   - Move GENERATE_REFERRAL logic into SUBMIT_REFERRAL handler
   - Update progress tracking logic

4. Potential Challenges:
   - Maintaining state consistency
   - Handling API failures
   - Preserving user feedback
   - Managing command sequence

Completion Criteria:
[x] Command flow documented
[x] State management analyzed
[x] Dependencies mapped
[x] Validation points identified

### Step 2: Database Operations Analysis
Status: [x] Completed

Description:
Review database operations and transaction requirements for referral system

Specifications:
1. Core Operations:
   - User management via users table
   - Funnel progress tracking via funnel_progress table
   - Referral code management via referral_codes table
   - Referral usage tracking via referral_tracking and referral_usage_log tables

2. Input Requirements:
   - User ID (VARCHAR(255))
   - Referral codes (VARCHAR(255))
   - Command responses (JSONB)
   - Timestamps for tracking

3. Output Expectations:
   - User records with profile data
   - Funnel progress state
   - Referral code details
   - Usage statistics

4. Validation Points:
   - Foreign key constraints
   - Unique constraints on referral usage
   - Transaction integrity
   - Data consistency

Dependencies:
- PostgreSQL database
- Connection pool management
- Transaction support
- Error handling system

Key Findings:
1. Database Schema:
   ```sql
   -- Funnel Progress Table
   CREATE TABLE funnel_progress (
     user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id),
     current_command_index INTEGER DEFAULT 0,
     completed_commands JSONB DEFAULT '[]'::jsonb,
     command_responses JSONB DEFAULT '{}'::jsonb,
     last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   );

   -- Referral Tables
   CREATE TABLE referral_tracking (
     id SERIAL PRIMARY KEY,
     referral_code VARCHAR(255) NOT NULL,
     referrer_user_id VARCHAR(255) NOT NULL REFERENCES users(id),
     referred_user_id VARCHAR(255) NOT NULL REFERENCES users(id),
     used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
     UNIQUE(referred_user_id)
   );

   CREATE TABLE referral_codes (
     code VARCHAR(255) PRIMARY KEY,
     owner_user_id VARCHAR(255) NOT NULL REFERENCES users(id),
     usage_count INTEGER DEFAULT 0,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   );
   ```

2. Transaction Requirements:
   - Referral code creation needs transaction
   - Referral usage tracking needs transaction
   - Funnel progress updates need transaction
   - Command response updates need transaction

3. Modification Strategy:
   - No schema changes needed
   - Update funnel progress tracking logic
   - Ensure transaction handling for combined operations
   - Maintain existing constraints

4. Potential Challenges:
   - Maintaining referral tracking integrity
   - Handling concurrent updates
   - Managing transaction rollbacks
   - Preserving data consistency

Completion Criteria:
[x] Database operations mapped
[x] Transaction requirements identified
[x] Error scenarios documented
[x] Data flow analyzed

### Step 3: API Layer Analysis
Status: [x] Completed

Description:
Analyze API endpoints and their integration points for referral system

Specifications:
1. Core Operations:
   - POST /api/referral-code: Generate new referral code
   - GET /api/referral-code/get: Retrieve existing referral code
   - POST /api/validate-referral: Validate and process referral code
   - POST /api/funnel-completion: Track funnel completion

2. Input Requirements:
   - User authentication via NextAuth session
   - User ID validation
   - Referral code validation
   - Command response tracking

3. Output Expectations:
   - Success/error responses with appropriate status codes
   - Detailed error messages for debugging
   - Referral code generation results
   - Validation results

4. Validation Points:
   - Session authentication
   - User authorization
   - Input format validation
   - Business rule validation

Dependencies:
- NextAuth.js for authentication
- Database operations
- Utility functions for validation
- Error handling middleware

Key Findings:
1. Authentication Flow:
   ```typescript
   const session = await getServerSession(authOptions)
   if (!session?.user) {
     return NextResponse.json(
       { error: 'Unauthorized - No session' }, 
       { status: 401 }
     )
   }
   ```

2. API Endpoints:
   - /api/referral-code:
     - Generates new referral code
     - Requires authenticated session
     - Validates wallet address
     - Creates database entry

   - /api/referral-code/get:
     - Retrieves existing codes
     - Handles user creation
     - Returns most recent code
     - Fallback to progress data

   - /api/validate-referral:
     - Validates referral codes
     - Prevents self-referral
     - Tracks usage
     - Handles transactions

3. Modification Strategy:
   - Add combined operation endpoint
   - Maintain existing validation
   - Update error handling
   - Preserve transaction integrity

4. Potential Challenges:
   - Race conditions
   - Transaction rollbacks
   - Error propagation
   - State consistency

Completion Criteria:
[x] API endpoints documented
[x] Authentication flow analyzed
[x] Error handling reviewed
[x] Integration points identified

## Module Specifications

### Command Handler Module
Purpose: Manage command execution and state

Algorithm:
1. Core Logic:
   - Command validation
   - State management
   - Message generation
   - API interaction
   
2. Dependencies:
   - Session management
   - Database operations
   - Message templates
   - API endpoints
   
3. Constraints:
   - Command sequence order
   - State consistency
   - Error handling
   - User authentication

4. Integration Points:
   - Database operations
   - API endpoints
   - UI components
   - Message system

### Database Operations Module
Purpose: Manage data persistence and retrieval

Algorithm:
1. Core Logic:
   - CRUD operations
   - Transaction management
   - State tracking
   - Error handling
   
2. Dependencies:
   - Database schema
   - Connection pool
   - Query builder
   - Error handlers
   
3. Constraints:
   - Data integrity
   - Transaction atomicity
   - Performance
   - Consistency

4. Integration Points:
   - API layer
   - Command handlers
   - State management
   - Error handling

## Success Criteria
- Command sequence flows automatically
- Data integrity maintained
- Error handling remains robust
- User experience improved
- Performance maintained

## Implementation Order
1. Command handler modifications
2. Database operation updates
3. API endpoint adjustments
4. Message flow updates
5. Testing implementation
6. Deployment preparation

## Notes
- Maintain existing validation logic
- Preserve error handling
- Consider edge cases
- Monitor performance impact
- Plan rollback strategy 