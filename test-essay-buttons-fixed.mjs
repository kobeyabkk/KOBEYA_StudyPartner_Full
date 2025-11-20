import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Listen for console messages and errors
  page.on('console', msg => console.log('[PAGE LOG]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));

  // Navigate to essay coaching page
  const url = 'https://feature-user-management.kobeyabkk-studypartner.pages.dev/essay-coaching';
  console.log(`🔍 Testing essay coaching page: ${url}`);
  
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    
    // Wait a bit for JavaScript to load
    await page.waitForTimeout(2000);
    
    // Check if selectLevel function exists
    const selectLevelExists = await page.evaluate(() => {
      return typeof window.selectLevel === 'function';
    });
    console.log('selectLevel function exists:', selectLevelExists);
    
    // Find all buttons
    const allButtons = await page.$$('button');
    console.log('Total buttons found:', allButtons.length);
    
    // Find level selection buttons specifically
    const levelButtons = await page.$$('#levelSelection .choice-button');
    console.log('Level selection buttons found:', levelButtons.length);
    
    if (levelButtons.length > 0) {
      // Try to click the first button (高校)
      console.log('🖱️  Attempting to click 高校 button...');
      await levelButtons[0].click();
      
      // Wait a bit for the selection to register
      await page.waitForTimeout(1000);
      
      // Check if button has 'selected' class
      const isSelected = await levelButtons[0].evaluate(btn => btn.classList.contains('selected'));
      console.log('Button has "selected" class:', isSelected);
      
      // Check if problemSetup section is visible
      const problemSetupVisible = await page.evaluate(() => {
        const section = document.getElementById('problemSetup');
        return section && !section.classList.contains('hidden');
      });
      console.log('Problem setup section visible:', problemSetupVisible);
      
      if (selectLevelExists && isSelected && problemSetupVisible) {
        console.log('✅ SUCCESS: Button is working correctly!');
      } else {
        console.log('❌ FAILED: Button not responding as expected');
      }
    } else {
      console.log('❌ No level selection buttons found');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }

  await browser.close();
})();
