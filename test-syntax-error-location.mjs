import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  let errorDetails = null;

  // Capture page errors with full details
  page.on('pageerror', error => {
    errorDetails = {
      message: error.message,
      name: error.name,
      stack: error.stack
    };
  });

  try {
    // Navigate through the flow quickly
    await page.goto('https://feature-user-management.kobeyabkk-studypartner.pages.dev/essay-coaching');
    await page.waitForTimeout(1000);
    
    // Quick setup
    await (await page.$$('#levelSelection .choice-button'))[0].click();
    await page.waitForTimeout(200);
    await (await page.$$('.radio-option'))[0].click();
    await page.waitForTimeout(200);
    await (await page.$$('#learningStyleSection .choice-button'))[3].click();
    await page.waitForTimeout(200);
    await (await page.$$('#formatSelection .choice-button'))[0].click();
    await page.waitForTimeout(200);
    await (await page.$('#startButton')).click();
    
    await page.waitForNavigation({ timeout: 10000 });
    await page.waitForTimeout(2000);
    
    if (errorDetails) {
      console.log('❌ JavaScript Syntax Error Detected:');
      console.log('Message:', errorDetails.message);
      console.log('Name:', errorDetails.name);
      if (errorDetails.stack) {
        console.log('Stack:', errorDetails.stack);
      }
      
      // Try to get the actual source code around the error
      const pageSource = await page.content();
      const scriptMatch = pageSource.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
      if (scriptMatch) {
        console.log(`\n📄 Found ${scriptMatch.length} script tags in page`);
      }
    } else {
      console.log('✅ No JavaScript errors detected!');
      
      // Test if functions exist
      const functionsExist = await page.evaluate(() => {
        return {
          sendMessage: typeof window.sendMessage === 'function',
          addMessage: typeof window.addMessage === 'function',
          quickAction: typeof window.quickAction === 'function'
        };
      });
      console.log('Functions available:', functionsExist);
    }
    
  } catch (error) {
    console.error('Test error:', error.message);
  }

  await browser.close();
})();
