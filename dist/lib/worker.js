"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const scraper_1 = require("./scraper");
const openai_1 = require("./openai");
if (!worker_threads_1.parentPort) {
    throw new Error('This file must be run as a worker thread');
}
async function runScraper() {
    let browser;
    let page;
    try {
        const { username: targetUsername } = worker_threads_1.workerData; // This is the profile we want to scrape
        // Send initialization progress
        worker_threads_1.parentPort.postMessage({ progress: 5, status: 'Starting browser...' });
        // Initialize browser and login with scraper credentials
        console.log('🌐 Initializing browser...');
        const scraper = await (0, scraper_1.initScraper)();
        browser = scraper.browser;
        page = scraper.page;
        console.log('✅ Browser initialized and logged in');
        worker_threads_1.parentPort.postMessage({ progress: 20, status: 'Browser ready' });
        // Navigate to target profile
        console.log('🔄 Navigating to target profile:', targetUsername);
        worker_threads_1.parentPort.postMessage({ progress: 30, status: 'Navigating to profile...' });
        // Navigate to profile with better error handling
        const profileUrl = `https://twitter.com/${targetUsername}`;
        console.log('Attempting to navigate to:', profileUrl);
        try {
            // Changed to use domcontentloaded instead of networkidle for initial navigation
            const response = await page.goto(profileUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            if (!response) {
                throw new Error('No response from navigation');
            }
            const status = response.status();
            console.log('Navigation response status:', status);
            if (status === 404) {
                throw new Error(`Profile not found: ${targetUsername}`);
            }
            if (status !== 200) {
                throw new Error(`Unexpected status code: ${status}`);
            }
            // Get current URL after any redirects
            const currentUrl = page.url();
            console.log('Current URL after navigation:', currentUrl);
            // If we got redirected to login, throw error
            if (currentUrl.includes('/login')) {
                throw new Error('Session expired - redirected to login page');
            }
            // Wait for initial content to be visible
            await page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 30000 });
            console.log('Primary column found, proceeding with scraping...');
        }
        catch (error) {
            console.error('Navigation failed:', error);
            throw error;
        }
        worker_threads_1.parentPort.postMessage({ progress: 40, status: 'Waiting for page load...' });
        console.log('⏳ Waiting for page load...');
        // Wait for essential profile elements with better selectors and error handling
        try {
            console.log('Waiting for profile elements...');
            // Wait for username first
            const usernameElement = await page.waitForSelector('[data-testid="UserName"]', { timeout: 30000 });
            if (!usernameElement) {
                throw new Error('Username element not found');
            }
            // Get and verify username immediately
            const currentHandle = await usernameElement.textContent();
            console.log('Current profile handle:', currentHandle);
            if (!currentHandle || !currentHandle.toLowerCase().includes(targetUsername.toLowerCase())) {
                throw new Error(`Wrong profile loaded: expected @${targetUsername}, got ${currentHandle}`);
            }
            console.log('✅ Confirmed correct profile loaded');
            // Now wait for the rest of the elements
            await Promise.all([
                page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 30000 }),
                page.waitForLoadState('domcontentloaded')
            ]);
            console.log('✅ All profile elements loaded');
            // Immediately start scraping after profile verification
            console.log('🔄 Starting scraping process...');
            // Get profile data first
            console.log('📊 Extracting profile data...');
            worker_threads_1.parentPort.postMessage({ progress: 50, status: 'Extracting profile data...' });
            const profile = await (0, scraper_1.scrapeProfile)(page);
            console.log('✅ Profile data extracted:', profile);
            // Then immediately start tweet collection
            console.log('🐦 Starting content collection...');
            worker_threads_1.parentPort.postMessage({
                progress: 60,
                status: 'Starting content collection...',
                phase: 'posts',
                scanProgress: { phase: 'posts', count: 0 }
            });
            const tweets = await (0, scraper_1.scrapeUserContent)(page, targetUsername);
            // Calculate final stats
            const postsCount = tweets.filter(t => !t.isReply).length;
            const repliesCount = tweets.filter(t => t.isReply).length;
            console.log(`✅ Collected ${tweets.length} items (${postsCount} posts, ${repliesCount} replies)`);
            worker_threads_1.parentPort.postMessage({
                progress: 90,
                status: 'Content collection complete',
                phase: 'complete',
                scanProgress: { phase: 'complete', count: tweets.length },
                tweets: tweets // Send tweets with progress update
            });
            // Clean up
            console.log('🧹 Cleaning up...');
            worker_threads_1.parentPort.postMessage({
                progress: 95,
                status: 'Cleaning up...',
                phase: 'complete',
                scanProgress: { phase: 'complete', count: tweets.length }
            });
            await browser.close();
            console.log('✅ Browser closed');
            // Send final data
            console.log('🏁 Sending final data...');
            // Perform personality analysis
            console.log('🧠 Analyzing personality...');
            worker_threads_1.parentPort.postMessage({
                progress: 95,
                status: 'Analyzing personality...',
                phase: 'analysis',
                scanProgress: { phase: 'analysis', count: tweets.length }
            });
            const analysis = await (0, openai_1.analyzePersonality)(tweets, profile);
            worker_threads_1.parentPort.postMessage({
                progress: 100,
                status: 'Complete',
                type: 'complete',
                data: {
                    profile,
                    tweets,
                    analysis
                }
            });
            // Add explicit completion message
            worker_threads_1.parentPort.postMessage({
                type: 'done',
                progress: 100,
                status: 'Scraping and analysis completed'
            });
        }
        catch (error) {
            console.error('Failed to detect profile elements:', error);
            // Log the current page content for debugging
            const content = await page.content();
            console.log('Current page content:', content.substring(0, 500));
            throw new Error('Failed to load profile page: ' + error);
        }
    }
    catch (error) {
        console.error('❌ Scrape error:', error);
        if (browser)
            await browser.close();
        worker_threads_1.parentPort.postMessage({
            error: error instanceof Error ? error.message : 'Scrape failed',
            progress: 0
        });
    }
}
// Start the scraping process
runScraper();
