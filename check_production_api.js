// Check if production API is serving updated code
import https from 'https';

async function checkProductionAPI() {
  console.log('🔍 Checking production API...\n');
  
  const postData = JSON.stringify({
    student_id: 'test-debug',
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
        
        if (parsed.success && parsed.data?.question?.question_data) {
          const qd = parsed.data.question.question_data;
          
          console.log('✅ API Response received\n');
          console.log('=== Question Data Fields ===');
          console.log('Has question_text:', !!qd.question_text);
          console.log('Has explanation:', !!qd.explanation);
          console.log('Has translation_ja:', !!qd.translation_ja);
          console.log('Has vocabulary_meanings:', !!qd.vocabulary_meanings);
          
          console.log('\n=== Translation JA ===');
          if (qd.translation_ja) {
            console.log('✅ PRESENT:', qd.translation_ja.substring(0, 100));
          } else {
            console.log('❌ MISSING');
          }
          
          console.log('\n=== Vocabulary Meanings ===');
          if (qd.vocabulary_meanings) {
            console.log('✅ PRESENT:', JSON.stringify(qd.vocabulary_meanings, null, 2).substring(0, 200));
          } else {
            console.log('❌ MISSING');
          }
          
          console.log('\n=== Explanation Style Check ===');
          if (qd.explanation) {
            const hasTeacherStyle = qd.explanation.includes('＜着眼点＞') || 
                                   qd.explanation.includes('＜鉄則') ||
                                   qd.explanation.includes('3単現') ||
                                   qd.explanation.includes('be動詞+');
            console.log('Has teacher-style markers:', hasTeacherStyle);
            console.log('Explanation preview:', qd.explanation.substring(0, 150));
          }
        } else {
          console.error('❌ Invalid response structure');
          console.log('Response:', JSON.stringify(parsed, null, 2).substring(0, 500));
        }
      } catch (e) {
        console.error('❌ Parse error:', e.message);
        console.log('Raw response:', data.substring(0, 500));
      }
    });
  });
  
  req.on('error', (error) => {
    console.error('❌ Request error:', error.message);
  });
  
  req.write(postData);
  req.end();
}

checkProductionAPI();
