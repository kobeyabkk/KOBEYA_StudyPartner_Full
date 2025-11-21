import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Listen for console messages and errors
  const errors = [];
  page.on('console', msg => {
    console.log(`[${msg.type().toUpperCase()}]`, msg.text());
  });
  page.on('pageerror', err => {
    console.log('[PAGE ERROR]', err.message);
    errors.push(err.message);
  });

  console.log('🧪 Testing essay coaching session page workflow\n');
  
  try {
    // Step 1: Go to essay coaching page
    console.log('Step 1: Navigate to essay coaching page...');
    await page.goto('https://feature-user-management.kobeyabkk-studypartner.pages.dev/essay-coaching', { 
      waitUntil: 'networkidle' 
    });
    await page.waitForTimeout(1500);
    
    // Step 2: Select level
    console.log('Step 2: Click 高校 level button...');
    const levelButtons = await page.$$('#levelSelection .choice-button');
    await levelButtons[0].click();
    await page.waitForTimeout(500);
    
    // Step 3: Select AI mode
    console.log('Step 3: Select "AIにお任せ" problem mode...');
    const radioOptions = await page.$$('.radio-option');
    await radioOptions[0].click();
    await page.waitForTimeout(500);
    
    // Step 4: Select learning style
    console.log('Step 4: Select "AIにお任せ" learning style...');
    const learningStyleButtons = await page.$$('#learningStyleSection .choice-button');
    await learningStyleButtons[3].click();
    await page.waitForTimeout(500);
    
    // Step 5: Select format
    console.log('Step 5: Select "55分フル授業" format...');
    const formatButtons = await page.$$('#formatSelection .choice-button');
    await formatButtons[0].click();
    await page.waitForTimeout(500);
    
    // Step 6: Click start button
    console.log('Step 6: Click start button...');
    const startButton = await page.$('#startButton');
    await startButton.click();
    
    // Wait for navigation to session page
    console.log('Step 7: Wait for session page to load...');
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    
    console.log('\n📍 Current URL:', page.url());
    
    // Check for JavaScript errors on session page
    if (errors.length > 0) {
      console.log('\n❌ JavaScript errors detected:');
      errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    } else {
      console.log('\n✅ No JavaScript errors on session page');
    }
    
    // Check if sendMessage function exists
    const sendMessageExists = await page.evaluate(() => {
      return typeof window.sendMessage === 'function';
    });
    console.log('sendMessage function exists:', sendMessageExists);
    
    // Try to type in input and click send
    console.log('\nStep 8: Type "OK" and try to send...');
    const input = await page.$('#userInput');
    if (input) {
      await input.fill('OK');
      console.log('  ✅ Typed "OK" into input field');
      
      const sendBtn = await page.$('#sendBtn');
      if (sendBtn) {
        const isDisabled = await sendBtn.evaluate(btn => btn.disabled);
        console.log('  Send button disabled:', isDisabled);
        
        if (!isDisabled) {
          console.log('  🖱️  Clicking send button...');
          await sendBtn.click();
          await page.waitForTimeout(2000);
          
          // Check if message was sent
          const messages = await page.$$('.message');
          console.log('  Messages on page:', messages.length);
          
          if (messages.length > 1) {
            console.log('  ✅ Message appears to have been sent!');
          } else {
            console.log('  ❌ Message may not have been sent');
          }
        }
      } else {
        console.log('  ❌ Send button not found');
      }
    } else {
      console.log('  ❌ Input field not found');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }

  await browser.close();
})();
