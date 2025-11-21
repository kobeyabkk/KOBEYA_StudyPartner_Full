/**
 * Phase 3: Long_reading Vocabulary Control Test
 * 
 * Target: Improve vocabulary score from 76.3% to 85%+
 */

const BASE_URL = 'http://localhost:3000';

async function testLongReadingGeneration() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 Phase 3: Long_reading Vocabulary Control Test');
  console.log('═══════════════════════════════════════════════════════\n');
  
  console.log('📊 Previous Results:');
  console.log('   Vocabulary Score: 76.3% ❌ (Failed)');
  console.log('   Target Score: 85%+ ✅\n');
  
  console.log('🔧 Phase 3 Improvements:');
  console.log('   1. Temperature: 0.25 → 0.2');
  console.log('   2. Top_p: 0.7 → 0.65');
  console.log('   3. Expanded forbidden words: ~60+ terms');
  console.log('   4. Stricter sentence length: 10-15 words');
  console.log('   5. Enhanced self-check: 8 mandatory checks\n');
  
  console.log('⏳ Generating Long_reading question...\n');
  
  const requestBody = {
    student_id: 'test_student_phase3',
    grade: 'pre2',
    format: 'long_reading',
    mode: 'practice'
  };
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${BASE_URL}/api/eiken/questions/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`\n❌ Request failed with status ${response.status}`);
      console.error('Error details:', errorText);
      
      // Parse error details
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.debug && errorData.debug.validation) {
          console.error('\n📊 Validation Results:');
          console.error('   Vocabulary Score:', errorData.debug.validation.vocabulary_score, '%');
          console.error('   Vocabulary Passed:', errorData.debug.validation.vocabulary_passed ? '✅' : '❌');
          console.error('   Attempts:', errorData.debug.metadata.attempts);
          
          console.log('\n📈 Improvement Analysis:');
          const previousScore = 76.3;
          const currentScore = errorData.debug.validation.vocabulary_score;
          const improvement = currentScore - previousScore;
          
          console.log(`   Previous Score: ${previousScore}%`);
          console.log(`   Current Score: ${currentScore.toFixed(1)}%`);
          console.log(`   Improvement: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%`);
          
          if (currentScore >= 85) {
            console.log('\n   🎉 SUCCESS! Target of 85%+ achieved!');
          } else if (improvement > 0) {
            console.log(`\n   ⚠️  PARTIAL SUCCESS: Score improved but still below target`);
            console.log(`   Gap to target: ${(85 - currentScore).toFixed(1)}%`);
          } else {
            console.log('\n   ❌ FAILURE: No improvement');
          }
        }
      } catch (e) {
        // Error parsing failed
      }
      
      return null;
    }
    
    const data = await response.json();
    
    console.log(`\n✅ Response received! (${elapsed}s)`);
    
    // Extract results
    if (data.data && data.data.validation) {
      const validation = data.data.validation;
      const vocabScore = validation.vocabulary_score;
      
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('📊 PHASE 3 TEST RESULTS');
      console.log('═══════════════════════════════════════════════════════\n');
      
      console.log('🎯 Vocabulary Control:');
      console.log(`   Score: ${vocabScore.toFixed(1)}% ${vocabScore >= 85 ? '✅' : '❌'}`);
      console.log(`   Target: 85%+`);
      console.log(`   Status: ${validation.vocabulary_passed ? 'PASSED ✅' : 'FAILED ❌'}`);
      
      const previousScore = 76.3;
      const improvement = vocabScore - previousScore;
      
      console.log('\n📈 Improvement:');
      console.log(`   Previous: ${previousScore}%`);
      console.log(`   Current: ${vocabScore.toFixed(1)}%`);
      console.log(`   Change: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%`);
      
      if (vocabScore >= 85) {
        console.log('\n🎉 SUCCESS! Phase 3 improvements achieved target!');
      } else if (improvement > 0) {
        console.log(`\n⚠️  PARTIAL SUCCESS: Improved but still ${(85 - vocabScore).toFixed(1)}% below target`);
        console.log('   Recommendations:');
        console.log('   - Further reduce temperature (0.2 → 0.15)');
        console.log('   - Add more forbidden words');
        console.log('   - Provide more few-shot examples');
      } else {
        console.log('\n❌ FAILURE: Phase 3 improvements ineffective');
      }
      
      // Check vocabulary notes
      if (data.data.question && data.data.question.question_data) {
        const questionData = data.data.question.question_data;
        
        if (questionData.vocabulary_notes && questionData.vocabulary_notes.length > 0) {
          console.log('\n📖 Vocabulary Notes:');
          questionData.vocabulary_notes.forEach((note, index) => {
            console.log(`   ${index + 1}. ${note.term} → ${note.definition}`);
          });
          console.log(`\n   Total: ${questionData.vocabulary_notes.length} notes ✅`);
        } else {
          console.log('\n⚠️  WARNING: No vocabulary notes generated');
        }
        
        // Show passage info
        console.log('\n📄 Passage Info:');
        console.log(`   Length: ${questionData.passage?.length || 0} characters`);
        console.log(`   Word count: ${questionData.word_count || 'N/A'}`);
        console.log(`   Questions: ${questionData.questions?.length || 0}`);
        
        // Show first 200 chars of passage
        if (questionData.passage) {
          console.log('\n📝 Passage Preview:');
          console.log(`   "${questionData.passage.substring(0, 200)}..."`);
        }
      }
      
      console.log('\n═══════════════════════════════════════════════════════');
      
      return data;
    } else {
      console.log('\n❌ ERROR: Unexpected response structure');
      console.log('Full response:', JSON.stringify(data, null, 2));
      return data;
    }
  } catch (error) {
    console.error('\n❌ Error during test:', error.message);
    console.error('Stack:', error.stack);
    return null;
  }
}

async function main() {
  const result = await testLongReadingGeneration();
  
  if (result) {
    console.log('\n✨ Test completed successfully!');
    process.exit(0);
  } else {
    console.log('\n❌ Test failed!');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
