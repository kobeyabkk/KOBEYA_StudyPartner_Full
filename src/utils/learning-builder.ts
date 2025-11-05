/**
 * KOBEYA Study Partner - Learning Data Builder
 * AI分析結果から学習データを構築するユーティリティ
 */

/**
 * AI分析結果から学習データを構築する
 * 
 * @param aiAnalysis - OpenAI APIからの分析結果
 * @returns 構築された学習データ
 */
export function buildLearningDataFromAI(aiAnalysis: any): any {
  console.log('✅ AI generated complete steps:', aiAnalysis.steps?.length || 0)
  
  if (aiAnalysis.steps && aiAnalysis.steps.length > 0) {
    console.log('🔍 First step details:', {
      stepNumber: aiAnalysis.steps[0]?.stepNumber,
      instruction: aiAnalysis.steps[0]?.instruction?.substring(0, 50) + '...',
      type: aiAnalysis.steps[0]?.type,
      optionsCount: aiAnalysis.steps[0]?.options?.length,
      options: aiAnalysis.steps[0]?.options
    })
  }
  
  return {
    analysis: `【AI学習アシスタント分析結果】<br><br>${aiAnalysis.analysis.replace(/。/g, '。<br>').replace(/！/g, '！<br>').replace(/<br><br>+/g, '<br><br>')}<br><br>🎯 **段階的学習を開始します**<br>一緒に問題を解いていきましょう。<br>各ステップで丁寧に説明しながら進めます！`,
    steps: aiAnalysis.steps.map((step: any) => {
      // 選択肢問題でない場合、強制的に選択肢問題に変換
      if (step.type !== 'choice' || !step.options || !Array.isArray(step.options) || step.options.length < 4) {
        console.warn(`⚠️ Step ${step.stepNumber} is not choice type or missing options, converting to choice`)
        return {
          ...step,
          type: 'choice',
          options: [
            "A) 基礎的な概念を確認する",
            "B) 中程度の理解を示す", 
            "C) 応用的な考え方をする",
            "D) 発展的な解法を選ぶ"
          ],
          correctAnswer: "A",
          completed: false,
          attempts: []
        }
      }
      return {
        ...step,
        completed: false,
        attempts: []
      }
    }),
    confirmationProblem: buildConfirmationProblem(aiAnalysis.confirmationProblem),
    similarProblems: buildSimilarProblems(aiAnalysis.similarProblems || [])
  }
}

/**
 * 確認問題を構築する
 * 
 * @param confirmation - AI分析結果の確認問題
 * @returns 構築された確認問題
 */
function buildConfirmationProblem(confirmation: any): any {
  const defaultConfirmation = {
    question: "確認問題: 学習内容を理解できましたか？",
    type: "choice",
    options: ["A) よく理解できた", "B) 少し理解できた", "C) もう一度説明が欲しい", "D) 全く分からない"],
    correctAnswer: "A",
    explanation: "素晴らしい！理解が深まりましたね。",
    attempts: []
  }
  
  if (!confirmation) {
    return defaultConfirmation
  }
  
  // 確認問題も選択肢問題を強制
  if (confirmation.type !== 'choice' || !confirmation.options || !Array.isArray(confirmation.options) || confirmation.options.length < 4) {
    console.warn('⚠️ Confirmation problem is not choice type, converting to choice')
    return {
      ...defaultConfirmation,
      question: confirmation.question || defaultConfirmation.question,
      explanation: confirmation.explanation || defaultConfirmation.explanation
    }
  }
  
  return {
    ...confirmation,
    attempts: []
  }
}

/**
 * 類似問題を構築する
 * 
 * @param problems - AI分析結果の類似問題配列
 * @returns 構築された類似問題配列
 */
function buildSimilarProblems(problems: any[]): any[] {
  return problems.map(problem => {
    // 類似問題は選択肢問題と記述問題の混合を許可
    if (problem.type === 'choice') {
      // choice形式の検証
      if (!problem.options || !Array.isArray(problem.options) || problem.options.length < 4) {
        console.warn(`⚠️ Similar problem ${problem.problemNumber} is choice type but missing proper options`)
        return {
          ...problem,
          type: 'choice',
          options: [
            "A) 基本的な解法",
            "B) 標準的なアプローチ",
            "C) 応用的な考え方", 
            "D) 発展的な解法"
          ],
          correctAnswer: "A",
          attempts: []
        }
      }
    } else if (problem.type === 'input') {
      // input形式の検証
      if (!problem.correctAnswers || !Array.isArray(problem.correctAnswers)) {
        console.warn(`⚠️ Similar problem ${problem.problemNumber} is input type but missing correctAnswers`)
        return {
          ...problem,
          type: 'input',
          correctAnswers: ["計算過程を記述してください"],
          attempts: []
        }
      }
    } else {
      // 不明な形式の場合はchoice形式に変換
      console.warn(`⚠️ Similar problem ${problem.problemNumber} has unknown type, converting to choice`)
      return {
        ...problem,
        type: 'choice',
        options: [
          "A) 基本的な解法",
          "B) 標準的なアプローチ",
          "C) 応用的な考え方", 
          "D) 発展的な解法"
        ],
        correctAnswer: "A",
        attempts: []
      }
    }
    
    return {
      ...problem,
      attempts: []
    }
  })
}
