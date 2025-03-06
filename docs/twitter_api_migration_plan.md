# Twitter API Migration Plan

## Overview
This document outlines the migration from Apify scraper to twitter-api.io for tweet collection. The migration will involve removing Apify-related code and implementing a new scraping system using twitter-api.io, while maintaining existing functionality and data structures.

## Core Objectives
1. Replace Apify scraper with twitter-api.io
2. Maintain existing data structures and database schema
3. Preserve current user experience and UI
4. Minimize downtime during migration
5. Ensure data consistency

## Implementation Steps

### 1. Setup & Dependencies ✅
Implementation:
- Remove Apify dependencies
- Configure Twitter API client
- Update environment variables
- Setup session integration

Checklist:
- [x] Remove Apify packages from package.json
  - [x] apify-client
  - [x] Related dev dependencies
- [x] Update environment configuration
  - [x] Remove APIFY_API_TOKEN
  - [x] Add TWITTER_API_KEY
- [x] Create twitter-api.io client configuration
  - [x] Add session support
  - [x] Add error handling
  - [x] Add type safety
- [x] Create API helpers
  - [x] Add getTwitterClient helper
  - [x] Add getAuthenticatedTwitterClient helper

### 2. Core Scraper Implementation 🔄
Implementation:
- Create new scraper module using twitter-api.io
- Implement tweet fetching with pagination
- Handle rate limiting
- Map API response to existing Tweet type
- Add comprehensive monitoring

Checklist:
- [x] Create TwitterAPIClient class
  - [x] Add session integration
  - [x] Add getCurrentUserTweets method
  - [x] Add getCurrentUserProfile method
  - [x] Add proper error handling
- [x] Implement tweet fetching
  - [x] Add pagination support
  - [x] Handle rate limits
  - [x] Add retry logic with backoff
  - [x] Add rate limit tracking
- [x] Map API responses to Tweet type
  - [x] Create data transformer
  - [x] Handle new fields
  - [x] Maintain compatibility
  - [x] Add profile transformations
- [x] Add logging and monitoring
  - [x] Add rate limit monitoring
  - [x] Add error tracking
  - [x] Add performance metrics
  - [x] Add request tracking
  - [x] Add latency monitoring

Next Steps:
1. Add integration tests for monitoring
2. Add monitoring dashboard or endpoint
3. Add alerting for high error rates
4. Document monitoring capabilities

### 3. API Route Updates 🔄
Implementation:
- Update scraping endpoints to use new client
- Maintain error handling
- Keep response formats
- Update progress tracking
- Add caching and monitoring

Checklist:
- [x] Update /api/scrape route
  - [x] Use new TwitterAPIClient
  - [x] Add session handling
  - [x] Update progress tracking
  - [x] Add error handling
  - [x] Add monitoring metrics
  - [x] Add rate limit handling
- [x] Update /api/tweets/[username]/all route
  - [x] Use new TwitterAPIClient
  - [x] Add pagination
  - [x] Add caching
  - [x] Add monitoring headers
  - [x] Add rate limit tracking
- [x] Update error responses
  - [x] Add proper error types
  - [x] Add error tracking
  - [x] Add rate limit errors
- [x] Test all endpoints
- [x] Update API documentation

Next Steps:
1. Add API route tests
2. Add rate limit retry tests
3. Add caching tests
4. Document API changes

### 4. Database Integration 🔄
Implementation:
- Keep existing schema
- Update save operations for new data format
- Maintain data consistency
- Add new metadata fields if needed
- Add proper indexing for new fields

Checklist:
- [x] Review current schema compatibility
- [x] Update save operations
  - [x] Handle new tweet format
  - [x] Update profile data storage
  - [x] Add view count storage
  - [x] Add conversation data
  - [x] Add entity storage
- [x] Add new fields
  - [x] Add language support
  - [x] Add conversation IDs
  - [x] Add entity indexes
  - [x] Add metadata fields
- [x] Create migration script
  - [x] Add schema updates
  - [x] Add data migration
  - [x] Add new indexes
  - [x] Add rollback support
- [ ] Test data consistency
  - [ ] Test migration script
  - [ ] Verify data integrity
  - [ ] Check index performance
  - [ ] Validate queries

Next Steps:
1. Test migration script in staging
2. Add data validation tests
3. Document schema changes
4. Create rollback procedures

### 5. Worker Thread Adaptation ✅
Implementation:
- Remove Apify worker
- Create new worker for Twitter API
- Maintain progress reporting
- Keep termination handling

Checklist:
- [x] Remove Apify worker code
- [x] Create new worker implementation
  - [x] Add session passing
  - [x] Add progress reporting
  - [x] Add batch processing
  - [x] Add error handling
- [x] Update worker message types
- [x] Maintain termination signals
- [x] Add new status reporting

