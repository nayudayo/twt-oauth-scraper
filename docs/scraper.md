# Twitter Scraper Documentation

## Selectors

### Authentication
```css
/* Login Form Elements */
input[name="text"]           /* Email/Username input field */
#id__wdc4n7hrju             /* Username confirmation input (bot check) */
input[name="password"]       /* Password input field */
```

### Profile Elements
```css
/* Main Profile Container */
[data-testid="primaryColumn"]     /* Main profile column */
[data-testid="UserName"]          /* Username display */
[data-testid="UserDescription"]   /* User bio */

/* Follow Stats */
[href$="/followers"]              /* Followers count */
[href$="/following"]              /* Following count */
```

### Tweet Elements
```css
/* Tweet Container */
div[data-testid="tweetText"]      /* Tweet text content */
article                           /* Tweet article container */
time                              /* Tweet timestamp */

/* Tweet Content Structure */
.css-1jxf684                      /* Text span */
.css-175oi2r.r-18u37iz           /* User info container */
.css-175oi2r.r-1wbh5a2.r-dnmrzs  /* Handle container */
```

## Flow Documentation

### 1. Authentication Flow
1. Navigate to login page
2. Enter email/username
3. Handle potential bot check (username confirmation)
4. Enter password
5. Wait for successful login (AppTabBar_Home_Link presence)

### 2. Profile Scraping Flow
1. Navigate to user profile
2. Verify correct profile loaded
3. Extract profile information:
   - Username
   - Bio
   - Followers count
   - Following count

### 3. Tweet Scraping Flow
1. Posts Phase:
   - Start on main profile tab
   - Collect tweets until no new content
   - Track unique tweet IDs
   - Extract tweet data:
     - Text content
     - Timestamp
     - URL
     - Metrics

2. Replies Phase:
   - Navigate to replies tab
   - Reset scroll position
   - Collect replies using same process
   - Filter for user's replies only

### 4. Scroll and Load Logic
- Scroll 1000px at a time
- Wait 3 seconds for content load
- Track scroll height changes
- Retry up to 5 times if no new content
- Break if height unchanged and max retries reached

### 5. Data Processing
- Clean and normalize text content
- Handle emojis and special characters
- Deduplicate tweets by ID
- Format timestamps consistently
- Structure final tweet object:
  ```typescript
  {
    id: string
    text: string
    url: string
    createdAt: string
    timestamp: string
    metrics: {
      likes: number | null
      retweets: number | null
      views: number | null
    }
    images: string[]
    isReply: boolean
  }
  ```

## Error Handling
- Login verification failures
- Wrong profile loaded
- Missing tweet elements
- Rate limiting detection
- Network timeouts
- Invalid content structure

## Browser Configuration
- Headless mode
- Custom viewport
- Human-like fingerprint
- Timezone and locale settings
- Extended timeouts
- Anti-detection measures 