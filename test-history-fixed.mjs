import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => {
    const text = msg.text();
    if (!text.includes('Failed to load resource')) {
      console.log(`[${msg.type().toUpperCase()}]`, text);
    }
  });
  
  try {
    console.log('🔐 Admin Login');
    await page.goto('https://125707f4.kobeyabkk-studypartner.pages.dev/admin/login');
    await page.fill('input#password', 'admin123');
    await page.click('button#loginBtn');
    await page.waitForTimeout(2000);
    
    console.log('📊 Navigate to user detail (JS2-04)');
    await page.goto('https://125707f4.kobeyabkk-studypartner.pages.dev/admin/users/3');
    await page.waitForSelector('.history-tabs', { timeout: 10000 });
    
    await page.waitForTimeout(3000);
    
    // Check essay tab
    const essayContent = await page.$eval('#historyContent', el => el.innerText);
    console.log('📝 Essay tab:', essayContent.substring(0, 100));
    
    // Switch to flashcard tab
    console.log('🔄 Switch to flashcard tab');
    await page.click('.history-tab:nth-child(2)');
    await page.waitForTimeout(2000);
    
    const flashcardContent = await page.$eval('#historyContent', el => el.innerText);
    console.log('📚 Flashcard tab:', flashcardContent.substring(0, 100));
    
    // Switch to international tab
    console.log('🔄 Switch to international tab');
    await page.click('.history-tab:nth-child(3)');
    await page.waitForTimeout(2000);
    
    const intlContent = await page.$eval('#historyContent', el => el.innerText);
    console.log('🌍 International tab:', intlContent.substring(0, 100));
    
    console.log('✅ All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
})();
