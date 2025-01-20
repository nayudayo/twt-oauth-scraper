import { chromium, type Cookie, type Page } from 'playwright'
import fs from 'fs/promises'
import path from 'path'
import type { Tweet } from '@/types/scraper'

const COOKIES_PATH = process.env.COOKIES_PATH || './data/cookies.json'
const OUTPUT_PATH = './output/tweets.json'

const SELECTORS = {
  twitterEmailInput: 'input[name="text"]',
  twitterUsernameInput: '#id__wdc4n7hrju',
  twitterPasswordInput: 'input[name="password"]'
}

// Ensure cookies directory exists
async function ensureCookiesDir() {
  await fs.mkdir(path.dirname(COOKIES_PATH), { recursive: true })
}

// Load saved cookies
async function loadCookies(): Promise<Cookie[]> {
  try {
    await ensureCookiesDir()
    const data = await fs.readFile(COOKIES_PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    console.log('No saved cookies found')
    return []
  }
}

// Save cookies for future use
async function saveCookies(cookies: Cookie[]) {
  try {
    await ensureCookiesDir()
    await fs.writeFile(COOKIES_PATH, JSON.stringify(cookies, null, 2))
    console.log('Cookies saved successfully')
  } catch (error) {
    console.error('Failed to save cookies:', error)
  }
}

async function handleLogin(page: Page, username: string, password: string) {
  console.log('Starting login process...')
  await page.goto('https://twitter.com/login')

  // Email/Username step
  console.log('Entering email...')
  const emailInput = await page.waitForSelector(SELECTORS.twitterEmailInput, { timeout: 10000 })
  if (!emailInput) throw new Error('Email input not found')
  await emailInput.fill(username)
  await page.keyboard.press('Enter')

  // Handle possible username confirmation (bot check)
  try {
    console.log('Checking for username confirmation...')
    const usernameInput = await page.waitForSelector(SELECTORS.twitterUsernameInput, { timeout: 5000 })
    if (usernameInput) {
      console.log('Bot check detected - username confirmation required')
      await usernameInput.fill(username)
      await page.keyboard.press('Enter')
    }
  } catch {
    console.log('No username confirmation required')
  }

  // Password step
  console.log('Waiting for password input...')
  const passwordInput = await page.waitForSelector(SELECTORS.twitterPasswordInput, { timeout: 10000 })
  if (!passwordInput) throw new Error('Password input not found')
  
  console.log('Entering password...')
  await passwordInput.fill(password)
  await page.keyboard.press('Enter')

  // Wait for successful login
  console.log('Waiting for login completion...')
  try {
    // Wait for either twitter.com/home or x.com/home
    await Promise.race([
      page.waitForURL('https://twitter.com/home', { timeout: 30000 }),
      page.waitForURL('https://x.com/home', { timeout: 30000 })
    ])

    // Additional check to ensure we're actually logged in
    await page.waitForSelector('[data-testid="AppTabBar_Home_Link"]', { timeout: 10000 })
    
    console.log('Login successful')
    return true
  } catch (error) {
    // Check if we're stuck at login
    const currentUrl = page.url()
    if (currentUrl.includes('/login')) {
      throw new Error('Login failed - possible verification required')
    }
    throw error
  }
}

// Add human-like behavior functions
async function humanScroll(page: Page) {
  // Random scroll speed and distance
  const speed = Math.floor(Math.random() * (100 - 50) + 50)
  const distance = Math.floor(Math.random() * (800 - 400) + 400)
  await page.mouse.wheel(0, distance)
  await page.waitForTimeout(speed)
}

async function humanDelay() {
  // Random delay between actions (0.5 to 2 seconds)
  const delay = Math.floor(Math.random() * (2000 - 500) + 500)
  await new Promise(resolve => setTimeout(resolve, delay))
}

async function moveMouseRandomly(page: Page) {
  const x = Math.floor(Math.random() * 800)
  const y = Math.floor(Math.random() * 600)
  await page.mouse.move(x, y, { steps: 5 })
}

// Add new function to save simplified tweet data
async function saveSimplifiedTweets(username: string, tweets: Tweet[]) {
  const simplifiedTweets = tweets.map(tweet => ({
    text: tweet.text,
    timestamp: tweet.timestamp
  }))
  
  const outputPath = `./output/${username}_tweets.json`
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, JSON.stringify(simplifiedTweets, null, 2))
  console.log(`Simplified tweets saved to ${outputPath}`)
}

