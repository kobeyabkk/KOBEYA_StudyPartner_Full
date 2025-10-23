// AIベースの弱点タグ推定システム
// 教材データベースに依存しない、AI解析結果ベースのタグ抽出

/**
 * AI解析結果から弱点タグを抽出する新しいアプローチ
 * 任意の教材・プリント・手書きノートに対応
 */

// 教科別キーワードマップ
const SUBJECT_KEYWORDS = {
  数学: [
    // 基礎計算
    '計算', '四則演算', '分数', '小数', '整数', '負の数', '正の数',
    // 代数
    '方程式', '一次方程式', '二次方程式', '連立方程式', '不等式',
    '因数分解', '展開', '文字式', '代入', '係数',
    // 関数・グラフ
    '関数', '一次関数', '二次関数', '比例', '反比例', 'グラフ', '座標',
    '直線', '放物線', '切片', '傾き',
    // 図形
    '図形', '三角形', '四角形', '円', '角度', '面積', '体積', '相似',
    '合同', '証明', '三平方の定理', 'ピタゴラス',
    // 確率・統計
    '確率', '統計', '度数', 'ヒストグラム', '平均', '中央値'
  ],
  
  英語: [
    // 文法基礎
    '文法', 'be動詞', '一般動詞', '疑問文', '否定文', '命令文',
    // 時制
    '現在形', '過去形', '未来形', '現在進行形', '過去進行形',
    '現在完了', '過去完了', '時制', 'tense',
    // 助動詞・動詞
    '助動詞', 'can', 'will', 'would', 'should', 'must', 'may',
    '不定詞', '動名詞', '分詞', '受動態', '能動態',
    // 文型・構文
    '文型', '主語', '動詞', '目的語', '補語', 'SVC', 'SVO',
    '関係代名詞', '関係副詞', '接続詞', '前置詞',
    // その他
    '比較', '最上級', '比較級', '発音', 'アクセント', '語順'
  ],
  
  国語: [
    // 読解・文章
    '読解', '文章読解', '説明文', '論説文', '物語', '小説', '随筆',
    '要約', '主題', '要旨', '段落', '構成',
    // 文法・語彙
    '文法', '品詞', '敬語', '語彙', '漢字', '熟語', '慣用句',
    '助詞', '助動詞', '動詞', '形容詞', '副詞',
    // 古典
    '古文', '漢文', '古典', '現代語訳', '品詞分解', '敬語',
    // 作文
    '作文', '小論文', '意見文', '感想文', '表現'
  ],
  
  理科: [
    // 物理
    '物理', '力', '運動', 'エネルギー', '電流', '電圧', '抵抗',
    '光', '音', '波', '振動', '圧力', '浮力',
    // 化学
    '化学', '原子', '分子', 'イオン', '化学式', '化学反応',
    '酸', 'アルカリ', '中和', '溶解', '結晶',
    // 生物
    '生物', '細胞', '植物', '動物', '人体', '消化', '呼吸',
    '循環', '生殖', '遺伝', '進化', '生態系',
    // 地学
    '地学', '地層', '岩石', '地震', '火山', '天気', '気象',
    '太陽系', '星', '月'
  ],
  
  社会: [
    // 地理
    '地理', '地形', '気候', '人口', '産業', '農業', '工業',
    '貿易', '交通', '都市', '村落', '地図', '緯度', '経度',
    // 歴史
    '歴史', '古代', '中世', '近世', '近代', '現代', '戦争',
    '政治', '文化', '宗教', '時代', '年号', '人物',
    // 公民
    '公民', '憲法', '政治', '経済', '法律', '選挙', '国会',
    '内閣', '裁判所', '地方自治', '国際関係', '人権'
  ]
}

// 弱点パターンキーワード
const WEAKNESS_PATTERNS = {
  計算ミス: ['計算', '間違', 'ミス', '符号', '桁', '繰り上がり', '繰り下がり'],
  理解不足: ['理解', 'わからない', '意味', '概念', '原理', '仕組み'],
  暗記不足: ['覚え', '暗記', '記憶', '忘れ', '思い出せない'],
  応用問題: ['応用', '発展', '難しい', '複雑', '組み合わせ'],
  時間不足: ['時間', '間に合わない', '遅い', 'スピード', '効率'],
  ケアレスミス: ['ケアレス', 'うっかり', '見落とし', '読み間違い', '写し間違い'],
  基礎不足: ['基礎', '基本', '土台', 'しっかり', '定着'],
  文章理解: ['文章', '読解', '問題文', '条件', '情報整理'],
  グラフ読み取り: ['グラフ', '表', '図', '座標', '読み取り', 'データ'],
  公式忘れ: ['公式', 'フォーミュラ', '定理', '法則', '覚える']
}

/**
 * AI解析結果から教科を判定
 */
export function inferSubjectFromAnalysis(analysis: string): string {
  if (!analysis) return 'その他'
  
  const text = analysis.toLowerCase()
  
  // 各教科のキーワード出現回数をカウント
  const scores = Object.entries(SUBJECT_KEYWORDS).map(([subject, keywords]) => {
    const score = keywords.reduce((count, keyword) => {
      return count + (text.includes(keyword.toLowerCase()) ? 1 : 0)
    }, 0)
    return { subject, score }
  })
  
  // 最も高いスコアの教科を返す
  const bestMatch = scores.reduce((max, current) => 
    current.score > max.score ? current : max
  )
  
  return bestMatch.score > 0 ? bestMatch.subject : 'その他'
}

/**
 * AI解析結果とセッションデータから弱点タグを抽出
 */
