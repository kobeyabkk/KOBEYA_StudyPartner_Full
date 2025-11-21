import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const logs = [];
  const errors = [];
  
  // Capture all console logs
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    console.log('[CONSOLE]', text);
  });
  
  page.on('pageerror', err => {
    errors.push(err.message);
    console.log('[ERROR]', err.message);
  });

  // Capture dialog boxes (alerts)
  page.on('dialog', async dialog => {
    console.log('[ALERT]', dialog.message());
    await dialog.accept();
  });

  try {
    console.log('🧪 Testing start button workflow\n');
    
    // Navigate to page
    await page.goto('https://feature-user-management.kobeyabkk-studypartner.pages.dev/essay-coaching', { 
      waitUntil: 'networkidle' 
    });
    await page.waitForTimeout(1500);
    
    // Step 1: Select level
    console.log('Step 1: Selecting 高校 level...');
    const levelButtons = await page.$$('#levelSelection .choice-button');
    await levelButtons[0].click();
    await page.waitForTimeout(500);
    
    // Check selectedLevel variable
    let selectedLevel = await page.evaluate(() => window.selectedLevel);
    console.log('  selectedLevel after click:', selectedLevel);
    
    // Step 2: Select problem mode (AI)
    console.log('\nStep 2: Selecting AI problem mode...');
    const radioOptions = await page.$$('.radio-option');
    await radioOptions[0].click();
    await page.waitForTimeout(500);
    
    let selectedProblemMode = await page.evaluate(() => window.selectedProblemMode);
    console.log('  selectedProblemMode after click:', selectedProblemMode);
    
    // Step 3: Select learning style (AI)
    console.log('\nStep 3: Selecting AI learning style...');
    const learningStyleButtons = await page.$$('#learningStyleSection .choice-button');
    await learningStyleButtons[3].click();
    await page.waitForTimeout(500);
    
    let selectedLearningStyle = await page.evaluate(() => window.selectedLearningStyle);
    console.log('  selectedLearningStyle after click:', selectedLearningStyle);
    
    // Step 4: Select format
    console.log('\nStep 4: Selecting 55分 format...');
    const formatButtons = await page.$$('#formatSelection .choice-button');
    await formatButtons[0].click();
    await page.waitForTimeout(500);
    
    let selectedFormat = await page.evaluate(() => window.selectedFormat);
    console.log('  selectedFormat after click:', selectedFormat);
    
    // Check if start button is visible
    const startButtonVisible = await page.evaluate(() => {
      const btn = document.getElementById('startButton');
      return btn && btn.classList.contains('visible');
    });
    console.log('  Start button visible:', startButtonVisible);
    
    // Step 5: Click start button
    console.log('\nStep 5: Clicking start button...');
    const startButton = await page.$('#startButton');
    
    if (!startButton) {
      console.log('❌ Start button not found!');
    } else {
      const isVisible = await startButton.isVisible();
      console.log('  Start button is visible:', isVisible);
      
      // Check if startLesson function exists
      const startLessonExists = await page.evaluate(() => {
        return typeof window.startLesson === 'function';
      });
      console.log('  startLesson function exists:', startLessonExists);
      
      // Try clicking
      await startButton.click();
      console.log('  ✅ Clicked start button');
      
      // Wait a bit for any actions
      await page.waitForTimeout(3000);
      
      // Check if navigation happened
      const currentUrl = page.url();
      console.log('  Current URL after click:', currentUrl);
      
      if (currentUrl.includes('/session/')) {
        console.log('\n✅ SUCCESS: Navigated to session page!');
      } else {
        console.log('\n❌ FAILED: Still on setup page');
        
        // Check all variables one more time
        const allVars = await page.evaluate(() => ({
          selectedLevel: window.selectedLevel,
          selectedProblemMode: window.selectedProblemMode,
          selectedLearningStyle: window.selectedLearningStyle,
          selectedFormat: window.selectedFormat
        }));
        console.log('  Final state of variables:', allVars);
      }
    }
    
    console.log('\n📝 Captured logs:', logs.length);
    console.log('❌ Captured errors:', errors.length);
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }

  await browser.close();
})();
