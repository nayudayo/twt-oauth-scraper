# Simple Concurrent Users Implementation

## Current Issues
1. No user isolation in memory and database operations
2. No rate limiting for API endpoints
3. No resource cleanup for inactive users
4. Potential race conditions in chat processing

## Implementation Plan

### 1. Basic Rate Limiting
```typescript
// src/lib/rate-limit.ts
class SimpleRateLimiter {
  private requests = new Map<string, number[]>();
  
  isAllowed(userId: string): boolean {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];
    
    // Keep only requests from last minute
    const recentRequests = userRequests.filter(time => 
      now - time < 60 * 1000
    );
    
    // Allow max 30 requests per minute
    if (recentRequests.length >= 30) {
      return false;
    }
    
    recentRequests.push(now);
    this.requests.set(userId, recentRequests);
    return true;
  }
}
```

### 2. User Memory Isolation
```typescript
// src/lib/memory.ts
class UserMemoryManager {
  // Redis for short-term (4 messages)
  private redis: Redis.Client;
  // Chroma for long-term
  private chroma: Chroma.Client;
  
  async storeMessage(userId: string, message: string) {
    const key = `user:${userId}:messages`;
    await this.redis.lpush(key, message);
    await this.redis.ltrim(key, 0, 3); // Keep only last 4
    
    // Store in long-term memory
    await this.chroma.addDocument(
      `user_${userId}`,
      message
    );
  }
  
  async getContext(userId: string) {
    // Get recent messages from Redis
    const recent = await this.redis.lrange(
      `user:${userId}:messages`, 
      0, 
      3
    );
    
    // Get relevant history from Chroma
    const history = await this.chroma.query(
      `user_${userId}`,
      5  // Get 5 most relevant messages
    );
    
    return { recent, history };
  }
}
```

### 3. Simple Cleanup Job
```typescript
// src/lib/cleanup.ts
class SimpleCleanup {
  private readonly INACTIVE_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours
  
  async cleanupInactiveUsers() {
    const now = Date.now();
    
    // Get all users
    const users = await db.getAllUsers();
    
    for (const user of users) {
      const lastActive = await db.getLastActive(user.id);
      
      if (now - lastActive > this.INACTIVE_THRESHOLD) {
        // Cleanup Redis
        await redis.del(`user:${user.id}:messages`);
        
        // Archive Chroma collection
        await chroma.archiveCollection(`user_${user.id}`);
      }
    }
  }
}
```

### 4. Enhanced Chat Route
```typescript
// src/app/api/chat/route.ts
export async function POST(req: Request) {
  try {
    const { userId, message } = await req.json();
    
    // Check rate limit
    if (!rateLimiter.isAllowed(userId)) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429 }
      );
    }
    
    // Get user context
    const context = await memoryManager.getContext(userId);
    
    // Process message
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        ...context.recent,
        { role: "user", content: message }
      ]
    });
    
    // Store the interaction
    await memoryManager.storeMessage(userId, message);
    await memoryManager.storeMessage(userId, response.choices[0].message.content);
    
    return NextResponse.json({ response: response.choices[0].message.content });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    );
  }
}
```

## Implementation Steps

1. **Basic Setup** (Day 1-2)
   - [ ] Set up Redis client
   - [ ] Set up Chroma client
   - [ ] Implement rate limiter

2. **Memory Management** (Day 3-4)
   - [ ] Implement UserMemoryManager
   - [ ] Add message storage logic
   - [ ] Add context retrieval

3. **Cleanup** (Day 5)
   - [ ] Implement cleanup job
   - [ ] Set up daily cleanup schedule
   - [ ] Add cleanup logging

4. **Integration** (Day 6-7)
   - [ ] Update chat route
   - [ ] Add error handling
   - [ ] Test with multiple users

## Testing

```typescript
describe('Chat System', () => {
  it('should handle multiple users', async () => {
    const users = ['user1', 'user2', 'user3'];
    const results = await Promise.all(
      users.map(u => sendMessage(u, 'test'))
    );
    expect(results.every(r => r.ok)).toBe(true);
  });
  
  it('should enforce rate limits', async () => {
    const user = 'test_user';
    const promises = Array(31).fill(null).map(() => 
      sendMessage(user, 'test')
    );
    const results = await Promise.all(promises);
    expect(results.some(r => r.status === 429)).toBe(true);
  });
});
```

This simplified implementation focuses on the essential features needed for concurrent user support without over-engineering. It provides:
- Basic rate limiting
- User memory isolation
- Simple cleanup mechanism
- Straightforward chat processing

The system can be enhanced later if needed, but this provides a solid foundation for handling multiple users efficiently.