export async function initScraper() {
  console.log('Starting browser initialization...')
  console.log('Environment check:', {
    NODE_ENV: process.env.NODE_ENV,
    hasUsername: !!process.env.SCRAPER_USERNAME,
    hasPassword: !!process.env.SCRAPER_PASSWORD,
    envKeys: Object.keys(process.env).filter(key => key.startsWith('SCRAPER_'))
  })
  
  try {
    // First, check if we have the required credentials
    const username = process.env.SCRAPER_USERNAME
    const password = process.env.SCRAPER_PASSWORD

    if (!username || !password) {
      console.error('Missing credentials:', { username: !!username, password: !!password })
      throw new Error('Scraper credentials not found in environment variables')
    }

    console.log('Launching browser in headful mode...')
    const browser = await chromium.launch({ 
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
      ]
    })
    console.log('Browser launched successfully')
    
    console.log('Creating browser context...')
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
      permissions: ['geolocation']
    })
    console.log('Browser context created')

    // Add human-like browser fingerprint
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] })
    })
    console.log('Browser fingerprint added')

    console.log('Creating new page...')
    const page = await context.newPage()
    console.log('Page created')

    // Try to load saved cookies
    const savedCookies = await loadCookies()
    if (savedCookies.length > 0) {
      console.log('Found saved cookies, attempting to restore session...')
      await context.addCookies(savedCookies)
      
      // Test if cookies are still valid by going to home
      await page.goto('https://twitter.com/home')
      const isLoggedIn = await page.evaluate(() => !document.querySelector('a[href="/login"]'))
      
      if (isLoggedIn) {
        console.log('Successfully restored session from cookies')
        return { browser, page }
      }
      console.log('Saved cookies expired, proceeding with login')
    }

    // Login with scraper account
    try {
      console.log('Starting login process with credentials...')
      const loginSuccess = await handleLogin(page, username, password)
      
      if (loginSuccess) {
        // Save cookies for future use
        const cookies = await context.cookies()
        await saveCookies(cookies)
      }

      return { browser, page }
    } catch (error) {
      console.error('Login error:', error)
      await browser.close()
      throw error
    }
  } catch (error) {
    console.error('Fatal error in initScraper:', error)
    throw error
  }
}

export async function scrapeProfile(page: Page) {
  try {
    console.log('Starting profile scrape...')
    
    // Get profile info
    const name = await page.$eval('[data-testid="primaryColumn"] [data-testid="UserName"]', (el: HTMLElement) => el.textContent).catch(() => null)
    const bio = await page.$eval('[data-testid="UserDescription"]', (el: HTMLElement) => el.textContent).catch(() => null)
    const followersCount = await page.$eval('[data-testid="primaryColumn"] [href$="/followers"]', (el: HTMLElement) => el.textContent).catch(() => null)
    const followingCount = await page.$eval('[data-testid="primaryColumn"] [href$="/following"]', (el: HTMLElement) => el.textContent).catch(() => null)
    
    return { name, bio, followersCount, followingCount }
  } catch (error) {
    console.error('Error in scrapeProfile:', error)
    throw error
  }
}

