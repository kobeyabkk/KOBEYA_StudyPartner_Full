/**
 * Essay Learning Card PDF Generator
 * 小論文学習記録カードのPDF生成
 * 
 * Note: This is a server-side PDF generation handler.
 * Uses base64 encoding for PDF data transfer.
 */

export interface LearningCardData {
  sessionId: string
  studentId?: string
  studentName?: string
  date: string
  targetLevel: string
  theme?: string
  
  // 統計情報
  essayCount: number
  averageScore: number
  
  // 学習内容
  goodPoints: string[]
  improvements: string[]
  nextFocus: string[]
  
  // 詳細
  learnedVocabulary?: string[]
  overallComment?: string
}

/**
 * Generate HTML content for learning card
 */
export function generateLearningCardHTML(data: LearningCardData): string {
  const {
    studentName = '生徒',
    date,
    targetLevel,
    theme = '未設定',
    essayCount,
    averageScore,
    goodPoints,
    improvements,
    nextFocus,
    learnedVocabulary = [],
    overallComment = ''
  } = data
  
  const levelName = {
    'high_school': '高校入試対策',
    'vocational': '専門学校入試',
    'university': '大学入試対策'
  }[targetLevel] || targetLevel
  
  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>小論文学習記録カード - ${studentName}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #333;
      background: white;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    
    .header {
      text-align: center;
      border-bottom: 3px solid #7c3aed;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    
    .header h1 {
      font-size: 20pt;
      color: #7c3aed;
      margin-bottom: 5px;
    }
    
    .header .subtitle {
      font-size: 10pt;
      color: #666;
    }
    
    .info-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
      padding: 10px;
      background: #f8f9fa;
      border-radius: 5px;
    }
    
    .info-item {
      flex: 1;
    }
    
    .info-label {
      font-weight: bold;
      color: #555;
      font-size: 9pt;
    }
    
    .info-value {
      font-size: 11pt;
      margin-top: 2px;
    }
    
    .section {
      margin-bottom: 20px;
      page-break-inside: avoid;
    }
    
    .section-title {
      font-size: 13pt;
      font-weight: bold;
      color: #7c3aed;
      border-left: 4px solid #7c3aed;
      padding-left: 10px;
      margin-bottom: 10px;
    }
    
    .stat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 20px;
    }
    
    .stat-box {
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      padding: 15px;
      text-align: center;
    }
    
    .stat-label {
      font-size: 9pt;
      color: #666;
      margin-bottom: 5px;
    }
    
    .stat-value {
      font-size: 20pt;
      font-weight: bold;
      color: #7c3aed;
    }
    
    .stat-unit {
      font-size: 10pt;
      color: #888;
    }
    
    .list-item {
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
      align-items: start;
    }
    
    .list-item:last-child {
      border-bottom: none;
    }
    
    .list-number {
      background: #7c3aed;
      color: white;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9pt;
      margin-right: 10px;
      flex-shrink: 0;
    }
    
    .list-content {
      flex: 1;
      font-size: 10pt;
    }
    
    .comment-box {
      background: #f8f9fa;
      border-left: 4px solid #10b981;
      padding: 15px;
      margin-top: 10px;
      border-radius: 5px;
    }
    
    .comment-icon {
      font-size: 14pt;
      margin-right: 5px;
    }
    
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 2px solid #e2e8f0;
      text-align: center;
      font-size: 9pt;
      color: #888;
    }
    
    .signature-line {
      margin-top: 40px;
      text-align: right;
      padding-right: 50px;
    }
    
    .signature-label {
      font-size: 10pt;
      color: #666;
      margin-bottom: 5px;
    }
    
    .signature-box {
      display: inline-block;
      border-bottom: 1px solid #333;
      width: 200px;
      height: 30px;
    }
    
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>📊 小論文学習記録カード</h1>
      <div class="subtitle">Essay Learning Record Card</div>
    </div>
    
    <!-- Basic Info -->
    <div class="info-section">
      <div class="info-item">
        <div class="info-label">氏名</div>
        <div class="info-value">${studentName}</div>
      </div>
      <div class="info-item">
        <div class="info-label">学習日</div>
        <div class="info-value">${date}</div>
      </div>
      <div class="info-item">
        <div class="info-label">対象レベル</div>
        <div class="info-value">${levelName}</div>
      </div>
    </div>
    
    <!-- Statistics -->
    <div class="section">
      <div class="section-title">📈 今日の学習統計</div>
      <div class="stat-grid">
        <div class="stat-box">
          <div class="stat-label">提出した小論文</div>
          <div class="stat-value">${essayCount}<span class="stat-unit">本</span></div>
        </div>
        <div class="stat-box">
          <div class="stat-label">平均スコア</div>
          <div class="stat-value">${averageScore}<span class="stat-unit">点</span></div>
        </div>
      </div>
    </div>
    
    <!-- Good Points -->
    <div class="section">
      <div class="section-title">✨ 良かった点</div>
      ${goodPoints.length > 0 ? goodPoints.map((point, i) => `
        <div class="list-item">
          <div class="list-number">${i + 1}</div>
          <div class="list-content">${point}</div>
        </div>
      `).join('') : '<div class="list-item"><div class="list-content">真剣に取り組む姿勢が素晴らしかったです。</div></div>'}
    </div>
    
    <!-- Improvements -->
    <div class="section">
      <div class="section-title">📝 改善点・次回への課題</div>
      ${improvements.length > 0 ? improvements.map((imp, i) => `
        <div class="list-item">
          <div class="list-number">${i + 1}</div>
          <div class="list-content">${imp}</div>
        </div>
      `).join('') : '<div class="list-item"><div class="list-content">文章構成を意識しましょう。</div></div>'}
    </div>
    
    <!-- Next Focus -->
    <div class="section">
      <div class="section-title">🎯 次回の重点目標</div>
      ${nextFocus.length > 0 ? nextFocus.map((focus, i) => `
        <div class="list-item">
          <div class="list-number">${i + 1}</div>
          <div class="list-content">${focus}</div>
        </div>
      `).join('') : '<div class="list-item"><div class="list-content">具体例を豊富に盛り込むことを心がけましょう。</div></div>'}
    </div>
    
    ${learnedVocabulary.length > 0 ? `
    <!-- Learned Vocabulary -->
    <div class="section">
      <div class="section-title">📚 学習した語彙</div>
      <div style="padding: 10px; background: #f8f9fa; border-radius: 5px;">
        ${learnedVocabulary.join('、')}
      </div>
    </div>
    ` : ''}
    
    <!-- Overall Comment -->
    ${overallComment ? `
    <div class="section">
      <div class="section-title">💡 先生からのコメント</div>
      <div class="comment-box">
        <span class="comment-icon">💬</span>
        ${overallComment}
      </div>
    </div>
    ` : ''}
    
    <!-- Signature -->
    <div class="signature-line">
      <div class="signature-label">指導者サイン</div>
      <div class="signature-box"></div>
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <div>AI & プログラミングのKOBEYA - 小論文指導システム</div>
      <div>Generated on ${new Date().toLocaleString('ja-JP')}</div>
    </div>
  </div>
