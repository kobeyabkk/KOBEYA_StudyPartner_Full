import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Listen for detailed console errors
  page.on('pageerror', err => {
    console.log('\n[PAGE ERROR]');
    console.log('Message:', err.message);
    console.log('Stack:', err.stack);
  });

  try {
    // Go directly to a session page URL (simpler)
    console.log('Loading essay coaching setup page...');
    await page.goto('https://feature-user-management.kobeyabkk-studypartner.pages.dev/essay-coaching', { 
      waitUntil: 'networkidle' 
    });
    await page.waitForTimeout(2000);
    
    // Complete setup
    const levelButtons = await page.$$('#levelSelection .choice-button');
    await levelButtons[0].click();
    await page.waitForTimeout(300);
    
    const radioOptions = await page.$$('.radio-option');
    await radioOptions[0].click();
    await page.waitForTimeout(300);
    
    const learningStyleButtons = await page.$$('#learningStyleSection .choice-button');
    await learningStyleButtons[3].click();
    await page.waitForTimeout(300);
    
    const formatButtons = await page.$$('#formatSelection .choice-button');
    await formatButtons[0].click();
    await page.waitForTimeout(300);
    
    const startButton = await page.$('#startButton');
    await startButton.click();
    
    console.log('\nWaiting for session page...');
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);
    
    console.log('\n✅ Page loaded successfully if no errors above');
    
  } catch (error) {
    console.error('Test error:', error.message);
  }

  await browser.close();
})();
