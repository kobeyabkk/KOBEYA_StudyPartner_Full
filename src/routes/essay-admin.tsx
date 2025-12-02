/**
 * Essay Admin Dashboard
 * 小論文講座 - 管理者ダッシュボード
 * 
 * Features:
 * - 問題ライブラリ管理
 * - 問題の承認・編集・削除
 * - 統計情報の表示
 * - 品質スコアの確認
 */

import { Hono } from 'hono'

const app = new Hono()

export function registerEssayAdminRoutes(essayAdminApp: Hono<any>) {
  console.log('🔧 Registering Essay Admin routes...')
  
  // Delegate to module-level app
  Object.assign(app, essayAdminApp)
  
  // 管理者ダッシュボード - メインページ
  app.get('/essay-admin', (c) => {
    return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>小論文講座 - 管理者ダッシュボード</title>
    
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    
    <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Noto Sans JP', sans-serif;
      background: #f8fafc;
      min-height: 100vh;
      color: #333;
    }
    
    .header {
      background: linear-gradient(135deg, #7c3aed, #8b5cf6);
      color: white;
      padding: 2rem;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    
    .header h1 {
      font-size: 1.75rem;
      margin-bottom: 0.5rem;
    }
    
    .header p {
      opacity: 0.9;
      font-size: 1rem;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    
    .stat-card {
      background: white;
      border-radius: 0.75rem;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      transition: transform 0.2s;
    }
    
    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    
    .stat-icon {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }
    
    .stat-label {
      font-size: 0.875rem;
      color: #666;
      margin-bottom: 0.5rem;
    }
    
    .stat-value {
      font-size: 2rem;
      font-weight: bold;
      color: #7c3aed;
    }
    
    .section {
      background: white;
      border-radius: 0.75rem;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    
    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 1rem;
      color: #374151;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .table-container {
      overflow-x: auto;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
    }
    
    th {
      background: #f8fafc;
      padding: 0.75rem;
      text-align: left;
      font-weight: 600;
      color: #374151;
      border-bottom: 2px solid #e2e8f0;
    }
    
    td {
      padding: 0.75rem;
      border-bottom: 1px solid #e2e8f0;
    }
    
    tr:hover {
      background: #f8fafc;
    }
    
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    
    .badge-high {
      background: #10b981;
      color: white;
    }
    
    .badge-medium {
      background: #f59e0b;
      color: white;
    }
    
    .badge-low {
      background: #ef4444;
      color: white;
    }
    
    .badge-active {
      background: #3b82f6;
      color: white;
    }
    
    .badge-inactive {
      background: #9ca3af;
      color: white;
    }
    
    .action-button {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      margin-right: 0.5rem;
    }
    
    .action-button.primary {
      background: #7c3aed;
      color: white;
    }
    
    .action-button.primary:hover {
      background: #6d28d9;
    }
    
    .action-button.secondary {
      background: #f3f4f6;
      color: #374151;
    }
    
    .action-button.secondary:hover {
      background: #e5e7eb;
    }
    
    .action-button.danger {
      background: #ef4444;
      color: white;
    }
    
    .action-button.danger:hover {
      background: #dc2626;
    }
    
    .loading {
      text-align: center;
      padding: 2rem;
      color: #666;
    }
    
    .empty-state {
      text-align: center;
      padding: 3rem;
      color: #666;
    }
    
    .empty-state i {
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.3;
    }
    
    .filter-bar {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    
    .filter-input {
      flex: 1;
      min-width: 200px;
      padding: 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 0.5rem;
      font-size: 1rem;
    }
    
    .filter-select {
      padding: 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 0.5rem;
      font-size: 1rem;
      background: white;
      cursor: pointer;
    }
    
    .pagination {
      display: flex;
      justify-content: center;
      gap: 0.5rem;
      margin-top: 1.5rem;
    }
    
    .page-button {
      padding: 0.5rem 1rem;
      border: 1px solid #e2e8f0;
      background: white;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .page-button:hover {
      background: #f8fafc;
      border-color: #7c3aed;
    }
    
    .page-button.active {
      background: #7c3aed;
      color: white;
      border-color: #7c3aed;
    }
    
    .quality-bar {
      width: 100%;
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
    }
    
    .quality-fill {
      height: 100%;
      transition: width 0.3s;
    }
    
    .quality-high {
      background: #10b981;
    }
    
    .quality-medium {
      background: #f59e0b;
    }
    
    .quality-low {
      background: #ef4444;
    }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔧 小論文講座 - 管理者ダッシュボード</h1>
        <p>問題ライブラリの管理と統計情報</p>
    </div>
    
    <div class="container">
        <!-- Statistics Cards -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">📚</div>
                <div class="stat-label">総問題数</div>
                <div class="stat-value" id="total-problems">-</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">✅</div>
                <div class="stat-label">有効な問題</div>
                <div class="stat-value" id="active-problems">-</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">🎯</div>
                <div class="stat-label">総使用回数</div>
                <div class="stat-value" id="total-usage">-</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">⭐</div>
                <div class="stat-label">平均品質スコア</div>
                <div class="stat-value" id="avg-quality">-</div>
            </div>
        </div>
        
        <!-- Problem Library Table -->
        <div class="section">
            <div class="section-title">
                <i class="fas fa-database"></i>
                問題ライブラリ
            </div>
            
            <!-- Filter Bar -->
            <div class="filter-bar">
                <input type="text" class="filter-input" id="search-input" placeholder="🔍 テーマで検索...">
                <select class="filter-select" id="level-filter">
                    <option value="">すべてのレベル</option>
                    <option value="high_school">高校入試</option>
                    <option value="vocational">専門学校入試</option>
                    <option value="university">大学入試</option>
                </select>
                <select class="filter-select" id="status-filter">
                    <option value="">すべての状態</option>
                    <option value="active">有効</option>
                    <option value="inactive">無効</option>
                </select>
                <button class="action-button primary" onclick="loadProblems()">
                    <i class="fas fa-sync-alt"></i> 更新
                </button>
                <button class="action-button secondary" onclick="cleanupCurrentEvents()">
                    <i class="fas fa-trash-alt"></i> 時事問題削除
                </button>
            </div>
            
            <div class="table-container">
                <div id="loading" class="loading">
                    <i class="fas fa-spinner fa-spin"></i> 読み込み中...
                </div>
                <div id="table-content" style="display: none;"></div>
            </div>
            
            <div class="pagination" id="pagination"></div>
        </div>
        
        <!-- Actions Section -->
        <div class="section">
            <div class="section-title">
                <i class="fas fa-tools"></i>
                メンテナンス操作
            </div>
            <p style="margin-bottom: 1rem; color: #666;">
                定期的なメンテナンス操作を実行できます。
            </p>
            <button class="action-button primary" onclick="updateQualityScores()">
                <i class="fas fa-calculator"></i> 品質スコア再計算
            </button>
            <button class="action-button secondary" onclick="exportCSV()">
                <i class="fas fa-download"></i> CSVエクスポート
            </button>
        </div>
    </div>
    
    <script>
    let currentPage = 1
    let allProblems = []
    const problemsPerPage = 10
    
    async function loadStatistics() {
      try {
        const response = await fetch('/api/essay-admin/statistics')
        const data = await response.json()
        
        if (data.ok && data.statistics) {
          const stats = data.statistics
          let totalProblems = 0
          let activeProblems = 0
          let totalUsage = 0
          let totalQuality = 0
          let count = 0
          
          stats.forEach(stat => {
            totalProblems += stat.total_problems || 0
            activeProblems += stat.active_problems || 0
            totalUsage += stat.total_usage || 0
            if (stat.avg_quality_score) {
              totalQuality += stat.avg_quality_score
              count++
            }
          })
          
          document.getElementById('total-problems').textContent = totalProblems
          document.getElementById('active-problems').textContent = activeProblems
          document.getElementById('total-usage').textContent = totalUsage
          document.getElementById('avg-quality').textContent = count > 0 ? Math.round(totalQuality / count) : 0
        }
      } catch (error) {
        console.error('Failed to load statistics:', error)
      }
    }
    
    async function loadProblems() {
      document.getElementById('loading').style.display = 'block'
      document.getElementById('table-content').style.display = 'none'
      
      try {
        const response = await fetch('/api/essay-admin/problems')
        const data = await response.json()
        
        if (data.ok && data.problems) {
          allProblems = data.problems
          filterAndDisplayProblems()
        }
      } catch (error) {
        console.error('Failed to load problems:', error)
        document.getElementById('loading').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>問題の読み込みに失敗しました</p></div>'
      }
    }
    
    function filterAndDisplayProblems() {
      const searchTerm = document.getElementById('search-input').value.toLowerCase()
      const levelFilter = document.getElementById('level-filter').value
      const statusFilter = document.getElementById('status-filter').value
      
      let filtered = allProblems.filter(p => {
        const matchesSearch = !searchTerm || p.theme.toLowerCase().includes(searchTerm)
        const matchesLevel = !levelFilter || p.target_level === levelFilter
        const matchesStatus = !statusFilter || 
          (statusFilter === 'active' && p.is_active) ||
          (statusFilter === 'inactive' && !p.is_active)
        return matchesSearch && matchesLevel && matchesStatus
      })
      
      displayProblems(filtered)
    }
    
    function displayProblems(problems) {
      document.getElementById('loading').style.display = 'none'
      
      if (problems.length === 0) {
        document.getElementById('table-content').innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><p>問題が見つかりませんでした</p></div>'
        document.getElementById('table-content').style.display = 'block'
        return
      }
      
      const start = (currentPage - 1) * problemsPerPage
      const end = start + problemsPerPage
      const pageProblems = problems.slice(start, end)
      
      let html = '<table><thead><tr>'
      html += '<th>ID</th><th>テーマ</th><th>レベル</th><th>品質</th><th>使用回数</th><th>状態</th><th>操作</th>'
      html += '</tr></thead><tbody>'
      
      pageProblems.forEach(p => {
        const qualityClass = p.quality_score >= 75 ? 'high' : p.quality_score >= 50 ? 'medium' : 'low'
        const qualityBadgeClass = p.quality_score >= 75 ? 'badge-high' : p.quality_score >= 50 ? 'badge-medium' : 'badge-low'
        
        html += '<tr>'
        html += '<td>' + p.id + '</td>'
        html += '<td><strong>' + p.theme + '</strong><br><small>' + p.problem_text.substring(0, 50) + '...</small></td>'
        html += '<td>' + p.target_level + '</td>'
        html += '<td><div class="quality-bar"><div class="quality-fill quality-' + qualityClass + '" style="width: ' + p.quality_score + '%"></div></div><small>' + p.quality_score + '点</small></td>'
        html += '<td>' + (p.usage_count || 0) + '回</td>'
        html += '<td><span class="badge ' + (p.is_active ? 'badge-active' : 'badge-inactive') + '">' + (p.is_active ? '有効' : '無効') + '</span></td>'
        html += '<td><button class="action-button secondary" onclick="viewProblem(' + p.id + ')"><i class="fas fa-eye"></i></button>'
        html += '<button class="action-button ' + (p.is_active ? 'danger' : 'primary') + '" onclick="toggleProblem(' + p.id + ', ' + p.is_active + ')"><i class="fas fa-' + (p.is_active ? 'ban' : 'check') + '"></i></button></td>'
        html += '</tr>'
      })
      
      html += '</tbody></table>'
      
      document.getElementById('table-content').innerHTML = html
      document.getElementById('table-content').style.display = 'block'
      
      renderPagination(problems.length)
    }
    
    function renderPagination(totalItems) {
      const totalPages = Math.ceil(totalItems / problemsPerPage)
      let html = ''
      
      for (let i = 1; i <= totalPages; i++) {
        html += '<button class="page-button ' + (i === currentPage ? 'active' : '') + '" onclick="goToPage(' + i + ')">' + i + '</button>'
      }
      
      document.getElementById('pagination').innerHTML = html
    }
    
    function goToPage(page) {
      currentPage = page
      filterAndDisplayProblems()
    }
    
    function viewProblem(id) {
      const problem = allProblems.find(p => p.id === id)
      if (problem) {
        alert('問題ID: ' + id + '\\n\\nテーマ: ' + problem.theme + '\\n\\n問題文:\\n' + problem.problem_text)
      }
    }
    
    async function toggleProblem(id, currentStatus) {
      const action = currentStatus ? '無効化' : '有効化'
      if (!confirm(\`この問題を\${action}しますか？\`)) return
      
      try {
        const response = await fetch('/api/essay-admin/toggle-problem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ problemId: id, activate: !currentStatus })
        })
        
        const data = await response.json()
        if (data.ok) {
          alert(\`問題を\${action}しました\`)
          loadProblems()
        }
      } catch (error) {
        alert('エラーが発生しました')
      }
    }
    
    async function cleanupCurrentEvents() {
      if (!confirm('1年以上前の時事問題を削除しますか？')) return
      
      try {
        const response = await fetch('/api/essay-admin/cleanup-events', { method: 'POST' })
        const data = await response.json()
        
        if (data.ok) {
          alert(\`\${data.deactivatedCount}件の時事問題を削除しました\`)
          loadProblems()
          loadStatistics()
        }
      } catch (error) {
        alert('エラーが発生しました')
      }
    }
    
    async function updateQualityScores() {
      if (!confirm('全ての問題の品質スコアを再計算しますか？')) return
      alert('この機能は実装予定です')
    }
    
    function exportCSV() {
      alert('CSV出力機能は実装予定です')
    }
    
    // Initialize
    document.getElementById('search-input').addEventListener('input', filterAndDisplayProblems)
    document.getElementById('level-filter').addEventListener('change', filterAndDisplayProblems)
    document.getElementById('status-filter').addEventListener('change', filterAndDisplayProblems)
    
    loadStatistics()
    loadProblems()
    </script>
</body>
</html>
    `)
  })
  
  // API: 統計情報取得
  app.get('/api/essay-admin/statistics', async (c) => {
    try {
      const db = c.env?.DB
      const result = await db.prepare(`
        SELECT 
          target_level,
          COUNT(*) as total_problems,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_problems,
          SUM(usage_count) as total_usage,
          AVG(quality_score) as avg_quality_score,
          AVG(avg_student_score) as overall_avg_score
        FROM essay_problem_library
        GROUP BY target_level
      `).all()
      
      return c.json({
        ok: true,
        statistics: result.results || []
      })
    } catch (error: any) {
      return c.json({
        ok: false,
        error: 'statistics_error',
        message: error.message
      }, 500)
    }
  })
  
  // API: 問題一覧取得
  app.get('/api/essay-admin/problems', async (c) => {
    try {
      const db = c.env?.DB
      const result = await db.prepare(`
        SELECT * FROM essay_problem_library
        ORDER BY created_at DESC
      `).all()
      
      return c.json({
        ok: true,
        problems: result.results || []
      })
    } catch (error: any) {
      return c.json({
        ok: false,
        error: 'problems_error',
        message: error.message
      }, 500)
    }
  })
  
  // API: 問題の有効化/無効化
  app.post('/api/essay-admin/toggle-problem', async (c) => {
    try {
      const { problemId, activate } = await c.req.json()
      const db = c.env?.DB
      
      await db.prepare(`
        UPDATE essay_problem_library
        SET is_active = ?, deactivated_at = ?
        WHERE id = ?
      `).bind(
        activate ? 1 : 0,
        activate ? null : new Date().toISOString(),
        problemId
      ).run()
      
      return c.json({
        ok: true,
        message: activate ? '問題を有効化しました' : '問題を無効化しました'
      })
    } catch (error: any) {
      return c.json({
        ok: false,
        error: 'toggle_error',
        message: error.message
      }, 500)
    }
  })
  
  // API: 時事問題の削除
  app.post('/api/essay-admin/cleanup-events', async (c) => {
    try {
      const db = c.env?.DB
      const result = await db.prepare(`
        UPDATE essay_problem_library
        SET is_active = 0, deactivated_at = CURRENT_TIMESTAMP
        WHERE is_current_event = 1
          AND created_at < date('now', '-1 year')
          AND is_active = 1
      `).run()
      
      const deactivatedCount = result.meta.changes || 0
      
      return c.json({
        ok: true,
        deactivatedCount,
        message: `${deactivatedCount}件の時事問題を削除しました`
      })
    } catch (error: any) {
      return c.json({
        ok: false,
        error: 'cleanup_error',
        message: error.message
      }, 500)
    }
  })
}

// Register routes on module-level app
registerEssayAdminRoutes(app)

export default app
