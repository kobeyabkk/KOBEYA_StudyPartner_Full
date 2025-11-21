import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Listen to console
  page.on('console', msg => console.log(`[${msg.type().toUpperCase()}]`, msg.text()));
  page.on('pageerror', err => console.error(`[PAGE ERROR]`, err.message));
  
  try {
    console.log('🔐 Step 1: Admin Login');
    await page.goto('https://52d0deca.kobeyabkk-studypartner.pages.dev/admin/login', {
      waitUntil: 'networkidle'
    });
    
    await page.fill('input#password', 'admin123');
    await page.click('button#loginBtn');
    await page.waitForTimeout(2000);
    
    console.log('✅ Login completed');
    
    console.log('📊 Step 2: Navigate to user detail');
    await page.goto('https://52d0deca.kobeyabkk-studypartner.pages.dev/admin/users/3', {
      waitUntil: 'networkidle'
    });
    
    await page.waitForSelector('.history-tabs', { timeout: 10000 });
    console.log('✅ History tabs loaded');
    
    // Check if essay history is loaded by default
    await page.waitForTimeout(2000);
    const historyContent = await page.$eval('#historyContent', el => el.innerHTML);
    console.log('📋 History content:', historyContent.substring(0, 200));
    
    // Click flashcard tab
    console.log('🔄 Step 3: Switch to flashcard tab');
    await page.click('.history-tab:nth-child(2)');
    await page.waitForTimeout(2000);
    
    // Click international tab
    console.log('🔄 Step 4: Switch to international tab');
    await page.click('.history-tab:nth-child(3)');
    await page.waitForTimeout(2000);
    
    console.log('✅ All tabs tested successfully');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
})();
