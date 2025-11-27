import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

// Utility functions
function toErrorMessage(error: unknown, fallback = '不明なエラー'): string {
  if (error instanceof Error) {
    return error.message || fallback
  }
  if (typeof error === 'string') {
    return error.trim() || fallback
  }
  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error)
    } catch {
      return fallback
    }
  }
  return String(error ?? fallback) || fallback
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Types
type LogRow = {
  id: number
  created_at: string | null
  student_id: string | null
  student_name: string | null
  subject: string | null
  mini_quiz_score: number | null
  weak_tags: string | null
  correct: number | null
  incorrect: number | null
  tasks_done: number | null
}

type ProcessedLog = LogRow & {
  weak_tags_display: string
  created_at_display: string
  scoreClass: string
  displayScore: string | number
}

const router = new Hono<{ Bindings: Bindings }>()

router.get('/', async (c) => {
  try {
    const db = c.env.DB
    const url = new URL(c.req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200) // 最大200件まで
    
    console.log(`📊 Dashboard access - limit: ${limit}`)
    
    // 最新ログを取得
    const logsResult = await db.prepare(`
      SELECT 
        id, created_at, student_id, student_name, subject, 
        mini_quiz_score, weak_tags, correct, incorrect, tasks_done
      FROM logs 
      ORDER BY id DESC 
      LIMIT ?
    `).bind(limit).all()
    
    const logs = (logsResult.results || []) as LogRow[]
    
    // 最新ログの日時を確認（警告表示用）
    let statusMessage = '✅ 正常動作中'
    let statusClass = 'status-ok'
    
    if (logs.length > 0) {
      const latestLog = logs[0]
      const latestTime = latestLog?.created_at ? new Date(latestLog.created_at) : null
      if (latestTime && !Number.isNaN(latestTime.getTime())) {
      const now = new Date()
      const hoursDiff = (now.getTime() - latestTime.getTime()) / (1000 * 60 * 60)
      
      if (hoursDiff > 24) {
        statusMessage = '⚠️ ログ受信停止の可能性あり'
        statusClass = 'status-warning'
      } else {
          const timeStr = formatDateTime(latestLog.created_at)
          statusMessage = timeStr
            ? `✅ 正常動作中（最新ログ: ${timeStr}）`
            : '✅ 正常動作中'
        }
      } else {
        statusMessage = '⚠️ 最新ログの日時が不正です'
        statusClass = 'status-warning'
      }
    } else {
      statusMessage = '⚠️ ログデータなし'
      statusClass = 'status-warning'
    }
    
    // weak_tags JSONをパース
    const processedLogs: ProcessedLog[] = logs.map((log) => {
      const weakTagsDisplay = (() => {
        try {
          const parsed = JSON.parse(log.weak_tags ?? '[]')
          return Array.isArray(parsed) ? parsed.join(', ') : log.weak_tags ?? ''
        } catch {
          return log.weak_tags ?? ''
        }
      })()
      const score = typeof log.mini_quiz_score === 'number' ? log.mini_quiz_score : null
      const scoreClass =
        score === null ? 'score-low'
        : score >= 80 ? 'score-high'
        : score >= 60 ? 'score-mid'
        : 'score-low'
      const displayScore = score === null ? '-' : score
      
      return {
        ...log,
        weak_tags_display: weakTagsDisplay,
        created_at_display: formatDateTime(log.created_at) || '-',
        scoreClass,
        displayScore
      }
    })
    
    // HTMLダッシュボードを生成
    const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KOBEYA Logs Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f8f9fa;
            color: #333;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        .header {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        .header h1 {
            margin: 0 0 10px 0;
            color: #2c3e50;
        }
        .header p {
            margin: 0;
            color: #7f8c8d;
        }
        .controls {
            margin: 20px 0;
        }
        .controls select {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: white;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        th {
            background-color: #34495e;
            color: white;
            padding: 12px 8px;
            text-align: left;
            font-weight: 500;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        td {
            padding: 10px 8px;
            border-bottom: 1px solid #ecf0f1;
        }
        tbody tr:nth-child(even) {
            background-color: #f8f9fa;
        }
        tbody tr:hover {
            background-color: #e8f4f8;
        }
        .status {
            background: white;
            padding: 15px 20px;
            margin-top: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            font-weight: 500;
        }
        .status-ok {
            color: #27ae60;
            border-left: 4px solid #27ae60;
        }
        .status-warning {
            color: #e67e22;
            border-left: 4px solid #e67e22;
        }
        .score-high { color: #27ae60; font-weight: bold; }
        .score-mid { color: #f39c12; }
        .score-low { color: #e74c3c; font-weight: bold; }
        .tags {
            font-size: 0.9em;
            color: #7f8c8d;
        }
        .student-id {
            font-family: 'Courier New', monospace;
            font-weight: bold;
        }
        .no-data {
            text-align: center;
            padding: 40px;
            color: #7f8c8d;
            font-style: italic;
        }
        @media (max-width: 768px) {
            .container { padding: 10px; }
            table { font-size: 0.9em; }
            th, td { padding: 8px 4px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 KOBEYA Logs Dashboard</h1>
            <p>最新${limit}件のログを表示 | 教室スタッフ専用</p>
        </div>
        
        <div class="controls">
            <label for="limitSelect">表示件数：</label>
            <select id="limitSelect" onchange="changeLimit()">
                <option value="25" ${limit === 25 ? 'selected' : ''}>25件</option>
                <option value="50" ${limit === 50 ? 'selected' : ''}>50件</option>
                <option value="100" ${limit === 100 ? 'selected' : ''}>100件</option>
                <option value="200" ${limit === 200 ? 'selected' : ''}>200件</option>
            </select>
            <button onclick="location.reload()" style="margin-left: 10px; padding: 8px 12px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
                🔄 更新
            </button>
        </div>
        
        ${logs.length > 0 ? `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>受信日時</th>
                    <th>生徒ID</th>
                    <th>生徒名</th>
                    <th>教科</th>
                    <th>スコア</th>
                    <th>正答</th>
                    <th>誤答</th>
                    <th>課題数</th>
                    <th>弱点タグ</th>
                </tr>
            </thead>
            <tbody>
                ${processedLogs.map(log => `
                <tr>
                    <td>${log.id}</td>
                    <td>${log.created_at_display}</td>
                    <td class="student-id">${log.student_id || '-'}</td>
                    <td>${log.student_name || '-'}</td>
                    <td>${log.subject || '-'}</td>
                    <td class="${log.scoreClass}">
                        ${log.displayScore}
                    </td>
                    <td>${log.correct || 0}</td>
                    <td>${log.incorrect || 0}</td>
                    <td>${log.tasks_done || 0}</td>
                    <td class="tags">${log.weak_tags_display || '-'}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        ` : `
        <div class="no-data">
            📝 ログデータがありません
        </div>
        `}
        
        <div class="status ${statusClass}">
            ${statusMessage} | 総件数: ${logs.length}件
        </div>
    </div>
    
    <script>
        function changeLimit() {
            const select = document.getElementById('limitSelect');
            const newLimit = select.value;
            window.location.href = '/dashboard?limit=' + newLimit;
        }
    </script>
</body>
</html>`
    
    return c.html(html)
    
  } catch (error) {
    console.error('❌ Dashboard error:', error)
    const errorMessage = toErrorMessage(error)
    
    const errorHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>KOBEYA Logs Dashboard - Error</title>
    <style>
        body { font-family: sans-serif; padding: 20px; background: #f8f9fa; }
        .error { background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; }
    </style>
</head>
<body>
    <div class="error">
        <h1>⚠️ DB接続エラー</h1>
        <p>ダッシュボードのデータを取得できませんでした。</p>
        <p><strong>エラー詳細:</strong> ${errorMessage}</p>
        <button onclick="location.reload()">🔄 再試行</button>
    </div>
</body>
</html>`
    
    return c.html(errorHtml, 500)
  }
})

export default router
