#!/usr/bin/env node

/**
 * 既存の英語解説を日本語に一括翻訳するスクリプト
 * 
 * Usage: node scripts/translate-explanations.mjs
 */

import { spawn } from 'child_process';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('❌ Error: OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

/**
 * D1データベースクエリを実行
 */
async function executeD1Query(sql, params = []) {
  return new Promise((resolve, reject) => {
    const args = ['d1', 'execute', 'kobeya-logs-db', '--remote', '--command', sql];
    
    const wrangler = spawn('npx', ['wrangler', ...args], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    wrangler.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    wrangler.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    wrangler.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Wrangler exited with code ${code}\n${stderr}`));
        return;
      }

      try {
        // JSONレスポンスをパース
        const jsonMatch = stdout.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          reject(new Error('No JSON response found'));
          return;
        }
        
        const response = JSON.parse(jsonMatch[0]);
        resolve(response[0].results);
      } catch (error) {
        reject(new Error(`Failed to parse response: ${error.message}\n${stdout}`));
      }
    });
  });
}

/**
 * OpenAI APIで英語を日本語に翻訳
 */
async function translateToJapanese(englishText) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a professional translator specializing in English education materials for Japanese students. Translate English explanations into clear, natural Japanese that students can easily understand.'
        },
        {
          role: 'user',
          content: `Translate this English explanation into Japanese. Keep the technical accuracy but make it easy to understand for Japanese English learners:\n\n${englishText}`
        }
      ],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

/**
 * メイン処理
 */
async function main() {
  console.log('🚀 Starting explanation translation process...\n');

  // Step 1: 英語の解説を持つ問題を取得
  console.log('📊 Fetching questions with English explanations...');
  const questions = await executeD1Query(`
    SELECT id, question_type, explanation
    FROM eiken_generated_questions
    WHERE explanation IS NOT NULL 
      AND explanation != ''
      AND explanation NOT LIKE '%は%'
      AND explanation NOT LIKE '%です%'
      AND explanation NOT LIKE '%ます%'
    ORDER BY id
  `);

  console.log(`✅ Found ${questions.length} questions with English explanations\n`);

  if (questions.length === 0) {
    console.log('✨ All explanations are already in Japanese!');
    return;
  }

  // Step 2: 各問題を翻訳
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const progress = `[${i + 1}/${questions.length}]`;

    try {
      console.log(`${progress} Translating question ID ${question.id} (${question.question_type})...`);
      
      // 翻訳
      const japaneseExplanation = await translateToJapanese(question.explanation);
      
      // データベース更新
      await executeD1Query(`
        UPDATE eiken_generated_questions
        SET explanation = '${japaneseExplanation.replace(/'/g, "''")}'
        WHERE id = ${question.id}
      `);

      console.log(`   ✅ Success: "${japaneseExplanation.substring(0, 60)}..."`);
      successCount++;

      // API rate limit対策: 少し待機
      if (i < questions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      errorCount++;
    }
  }

  // Step 3: サマリー表示
  console.log('\n' + '='.repeat(60));
  console.log('📊 Translation Summary:');
  console.log(`   ✅ Successfully translated: ${successCount} questions`);
  console.log(`   ❌ Failed: ${errorCount} questions`);
  console.log(`   📈 Success rate: ${((successCount / questions.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(60));

  // Step 4: 検証
  console.log('\n🔍 Verifying translations...');
  const remainingEnglish = await executeD1Query(`
    SELECT COUNT(*) as count
    FROM eiken_generated_questions
    WHERE explanation IS NOT NULL 
      AND explanation != ''
      AND explanation NOT LIKE '%は%'
      AND explanation NOT LIKE '%です%'
      AND explanation NOT LIKE '%ます%'
  `);

  const englishCount = remainingEnglish[0].count;
  if (englishCount === 0) {
    console.log('✨ Perfect! All explanations are now in Japanese! 🎌');
  } else {
    console.log(`⚠️  Warning: ${englishCount} English explanations still remain. You may need to run this script again.`);
  }
}

// 実行
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
