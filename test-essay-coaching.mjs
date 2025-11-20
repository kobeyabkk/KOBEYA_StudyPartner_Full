import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('[CONSOLE]', msg.text()));
  page.on('pageerror', err => console.error('[ERROR]', err.message));
  
  try {
    console.log('📝 Testing essay coaching page...');
    await page.goto('https://30b2f243.kobeyabkk-studypartner.pages.dev/essay-coaching', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    console.log('✅ Page loaded');
    
    // Check for target level buttons
    const buttons = await page.$$('button');
    console.log(`Found ${buttons.length} buttons on page`);
    
    // Try to find and click a level button
    const highSchoolBtn = await page.$('button:has-text("高校")');
    if (highSchoolBtn) {
      console.log('✅ Found 高校 button');
      await highSchoolBtn.click();
      await page.waitForTimeout(2000);
      console.log('✅ Clicked 高校 button');
    } else {
      console.log('❌ Could not find 高校 button');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
})();
