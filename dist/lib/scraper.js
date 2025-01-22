"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeUserContent = scrapeUserContent;
exports.scrapeProfile = scrapeProfile;
exports.initScraper = initScraper;
const playwright_1 = require("playwright");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const worker_threads_1 = require("worker_threads");
const COOKIES_PATH = process.env.COOKIES_PATH || './data/cookies.json';
// Add output directory constants
const OUTPUT_DIR = './output';
const LOGS_DIR = `${OUTPUT_DIR}/logs`;
const DATA_DIR = `${OUTPUT_DIR}/data`;
const STATS_DIR = `${OUTPUT_DIR}/stats`;
const SELECTORS = {
    twitterEmailInput: 'input[name="text"]',
    twitterUsernameInput: '#id__wdc4n7hrju',
    twitterPasswordInput: 'input[name="password"]'
};
// Ensure cookies directory exists
async function ensureCookiesDir() {
    await promises_1.default.mkdir(path_1.default.dirname(COOKIES_PATH), { recursive: true });
}
// Load saved cookies
async function loadCookies() {
    try {
        await ensureCookiesDir();
        const data = await promises_1.default.readFile(COOKIES_PATH, 'utf-8');
        return JSON.parse(data);
    }
    catch (_a) {
        console.log('No saved cookies found');
        return [];
    }
}
// Save cookies for future use
async function saveCookies(cookies) {
    try {
        await ensureCookiesDir();
        await promises_1.default.writeFile(COOKIES_PATH, JSON.stringify(cookies, null, 2));
        console.log('Cookies saved successfully');
    }
    catch (error) {
        console.error('Failed to save cookies:', error);
    }
}
async function handleLogin(page, username, password) {
    console.log('Starting login process...');
    await page.goto('https://twitter.com/login');
    // Email/Username step
    console.log('Entering email...');
    const emailInput = await page.waitForSelector(SELECTORS.twitterEmailInput, { timeout: 10000 });
    if (!emailInput)
        throw new Error('Email input not found');
    await emailInput.fill(username);
    await page.keyboard.press('Enter');
    // Handle possible username confirmation (bot check)
    try {
        console.log('Checking for username confirmation...');
        const usernameInput = await page.waitForSelector(SELECTORS.twitterUsernameInput, { timeout: 5000 });
        if (usernameInput) {
            console.log('Bot check detected - username confirmation required');
            await usernameInput.fill(username);
            await page.keyboard.press('Enter');
        }
    }
    catch (_a) {
        console.log('No username confirmation required');
    }
    // Password step
    console.log('Waiting for password input...');
    const passwordInput = await page.waitForSelector(SELECTORS.twitterPasswordInput, { timeout: 10000 });
    if (!passwordInput)
        throw new Error('Password input not found');
    console.log('Entering password...');
    await passwordInput.fill(password);
    await page.keyboard.press('Enter');
    // Wait for successful login
    console.log('Waiting for login completion...');
    try {
        // Just wait for the home link to appear to confirm we're logged in
        await page.waitForSelector('[data-testid="AppTabBar_Home_Link"]', { timeout: 30000 });
        console.log('Login successful');
        return true;
    }
    catch (error) {
        // Check if we're stuck at login
        const currentUrl = page.url();
        if (currentUrl.includes('/login')) {
            throw new Error('Login failed - possible verification required');
        }
        throw error;
    }
}
async function extractTweetTimestamp(tweet) {
    try {
        const timestamp = await tweet.$eval('div.css-175oi2r.r-18u37iz.r-1wbh5a2.r-1ez5h0i > div > div.css-175oi2r.r-18u37iz.r-1q142lx > a > time', el => el.getAttribute('datetime'));
        return timestamp;
    }
    catch (_a) {
        return null;
    }
}
// Add output handling functions
async function ensureOutputDirs() {
    await promises_1.default.mkdir(OUTPUT_DIR, { recursive: true });
    await promises_1.default.mkdir(LOGS_DIR, { recursive: true });
    await promises_1.default.mkdir(DATA_DIR, { recursive: true });
    await promises_1.default.mkdir(STATS_DIR, { recursive: true });
}
async function saveScrapedData(username, data, stats) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    // Save full data
    const dataPath = path_1.default.join(DATA_DIR, `${username}_${timestamp}.json`);
    await promises_1.default.writeFile(dataPath, JSON.stringify(data, null, 2));
    // Save simplified data
    const simplifiedData = data.map(tweet => ({
        text: tweet.text,
        timestamp: tweet.timestamp,
        isReply: tweet.isReply
    }));
    const simplePath = path_1.default.join(DATA_DIR, `${username}_${timestamp}_simple.json`);
    await promises_1.default.writeFile(simplePath, JSON.stringify(simplifiedData, null, 2));
    // Save stats
    const statsPath = path_1.default.join(STATS_DIR, `${username}_${timestamp}_stats.json`);
    await promises_1.default.writeFile(statsPath, JSON.stringify(stats, null, 2));
    return {
        dataPath,
        simplePath,
        statsPath
    };
}
async function navigateToReplies(page) {
    console.log('Navigating to replies tab...');
    const repliesTabSelector = '#react-root > div > div > div.css-175oi2r.r-1f2l425.r-13qz1uu.r-417010.r-18u37iz > main > div > div > div > div > div > div:nth-child(3) > div > div > div:nth-child(2) > nav > div > div.css-175oi2r.r-1adg3ll.r-16y2uox.r-1wbh5a2.r-1pi2tsx > div > div:nth-child(2) > a > div > div';
    await page.waitForSelector(repliesTabSelector);
    await page.click(repliesTabSelector);
    await page.waitForTimeout(2000); // Wait for content to load
}
async function waitForProfile(page, username) {
    console.log('Waiting for profile page to load...');
    // Wait for essential profile elements
    await Promise.all([
        page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 30000 }),
        page.waitForSelector('[data-testid="UserName"]', { timeout: 30000 })
    ]);
    // Verify we're on the correct profile
    const handle = await page.$eval('[data-testid="UserName"]', el => el.textContent);
    if (!handle || !handle.toLowerCase().includes(username.toLowerCase())) {
        throw new Error(`Wrong profile loaded: expected @${username}, got ${handle}`);
    }
    console.log('Profile page loaded successfully');
}
async function scrapeUserContent(page, username) {
    await ensureOutputDirs();
    const startTime = Date.now();
    console.log('Starting scrape...');
    // Verify we're on the correct profile page
    await waitForProfile(page, username);
    // Scrape posts first (Phase 1)
    console.log('Phase 1: Scanning and scraping posts...');
    const posts = await scrapeTweets(page, username, false);
    console.log(`Collected ${posts.length} posts`);
    // Send posts progress
    if (worker_threads_1.parentPort) {
        worker_threads_1.parentPort.postMessage({
            tweets: posts,
            scanProgress: {
                phase: 'posts',
                count: posts.length
            }
        });
    }
    // Navigate to replies tab
    await navigateToReplies(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    // Scrape replies (Phase 2)
    console.log('Phase 2: Scanning and scraping replies...');
    const replies = await scrapeTweets(page, username, true);
    console.log(`Collected ${replies.length} replies`);
    // Send replies progress
    if (worker_threads_1.parentPort) {
        worker_threads_1.parentPort.postMessage({
            tweets: replies,
            scanProgress: {
                phase: 'replies',
                count: replies.length
            }
        });
    }
    const allTweets = [...posts, ...replies];
    // Save data with stats
    const stats = {
        username,
        totalPosts: posts.length,
        totalReplies: replies.length,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
    };
    const paths = await saveScrapedData(username, allTweets, stats);
    console.log('Data saved:', paths);
    return allTweets;
}
async function scrapeTweets(page, username, isRepliesTab = false) {
    const tweets = [];
    const seenTweetIds = new Set();
    let lastHeight = 0;
    let noNewContentCount = 0;
    const MAX_NO_NEW_CONTENT_RETRIES = 5;
    console.log(`\nStarting tweet collection in ${isRepliesTab ? 'replies' : 'posts'} tab`);
    console.log('Current URL:', await page.url());
    while (noNewContentCount < MAX_NO_NEW_CONTENT_RETRIES) {
        // Get all tweet containers with exact selector
        const baseSelector = '#react-root > div > div > div.css-175oi2r.r-1f2l425.r-13qz1uu.r-417010.r-18u37iz > main > div > div > div > div.css-175oi2r.r-kemksi.r-1kqtdi0.r-1ua6aaf.r-th6na.r-1phboty.r-16y2uox.r-184en5c.r-1abdc3e.r-1lg4w6u.r-f8sm7e.r-13qz1uu.r-1ye8kvj > div > div:nth-child(3) > div > div > section > div > div';
        console.log('Looking for tweets with selector:', baseSelector);
        const tweetElements = await page.$$(`${baseSelector} > div`);
        console.log(`\nFound ${tweetElements.length} tweet elements`);
        if (tweetElements.length === 0) {
            console.log('No tweet elements found, checking page content...');
            const content = await page.content();
            console.log('Page content preview:', content.substring(0, 500));
        }
        const initialTweetCount = tweets.length;
        for (const tweet of tweetElements) {
            try {
                // Log the HTML structure we're looking at
                const html = await tweet.evaluate(el => el.outerHTML);
                console.log('\nExamining tweet element:', html.substring(0, 500) + '...');
                // Try to get tweet ID from either regular tweet or retweet
                let tweetId = null;
                let articleEl = null;
                // First try regular tweet
                articleEl = await tweet.$('article');
                if (!articleEl) {
                    // Then try retweet
                    const retweetContainer = await tweet.$('div.css-175oi2r.r-1adg3ll.r-1ny4l3l > div');
                    if (retweetContainer) {
                        articleEl = await retweetContainer.$('article');
                    }
                }
                if (articleEl) {
                    const fullId = await articleEl.getAttribute('aria-labelledby');
                    // Only take the first ID from the space-separated list
                    tweetId = fullId ? fullId.split(' ')[0] : null;
                    console.log('Found tweet ID:', tweetId);
                }
                if (!tweetId) {
                    console.log('No tweet ID found - skipping');
                    continue;
                }
                // Clean up the tweet ID to ensure consistent comparison
                tweetId = tweetId.trim();
                if (seenTweetIds.has(tweetId)) {
                    console.log('Duplicate tweet ID found - skipping');
                    continue;
                }
                seenTweetIds.add(tweetId);
                // Extract tweet text with improved selector
                const text = await tweet.evaluate((el) => {
                    const tweetTextDiv = el.querySelector('div[data-testid="tweetText"]');
                    if (!tweetTextDiv)
                        return null;
                    const parts = [];
                    // Process all direct children
                    for (const child of tweetTextDiv.children) {
                        if (child.tagName === 'SPAN') {
                            // Handle regular text spans
                            if (child.classList.contains('css-1jxf684')) {
                                parts.push(child.textContent);
                            }
                            // Handle hashtag/mention links
                            const link = child.querySelector('a');
                            if (link) {
                                parts.push(link.textContent);
                            }
                        }
                        else if (child.tagName === 'IMG') {
                            // Handle emojis
                            parts.push(child.getAttribute('alt') || '🔄');
                        }
                    }
                    return parts.join(' ').trim();
                }).catch(() => null);
                console.log('Extracted text:', text);
                // Get handle for filtering replies
                const handle = await tweet.evaluate(el => {
                    const handleSpan = el.querySelector('div.css-175oi2r.r-18u37iz.r-1wbh5a2.r-1ez5h0i > div > div.css-175oi2r.r-1wbh5a2.r-dnmrzs > a > div > span');
                    return (handleSpan === null || handleSpan === void 0 ? void 0 : handleSpan.textContent) || null;
                });
                console.log('Tweet handle:', handle);
                // Only process tweets from the user in replies tab
                if (isRepliesTab && handle !== `@${username}`) {
                    console.log('Skipping - not a user reply');
                    continue;
                }
                // Get timestamp
                const timestamp = await extractTweetTimestamp(tweet);
                console.log('Tweet timestamp:', timestamp);
                tweets.push({
                    id: tweetId,
                    text,
                    metrics: {
                        likes: null,
                        retweets: null,
                        views: null
                    },
                    images: [],
                    timestamp,
                    isReply: isRepliesTab
                });
                console.log('Successfully processed tweet\n---');
            }
            catch (error) {
                console.error('Error processing tweet:', error instanceof Error ? error.message : 'Unknown error');
                continue;
            }
        }
        // Check if we got any new tweets
        if (tweets.length === initialTweetCount) {
            noNewContentCount++;
            console.log(`No new tweets found. Retry attempt ${noNewContentCount}/${MAX_NO_NEW_CONTENT_RETRIES}`);
        }
        else {
            noNewContentCount = 0;
        }
        // Scroll down to load more tweets
        await page.evaluate(() => window.scrollBy(0, 1000));
        await page.waitForTimeout(3000); // Wait longer for content to load
        // Get the new page height
        const newHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        if (newHeight === lastHeight && noNewContentCount >= MAX_NO_NEW_CONTENT_RETRIES) {
            console.log('Reached the end of the timeline - no more scrolling possible');
            break;
        }
        lastHeight = newHeight;
        console.log(`Collected ${tweets.length} tweets so far...`);
        // Send progress update after each batch
        if (worker_threads_1.parentPort) {
            worker_threads_1.parentPort.postMessage({
                tweets,
                scanProgress: {
                    phase: isRepliesTab ? 'replies' : 'posts',
                    count: tweets.length
                }
            });
        }
    }
    console.log(`\nFinished collecting tweets in ${isRepliesTab ? 'replies' : 'posts'} tab`);
    console.log(`Total unique tweets collected: ${tweets.length}`);
    return tweets;
}
async function scrapeProfile(page) {
    try {
        console.log('Starting profile scrape...');
        // Get profile info
        const name = await page.$eval('[data-testid="primaryColumn"] [data-testid="UserName"]', (el) => el.textContent).catch(() => null);
        const bio = await page.$eval('[data-testid="UserDescription"]', (el) => el.textContent).catch(() => null);
        const followersCount = await page.$eval('[data-testid="primaryColumn"] [href$="/followers"]', (el) => el.textContent).catch(() => null);
        const followingCount = await page.$eval('[data-testid="primaryColumn"] [href$="/following"]', (el) => el.textContent).catch(() => null);
        return { name, bio, followersCount, followingCount };
    }
    catch (error) {
        console.error('Error in scrapeProfile:', error);
        throw error;
    }
}
async function initScraper() {
    console.log('Starting browser initialization...');
    console.log('Environment check:', {
        NODE_ENV: process.env.NODE_ENV,
        hasUsername: !!process.env.SCRAPER_USERNAME,
        hasPassword: !!process.env.SCRAPER_PASSWORD,
        envKeys: Object.keys(process.env).filter(key => key.startsWith('SCRAPER_'))
    });
    try {
        // First, check if we have the required credentials
        const username = process.env.SCRAPER_USERNAME;
        const password = process.env.SCRAPER_PASSWORD;
        if (!username || !password) {
            console.error('Missing credentials:', { username: !!username, password: !!password });
            throw new Error('Scraper credentials not found in environment variables');
        }
        console.log('Launching browser...');
        const browser = await playwright_1.chromium.launch({
            headless: false,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--hide-scrollbars',
                '--mute-audio',
                '--window-size=1280,800'
            ]
        });
        console.log('Browser launched successfully');
        console.log('Creating browser context...');
        const context = await browser.newContext({
            viewport: {
                width: 1280 + Math.floor(Math.random() * 100),
                height: 800 + Math.floor(Math.random() * 100)
            },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            deviceScaleFactor: 1,
            hasTouch: false,
            locale: 'en-US',
            timezoneId: 'America/New_York',
            permissions: ['geolocation'],
            colorScheme: 'dark',
            isMobile: false,
            javaScriptEnabled: true,
            bypassCSP: true,
            ignoreHTTPSErrors: true,
            acceptDownloads: false,
            extraHTTPHeaders: {
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });
        console.log('Browser context created');
        // Add human-like browser fingerprint
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        });
        console.log('Browser fingerprint added');
        console.log('Creating new page...');
        const page = await context.newPage();
        console.log('Page created');
        // Set longer timeouts for navigation
        page.setDefaultTimeout(60000); // 60 seconds
        page.setDefaultNavigationTimeout(60000);
        // Try to load saved cookies
        const savedCookies = await loadCookies();
        if (savedCookies.length > 0) {
            console.log('Found saved cookies, attempting to restore session...');
            await context.addCookies(savedCookies);
            // Test if cookies are still valid with a quick navigation
            try {
                // Just do a quick navigation to verify cookies
                await page.goto('https://twitter.com', {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                const isLoggedIn = await page.evaluate(() => !document.querySelector('a[href="/login"]'));
                if (isLoggedIn) {
                    console.log('Successfully restored session from cookies');
                    return { browser, page };
                }
                console.log('Saved cookies expired, proceeding with login');
            }
            catch (error) {
                console.log('Cookie validation failed:', error);
                console.log('Proceeding with fresh login');
            }
        }
        // Login with scraper account
        try {
            console.log('Starting login process with credentials...');
            const loginSuccess = await handleLogin(page, username, password);
            if (loginSuccess) {
                // Save cookies for future use
                const cookies = await context.cookies();
                await saveCookies(cookies);
            }
            return { browser, page };
        }
        catch (error) {
            console.error('Login error:', error);
            await browser.close();
            throw error;
        }
    }
    catch (error) {
        console.error('Fatal error in initScraper:', error);
        throw error;
    }
}
