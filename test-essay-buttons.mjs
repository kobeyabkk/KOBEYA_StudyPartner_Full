import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Capture all console messages
  page.on('console', msg => {
    console.log(`[CONSOLE ${msg.type()}]`, msg.text());
  });
  
  // Capture all errors
  page.on('pageerror', err => {
    console.error('[PAGE ERROR]', err.message);
  });
  
  try {
    console.log('🔍 Testing essay coaching page...\n');
    
    // Try multiple URLs
    const urls = [
      'https://30b2f243.kobeyabkk-studypartner.pages.dev/essay-coaching',
      'https://1f8a3645.kobeyabkk-studypartner.pages.dev/essay-coaching'
    ];
    
    let loaded = false;
    for (const url of urls) {
      try {
        console.log(`Trying: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        loaded = true;
        console.log('✅ Page loaded successfully\n');
        break;
      } catch (e) {
        console.log(`❌ Failed: ${e.message}\n`);
      }
    }
    
    if (!loaded) {
      throw new Error('Could not load any URL');
    }
    
    // Wait a bit for JS to initialize
    await page.waitForTimeout(2000);
    
    // Check if selectLevel function exists
    const hasFunction = await page.evaluate(() => {
      return typeof window.selectLevel === 'function';
    });
    console.log(`selectLevel function exists: ${hasFunction}`);
    
    // Find all buttons
    const buttons = await page.$$('button');
    console.log(`Total buttons found: ${buttons.length}\n`);
    
    // Find level selection buttons specifically
    const levelButtons = await page.$$('#levelSelection button');
    console.log(`Level selection buttons found: ${levelButtons.length}`);
    
    if (levelButtons.length > 0) {
      // Try to click the first button (高校)
      console.log('\n🖱️  Attempting to click 高校 button...');
      
      try {
        await levelButtons[0].click();
        await page.waitForTimeout(1000);
        console.log('✅ Button clicked successfully');
        
        // Check if problemSetup is now visible
        const problemSetupVisible = await page.evaluate(() => {
          const el = document.getElementById('problemSetup');
          return el && !el.classList.contains('hidden');
        });
        console.log(`Problem setup section visible: ${problemSetupVisible}`);
        
      } catch (clickError) {
        console.error('❌ Click error:', clickError.message);
      }
    } else {
      console.log('❌ No level selection buttons found');
      
      // Debug: Get page HTML
      const html = await page.content();
      console.log('\nPage HTML length:', html.length);
      console.log('Contains "levelSelection":', html.includes('levelSelection'));
      console.log('Contains "selectLevel":', html.includes('selectLevel'));
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
})();
