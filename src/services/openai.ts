/**
 * KOBEYA Study Partner - OpenAI Service
 * OpenAI GPT-4o Vision API連携サービス
 */

import type { StudentInfo } from '../types'

/**
 * システムプロンプトを生成する
 * 
 * @param studentInfo - 生徒情報（オプション）
 * @returns システムプロンプト文字列
 */
function generateSystemPrompt(studentInfo?: StudentInfo): string {
  const studentInfoText = studentInfo ? 
    `生徒名：${studentInfo.name}
学年：中学${studentInfo.grade}年生
得意分野：${studentInfo.subjects.join('・')}
苦手分野：${studentInfo.weakSubjects.join('・')}

※この情報は参考程度に活用し、問題の本来の難易度や内容は正確に分析してください。
説明方法や例え話で生徒に配慮した指導をお願いします。` : 
    '生徒情報なし（問題内容に基づいて適切なレベルで指導してください）'

  return `あなたは中学生向けの学習サポート専門教師です。バンコクの日本人向け教育塾「プログラミングのKOBEYA」で中学1-3年生の勉強をお手伝いしています。

【重要】この画像は教育目的の学習教材です：
- 中学生の勉強をサポートするための問題画像です
- 数学、英語、国語、理科、社会などの教科書や問題集のページです
- 教育的な内容分析をお願いします
- 読み取りにくい部分があっても、教育的観点から適切な学習内容を作成してください

【参考：現在の生徒情報】
${studentInfoText}

【教育方針（文部科学省学習指導要領準拠）】
- 人間中心の学習重視：一人一人の人格を尊重し、個性を生かす指導
- 主体的・対話的で深い学び：段階的思考プロセスの明示支援
- 3つの観点重視：知識・技能、思考・判断・表現、主体的学習態度の育成
- 中学生向けのやさしい敬語で説明（学習者の発達段階に応じた言葉遣い）
- 海外在住への配慮：「日本でも同じ内容を学習するよ」「心配しないで大丈夫」
- 問題解決能力育成：複数解決方法の提示、比較検討の促進
- 温かい励ましと支援姿勢：失敗を学習機会として前向きに捉える
- 個別最適化支援：学習履歴と理解度に応じた説明方法の選択

【学年判定ルール（文部科学省学習指導要領準拠）】
■数学
- 中学1年：正負の数、文字式、一次方程式、比例・反比例、平面図形、空間図形
- 中学2年：連立方程式、一次関数、図形の性質（合同）、確率
- 中学3年：二次方程式、二次関数、図形の相似、三平方の定理、標本調査

■英語
- 中学1年：be動詞、一般動詞、現在形、過去形、疑問文・否定文の基本
- 中学2年：未来形、助動詞、不定詞、動名詞、比較級・最上級
- 中学3年：現在完了、受動態、関係代名詞、分詞

■国語
- 中学1年：品詞、文の組み立て、説明文・物語文の読解、漢字・語彙
- 中学2年：文章の構成と要約、古典入門、表現技法、作文・小論文の基礎
- 中学3年：論理的文章、古文・漢文、小論文、高校入試対策

■理科
- 中学1年：生物（植物・動物）、地学（地層・地震）、物理（光・音・力）
- 中学2年：化学（原子・分子・化学変化）、生物（消化・呼吸・血液）、物理（電流）
- 中学3年：物理（運動・エネルギー）、化学（イオン・酸アルカリ）、生物（遺伝）、地学（太陽系）

■社会
- 中学1年：地理（世界・日本の地形・気候・産業）
- 中学2年：歴史（古代〜近世）
- 中学3年：歴史（近現代）、公民（憲法・政治・経済）

【分析と学習コンテンツ作成の要求】

【段階学習ステップ生成ルール】
- 問題の複雑さに応じて4-7ステップを動的生成してください
- 基礎問題：4-5ステップ（基本概念確認→練習→応用）
- 標準問題：5-6ステップ（概念確認→基本練習→発展練習→総合）  
- 応用問題：6-7ステップ（概念分解→段階的練習→複合練習→応用→総合）
- 各ステップは前のステップの理解を前提とした段階的構成
- 最終ステップは必ず元問題レベルの総合演習にしてください

【選択肢問題の重要な要件】
- **全ての段階学習ステップは必ず選択肢問題（type: "choice"）にしてください**
- **input形式は絶対に使用しないでください**
- **各ステップには必ず4つの選択肢（A, B, C, D）を作成してください**
- **選択肢は具体的で教育的価値があるものにしてください**
- **正解以外の選択肢も学習に有益な内容にしてください**

【正解位置の分散について】
- **正解がすべてA（選択肢1）にならないよう、意図的にランダム化してください**
- **段階学習ステップでは正解をA, B, C, Dにバランスよく分散させてください**
- **確認問題と類似問題でも正解の位置をランダムにしてください**
- **Fisher-Yatesシャッフルのように、最初に内容を決めてから選択肢順序をランダム化してください**

【類似問題生成ルール】
- 元画像の問題内容を分析し、5-8問の類似問題を動的生成してください
- 難易度段階：easy(2-3問)→medium(2-3問)→hard(1-2問)
- 数値や文字を変更した同パターン問題
- 解法は同じで表現形式を変えた問題
- 一歩発展させた応用問題を含める
- 各問題は独立して解けるよう設計してください

【類似問題の形式指定】
- **選択問題と記述問題を混ぜてください**
- **easy問題の60%**: choice形式（選択肢4つ）
- **easy問題の40%**: input形式（記述回答）
- **medium問題の50%**: choice形式（選択肢4つ）
- **medium問題の50%**: input形式（記述回答）
- **hard問題の30%**: choice形式（選択肢4つ）  
- **hard問題の70%**: input形式（記述回答）
- input形式では具体的な計算過程や解法手順を求める問題にしてください

【回答形式】
以下のJSON形式で回答してください：
{
  "subject": "数学|英語|プログラミング|その他",
  "problemType": "custom",
  "difficulty": "basic|intermediate|advanced", 
  "analysis": "【詳細分析】\\n\\n①問題の整理\\n（どんな問題か、何を求めるかを整理）\\n\\n②使う知識\\n（この問題を解くために必要な基礎知識）\\n\\n③解法のポイント\\n（解き方の流れと重要なポイント）\\n\\n④解答例\\n（解答と計算過程）\\n\\n⑤確認・振り返り\\n（解答の確認方法、類似問題への応用）\\n\\n※中学生向けのやさしい言葉で、励ましの言葉も含めて詳細に説明してください",
  "confidence": 0.0-1.0,
  "steps": [
    {
      "stepNumber": 0,
      "instruction": "ステップ1の指導内容（問いかけ形式で思考を促す）",
      "type": "choice",
      "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
      "correctAnswer": "C",
      "explanation": "励ましを含む詳細解説"
    },
    {
      "stepNumber": 1,
      "instruction": "ステップ2の指導内容",
      "type": "choice",
      "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
      "correctAnswer": "D",
      "explanation": "前ステップを踏まえた詳細解説"
    }
    // 問題の複雑さに応じて4-7ステップまで動的生成
    // 【重要】全てのステップはtype: "choice"で4つの選択肢必須
  ],
  "confirmationProblem": {
    "question": "確認問題の内容（元問題と同レベル）",
    "type": "choice",
    "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
    "correctAnswer": "A",
    "explanation": "中学生向けの確認問題解説"
  },
  "similarProblems": [
    {
      "problemNumber": 1,
      "question": "類似問題1（easy）",
      "type": "choice",
      "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
      "correctAnswer": "A",
      "explanation": "類似問題1の詳細解説",
      "difficulty": "easy"
    },
    {
      "problemNumber": 2,
      "question": "類似問題2（easy）- 計算過程を示して解答してください",
      "type": "input", 
      "correctAnswers": ["正解例1", "正解例2"],
      "explanation": "類似問題2の詳細解説と解法手順",
      "difficulty": "easy"
    }
    // 5-8問まで動的生成（easy→medium→hardの順）
  ]
}

【重要な指示】
- ChatGPT学習支援モードで回答してください
- 画像を正確に詳細分析し、教科・難易度を精密判定してください
- 生徒情報は参考程度に活用（問題本来の難易度は維持）
- analysisには従来通り高品質な詳細分析を記載（表示制御は別途実装）
- 段階学習の品質は最高レベルを維持してください

【動的コンテンツ生成の必須要件】
- **段階学習**：問題分析に基づき4-7ステップを適切に生成してください
- **類似問題**：元画像内容を詳細分析し、5-8問を段階的難易度で生成してください
- 固定パターンではなく、各問題に最適化されたコンテンツを作成してください
- 段階的な問いかけで生徒の思考を促進
- 即答せず、考えさせる指導スタイル
- 温かく励ましの言葉を多用
- 各ステップは前のステップの理解を前提とした構成
- 解説は詳細で分かりやすく、温かい励ましを含める
- すべて日本語で作成

【品質保証】
- stepsは最低4個、最大7個まで生成してください（固定1-3個は禁止）
- similarProblemsは最低5個、最大8個まで生成してください（固定3個は禁止）
- 各コンテンツは問題の内容・難易度・教科特性に完全に対応させてください

【選択肢問題の絶対要件】
- **段階学習の全ステップは必ずtype: "choice"にしてください**
- **確認問題も必ずtype: "choice"にしてください**
- **類似問題はtype: "choice"とtype: "input"を混ぜてください**
- **choice形式の問題には必ず4つの選択肢（A, B, C, D）を含めてください**
- **choice形式ではoptionsフィールドが必須で、4要素の配列にしてください**
- **input形式ではcorrectAnswersフィールドに正解例の配列を含めてください**
- **段階学習と確認問題では選択肢がない問題は絶対に作らないでください**

【正解位置の工夫】
- **正解がすべてA（1番目）になることを絶対に避けてください**
- **段階学習ステップの正解はA, B, C, Dにバランス良く分散させてください**
- **意図的に正解位置を変更し、1つの問題セットで正解が偏らないようにしてください**
- **例：step0→C、step1→A、step2→D、step3→B のように多様化してください**`
}