Next Steps:
1. Add worker tests
2. Add error recovery mechanisms
3. Add performance monitoring
4. Document worker behavior

### 6. Code Cleanup 🔄
Implementation:
- Remove all Apify-related code
- Clean up unused imports
- Update type definitions
- Remove deprecated functions

Checklist:
- [x] Remove Apify code
  - [x] Remove worker code
  - [x] Remove scraper code
  - [x] Remove types
- [x] Update worker pool implementation
  - [x] Update worker path
  - [x] Update job interface
  - [x] Add new worker configuration
- [ ] Clean up imports
- [ ] Update type definitions
- [ ] Remove unused functions
- [ ] Update comments and documentation

Next Steps:
1. Remove Apify environment variables
2. Update Docker configuration
3. Clean up remaining imports
4. Update documentation

### 7. Testing & Validation 🔄
Implementation:
- Test new scraper functionality
- Verify data consistency
- Check error handling
- Validate rate limiting

Checklist:
- [ ] Unit tests for TwitterAPIClient
- [ ] Integration tests
- [ ] Rate limit testing
- [ ] Error handling tests
- [ ] Data consistency checks

### 8. UI Updates 🔄
Implementation:
- Update progress indicators
- Maintain error messages
- Keep loading states
- Update status displays

Checklist:
- [ ] Review progress displays
- [ ] Update error messages
- [ ] Test loading states
- [ ] Verify status updates
- [ ] Update any API-specific UI elements

### 9. Documentation 🔄
Implementation:
- Update API documentation
- Revise implementation details
- Update configuration guides
- Add migration notes

Checklist:
- [ ] Update API docs
- [ ] Revise implementation docs
- [ ] Update configuration guides
- [ ] Add troubleshooting section
- [ ] Document rate limits

### 10. Deployment 🔄
Implementation:
- Create deployment strategy
- Plan rollback procedure
- Update environment variables
- Test in staging

Checklist:
- [ ] Create deployment plan
- [ ] Setup staging environment
- [ ] Update environment variables
- [ ] Test rollback procedure
- [ ] Document deployment steps

## Migration Strategy
1. Develop new scraper implementation
2. Test thoroughly in development
3. Remove all Apify-related code
4. Deploy clean implementation
5. Verify functionality in production

## Rollback Plan
1. Maintain development branch with working implementation
2. Document API configuration steps
3. Keep clean database initialization scripts
4. Prepare fresh deployment procedure
5. Test clean deployment process

## Current vs New Implementation

### Data Structure Changes

```typescript
// TwitterAPIClient Interface
interface TwitterAPIClient {
  // Session-aware methods
  getCurrentUserTweets(params?: {
    includeReplies?: boolean;
    cursor?: string;
  }): Promise<{
    tweets: TwitterAPITweet[];
    hasNextPage: boolean;
    nextCursor?: string;
  }>;

  getCurrentUserProfile(): Promise<TwitterAPIProfile>;

  // General methods
  getUserTweets(params: {
    userId?: string;
    userName?: string;
    includeReplies?: boolean;
    cursor?: string;
  }): Promise<{
    tweets: TwitterAPITweet[];
    hasNextPage: boolean;
    nextCursor?: string;
  }>;

  getUserProfile(params: {
    userId?: string;
    userName?: string;
  }): Promise<TwitterAPIProfile>;
}

// API Helpers
interface TwitterAPI {
  getTwitterClient(): Promise<TwitterAPIClient>;
  getAuthenticatedTwitterClient(): Promise<TwitterAPIClient>;
}
```

## Next Steps

1. **API Route Updates**
   - Update all API routes to use new client
   - Implement proper error handling
   - Add rate limiting
   - Add caching where appropriate

2. **Worker Implementation**
   - Remove Apify worker
   - Create new worker for Twitter API
   - Add proper session handling
   - Implement progress tracking

3. **Database Updates**
   - Review schema for new data
   - Update save operations
   - Add migration scripts
   - Test data consistency

4. **Testing**
   - Add unit tests for client
   - Test session handling
   - Test rate limiting
   - Verify data consistency

## Legend
- ✅ Complete
- 🔄 In Progress
- ❌ Not Started

## Required Changes

1. **API Client Setup**
   - Replace Apify client with Twitter API client
   - Update environment variables
   - Implement rate limiting according to Twitter API limits
   - Add proper error handling for Twitter API responses

2. **Tweet Fetching Logic**
   ```typescript
   // New implementation structure
   class TwitterAPIClient {
     async getUserTweets(username: string, options?: {
       limit?: number;
       cursor?: string;
       includeReplies?: boolean;
     }): Promise<{
       tweets: TwitterAPITweet[];
       hasNextPage: boolean;
       nextCursor?: string;
     }>;
     
     async getUserProfile(username: string): Promise<TwitterAPIProfile>;
   }
   ```