export async function scrapeTweets(
  page: Page,
  onProgress?: (processed: number) => Promise<void>
) {
  try {
    console.log('Starting tweet scrape...')
    const tweets = []
    const seenTweetIds = new Set()
    let lastHeight = 0
    let processedCount = 0
    let noNewContentCount = 0
    const MAX_NO_NEW_CONTENT_RETRIES = 5

    // Get username from URL
    const username = page.url().split('/').pop()
    if (!username) {
      throw new Error('Could not determine username from URL')
    }

    // Ensure output directory exists
    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })

    while (true) {
      // Add random mouse movement
      await moveMouseRandomly(page)
      await humanDelay()

      // Get all tweet containers
      const baseSelector = '#react-root > div > div > div.css-175oi2r.r-1f2l425.r-13qz1uu.r-417010.r-18u37iz > main > div > div > div > div.css-175oi2r.r-kemksi.r-1kqtdi0.r-1ua6aaf.r-th6na.r-1phboty.r-16y2uox.r-184en5c.r-1abdc3e.r-1lg4w6u.r-f8sm7e.r-13qz1uu.r-1ye8kvj > div > div:nth-child(3) > div > div > section > div > div'
      
      // Get current tweets on the page
      const tweetElements = await page.$$(`${baseSelector} > div`)
      const initialTweetCount = tweets.length
      
      for (const tweet of tweetElements) {
        try {
          // Log the HTML structure we're looking at
          const html = await tweet.evaluate(el => el.outerHTML)
          console.log('\nExamining tweet element:', html.substring(0, 500) + '...')

          // Try to get tweet ID from either regular tweet or retweet
          let tweetId = null
          try {
            // Try regular tweet first
            console.log('Trying regular tweet selector: article')
            const articleEl = await tweet.$('article')
            if (articleEl) {
              const articleHtml = await articleEl.evaluate(el => el.outerHTML)
              console.log('Found article element:', articleHtml.substring(0, 200) + '...')
              tweetId = await articleEl.getAttribute('aria-labelledby')
              console.log('Found tweet ID:', tweetId)
            } else {
              console.log('No article element found')
            }
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            console.log('Failed to get regular tweet ID:', errorMessage)
            // If that fails, try retweet selector
            try {
              console.log('Trying retweet selector: div.css-175oi2r.r-1adg3ll.r-1ny4l3l > div > article')
              const retweetEl = await tweet.$('div.css-175oi2r.r-1adg3ll.r-1ny4l3l > div > article')
              if (retweetEl) {
                const retweetHtml = await retweetEl.evaluate(el => el.outerHTML)
                console.log('Found retweet element:', retweetHtml.substring(0, 200) + '...')
                tweetId = await retweetEl.getAttribute('aria-labelledby')
                console.log('Found retweet ID:', tweetId)
              } else {
                console.log('No retweet element found')
              }
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error'
              console.log('Failed to get retweet ID:', errorMessage)
              console.log('Could not find tweet ID - skipping')
              continue
            }
          }

          if (seenTweetIds.has(tweetId)) continue
          seenTweetIds.add(tweetId)

          // Extract tweet content with exact selectors based on the HTML structure
          const tweetData = {
            id: tweetId,
            text: await tweet.evaluate((el) => {
              // Find the div with data-testid="tweetText"
              const tweetTextDiv = el.querySelector('div[data-testid="tweetText"]')
              if (!tweetTextDiv) return null

              const parts = []
              // Process all direct children
              for (const child of tweetTextDiv.children) {
                if (child.tagName === 'SPAN') {
                  // Handle regular text spans with css-1jxf684 class
                  if (child.classList.contains('css-1jxf684')) {
                    parts.push(child.textContent)
                  }
                  // Handle hashtag/mention links
                  const link = child.querySelector('a')
                  if (link) {
                    parts.push(link.textContent)
                  }
                } else if (child.tagName === 'IMG') {
                  // Handle emojis
                  parts.push(child.getAttribute('alt') || '🔄')
                }
              }
              return parts.join(' ').trim()
            }).catch(() => null),
            images: await tweet.evaluate((el) => {
              const images = el.querySelectorAll('div.r-1p0dtai img[src*="/media/"]')
              return Array.from(images).map(img => (img as HTMLImageElement).src)
            }).catch(() => []),
            timestamp: await tweet.$eval('time', el => el.getAttribute('datetime')).catch(() => null),
            metrics: {
              likes: await tweet.$eval('[data-testid="like"]', el => el.getAttribute('aria-label')).catch(() => '0'),
              retweets: await tweet.$eval('[data-testid="retweet"]', el => el.getAttribute('aria-label')).catch(() => '0'),
              views: await tweet.$eval('[data-testid="app-text-transition-container"]', el => el.textContent).catch(() => '0')
            }
          }

          tweets.push(tweetData)
          processedCount++
          
          // Report progress
          if (onProgress) {
            await onProgress(processedCount)
          }

          // Save both full and simplified data
          await fs.writeFile(OUTPUT_PATH, JSON.stringify(tweets, null, 2))
          await saveSimplifiedTweets(username, tweets)

          // Random delay between processing tweets
          await humanDelay()
        } catch (error) {
          console.error('Error processing tweet:', error)
          continue
        }
      }

      // Check if we got any new tweets in this batch
      if (tweets.length === initialTweetCount) {
        noNewContentCount++
        console.log(`No new tweets found. Retry attempt ${noNewContentCount}/${MAX_NO_NEW_CONTENT_RETRIES}`)
        
        if (noNewContentCount >= MAX_NO_NEW_CONTENT_RETRIES) {
          console.log('No new tweets after multiple retries. Assuming we reached the end.')
          break
        }
      } else {
        // Reset the counter if we found new tweets
        noNewContentCount = 0
      }

      // Perform multiple small scrolls instead of one large scroll
      for (let i = 0; i < 3; i++) {
        await humanScroll(page)
        await page.waitForTimeout(1000) // Wait between small scrolls
      }
      
      // Wait longer for content to load
      await page.waitForTimeout(3000)

      // Get the new page height
      const newHeight = await page.evaluate(() => document.documentElement.scrollHeight)
      
      // If we haven't scrolled further after multiple attempts, we've reached the end
      if (newHeight === lastHeight && noNewContentCount >= MAX_NO_NEW_CONTENT_RETRIES) {
        console.log('Reached the end of the timeline - no more scrolling possible')
        break
      }
      
      lastHeight = newHeight
      
      // Move mouse to a random tweet (looks more human)
      if (tweetElements.length > 0) {
        const randomTweet = tweetElements[Math.floor(Math.random() * tweetElements.length)]
        const box = await randomTweet.boundingBox()
        if (box) {
          await page.mouse.move(
            box.x + Math.random() * box.width,
            box.y + Math.random() * box.height,
            { steps: 10 }
          )
        }
      }

      // Log progress
      console.log(`Collected ${tweets.length} tweets so far...`)
    }

    console.log(`Finished scraping. Total tweets collected: ${tweets.length}`)
    return tweets
  } catch (error) {
    console.error('Error in scrapeTweets:', error)
    throw error
  }
} 