import { parentPort, workerData } from 'worker_threads'
import { initScraper, scrapeProfile, scrapeUserContent } from './scraper'

if (!parentPort) {
  throw new Error('This file must be run as a worker thread')
}

async function runScraper() {
  let browser;
  let page;

  try {
    const { username } = workerData

    // Send initialization progress
    parentPort!.postMessage({ progress: 5, status: 'Starting browser...' })
    
    // Initialize browser
    console.log('🌐 Initializing browser...')
    const scraper = await initScraper()
    browser = scraper.browser
    page = scraper.page
    console.log('✅ Browser initialized')
    
    parentPort!.postMessage({ progress: 15, status: 'Browser ready' })

    // Navigate to profile
    console.log('🔄 Navigating to profile:', username)
    parentPort!.postMessage({ progress: 25, status: 'Navigating to profile...' })
    
    // Try both twitter.com and x.com domains
    try {
      await page.goto(`https://twitter.com/${username}`, { waitUntil: 'domcontentloaded' })
    } catch {
      await page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded' })
    }
    
    parentPort!.postMessage({ progress: 35, status: 'Waiting for page load...' })
    console.log('⏳ Waiting for page load...')
    
    // Wait for essential profile elements
    await page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 30000 })
    console.log('✅ Page loaded')

    // Get profile data
    console.log('📊 Extracting profile data...')
    parentPort!.postMessage({ progress: 45, status: 'Extracting profile data...' })
    const profile = await scrapeProfile(page)
    console.log('✅ Profile data extracted:', profile)
    parentPort!.postMessage({ progress: 60, status: 'Profile data extracted' })

    // Get tweets and replies
    console.log('🐦 Starting content collection...')
    parentPort!.postMessage({ progress: 65, status: 'Collecting posts...' })
    const tweets = await scrapeUserContent(page, username)
    console.log(`✅ Collected ${tweets.length} items (${tweets.filter(t => !t.isReply).length} posts, ${tweets.filter(t => t.isReply).length} replies)`)
    parentPort!.postMessage({ progress: 90, status: 'Content collected' })

    // Clean up
    console.log('🧹 Cleaning up...')
    parentPort!.postMessage({ progress: 95, status: 'Cleaning up...' })
    await browser.close()
    console.log('✅ Browser closed')
    
    // Send final data
    console.log('🏁 Sending final data...')
    parentPort!.postMessage({ 
      progress: 100,
      status: 'Complete',
      data: {
        profile,
        tweets
      }
    })

  } catch (error) {
    console.error('❌ Scrape error:', error)
    if (browser) await browser.close()
    parentPort!.postMessage({ 
      error: error instanceof Error ? error.message : 'Scrape failed',
      progress: 0
    })
  }
}

// Start the scraping process
runScraper() 