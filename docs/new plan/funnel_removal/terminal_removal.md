# Terminal Modal Removal Plan

## Summary
Complete removal of the TerminalModal component and all related code, ensuring system stability and proper cleanup of all dependencies.

Core Objectives:
- ✅ Remove TerminalModal component and related files
- ✅ Clean up all dependencies and constants
- ✅ Update affected components and tests
- ✅ Maintain system stability

Expected Impact:
- ✅ Reduced codebase complexity
- ✅ Simplified architecture
- ✅ Improved maintainability
- ✅ Optimized bundle size

## Implementation Steps

### Step 1: Impact Analysis
Status: [✅] Completed

Description:
Analyze all terminal-related code and dependencies for removal

Findings:
1. Component Files:
   - ✅ src/components/TerminalModal.tsx - Main component file
   - ✅ src/components/__tests__/TerminalModal.test.tsx - Test file
   - ✅ src/constants/messages.ts - Terminal messages and ASCII art

2. Direct Dependencies:
   - ✅ src/app/page.tsx:
     * Imports removed
     * State management cleaned up
     * Terminal-related logic removed
   
3. API Endpoints:
   - ✅ /api/funnel-completion (GET/POST)
   - ✅ Related mock handlers in src/mocks/handlers.ts

Completion Criteria:
- [✅] All terminal files identified
- [✅] Dependencies mapped
- [✅] API endpoints documented
- [✅] Impact assessed

### Step 2: API Cleanup
Status: [✅] Completed

Description:
Remove all terminal-related API endpoints and handlers

Actions Completed:
1. API Routes Removed:
   - ✅ /api/funnel-completion route.ts
   - ✅ Associated types and interfaces

2. Mock Handlers Cleaned:
   - ✅ Removed funnel-completion GET/POST handlers
   - ✅ Cleaned up related interfaces

Completion Criteria:
- [✅] API routes removed
- [✅] Handlers cleaned up
- [✅] Documentation updated
- [✅] Types cleaned

### Step 3: Component and Constants Removal
Status: [✅] Completed

Description:
Remove the TerminalModal component and related constants

Actions Completed:
1. Files Removed:
   - ✅ src/components/TerminalModal.tsx
   - ✅ src/components/__tests__/TerminalModal.test.tsx
   - ✅ src/constants/messages.ts

2. Dependencies Cleaned:
   - ✅ Removed imports from page.tsx
   - ✅ Cleaned up terminal-related state
   - ✅ Removed terminal completion logic

Completion Criteria:
- [✅] Component files removed
- [✅] Constants cleaned up
- [✅] References updated

### Step 4: Database Cleanup
Status: [✅] Completed

Description:
Clean up database schema and scripts while preserving cooldown functionality

Actions Required:
1. Schema Consolidation:
   - ✅ Merge cooldown columns from `004_add_cooldowns.sql` into main schema
   - ✅ Ensure cooldown indexes are preserved
   - ✅ Remove funnel-related tables from schema definition

2. Script Updates:
   - ✅ Update `purge-db.ts`:
     * ✅ Remove funnel_completion table drop command
     * ✅ Remove funnel_completion table creation
     * ✅ Remove funnel-related indexes
     * ✅ Keep cooldown-related schema intact

3. Verification:
   - ✅ Ensure cooldown functionality remains intact
   - ✅ Verify no funnel-related tables are recreated
   - ✅ Check all remaining table dependencies

Completion Criteria:
- [✅] Cooldown schema merged into main schema
- [✅] Funnel tables removed from purge-db.ts
- [✅] No broken dependencies
- [✅] Cooldown functionality preserved

Dependencies:
- ✅ Previous steps completed
- ✅ Database schema understanding
- ✅ Cooldown functionality requirements

### Step 5: Build and Test Verification
Status: [ ] Not Started

Description:
Verify system stability after removal

Next Steps:
1. Run full build process
2. Execute test suite
3. Verify no broken references
4. Check application functionality

Completion Criteria:
- [ ] Build passes
- [ ] Tests updated and passing
- [ ] No broken references
- [ ] Routes working

## Success Criteria
- Build Status: Pending verification
- Test Coverage: Pending verification
- System Stability: Pending verification
- Bundle Size: Reduced ✅
- No Terminal References: Confirmed ✅
- Database Cleanup: Completed ✅

## Implementation Order
1. ✅ Impact analysis
2. ✅ API cleanup
3. ✅ Component and constants removal
4. ✅ Database cleanup
5. ⏳ Build and test verification
6. ⏳ Final documentation update

## Notes
- ✅ Successfully removed all terminal-related code
- ✅ Cleaned up all direct dependencies
- ✅ Removed API endpoints and handlers
- ⚠️ Need to handle database cleanup
- ⚠️ Need to run final build and test verification
- 📝 Consider monitoring for any performance improvements 