export function extractWeakTagsFromAI(analysis: string, sessionData?: any): string[] {
  const weakTags: string[] = []
  
  if (!analysis) return weakTags
  
  const text = analysis.toLowerCase()
  
  // 1. 教科判定
  const subject = inferSubjectFromAnalysis(analysis)
  if (subject !== 'その他') {
    weakTags.push(subject)
  }
  
  // 2. 具体的な分野・単元の抽出
  const subjectKeywords = SUBJECT_KEYWORDS[subject as keyof typeof SUBJECT_KEYWORDS] || []
  subjectKeywords.forEach(keyword => {
    if (text.includes(keyword.toLowerCase())) {
      weakTags.push(keyword)
    }
  })
  
  // 3. 弱点パターンの抽出
  Object.entries(WEAKNESS_PATTERNS).forEach(([pattern, keywords]) => {
    const hasPattern = keywords.some(keyword => 
      text.includes(keyword.toLowerCase())
    )
    if (hasPattern) {
      weakTags.push(pattern)
    }
  })
  
  // 4. セッションデータから間違いパターンを分析
  if (sessionData?.steps) {
    const incorrectSteps = sessionData.steps.filter((step: any) => 
      step.attempts?.some((attempt: any) => !attempt.isCorrect)
    )
    
    incorrectSteps.forEach((step: any) => {
      const instruction = (step.instruction || '').toLowerCase()
      
      // 計算系の間違い
      if (instruction.includes('計算') || instruction.includes('式')) {
        weakTags.push('計算ミス')
      }
      
      // 符号系の間違い
      if (instruction.includes('符号') || instruction.includes('+') || instruction.includes('-')) {
        weakTags.push('符号')
      }
      
      // グラフ系の間違い
      if (instruction.includes('グラフ') || instruction.includes('座標')) {
        weakTags.push('グラフ読み取り')
      }
      
      // 文法系の間違い（英語）
      if (instruction.includes('文法') || instruction.includes('時制')) {
        weakTags.push('文法')
      }
      
      // 読解系の間違い
      if (instruction.includes('読解') || instruction.includes('文章')) {
        weakTags.push('文章理解')
      }
    })
  }
  
  // 5. 類似問題での間違いパターン分析
  if (sessionData?.similarProblems) {
    const incorrectSimilar = sessionData.similarProblems.filter((problem: any) =>
      !problem.attempts?.some((attempt: any) => attempt.isCorrect)
    )
    
    if (incorrectSimilar.length > sessionData.similarProblems.length * 0.5) {
      // 半数以上間違いの場合は基礎不足
      weakTags.push('基礎不足')
    }
  }
  
  // 6. 重複削除と優先順位調整
  const uniqueTags = [...new Set(weakTags)]
  
  // 一般的すぎるタグを後回しにし、具体的なタグを優先
  return uniqueTags.sort((a, b) => {
    const genericTags = ['計算ミス', 'ケアレスミス', '基礎不足', 'その他']
    const aIsGeneric = genericTags.includes(a)
    const bIsGeneric = genericTags.includes(b)
    
    if (aIsGeneric && !bIsGeneric) return 1
    if (!aIsGeneric && bIsGeneric) return -1
    return 0
  })
}

/**
 * 学習セッションから包括的な弱点分析を実行
 */
export function analyzeSessionWeaknesses(sessionData: any, studentInfo?: any): {
  weak_tags: string[]
  subject: string
  accuracy: number
  recommendations: string[]
} {
  const analysis = sessionData.analysis || ''
  
  // AIベースの弱点タグ抽出
  const weakTags = extractWeakTagsFromAI(analysis, sessionData)
  
  // 教科判定
  const subject = inferSubjectFromAnalysis(analysis)
  
  // 正答率計算
  const completedSteps = sessionData.steps ? 
    sessionData.steps.filter((step: any) => step.completed).length : 0
  const totalSteps = sessionData.steps ? sessionData.steps.length : 0
  const accuracy = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0
  
  // 推奨アクション生成
  const recommendations = generateRecommendations(weakTags, accuracy, subject)
  
  return {
    weak_tags: weakTags,
    subject,
    accuracy: Math.round(accuracy),
    recommendations
  }
}

/**
 * 弱点タグと正答率に基づく推奨アクション生成
 */
function generateRecommendations(weakTags: string[], accuracy: number, subject: string): string[] {
  const recommendations: string[] = []
  
  // 正答率ベースの推奨
  if (accuracy < 30) {
    recommendations.push('基礎的な内容の復習が必要です')
    recommendations.push(`${subject}の基本概念を再確認しましょう`)
  } else if (accuracy < 60) {
    recommendations.push('基礎は理解できているので、練習問題を増やしましょう')
  } else if (accuracy >= 90) {
    recommendations.push('素晴らしい理解度です！さらに発展的な内容にチャレンジしましょう')
  }
  
  // 弱点タグ別の具体的推奨
  if (weakTags.includes('計算ミス')) {
    recommendations.push('計算の手順を丁寧に確認する習慣をつけましょう')
  }
  
  if (weakTags.includes('符号')) {
    recommendations.push('正負の数の計算ルールを復習しましょう')
  }
  
  if (weakTags.includes('文法')) {
    recommendations.push('基本的な文法規則を整理して覚えましょう')
  }
  
  if (weakTags.includes('文章理解')) {
    recommendations.push('問題文をゆっくり読んで、重要な情報を整理する練習をしましょう')
  }
  
  if (weakTags.includes('グラフ読み取り')) {
    recommendations.push('グラフの軸や単位を正確に確認する習慣をつけましょう')
  }
  
  if (weakTags.includes('基礎不足')) {
    recommendations.push('教科書の基本例題を繰り返し練習しましょう')
  }
  
  // デフォルト推奨
  if (recommendations.length === 0) {
    recommendations.push('引き続き学習を頑張りましょう！')
  }
  
  return recommendations.slice(0, 3) // 最大3つまで
}