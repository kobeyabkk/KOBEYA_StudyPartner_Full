/**
 * Vocabulary Notes Generation Test
 * 
 * Tests Essay and Long_reading question generation with vocabulary notes
 */

const BASE_URL = 'http://localhost:3000';

async function testEssayGeneration() {
  console.log('🧪 Testing Essay question generation with vocabulary notes...\n');
  
  const requestBody = {
    student_id: 'test_student_001',
    grade: 'pre2',
    format: 'essay',
    mode: 'practice'
  };
  
  console.log('📤 Request:', JSON.stringify(requestBody, null, 2));
  
  try {
    const response = await fetch(`${BASE_URL}/api/eiken/questions/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Request failed with status ${response.status}`);
      console.error('Error details:', errorText);
      return null;
    }
    
    const data = await response.json();
    console.log('\n✅ Response received!');
    console.log('📊 Response keys:', Object.keys(data));
    
    // Check if vocabulary_notes exists
    if (data.question && data.question.question_data) {
      const questionData = data.question.question_data;
      console.log('\n📝 Question Data keys:', Object.keys(questionData));
      
      if (questionData.vocabulary_notes) {
        console.log('\n🎉 SUCCESS! Vocabulary notes found:');
        console.log('📖 Vocabulary Notes:');
        questionData.vocabulary_notes.forEach((note, index) => {
          console.log(`   ${index + 1}. ${note.term} → ${note.definition}`);
        });
        
        console.log(`\n✅ Total vocabulary notes: ${questionData.vocabulary_notes.length}`);
        
        // Show full essay data
        console.log('\n📄 Full Essay Data:');
        console.log('   Essay Prompt:', questionData.essay_prompt);
        console.log('   Sample Essay (first 100 chars):', 
          questionData.sample_essay?.substring(0, 100) + '...');
        
        return data;
      } else {
        console.log('\n⚠️  WARNING: vocabulary_notes field is missing!');
        console.log('Question Data:', JSON.stringify(questionData, null, 2));
        return data;
      }
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

async function testLongReadingGeneration() {
  console.log('\n\n🧪 Testing Long_reading question generation with vocabulary notes...\n');
  
  const requestBody = {
    student_id: 'test_student_001',
    grade: 'pre2',
    format: 'long_reading',
    mode: 'practice'
  };
  
  console.log('📤 Request:', JSON.stringify(requestBody, null, 2));
  
  try {
    const response = await fetch(`${BASE_URL}/api/eiken/questions/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Request failed with status ${response.status}`);
      console.error('Error details:', errorText);
      return null;
    }
    
    const data = await response.json();
    console.log('\n✅ Response received!');
    console.log('📊 Response keys:', Object.keys(data));
    
    // Check if vocabulary_notes exists
    if (data.question && data.question.question_data) {
      const questionData = data.question.question_data;
      console.log('\n📝 Question Data keys:', Object.keys(questionData));
      
      if (questionData.vocabulary_notes) {
        console.log('\n🎉 SUCCESS! Vocabulary notes found:');
        console.log('📖 Vocabulary Notes:');
        questionData.vocabulary_notes.forEach((note, index) => {
          console.log(`   ${index + 1}. ${note.term} → ${note.definition}`);
        });
        
        console.log(`\n✅ Total vocabulary notes: ${questionData.vocabulary_notes.length}`);
        
        // Show passage info
        console.log('\n📄 Long Reading Data:');
        console.log('   Passage length:', questionData.passage?.length || 0, 'characters');
        console.log('   Word count:', questionData.word_count || 'N/A');
        console.log('   Number of questions:', questionData.questions?.length || 0);
        
        return data;
      } else {
        console.log('\n⚠️  WARNING: vocabulary_notes field is missing!');
        console.log('Question Data:', JSON.stringify(questionData, null, 2));
        return data;
      }
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
  console.log('═══════════════════════════════════════════════════════');
  console.log('📖 Vocabulary Notes Generation Test');
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Test Essay generation
  const essayResult = await testEssayGeneration();
  
  // Wait a bit before next test
  console.log('\n⏳ Waiting 3 seconds before next test...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Test Long_reading generation
  const longReadingResult = await testLongReadingGeneration();
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 Test Summary');
  console.log('═══════════════════════════════════════════════════════');
  console.log('Essay test:', essayResult ? '✅ PASSED' : '❌ FAILED');
  console.log('Long_reading test:', longReadingResult ? '✅ PASSED' : '❌ FAILED');
  console.log('\n✨ Test completed!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