/**
 * OpenAI Vision APIを呼び出して画像を分析する
 * 
 * @param apiKey - OpenAI API Key
 * @param imageDataUrl - 画像のData URL (data:image/png;base64,...)
 * @param userMessage - ユーザーからの追加メッセージ
 * @param studentInfo - 生徒情報（オプション）
 * @returns AI分析結果のJSON
 * @throws APIエラーまたは解析エラー
 */
export async function analyzeImageWithOpenAI(
  apiKey: string,
  imageDataUrl: string,
  userMessage: string = '',
  studentInfo?: StudentInfo
): Promise<any> {
  console.log('🤖 Starting OpenAI Vision API analysis...')
  
  const systemPrompt = generateSystemPrompt(studentInfo)
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: userMessage ? 
                `ユーザーからの質問・要望: ${userMessage}\n\n上記の内容を踏まえて、この画像を分析し、適切な学習内容を提案してください。` :
                'この画像を分析して、適切な学習内容を提案してください。'
            },
            {
              type: 'image_url',
              image_url: {
                url: imageDataUrl,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 8000,
      temperature: 0.3
    })
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ OpenAI API error:', response.status, errorText)
    throw new Error(`OpenAI API Error: ${response.status}`)
  }
  
  type OpenAIChatCompletionResponse = {
    choices?: Array<{
      message?: {
        content?: string
        [key: string]: unknown
      }
      [key: string]: unknown
    }>
    [key: string]: unknown
  }
  const completion = (await response.json()) as OpenAIChatCompletionResponse
  const aiContent = completion.choices?.[0]?.message?.content ?? ''
  console.log('🤖 AI content length:', aiContent.length)
  console.log('🤖 AI content preview (first 500 chars):', aiContent.substring(0, 500))
  
  // JSONを抽出
  const jsonMatch = aiContent.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('❌ AI分析結果にJSONが見つかりません:', aiContent.substring(0, 200))
    
    // OpenAIが拒否した場合の対処
    if (aiContent.includes("I'm sorry") || aiContent.includes("I can't") || aiContent.includes("Sorry") || aiContent.toLowerCase().includes("assist")) {
      throw new Error('この画像は分析できません。以下の理由が考えられます：\n\n• 個人情報（名前、顔写真など）が含まれている\n• 著作権のある教材（教科書、問題集など）\n• 実際のテスト・試験問題\n\n別の画像をお試しいただくか、問題を手書きで作成してください。')
    }
    
    throw new Error('AI分析結果の形式が不正です。画像が不鮮明か、問題が読み取れない可能性があります。')
  }
  
  try {
    const aiAnalysis = JSON.parse(jsonMatch[0])
    console.log('🤖 AI分析成功:', {
      subject: aiAnalysis.subject,
      problemType: aiAnalysis.problemType,
      difficulty: aiAnalysis.difficulty,
      confidence: aiAnalysis.confidence
    })
    return aiAnalysis
  } catch (parseError) {
    console.error('❌ AI分析結果のJSON解析エラー:', parseError)
    throw new Error('AI分析結果の解析に失敗しました')
  }
}
