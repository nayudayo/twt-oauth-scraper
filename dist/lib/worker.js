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
        const { username } = worker_threads_1.workerData;
        // Send initialization progress
        worker_threads_1.parentPort.postMessage({ progress: 5, status: 'Starting browser...' });
        // Initialize browser
        console.log('🌐 Initializing browser...');
        const scraper = await (0, scraper_1.initScraper)();
        browser = scraper.browser;
        page = scraper.page;
        console.log('✅ Browser initialized');
        worker_threads_1.parentPort.postMessage({ progress: 20, status: 'Browser ready' });
        // Navigate to profile
        console.log('🔄 Navigating to profile:', username);
        worker_threads_1.parentPort.postMessage({ progress: 30, status: 'Navigating to profile...' });
        // Try both twitter.com and x.com domains
        try {
            await page.goto(`https://twitter.com/${username}`, { waitUntil: 'domcontentloaded' });
        }
        catch (_a) {
            await page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded' });
        }
        worker_threads_1.parentPort.postMessage({ progress: 40, status: 'Waiting for page load...' });
        console.log('⏳ Waiting for page load...');
        // Wait for essential profile elements
        await page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 30000 });
        console.log('✅ Page loaded');
        // Get profile data
        console.log('📊 Extracting profile data...');
        worker_threads_1.parentPort.postMessage({ progress: 50, status: 'Extracting profile data...' });
        const profile = await (0, scraper_1.scrapeProfile)(page);
        console.log('✅ Profile data extracted:', profile);
        // Get tweets and replies
        console.log('🐦 Starting content collection...');
        worker_threads_1.parentPort.postMessage({
            progress: 60,
            status: 'Starting content collection...',
            phase: 'posts',
            scanProgress: { phase: 'posts', count: 0 }
        });
        const tweets = await (0, scraper_1.scrapeUserContent)(page, username);
        // Calculate final stats
        const postsCount = tweets.filter(t => !t.isReply).length;
        const repliesCount = tweets.filter(t => t.isReply).length;
        console.log(`✅ Collected ${tweets.length} items (${postsCount} posts, ${repliesCount} replies)`);
        worker_threads_1.parentPort.postMessage({
            progress: 90,
            status: 'Content collection complete',
            scanProgress: { phase: 'complete', count: tweets.length }
        });
        // Clean up
        console.log('🧹 Cleaning up...');
        worker_threads_1.parentPort.postMessage({
            progress: 95,
            status: 'Cleaning up...',
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
            scanProgress: { phase: 'analysis', count: tweets.length }
        });
        const analysis = await (0, openai_1.analyzePersonality)(tweets, profile);
        worker_threads_1.parentPort.postMessage({
            progress: 100,
            status: 'Complete',
            type: 'complete',
            tweets: tweets,
            data: {
                profile,
                tweets,
                analysis
            },
            scanProgress: { phase: 'complete', count: tweets.length }
        });
        // Add explicit completion message
        worker_threads_1.parentPort.postMessage({
            type: 'done',
            progress: 100,
            status: 'Scraping and analysis completed'
        });
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