</body>
</html>
  `
}

/**
 * API handler to generate PDF from learning card data
 */
export async function handlePDFGeneration(c: any): Promise<Response> {
  try {
    const { sessionId } = await c.req.json()
    
    if (!sessionId) {
      return c.json({
        ok: false,
        error: 'missing_session_id',
        message: 'セッションIDが必要です'
      }, 400)
    }
    
    const db = c.env?.DB
    
    // セッションデータを取得
    const sessionRow = await db.prepare(
      'SELECT * FROM essay_sessions WHERE session_id = ?'
    ).bind(sessionId).first()
    
    if (!sessionRow) {
      return c.json({
        ok: false,
        error: 'session_not_found',
        message: 'セッションが見つかりません'
      }, 404)
    }
    
    // 学習記録カードを取得
    const cardRow = await db.prepare(
      'SELECT * FROM essay_learning_cards WHERE session_id = ?'
    ).bind(sessionId).first()
    
    // カードデータを構築
    const cardData: LearningCardData = {
      sessionId,
      studentId: sessionRow.student_id || undefined,
      date: new Date(sessionRow.created_at).toLocaleDateString('ja-JP'),
      targetLevel: sessionRow.target_level || 'high_school',
      theme: sessionRow.theme || undefined,
      essayCount: cardRow ? 3 : 0, // 仮
      averageScore: cardRow ? cardRow.total_score : 0,
      goodPoints: cardRow ? JSON.parse(cardRow.learned_vocabulary || '[]') : [],
      improvements: cardRow ? JSON.parse(cardRow.improvement_points || '[]') : [],
      nextFocus: cardRow ? JSON.parse(cardRow.next_focus || '[]') : [],
      overallComment: cardRow ? cardRow.overall_comment : undefined
    }
    
    // HTMLを生成
    const html = generateLearningCardHTML(cardData)
    
    // HTMLをBase64エンコード（フロントエンドでPDF変換）
    const htmlBase64 = btoa(unescape(encodeURIComponent(html)))
    
    return c.json({
      ok: true,
      html,
      htmlBase64,
      message: 'PDF用HTMLを生成しました'
    }, 200)
    
  } catch (error: any) {
    console.error('❌ PDF generation error:', error)
    return c.json({
      ok: false,
      error: 'pdf_generation_error',
      message: `PDF生成エラー: ${error.message}`
    }, 500)
  }
}
