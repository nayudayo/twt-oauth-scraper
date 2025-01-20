import { initScraper, scrapeProfile, scrapeTweets } from '@/lib/scraper'
import { getToken } from 'next-auth/jwt'
import { NextRequest } from 'next/server'
import type { TwitterProfile, Tweet } from '@/types/scraper'

interface EventData {
  error?: string
  progress?: number
  status?: string
  data?: {
    profile: TwitterProfile
    tweets: Tweet[]
  }
}

export async function POST(req: NextRequest) {
  // Create the stream first
  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  // Start the response immediately
  const response = new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })

  // Helper function to send events
  const send = async (data: EventData) => {
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
    } catch (error) {
      console.error('Error sending event:', error)
    }
  }

  // Start the scraping process in the background
  const scrapeProcess = async () => {
    let browser;
    let page;

    try {
      console.log('🔑 Getting auth token...')
      const token = await getToken({ req })
      if (!token?.accessToken || !token?.username) {
        console.error('❌ No access token or username found')
        await send({ error: 'No access token or username found', progress: 0 })
        return
      }
      console.log('✅ Token found for user:', token.username)

      // Start with initializing message
      await send({ progress: 5, status: 'Starting browser...' })
      
      // Initialize browser
      console.log('🌐 Initializing browser...')
      const scraper = await initScraper()
      browser = scraper.browser
      page = scraper.page
      console.log('✅ Browser initialized')
      
      await send({ progress: 15, status: 'Browser ready' })

      // Navigate to profile
      console.log('🔄 Navigating to profile:', token.username)
      await send({ progress: 25, status: 'Navigating to profile...' })
      
      // Try both twitter.com and x.com domains
      try {
        await page.goto(`https://twitter.com/${token.username}`, { waitUntil: 'domcontentloaded' })
      } catch {
        await page.goto(`https://x.com/${token.username}`, { waitUntil: 'domcontentloaded' })
      }
      
      await send({ progress: 35, status: 'Waiting for page load...' })
      console.log('⏳ Waiting for page load...')
      
      // Wait for essential profile elements
      console.log('Waiting for profile content...')
      await page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 30000 })
      console.log('✅ Page loaded')

      // Get profile data
      console.log('📊 Extracting profile data...')
      await send({ progress: 45, status: 'Extracting profile data...' })
      const profile = await scrapeProfile(page)
      console.log('✅ Profile data extracted:', profile)
      await send({ progress: 60, status: 'Profile data extracted' })

      // Get tweets
      console.log('🐦 Starting tweet collection...')
      await send({ progress: 65, status: 'Starting tweet collection...' })
      const tweets = await scrapeTweets(page, async (processed) => {
        await send({ 
          progress: Math.min(65 + Math.floor((processed / 100) * 25), 90), // Cap at 90%
          status: `Processing tweets (${processed} collected)...` 
        })
      })
      console.log(`✅ Collected ${tweets.length} tweets`)
      await send({ progress: 90, status: 'Tweets collected' })

      // Clean up
      console.log('🧹 Cleaning up...')
      await send({ progress: 95, status: 'Cleaning up...' })
      await browser.close()
      console.log('✅ Browser closed')
      
      // Send final data
      console.log('🏁 Sending final data...')
      await send({ 
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
      await send({ 
        error: error instanceof Error ? error.message : 'Scrape failed',
        progress: 0
      })
    } finally {
      await writer.close()
      console.log('👋 Stream closed')
    }
  }

  // Start the scraping process without awaiting it
  scrapeProcess()

  // Return the response immediately
  return response
} 