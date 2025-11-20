import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Password Reset URL')) {
      console.log('✅ ' + text);
    }
  });
  
  try {
    console.log('🔐 Test 1: Admin Login & User Filter');
    await page.goto('https://1fd71504.kobeyabkk-studypartner.pages.dev/admin/login');
    await page.fill('input#password', 'admin123');
    await page.click('button#loginBtn');
    await page.waitForTimeout(2000);
    
    // Check if we're on users page
    await page.waitForSelector('.filter-tabs', { timeout: 10000 });
    console.log('✅ Filter tabs loaded');
    
    // Check filter counts
    const countAll = await page.$eval('#countAll', el => el.textContent);
    const countActive = await page.$eval('#countActive', el => el.textContent);
    const countInactive = await page.$eval('#countInactive', el => el.textContent);
    console.log(`📊 Counts - All: ${countAll}, Active: ${countActive}, Inactive: ${countInactive}`);
    
    // Click active filter
    await page.click('[data-filter="active"]');
    await page.waitForTimeout(1000);
    console.log('✅ Active filter clicked');
    
    // Click inactive filter
    await page.click('[data-filter="inactive"]');
    await page.waitForTimeout(1000);
    console.log('✅ Inactive filter clicked');
    
    console.log('\n🔑 Test 2: Password Reset Flow');
    
    // Go to reset password page
    await page.goto('https://1fd71504.kobeyabkk-studypartner.pages.dev/admin/reset-password');
    await page.waitForSelector('#resetForm', { timeout: 5000 });
    console.log('✅ Reset password page loaded');
    
    // Fill email
    await page.fill('input#email', 'kobeyabkk@gmail.com');
    await page.click('button#resetBtn');
    await page.waitForTimeout(2000);
    
    // Check for success message
    const successVisible = await page.$eval('#successMessage', el => 
      window.getComputedStyle(el).display !== 'none'
    );
    
    if (successVisible) {
      console.log('✅ Password reset request successful');
    } else {
      console.log('❌ Password reset request failed');
    }
    
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
})();
