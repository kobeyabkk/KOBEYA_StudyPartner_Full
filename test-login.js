const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Listen to console messages
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    console.log(`[${type.toUpperCase()}] ${text}`);
  });
  
  // Listen to page errors
  page.on('pageerror', error => {
    console.error(`[PAGE ERROR] ${error.message}`);
  });
  
  try {
    console.log('🔍 Navigating to Study Partner page...');
    await page.goto('https://f6806105.kobeyabkk-studypartner.pages.dev/study-partner', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    console.log('✅ Page loaded');
    
    // Wait for login button
    console.log('🔍 Waiting for login button...');
    await page.waitForSelector('button#btnLogin', { timeout: 10000 });
    console.log('✅ Login button found');
    
    // Fill in credentials
    await page.fill('input#appkey', '180418');
    await page.fill('input#sid', 'JS2-04');
    console.log('✅ Credentials filled');
    
    // Click login button
    console.log('🔘 Clicking login button...');
    await page.click('button#btnLogin');
    
    // Wait for response
    await page.waitForTimeout(3000);
    
    console.log('✅ Test completed');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
})();
