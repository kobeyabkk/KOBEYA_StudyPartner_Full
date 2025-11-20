import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Production URL
  const baseUrl = 'https://kobeyabkk-studypartner.pages.dev';
  
  console.log('🧪 Testing PRODUCTION environment');
  console.log(`🌐 URL: ${baseUrl}\n`);
  
  // Listen for errors
  const errors = [];
  page.on('pageerror', err => {
    errors.push(err.message);
  });

  try {
    // Test 1: Essay coaching level selection
    console.log('Test 1: Essay coaching level selection buttons');
    await page.goto(`${baseUrl}/essay-coaching`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    
    const levelButtons = await page.$$('#levelSelection .choice-button');
    console.log(`  - Found ${levelButtons.length} level buttons`);
    
    await levelButtons[0].click();
    await page.waitForTimeout(500);
    
    const problemSetupVisible = await page.evaluate(() => {
      return !document.getElementById('problemSetup')?.classList.contains('hidden');
    });
    console.log(`  - Level button works: ${problemSetupVisible ? '✅' : '❌'}`);
    
    // Test 2: Complete workflow to session page
    console.log('\nTest 2: Complete workflow to session');
    await (await page.$$('.radio-option'))[0].click();
    await page.waitForTimeout(300);
    await (await page.$$('#learningStyleSection .choice-button'))[3].click();
    await page.waitForTimeout(300);
    await (await page.$$('#formatSelection .choice-button'))[0].click();
    await page.waitForTimeout(300);
    
    const startButton = await page.$('#startButton');
    const startButtonVisible = await startButton.evaluate(btn => 
      btn.classList.contains('visible')
    );
    console.log(`  - Start button visible: ${startButtonVisible ? '✅' : '❌'}`);
    
    await startButton.click();
    await page.waitForNavigation({ timeout: 15000 });
    await page.waitForTimeout(2000);
    
    // Test 3: Check session page functions
    console.log('\nTest 3: Session page functions');
    const sendMessageExists = await page.evaluate(() => 
      typeof window.sendMessage === 'function'
    );
    console.log(`  - sendMessage function: ${sendMessageExists ? '✅' : '❌'}`);
    
    // Test 4: Send OK message
    console.log('\nTest 4: Send OK message');
    const input = await page.$('#userInput');
    await input.fill('OK');
    await (await page.$('#sendBtn')).click();
    await page.waitForTimeout(3000);
    
    const messages = await page.$$('.message');
    console.log(`  - Messages on page: ${messages.length}`);
    console.log(`  - Message sent: ${messages.length >= 2 ? '✅' : '❌'}`);
    
    // Summary
    console.log('\n' + '='.repeat(50));
    if (errors.length === 0 && problemSetupVisible && startButtonVisible && sendMessageExists && messages.length >= 2) {
      console.log('🎉 ALL TESTS PASSED IN PRODUCTION!');
      console.log('✅ Level selection works');
      console.log('✅ Session creation works');
      console.log('✅ Message sending works');
      console.log('✅ No JavaScript errors');
    } else {
      console.log('❌ SOME TESTS FAILED');
      if (errors.length > 0) {
        console.log('Errors:', errors);
      }
    }
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }

  await browser.close();
})();
