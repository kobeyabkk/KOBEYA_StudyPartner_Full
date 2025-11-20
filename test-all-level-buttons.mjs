import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Listen for console messages and errors
  page.on('console', msg => console.log('[PAGE LOG]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));

  // Navigate to essay coaching page
  const url = 'https://feature-user-management.kobeyabkk-studypartner.pages.dev/essay-coaching';
  console.log(`🔍 Testing all three level selection buttons: ${url}\n`);
  
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    const levelButtons = await page.$$('#levelSelection .choice-button');
    const buttonNames = ['高校 (high_school)', '専門学校 (vocational)', '大学 (university)'];
    const expectedLevels = ['high_school', 'vocational', 'university'];
    
    let allPassed = true;
    
    for (let i = 0; i < levelButtons.length; i++) {
      console.log(`\n📝 Testing button ${i + 1}: ${buttonNames[i]}`);
      
      // Reload page for clean state
      if (i > 0) {
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
      }
      
      // Get fresh button reference
      const buttons = await page.$$('#levelSelection .choice-button');
      
      // Click the button
      await buttons[i].click();
      await page.waitForTimeout(500);
      
      // Verify selection
      const isSelected = await buttons[i].evaluate(btn => btn.classList.contains('selected'));
      const problemSetupVisible = await page.evaluate(() => {
        const section = document.getElementById('problemSetup');
        return section && !section.classList.contains('hidden');
      });
      
      // Check what level was selected
      const selectedLevel = await page.evaluate(() => window.selectedLevel);
      
      console.log(`  - Button selected: ${isSelected ? '✅' : '❌'}`);
      console.log(`  - Problem setup visible: ${problemSetupVisible ? '✅' : '❌'}`);
      console.log(`  - Selected level: ${selectedLevel} (expected: ${expectedLevels[i]}) ${selectedLevel === expectedLevels[i] ? '✅' : '❌'}`);
      
      if (!isSelected || !problemSetupVisible || selectedLevel !== expectedLevels[i]) {
        allPassed = false;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    if (allPassed) {
      console.log('🎉 ALL TESTS PASSED! All three buttons are working correctly.');
    } else {
      console.log('❌ SOME TESTS FAILED. Please check the results above.');
    }
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }

  await browser.close();
})();
