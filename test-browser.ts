import { chromium } from 'playwright';

(async () => {
  console.log('Starting browser test...');
  try {
    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: false });
    console.log('Browser launched successfully');
    
    console.log('Creating new page...');
    const page = await browser.newPage();
    console.log('Page created');
    
    console.log('Navigating to google.com...');
    await page.goto('https://google.com');
    console.log('Navigation successful');
    
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    
    console.log('Closing browser...');
    await browser.close();
    console.log('Test completed successfully');
  } catch (error) {
    console.error('Test failed:', error);
  }
})(); 