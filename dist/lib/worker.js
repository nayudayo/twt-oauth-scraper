"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const scraper_1 = require("./scraper");
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
        worker_threads_1.parentPort.postMessage({ progress: 15, status: 'Browser ready' });
        // Navigate to profile
        console.log('🔄 Navigating to profile:', username);
        worker_threads_1.parentPort.postMessage({ progress: 25, status: 'Navigating to profile...' });
        // Try both twitter.com and x.com domains
        try {
            await page.goto(`https://twitter.com/${username}`, { waitUntil: 'domcontentloaded' });
        }
        catch (_a) {
            await page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded' });
        }
        worker_threads_1.parentPort.postMessage({ progress: 35, status: 'Waiting for page load...' });
        console.log('⏳ Waiting for page load...');
        // Wait for essential profile elements
        await page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 30000 });
        console.log('✅ Page loaded');
        // Get profile data
        console.log('📊 Extracting profile data...');
        worker_threads_1.parentPort.postMessage({ progress: 45, status: 'Extracting profile data...' });
        const profile = await (0, scraper_1.scrapeProfile)(page);
        console.log('✅ Profile data extracted:', profile);
        worker_threads_1.parentPort.postMessage({ progress: 60, status: 'Profile data extracted' });
        // Get tweets and replies
        console.log('🐦 Starting content collection...');
        worker_threads_1.parentPort.postMessage({ progress: 65, status: 'Collecting posts...' });
        const tweets = await (0, scraper_1.scrapeUserContent)(page, username);
        console.log(`✅ Collected ${tweets.length} items (${tweets.filter(t => !t.isReply).length} posts, ${tweets.filter(t => t.isReply).length} replies)`);
        worker_threads_1.parentPort.postMessage({ progress: 90, status: 'Content collected' });
        // Clean up
        console.log('🧹 Cleaning up...');
        worker_threads_1.parentPort.postMessage({ progress: 95, status: 'Cleaning up...' });
        await browser.close();
        console.log('✅ Browser closed');
        // Send final data
        console.log('🏁 Sending final data...');
        worker_threads_1.parentPort.postMessage({
            progress: 100,
            status: 'Complete',
            data: {
                profile,
                tweets
            }
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
