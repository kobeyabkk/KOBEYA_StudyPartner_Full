// Test question generation to see actual output
import https from 'https';

const API_URL = 'https://kobeyabkk-studypartner.pages.dev/api/eiken/questions/generate';

async function testGeneration() {
  try {
    console.log('🧪 Testing question generation...\n');
    
    const postData = JSON.stringify({
      student_id: 'test-user',
      grade: '5',
      format: 'grammar_fill',
      mode: 'practice',
    });
    
    const options = {
      hostname: 'kobeyabkk-studypartner.pages.dev',
      path: '/api/eiken/questions/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          
          if (parsed.success) {
            console.log('✅ Generation successful!\n');
            console.log('=== Question Data ===');
            console.log('Question Text:', parsed.data.question.question_data.question_text);
            console.log('\n=== Explanation ===');
            console.log(parsed.data.question.question_data.explanation);
            console.log('\n=== Translation JA ===');
            console.log(parsed.data.question.question_data.translation_ja || '❌ NOT PRESENT');
            console.log('\n=== Vocabulary Meanings ===');
            console.log(JSON.stringify(parsed.data.question.question_data.vocabulary_meanings, null, 2) || '❌ NOT PRESENT');
          } else {
            console.error('❌ Generation failed:', parsed.error);
          }
        } catch (e) {
          console.error('❌ Parse error:', e.message);
          console.log('Raw response:', data);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Request error:', error.message);
    });
    
    req.write(postData);
    req.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testGeneration();
