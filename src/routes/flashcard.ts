import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const router = new Hono<{ Bindings: Bindings }>()

router.get('/list', (c) => {
  console.log('📇 Flashcard list page requested')
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>フラッシュカード一覧 | KOBEYA Study Partner</title>
        
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        
        <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', sans-serif;
          background: linear-gradient(180deg, #fafafa 0%, #f5f5f5 100%);
          min-height: 100vh;
          color: #37352f;
          padding-bottom: 100px;
        }
        
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem 1.5rem;
        }
        
        .header {
          text-align: center;
          margin-bottom: 2rem;
          padding: 1.5rem;
          background: white;
          border-radius: 1rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        
        .header h1 {
          font-size: 1.75rem;
          color: #7c3aed;
          margin-bottom: 0.5rem;
        }
        
        .stats {
          display: flex;
          gap: 1rem;
          justify-content: center;
          margin-top: 1rem;
          flex-wrap: wrap;
        }
        
        .stat-item {
          padding: 0.75rem 1.5rem;
          background: #f3e8ff;
          border-radius: 0.5rem;
          font-size: 0.95rem;
        }
        
        .stat-number {
          font-size: 1.5rem;
          font-weight: 700;
          color: #7c3aed;
        }
        
        .action-bar {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          flex-wrap: wrap;
        }
        
        .btn {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 0.5rem;
          font-family: inherit;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .btn-primary {
          background: #7c3aed;
          color: white;
        }
        
        .btn-primary:hover {
          background: #6d28d9;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
        }
        
        .btn-secondary {
          background: white;
          color: #7c3aed;
          border: 2px solid #7c3aed;
        }
        
        .btn-secondary:hover {
          background: #f3e8ff;
        }
        
        .btn-danger {
          background: #dc2626;
          color: white;
        }
        
        .btn-danger:hover {
          background: #b91c1c;
        }
        
        .card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.5rem;
        }
        
        .flashcard {
          background: white;
          border-radius: 1rem;
          padding: 1.5rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          transition: all 0.3s;
          cursor: pointer;
          position: relative;
        }
        
        .flashcard:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(124, 58, 237, 0.15);
        }
        
        .flashcard.flipped .card-front {
          display: none;
        }
        
        .flashcard.flipped .card-back {
          display: block;
        }
        
        .card-front, .card-back {
          min-height: 120px;
        }
        
        .card-back {
          display: none;
        }
        
        .card-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #7c3aed;
          margin-bottom: 0.5rem;
          text-transform: uppercase;
        }
        
        .card-content {
          font-size: 1.1rem;
          line-height: 1.6;
          color: #37352f;
        }
        
        .card-meta {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #e0e0e0;
          font-size: 0.875rem;
          color: #6b7280;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .card-actions {
          position: absolute;
          top: 1rem;
          right: 1rem;
          display: flex;
          gap: 0.5rem;
          opacity: 0;
          transition: opacity 0.2s;
        }
        
        .flashcard:hover .card-actions {
          opacity: 1;
        }
        
        .icon-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: none;
          background: white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        
        .icon-btn:hover {
          transform: scale(1.1);
          box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }
        
        .icon-btn.edit:hover {
          background: #3b82f6;
          color: white;
        }
        
        .icon-btn.delete:hover {
          background: #dc2626;
          color: white;
        }
        
        .empty-state {
          text-align: center;
          padding: 4rem 2rem;
          background: white;
          border-radius: 1rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        
        .empty-state i {
          font-size: 4rem;
          color: #d1d5db;
          margin-bottom: 1rem;
        }
        
        .loading {
          text-align: center;
          padding: 4rem 2rem;
        }
        
        .spinner {
          border: 4px solid #f3f4f6;
          border-top: 4px solid #7c3aed;
          border-radius: 50%;
          width: 50px;
          height: 50px;
          animation: spin 1s linear infinite;
          margin: 0 auto 1rem;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .mastery-badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 1rem;
          font-size: 0.75rem;
          font-weight: 600;
        }
        
        .mastery-0 { background: #f3f4f6; color: #6b7280; }
        .mastery-1 { background: #fee2e2; color: #dc2626; }
        .mastery-2 { background: #fef3c7; color: #f59e0b; }
        .mastery-3 { background: #dbeafe; color: #3b82f6; }
        .mastery-4 { background: #d1fae5; color: #10b981; }
        .mastery-5 { background: #dcfce7; color: #16a34a; }
        
        .card-checkbox {
          position: absolute;
          top: 1rem;
          left: 1rem;
          width: 24px;
          height: 24px;
          cursor: pointer;
          z-index: 10;
        }
        
        .flashcard.selected {
          border: 3px solid #7c3aed;
          box-shadow: 0 8px 24px rgba(124, 58, 237, 0.25);
        }
        
        .selection-bar {
          display: none;
          position: sticky;
          top: 0;
          z-index: 100;
          background: white;
          padding: 1rem 1.5rem;
          border-radius: 1rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          margin-bottom: 1.5rem;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }
        
        .selection-bar.active {
          display: flex;
        }
        
        .selection-info {
          flex: 1;
          font-weight: 600;
          color: #7c3aed;
        }
        
        .selection-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        
        .btn-sm {
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
        }
        
        @media (max-width: 768px) {
          .card-grid {
            grid-template-columns: 1fr;
          }
          
          .action-bar {
            flex-direction: column;
          }
          
          .btn {
            width: 100%;
            justify-content: center;
          }
        }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📇 フラッシュカード一覧</h1>
                <p>あなたの学習カードコレクション</p>
                <div class="stats">
                    <div class="stat-item">
                        <div class="stat-number" id="totalCards">0</div>
                        <div>総カード数</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number" id="studyToday">0</div>
                        <div>今日の復習</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number" id="masteryAvg">0%</div>
                        <div>平均習熟度</div>
                    </div>
                </div>
            </div>

            <div class="action-bar">
                <button class="btn btn-primary" onclick="window.location.href='/flashcard/create'">
                    <i class="fas fa-plus"></i> 新しいカードを作成
                </button>
                <button class="btn btn-primary" onclick="window.location.href='/flashcard/study'">
                    <i class="fas fa-brain"></i> 学習を開始
                </button>
                <button class="btn btn-secondary" onclick="window.location.href='/study-partner'">
                    <i class="fas fa-home"></i> ホームに戻る
                </button>
            </div>

            <!-- 選択バー -->
            <div class="selection-bar" id="selectionBar">
                <div class="selection-info">
                    <span id="selectedCount">0</span>枚のカードを選択中
                </div>
                <div class="selection-actions">
                    <button class="btn btn-secondary btn-sm" onclick="selectAll()">
                        <i class="fas fa-check-double"></i> 全選択
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="deselectAll()">
                        <i class="fas fa-times"></i> 選択解除
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteSelected()">
                        <i class="fas fa-trash"></i> 選択したカードを削除
                    </button>
                </div>
            </div>

            <div id="cardContainer">
                <div class="loading">
                    <div class="spinner"></div>
                    <p>カードを読み込み中...</p>
                </div>
            </div>
        </div>

        <script>
        let cards = [];
        let selectedCards = new Set();

        function getLoginInfo() {
            // 新しいログインシステムをチェック
            const authData = localStorage.getItem('study_partner_auth');
            if (authData) {
                try {
                    const parsed = JSON.parse(authData);
                    return { appkey: parsed.appkey, sid: parsed.sid };
                } catch (e) {
                    console.error('Failed to parse auth data:', e);
                }
            }
            
            // 古いシステムもチェック（後方互換性）
            const appkey = localStorage.getItem('appkey');
            const sid = localStorage.getItem('sid');
            
            if (!appkey || !sid) {
                alert('ログインが必要です。Study Partnerからアクセスしてください。');
                window.location.href = '/study-partner';
                return null;
            }
            
            return { appkey, sid };
        }

        async function loadCards() {
            const loginInfo = getLoginInfo();
            if (!loginInfo) return;

            try {
                const response = await fetch('/api/flashcard/list', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        appkey: loginInfo.appkey,
                        sid: loginInfo.sid,
                        limit: 100,
                        offset: 0
                    })
                });

                const data = await response.json();

                if (data.success && data.cards) {
                    cards = data.cards;
                    displayCards();
                    updateStats();
                } else {
                    showEmptyState();
                }
            } catch (error) {
                console.error('Failed to load cards:', error);
                document.getElementById('cardContainer').innerHTML = \`
                    <div class="empty-state">
                        <i class="fas fa-exclamation-circle"></i>
                        <h3>エラーが発生しました</h3>
                        <p>\${error.message}</p>
                    </div>
                \`;
            }
        }

        function displayCards() {
            const container = document.getElementById('cardContainer');
            
            if (cards.length === 0) {
                showEmptyState();
                return;
            }

            container.innerHTML = '<div class="card-grid">' + cards.map((card, index) => \`
                <div class="flashcard \${selectedCards.has(card.card_id) ? 'selected' : ''}" onclick="flipCard(\${index})" id="card-\${index}" data-card-id="\${card.card_id}">
                    <input type="checkbox" class="card-checkbox" 
                           onclick="event.stopPropagation(); toggleCardSelection('\${card.card_id}')"
                           \${selectedCards.has(card.card_id) ? 'checked' : ''}>
                    
                    <div class="card-actions">
                        <button class="icon-btn edit" onclick="event.stopPropagation(); editCard('\${card.card_id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="icon-btn delete" onclick="event.stopPropagation(); deleteCard('\${card.card_id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    
                    <div class="card-front">
                        <div class="card-label">📝 表面</div>
                        <div class="card-content">\${escapeHtml(card.front_text)}</div>
                    </div>
                    
                    <div class="card-back">
                        <div class="card-label">💡 裏面</div>
                        <div class="card-content">\${escapeHtml(card.back_text)}</div>
                    </div>
                    
                    <div class="card-meta">
                        <span class="mastery-badge mastery-\${card.mastery_level || 0}">
                            習熟度: \${card.mastery_level || 0}/5
                        </span>
                        <span>\${formatDate(card.created_at)}</span>
                    </div>
                </div>
            \`).join('') + '</div>';
        }

        function showEmptyState() {
            document.getElementById('cardContainer').innerHTML = \`
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <h3>カードがまだありません</h3>
                    <p>「新しいカードを作成」ボタンから最初のカードを作成しましょう！</p>
                </div>
            \`;
        }

        function updateStats() {
            document.getElementById('totalCards').textContent = cards.length;
            
            const today = new Date().toISOString().split('T')[0];
            const studyToday = cards.filter(c => 
                c.last_reviewed_at && c.last_reviewed_at.startsWith(today)
            ).length;
            document.getElementById('studyToday').textContent = studyToday;
            
            const avgMastery = cards.length > 0
                ? Math.round((cards.reduce((sum, c) => sum + (c.mastery_level || 0), 0) / cards.length / 5) * 100)
                : 0;
            document.getElementById('masteryAvg').textContent = avgMastery + '%';
        }

        function flipCard(index) {
            const card = document.getElementById(\`card-\${index}\`);
            card.classList.toggle('flipped');
        }

        async function deleteCard(cardId) {
            if (!confirm('このカードを削除してもよろしいですか？')) return;

            const loginInfo = getLoginInfo();
            if (!loginInfo) return;

            try {
                const response = await fetch('/api/flashcard/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        appkey: loginInfo.appkey,
                        sid: loginInfo.sid,
                        cardId: cardId
                    })
                });

                const data = await response.json();

                if (data.success) {
                    alert('カードを削除しました');
                    loadCards();
                } else {
                    alert('削除に失敗しました: ' + (data.error || '不明なエラー'));
                }
            } catch (error) {
                console.error('Delete error:', error);
                alert('エラーが発生しました: ' + error.message);
            }
        }

        function editCard(cardId) {
            alert('編集機能は準備中です。カードID: ' + cardId);
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function formatDate(dateString) {
            if (!dateString) return '';
            const date = new Date(dateString);
            return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
        }

        // 複数選択機能
        function toggleCardSelection(cardId) {
            if (selectedCards.has(cardId)) {
                selectedCards.delete(cardId);
            } else {
                selectedCards.add(cardId);
            }
            updateSelectionUI();
        }

        function selectAll() {
            selectedCards.clear();
            cards.forEach(card => selectedCards.add(card.card_id));
            displayCards();
            updateSelectionUI();
        }

        function deselectAll() {
            selectedCards.clear();
            displayCards();
            updateSelectionUI();
        }

        function updateSelectionUI() {
            const selectionBar = document.getElementById('selectionBar');
            const selectedCount = document.getElementById('selectedCount');
            
            if (selectedCards.size > 0) {
                selectionBar.classList.add('active');
                selectedCount.textContent = selectedCards.size;
                
                // 選択されたカードに視覚的フィードバック
                cards.forEach(card => {
                    const cardElement = document.querySelector(\`[data-card-id="\${card.card_id}"]\`);
                    if (cardElement) {
                        if (selectedCards.has(card.card_id)) {
                            cardElement.classList.add('selected');
                        } else {
                            cardElement.classList.remove('selected');
                        }
                    }
                });
            } else {
                selectionBar.classList.remove('active');
            }
        }

        async function deleteSelected() {
            const count = selectedCards.size;
            if (count === 0) {
                alert('削除するカードを選択してください');
                return;
            }

            if (!confirm(\`選択した\${count}枚のカードを削除してもよろしいですか？\\n\\nこの操作は取り消せません。\`)) {
                return;
            }

            const loginInfo = getLoginInfo();
            if (!loginInfo) return;

            try {
                const response = await fetch('/api/flashcard/delete-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        appkey: loginInfo.appkey,
                        sid: loginInfo.sid,
                        cardIds: Array.from(selectedCards)
                    })
                });

                const data = await response.json();

                if (data.success) {
                    alert(\`✅ \${count}枚のカードを削除しました\`);
                    selectedCards.clear();
                    loadCards();
                } else {
                    alert('削除に失敗しました: ' + (data.error || '不明なエラー'));
                }
            } catch (error) {
                console.error('Batch delete error:', error);
                alert('エラーが発生しました: ' + error.message);
            }
        }

        // 初期化
        loadCards();
        </script>

        <!-- ログイン状態インジケーター -->
        <div id="login-status-indicator" style="position: fixed; top: 1rem; right: 1rem; z-index: 40;"></div>

        <script>
        (function() {
          function updateLoginStatus() {
            const indicator = document.getElementById('login-status-indicator');
            if (!indicator) return;
            
            try {
              const authData = localStorage.getItem('study_partner_auth');
              const isLoggedIn = !!authData;
              let studentName = 'ゲスト';
              
              if (authData) {
                const parsed = JSON.parse(authData);
                studentName = parsed.studentName || '生徒';
              }
              
              const bgColor = isLoggedIn ? '#f0fdf4' : '#f9fafb';
              const textColor = isLoggedIn ? '#15803d' : '#6b7280';
              const borderColor = isLoggedIn ? '#bbf7d0' : '#e5e7eb';
              const dotColor = isLoggedIn ? '#22c55e' : '#9ca3af';
              const title = isLoggedIn ? studentName + 'さんとしてログイン中' : 'ログインしていません';
              
              indicator.innerHTML = '<div style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 0.5rem; font-size: 0.875rem; background-color: ' + bgColor + '; color: ' + textColor + '; border: 1px solid ' + borderColor + ';" title="' + title + '"><div style="width: 0.5rem; height: 0.5rem; border-radius: 9999px; background-color: ' + dotColor + ';"></div><span style="font-weight: 500;">' + studentName + '</span></div>';
            } catch (error) {
              console.error('Failed to read login status:', error);
            }
          }
          
          updateLoginStatus();
          window.addEventListener('storage', function(e) {
            if (e.key === 'study_partner_auth') {
              updateLoginStatus();
            }
          });
          window.addEventListener('loginStatusChanged', updateLoginStatus);
        })();
        </script>
        
        <!-- フローティングAIチャットボタン -->
        <button onclick="openAIChat('flashcard-ai-help')" style="position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 50; width: 56px; height: 56px; border: none; padding: 0; cursor: pointer; background: transparent;">
          <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #7c3aed, #8b5cf6); border-radius: 50%; box-shadow: 0 10px 25px rgba(124, 58, 237, 0.5); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);" onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 15px 35px rgba(124, 58, 237, 0.6)';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 10px 25px rgba(124, 58, 237, 0.5)';">
            <svg style="width: 28px; height: 28px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
            </svg>
          </div>
        </button>
        <script>
        function openAIChat(context) {
          const sessionId = context + '_' + Date.now() + '_' + Math.random().toString(36).substring(7);
          const windowFeatures = 'width=900,height=700,scrollbars=yes,resizable=yes';
          window.open('/international-student/' + sessionId, 'ai-chat-' + context, windowFeatures);
        }
        </script>
    </body>
    </html>
  `)
})

// フラッシュカード メニューページ（統合）
router.get('/', (c) => {
  console.log('📇 Flashcard menu page requested')
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
        <title>フラッシュカード | KOBEYA Study Partner</title>
        
        <!-- Google Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        
        <!-- Font Awesome -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        
        <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', sans-serif; 
          background: #f5f5f5;
          min-height: 100vh;
          color: #37352f;
          padding: 2rem 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .container { 
          max-width: 600px; 
          width: 100%;
        }

        .header {
          text-align: center;
          margin-bottom: 2rem;
          background: white;
          padding: 2rem;
          border-radius: 1rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }

        .header h1 {
          font-size: 2rem;
          margin-bottom: 0.5rem;
          color: #7c3aed;
        }

        .header p {
          font-size: 1rem;
          color: #6b7280;
        }

        .menu-grid {
          display: grid;
          gap: 1.5rem;
        }

        .menu-card {
          background: white;
          border-radius: 1rem;
          padding: 2rem;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          text-decoration: none;
          color: inherit;
          display: block;
        }

        .menu-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 12px 24px rgba(0,0,0,0.2);
        }

        .menu-card.create {
          background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
          color: white;
        }

        .menu-card.list {
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          color: white;
        }

        .menu-card-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
          display: block;
        }

        .menu-card-title {
          font-size: 1.5rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }

        .menu-card-description {
          font-size: 0.95rem;
          opacity: 0.9;
          line-height: 1.5;
        }

        .back-button {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: #6b7280;
          text-decoration: none;
          font-size: 0.95rem;
          margin-bottom: 1.5rem;
          transition: color 0.2s;
        }

        .back-button:hover {
          color: #374151;
        }

        .stats-card {
          background: white;
          border-radius: 1rem;
          padding: 1.5rem;
          margin-top: 1.5rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .stats-title {
          font-size: 0.875rem;
          color: #6b7280;
          margin-bottom: 0.75rem;
          font-weight: 500;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
        }

        .stat-item {
          text-align: center;
        }

        .stat-value {
          font-size: 1.75rem;
          font-weight: 700;
          color: #7c3aed;
          margin-bottom: 0.25rem;
        }

        .stat-label {
          font-size: 0.75rem;
          color: #6b7280;
        }

        @media (max-width: 768px) {
          body {
            padding: 1rem;
          }

          .header h1 {
            font-size: 1.5rem;
          }

          .menu-card {
            padding: 1.5rem;
          }

          .menu-card-icon {
            font-size: 2.5rem;
          }

          .menu-card-title {
            font-size: 1.25rem;
          }

          .stats-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 0.5rem;
          }
        }
        </style>
    </head>
    <body>
        <div class="container">
            <a href="/study-partner" class="back-button">
                <i class="fas fa-arrow-left"></i>
                Study Partnerに戻る
            </a>

            <div class="header">
                <h1>📇 フラッシュカード</h1>
                <p>暗記学習をスマートに</p>
            </div>

            <div class="menu-grid">
                <a href="/flashcard/create" class="menu-card create">
                    <i class="fas fa-plus-circle menu-card-icon"></i>
                    <div class="menu-card-title">➕ 新しいカードを作成</div>
                    <div class="menu-card-description">
                        写真から自動作成 or 手動で単語カードを作成できます
                    </div>
                </a>

                <a href="/flashcard/list" class="menu-card list">
                    <i class="fas fa-layer-group menu-card-icon"></i>
                    <div class="menu-card-title">📚 カード一覧・学習</div>
                    <div class="menu-card-description">
                        保存したカードを見る・学習する・管理する
                    </div>
                </a>

                <a href="/flashcard/categories" class="menu-card" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white;">
                    <i class="fas fa-folder menu-card-icon"></i>
                    <div class="menu-card-title">📁 カテゴリ管理</div>
                    <div class="menu-card-description">
                        カードを整理するカテゴリを作成・管理する
                    </div>
                </a>
            </div>

            <div class="stats-card">
                <div class="stats-title">📊 あなたの学習状況</div>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value" id="totalCards">-</div>
                        <div class="stat-label">総カード数</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" id="reviewDue">-</div>
                        <div class="stat-label">復習待ち</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" id="masteredCards">-</div>
                        <div class="stat-label">習得済み</div>
                    </div>
                </div>
            </div>
        </div>

        <script>
        // ログイン情報取得
        function getLoginInfo() {
            // 新しいログインシステムをチェック
            const authData = localStorage.getItem('study_partner_auth');
            if (authData) {
                try {
                    const parsed = JSON.parse(authData);
                    return { appkey: parsed.appkey, sid: parsed.sid };
                } catch (e) {
                    console.error('Failed to parse auth data:', e);
                }
            }
            
            // 古いシステムもチェック（後方互換性）
            const appkey = localStorage.getItem('appkey');
            const sid = localStorage.getItem('sid');
            
            if (!appkey || !sid) {
                alert('ログインが必要です。Study Partnerからアクセスしてください。');
                window.location.href = '/study-partner';
                return null;
            }
            
            return { appkey, sid };
        }

        // 統計情報の取得
        async function loadStats() {
            const loginInfo = getLoginInfo();
            if (!loginInfo) return;

            try {
                const response = await fetch('/api/flashcard/stats', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        appkey: loginInfo.appkey,
                        sid: loginInfo.sid
                    })
                });

                const data = await response.json();

                if (data.success) {
                    document.getElementById('totalCards').textContent = data.stats.total || 0;
                    document.getElementById('reviewDue').textContent = data.stats.reviewDue || 0;
                    document.getElementById('masteredCards').textContent = data.stats.mastered || 0;
                }
            } catch (error) {
                console.error('Stats load error:', error);
                // エラーでも表示は続ける（統計は補助的な機能）
                document.getElementById('totalCards').textContent = '0';
                document.getElementById('reviewDue').textContent = '0';
                document.getElementById('masteredCards').textContent = '0';
            }
        }

        // 初期化
        loadStats();
        </script>
    </body>
    </html>
  `)
})

// フラッシュカード学習モードページ
router.get('/study', (c) => {
  console.log('📚 Flashcard study mode requested')
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
        <title>学習モード | KOBEYA Study Partner</title>
        
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        
        <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', sans-serif;
          background: #f5f5f5;
          min-height: 100vh;
          color: #374151;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        
        .study-header {
          padding: 1rem 1.5rem;
          display: none;
          justify-content: space-between;
          align-items: center;
          background: white;
          border-bottom: 1px solid #e5e7eb;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        
        .study-header.show {
          display: flex;
        }
        
        .exit-btn {
          background: #f3f4f6;
          border: 1px solid #d1d5db;
          color: #374151;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          cursor: pointer;
          font-size: 0.95rem;
          transition: all 0.2s;
        }
        
        .exit-btn:hover {
          background: #e5e7eb;
        }
        
        .progress-bar-container {
          flex: 1;
          margin: 0 2rem;
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
        }
        
        .progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #10b981 0%, #34d399 100%);
          transition: width 0.3s ease;
          border-radius: 4px;
        }
        
        .progress-text {
          font-size: 0.95rem;
          font-weight: 600;
        }
        
        .study-container {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }
        
        .card-wrapper {
          perspective: 1000px;
          width: 100%;
          max-width: 600px;
        }
        
        .flashcard-study {
          width: 100%;
          min-height: 400px;
          position: relative;
          transform-style: preserve-3d;
          transition: transform 0.6s;
          cursor: pointer;
        }
        
        .flashcard-study.flipped {
          transform: rotateY(180deg);
        }
        
        .card-face {
          position: absolute;
          width: 100%;
          min-height: 400px;
          backface-visibility: hidden;
          background: white;
          border-radius: 1.5rem;
          padding: 3rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        
        .card-face-front {
          color: #37352f;
        }
        
        .card-face-back {
          transform: rotateY(180deg);
          background: #f3e8ff;
          color: #37352f;
        }
        
        .card-label {
          font-size: 0.875rem;
          font-weight: 600;
          color: #7c3aed;
          margin-bottom: 1rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .card-content {
          font-size: 2rem;
          line-height: 1.6;
          text-align: center;
          color: #37352f;
          word-wrap: break-word;
        }
        
        .tap-hint {
          margin-top: 2rem;
          font-size: 0.875rem;
          color: #9ca3af;
          text-align: center;
        }
        
        .action-buttons {
          display: flex;
          gap: 1rem;
          margin-top: 2rem;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.3s;
          pointer-events: none;
        }
        
        .action-buttons.show {
          opacity: 1;
          pointer-events: auto;
        }
        
        .btn-action {
          padding: 1rem 2rem;
          border: none;
          border-radius: 1rem;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 140px;
          justify-content: center;
        }
        
        .btn-wrong {
          background: #ef4444;
          color: white;
        }
        
        .btn-wrong:hover {
          background: #dc2626;
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(239, 68, 68, 0.3);
        }
        
        .btn-correct {
          background: #10b981;
          color: white;
        }
        
        .btn-correct:hover {
          background: #059669;
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(16, 185, 129, 0.3);
        }
        
        .selection-container {
          display: none;
          padding: 2rem;
          max-width: 900px;
          margin: 0 auto;
        }
        
        .selection-container.show {
          display: block;
        }
        
        .selection-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        
        .selection-header h2 {
          font-size: 2rem;
          margin-bottom: 0.5rem;
        }
        
        .selection-header p {
          opacity: 0.9;
          font-size: 1rem;
        }
        
        .selection-controls {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          align-items: center;
        }
        
        .selection-info {
          flex: 1;
          font-size: 1.1rem;
          font-weight: 600;
        }
        
        .selection-buttons {
          display: flex;
          gap: 0.75rem;
        }
        
        .card-list {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 1rem;
          padding: 1.5rem;
          max-height: 60vh;
          overflow-y: auto;
          margin-bottom: 1.5rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        
        .card-item-selectable {
          background: #f9fafb;
          border: 2px solid #e5e7eb;
          border-radius: 0.75rem;
          padding: 1rem;
          margin-bottom: 0.75rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .card-item-selectable:hover {
          background: white;
          border-color: #d1d5db;
          box-shadow: 0 2px 4px rgba(0,0,0,0.08);
        }
        
        .card-item-selectable.selected {
          background: #d1fae5;
          border-color: #10b981;
          box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);
        }
        
        .card-checkbox {
          width: 24px;
          height: 24px;
          cursor: pointer;
        }
        
        .card-info {
          flex: 1;
        }
        
        .card-front-text {
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 0.25rem;
        }
        
        .card-meta-info {
          font-size: 0.875rem;
          opacity: 0.8;
        }
        
        .start-study-btn {
          width: 100%;
          padding: 1.25rem;
          font-size: 1.2rem;
          font-weight: 700;
          background: #10b981;
          color: white;
          border: none;
          border-radius: 0.75rem;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        
        .start-study-btn:hover:not(:disabled) {
          background: #059669;
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(16, 185, 129, 0.3);
        }
        
        .start-study-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .results-container {
          display: none;
          text-align: center;
          padding: 2rem;
        }
        
        .results-container.show {
          display: block;
        }
        
        .results-title {
          font-size: 2.5rem;
          margin-bottom: 1rem;
        }
        
        .results-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
          margin: 2rem 0;
          max-width: 800px;
          margin-left: auto;
          margin-right: auto;
        }
        
        .stat-card {
          background: white;
          padding: 1.5rem;
          border-radius: 1rem;
          border: 1px solid #e5e7eb;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        
        .stat-number {
          font-size: 2.5rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }
        
        .stat-label {
          font-size: 1rem;
          opacity: 0.9;
        }
        
        .results-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
          margin-top: 2rem;
          flex-wrap: wrap;
        }
        
        .loading {
          text-align: center;
          padding: 4rem 2rem;
        }
        
        .spinner {
          border: 4px solid rgba(255,255,255,0.3);
          border-top: 4px solid white;
          border-radius: 50%;
          width: 50px;
          height: 50px;
          animation: spin 1s linear infinite;
          margin: 0 auto 1rem;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @media (max-width: 768px) {
          .progress-bar-container {
            margin: 0 1rem;
          }
          
          .card-face {
            min-height: 300px;
            padding: 2rem;
          }
          
          .card-content {
            font-size: 1.5rem;
          }
          
          .action-buttons {
            flex-direction: column;
            width: 100%;
          }
          
          .btn-action {
            width: 100%;
          }
        }
        </style>
    </head>
    <body>
        <!-- ヘッダー -->
        <div class="study-header">
            <button class="exit-btn" onclick="exitStudy()">
                <i class="fas fa-times"></i> 終了
            </button>
            <div class="progress-bar-container">
                <div class="progress-bar" id="progressBar" style="width: 0%"></div>
            </div>
            <div class="progress-text" id="progressText">0 / 0</div>
        </div>

        <!-- カード選択画面 -->
        <div class="selection-container" id="selectionContainer">
            <div class="selection-header">
                <h2>📚 学習するカードを選択</h2>
                <p>チェックボックスで学習したいカードを選んでください</p>
            </div>
            
            <div class="selection-controls">
                <div class="selection-info">
                    <span id="selectedCardCount">0</span> / <span id="totalCardCount">0</span> 枚選択中
                </div>
                <div class="selection-buttons">
                    <button class="btn-action btn-correct btn-sm" onclick="selectAllCards()" style="background: #3b82f6; min-width: auto; padding: 0.5rem 1rem;">
                        <i class="fas fa-check-double"></i> 全選択
                    </button>
                    <button class="btn-action btn-wrong btn-sm" onclick="deselectAllCards()" style="min-width: auto; padding: 0.5rem 1rem;">
                        <i class="fas fa-times"></i> 選択解除
                    </button>
                </div>
            </div>
            
            <div class="card-list" id="cardListSelection"></div>
            
            <div class="shuffle-option" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin: 1rem 0; padding: 1rem; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0.5rem;">
                <input type="checkbox" id="shuffleCheckbox" style="width: 20px; height: 20px; cursor: pointer;">
                <label for="shuffleCheckbox" style="cursor: pointer; font-size: 1rem;">
                    🎲 順番をシャッフルする
                </label>
            </div>
            
            <button class="start-study-btn" id="startStudyBtn" onclick="startStudyWithSelected()" disabled>
                <i class="fas fa-play-circle"></i> 学習を開始 (<span id="selectedCountBtn">0</span>枚)
            </button>
        </div>

        <!-- 学習コンテナ -->
        <div class="study-container" id="studyContainer" style="display: none;">
            <div class="loading">
                <div class="spinner"></div>
                <p>カードを読み込み中...</p>
            </div>
        </div>

        <!-- 結果画面 -->
        <div class="results-container" id="resultsContainer">
            <div class="results-title">🎉 学習完了！</div>
            <div class="results-stats">
                <div class="stat-card">
                    <div class="stat-number" id="totalCardsResult">0</div>
                    <div class="stat-label">学習したカード</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number" style="color: #10b981;" id="correctCount">0</div>
                    <div class="stat-label">✅ わかった</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number" style="color: #ef4444;" id="wrongCount">0</div>
                    <div class="stat-label">❌ わからなかった</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number" id="accuracyRate">0%</div>
                    <div class="stat-label">正答率</div>
                </div>
            </div>
            <div class="results-actions">
                <button class="btn-action btn-correct" onclick="window.location.href='/flashcard/list'">
                    <i class="fas fa-list"></i> カード一覧へ
                </button>
                <button class="btn-action btn-correct" onclick="restartStudy(false)" style="background: #3b82f6;">
                    <i class="fas fa-redo"></i> 全てもう一度
                </button>
                <button class="btn-action btn-wrong" onclick="restartStudy(true)" id="retryWrongBtn">
                    <i class="fas fa-times-circle"></i> 間違えた問題のみ
                </button>
            </div>
        </div>

        <script>
        let cards = [];
        let allCards = []; // 元のカードリストを保持
        let selectedCardIds = new Set(); // 選択されたカードID
        let currentIndex = 0;
        let isFlipped = false;
        let correctAnswers = 0;
        let wrongAnswers = 0;
        let studyStartTime = Date.now();
        let wrongCardIds = []; // 間違えた問題のIDを記録

        function getLoginInfo() {
            const appkey = localStorage.getItem('appkey');
            const sid = localStorage.getItem('sid');
            
            if (!appkey || !sid) {
                alert('ログインが必要です。');
                window.location.href = '/study-partner';
                return null;
            }
            
            return { appkey, sid };
        }

        async function loadCards() {
            const loginInfo = getLoginInfo();
            if (!loginInfo) return;

            try {
                const response = await fetch('/api/flashcard/list', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        appkey: loginInfo.appkey,
                        sid: loginInfo.sid,
                        limit: 100
                    })
                });

                const data = await response.json();

                if (data.success && data.cards && data.cards.length > 0) {
                    // 復習が必要なカードを優先
                    allCards = data.cards.sort((a, b) => {
                        const aReview = a.next_review_at || '9999-12-31';
                        const bReview = b.next_review_at || '9999-12-31';
                        return aReview.localeCompare(bReview);
                    });
                    
                    // 選択画面を表示
                    showCardSelection();
                } else {
                    alert('学習するカードがありません。まずカードを作成してください。');
                    window.location.href = '/flashcard/create';
                }
            } catch (error) {
                console.error('Failed to load cards:', error);
                alert('カードの読み込みに失敗しました: ' + error.message);
            }
        }

        function startStudy() {
            currentIndex = 0;
            correctAnswers = 0;
            wrongAnswers = 0;
            wrongCardIds = [];
            studyStartTime = Date.now();
            showCard();
        }

        function showCard() {
            if (currentIndex >= cards.length) {
                showResults();
                return;
            }

            const card = cards[currentIndex];
            isFlipped = false;

            const container = document.getElementById('studyContainer');
            container.innerHTML = \`
                <div class="card-wrapper">
                    <div class="flashcard-study" id="flashcard" onclick="flipCard()">
                        <div class="card-face card-face-front">
                            <div class="card-label">📝 表面</div>
                            <div class="card-content">\${escapeHtml(card.front_text)}</div>
                            <div class="tap-hint">
                                <i class="fas fa-hand-pointer"></i> タップして裏面を表示
                            </div>
                        </div>
                        <div class="card-face card-face-back">
                            <div class="card-label">💡 裏面</div>
                            <div class="card-content">\${escapeHtml(card.back_text)}</div>
                        </div>
                    </div>
                    <div class="action-buttons" id="actionButtons">
                        <button class="btn-action btn-wrong" onclick="answerCard(false)">
                            <i class="fas fa-times"></i> わからなかった
                        </button>
                        <button class="btn-action btn-correct" onclick="answerCard(true)">
                            <i class="fas fa-check"></i> わかった
                        </button>
                    </div>
                </div>
            \`;

            updateProgress();
        }

        function flipCard() {
            if (isFlipped) return;
            
            const flashcard = document.getElementById('flashcard');
            const actionButtons = document.getElementById('actionButtons');
            
            flashcard.classList.add('flipped');
            actionButtons.classList.add('show');
            isFlipped = true;
        }

        async function answerCard(isCorrect) {
            const card = cards[currentIndex];
            
            if (isCorrect) {
                correctAnswers++;
            } else {
                wrongAnswers++;
                // 間違えた問題のIDを記録
                wrongCardIds.push(card.card_id);
            }

            // 学習記録をAPIに送信
            await recordStudy(card.card_id, isCorrect);

            // 次のカードへ
            currentIndex++;
            showCard();
        }

        async function recordStudy(cardId, isCorrect) {
            const loginInfo = getLoginInfo();
            if (!loginInfo) return;

            try {
                await fetch('/api/flashcard/record-study', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        appkey: loginInfo.appkey,
                        sid: loginInfo.sid,
                        cardId: cardId,
                        isCorrect: isCorrect,
                        responseTimeMs: Date.now() - studyStartTime
                    })
                });
            } catch (error) {
                console.error('Failed to record study:', error);
            }
        }

        function updateProgress() {
            const progress = ((currentIndex) / cards.length) * 100;
            document.getElementById('progressBar').style.width = progress + '%';
            document.getElementById('progressText').textContent = \`\${currentIndex} / \${cards.length}\`;
        }

        function showResults() {
            document.getElementById('studyContainer').style.display = 'none';
            document.getElementById('resultsContainer').classList.add('show');

            const accuracy = cards.length > 0 
                ? Math.round((correctAnswers / cards.length) * 100) 
                : 0;

            document.getElementById('totalCardsResult').textContent = cards.length;
            document.getElementById('correctCount').textContent = correctAnswers;
            document.getElementById('wrongCount').textContent = wrongAnswers;
            document.getElementById('accuracyRate').textContent = accuracy + '%';
            
            // 間違えた問題のみボタンの表示/非表示
            const retryWrongBtn = document.getElementById('retryWrongBtn');
            if (wrongCardIds.length === 0) {
                retryWrongBtn.style.display = 'none';
            } else {
                retryWrongBtn.style.display = 'flex';
            }
        }

        function restartStudy(wrongOnly = false) {
            document.getElementById('resultsContainer').classList.remove('show');
            document.getElementById('studyContainer').style.display = 'flex';
            
            if (wrongOnly && wrongCardIds.length > 0) {
                // 間違えた問題のみを抽出
                cards = allCards.filter(card => wrongCardIds.includes(card.card_id));
                
                if (cards.length === 0) {
                    alert('間違えた問題がありません！');
                    cards = [...allCards]; // 元に戻す
                }
            } else {
                // 全てもう一度の場合は元のリストをコピー
                cards = [...allCards];
            }
            
            startStudy();
        }

        // カード選択画面の表示
        function showCardSelection() {
            document.getElementById('studyContainer').style.display = 'none';
            document.getElementById('selectionContainer').classList.add('show');
            
            // デフォルトで全てのカードを選択
            selectedCardIds.clear();
            allCards.forEach(card => selectedCardIds.add(card.card_id));
            
            renderCardList();
            updateSelectionCount();
        }
        
        function renderCardList() {
            const container = document.getElementById('cardListSelection');
            container.innerHTML = allCards.map(card => \`
                <div class="card-item-selectable \${selectedCardIds.has(card.card_id) ? 'selected' : ''}" 
                     onclick="toggleCardSelect('\${card.card_id}', event)" 
                     data-card-id="\${card.card_id}">
                    <input type="checkbox" 
                           class="card-checkbox" 
                           \${selectedCardIds.has(card.card_id) ? 'checked' : ''}
                           onclick="event.stopPropagation();"
                           onchange="toggleCardSelect('\${card.card_id}', event)">
                    <div class="card-info">
                        <div class="card-front-text">\${escapeHtml(card.front_text)}</div>
                        <div class="card-meta-info">
                            習熟度: \${card.mastery_level || 0}/5 | 
                            復習回数: \${card.review_count || 0}回
                        </div>
                    </div>
                </div>
            \`).join('');
        }
        
        function toggleCardSelect(cardId, event) {
            // イベントが存在し、チェックボックス自身からのイベントでない場合のみ処理
            if (event && event.target.classList.contains('card-checkbox')) {
                // チェックボックス自身のクリックは自動的に状態が変わるため、
                // その状態を反映する
                const checkbox = event.target;
                if (checkbox.checked) {
                    selectedCardIds.add(cardId);
                } else {
                    selectedCardIds.delete(cardId);
                }
            } else {
                // カード領域のクリックによるトグル
                if (selectedCardIds.has(cardId)) {
                    selectedCardIds.delete(cardId);
                } else {
                    selectedCardIds.add(cardId);
                }
            }
            
            // UIを更新
            const cardElement = document.querySelector(\`[data-card-id="\${cardId}"]\`);
            const checkbox = cardElement.querySelector('.card-checkbox');
            
            if (selectedCardIds.has(cardId)) {
                cardElement.classList.add('selected');
                checkbox.checked = true;
            } else {
                cardElement.classList.remove('selected');
                checkbox.checked = false;
            }
            
            updateSelectionCount();
        }
        
        function selectAllCards() {
            selectedCardIds.clear();
            allCards.forEach(card => selectedCardIds.add(card.card_id));
            renderCardList();
            updateSelectionCount();
        }
        
        function deselectAllCards() {
            selectedCardIds.clear();
            renderCardList();
            updateSelectionCount();
        }
        
        function updateSelectionCount() {
            const count = selectedCardIds.size;
            const total = allCards.length;
            
            document.getElementById('selectedCardCount').textContent = count;
            document.getElementById('totalCardCount').textContent = total;
            document.getElementById('selectedCountBtn').textContent = count;
            
            const startBtn = document.getElementById('startStudyBtn');
            startBtn.disabled = count === 0;
        }
        
        // Fisher-Yates シャッフルアルゴリズム
        function shuffleArray(array) {
            const shuffled = [...array]; // 元の配列を変更しないようコピー
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
        }
        
        function startStudyWithSelected() {
            if (selectedCardIds.size === 0) {
                alert('学習するカードを選択してください');
                return;
            }
            
            // 選択されたカードのみを抽出
            cards = allCards.filter(card => selectedCardIds.has(card.card_id));
            
            // シャッフルオプションがONの場合、カードをランダム化
            const shuffleCheckbox = document.getElementById('shuffleCheckbox');
            if (shuffleCheckbox && shuffleCheckbox.checked) {
                cards = shuffleArray(cards);
                console.log('📢 カードをシャッフルしました');
            }
            
            // 選択画面を非表示、学習画面とヘッダーを表示
            document.getElementById('selectionContainer').classList.remove('show');
            document.getElementById('studyContainer').style.display = 'flex';
            document.querySelector('.study-header').classList.add('show');
            
            startStudy();
        }

        function exitStudy() {
            if (currentIndex > 0 && currentIndex < cards.length) {
                if (!confirm('学習を中断してもよろしいですか？\\n\\n進捗は保存されます。')) {
                    return;
                }
            }
            window.location.href = '/flashcard/list';
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // 初期化
        loadCards();
        </script>
    </body>
    </html>
  `)
})

// カテゴリ管理ページ
router.get('/categories', (c) => {
  console.log('📁 Category management page requested')
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
        <title>カテゴリ管理 | KOBEYA Study Partner</title>
        
        <!-- Google Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        
        <!-- Font Awesome -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        
        <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', sans-serif; 
          background: #f5f5f5;
          min-height: 100vh;
          color: #37352f;
          padding: 2rem 1rem;
        }
        
        .container { 
          max-width: 800px; 
          width: 100%;
          margin: 0 auto;
        }

        .header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .header h1 {
          font-size: 2.5rem;
          margin-bottom: 0.5rem;
        }

        .header p {
          font-size: 1.1rem;
          opacity: 0.9;
        }

        .back-button {
          position: fixed;
          top: 1rem;
          left: 1rem;
          background: white;
          border: 1px solid #e5e7eb;
          color: #374151;
          padding: 0.75rem 1.5rem;
          border-radius: 2rem;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
          font-size: 1rem;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          z-index: 100;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .back-button:hover {
          background: #f9fafb;
          transform: translateX(-5px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .action-section {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 1rem;
          padding: 1.5rem;
          margin-bottom: 2rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }

        .action-section h2 {
          font-size: 1.5rem;
          margin-bottom: 1rem;
        }

        .input-group {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }

        .input-field {
          flex: 1;
          min-width: 200px;
          padding: 0.75rem 1rem;
          border: 2px solid #d1d5db;
          border-radius: 0.5rem;
          background: white;
          color: #374151;
          font-size: 1rem;
        }

        .input-field::placeholder {
          color: #9ca3af;
        }

        .color-picker-group {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .color-picker {
          width: 60px;
          height: 45px;
          border: 2px solid #d1d5db;
          border-radius: 0.5rem;
          cursor: pointer;
          background: white;
        }

        .icon-picker {
          padding: 0.75rem 1rem;
          border: 2px solid #d1d5db;
          border-radius: 0.5rem;
          background: white;
          color: #374151;
          font-size: 1rem;
          cursor: pointer;
          min-width: 100px;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 0.75rem 2rem;
          border-radius: 0.5rem;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(0,0,0,0.2);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .categories-list {
          display: grid;
          gap: 1rem;
        }

        .category-item {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 1rem;
          padding: 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }

        .category-item:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.12);
          transform: translateY(-2px);
        }

        .category-info {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex: 1;
        }

        .category-icon {
          font-size: 2rem;
          width: 60px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 0.75rem;
        }

        .category-details h3 {
          font-size: 1.25rem;
          margin-bottom: 0.25rem;
        }

        .category-details p {
          font-size: 0.875rem;
          opacity: 0.8;
        }

        .category-actions {
          display: flex;
          gap: 0.5rem;
        }

        .btn-icon {
          background: white;
          border: 1px solid #d1d5db;
          color: #374151;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.875rem;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }

        .btn-icon:hover {
          background: #f9fafb;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .btn-icon.delete {
          background: #fee2e2;
          border-color: #fca5a5;
          color: #dc2626;
        }

        .btn-icon.delete:hover {
          background: #fecaca;
          box-shadow: 0 2px 4px rgba(220, 38, 38, 0.2);
        }

        .loading {
          text-align: center;
          padding: 3rem;
          font-size: 1.2rem;
        }

        .empty-state {
          text-align: center;
          padding: 3rem;
          opacity: 0.8;
        }

        .empty-state i {
          font-size: 4rem;
          margin-bottom: 1rem;
          display: block;
        }

        @media (max-width: 768px) {
          .input-group {
            flex-direction: column;
          }

          .category-item {
            flex-direction: column;
            gap: 1rem;
            text-align: center;
          }

          .category-info {
            flex-direction: column;
            text-align: center;
          }

          .category-actions {
            width: 100%;
            justify-content: center;
          }
        }
        </style>
    </head>
    <body>
        <a href="/flashcard" class="back-button">
            <i class="fas fa-arrow-left"></i> 戻る
        </a>

        <div class="container">
            <div class="header">
                <h1>📁 カテゴリ管理</h1>
                <p>フラッシュカードを整理するカテゴリを作成・管理できます</p>
            </div>

            <div class="action-section">
                <h2>新しいカテゴリを作成</h2>
                <div class="input-group">
                    <input type="text" id="categoryName" class="input-field" placeholder="カテゴリ名（例：英単語、数学、歴史）" maxlength="30">
                </div>
                <div class="input-group">
                    <div class="color-picker-group">
                        <label style="opacity: 0.9;">カラー:</label>
                        <input type="color" id="categoryColor" class="color-picker" value="#8b5cf6">
                    </div>
                    <select id="categoryIcon" class="icon-picker">
                        <option value="📚">📚 本（一般）</option>
                        <option value="🔤">🔤 英語・言語</option>
                        <option value="🔢">🔢 数学</option>
                        <option value="🧪">🧪 理科・化学</option>
                        <option value="🌍">🌍 地理・社会</option>
                        <option value="📜">📜 歴史</option>
                        <option value="💻">💻 プログラミング</option>
                        <option value="🎨">🎨 美術・芸術</option>
                        <option value="🎵">🎵 音楽</option>
                        <option value="⚖️">⚖️ 法律・政治</option>
                        <option value="💰">💰 経済・ビジネス</option>
                        <option value="🏥">🏥 医学・健康</option>
                        <option value="📖">📖 国語・文学</option>
                        <option value="🔬">🔬 物理</option>
                        <option value="🌱">🌱 生物</option>
                        <option value="🗣️">🗣️ 会話・スピーチ</option>
                        <option value="📝">📝 試験対策</option>
                        <option value="🎓">🎓 大学受験</option>
                        <option value="🌟">🌟 資格試験</option>
                        <option value="💡">💡 その他</option>
                    </select>
                    <button class="btn-primary" onclick="createCategory()">
                        <i class="fas fa-plus"></i> 作成
                    </button>
                </div>
            </div>

            <div id="categoriesContainer">
                <div class="loading">
                    <i class="fas fa-spinner fa-spin"></i><br>
                    読み込み中...
                </div>
            </div>
        </div>

        <script>
        let categories = [];

        function getLoginInfo() {
            const appkey = localStorage.getItem('appkey');
            const sid = localStorage.getItem('sid');
            
            if (!appkey || !sid) {
                alert('ログインが必要です。');
                window.location.href = '/study-partner';
                return null;
            }
            
            return { appkey, sid };
        }

        async function loadCategories() {
            const loginInfo = getLoginInfo();
            if (!loginInfo) return;

            try {
                const response = await fetch('/api/flashcard/category/list', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        appkey: loginInfo.appkey,
                        sid: loginInfo.sid
                    })
                });

                const data = await response.json();

                if (data.success) {
                    categories = data.categories || [];
                    renderCategories();
                } else {
                    throw new Error(data.error || 'カテゴリ取得失敗');
                }
            } catch (error) {
                console.error('Failed to load categories:', error);
                document.getElementById('categoriesContainer').innerHTML = \`
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>カテゴリの読み込みに失敗しました</p>
                    </div>
                \`;
            }
        }

        function renderCategories() {
            const container = document.getElementById('categoriesContainer');

            if (categories.length === 0) {
                container.innerHTML = \`
                    <div class="empty-state">
                        <i class="fas fa-folder-open"></i>
                        <p>まだカテゴリがありません</p>
                        <p>上のフォームから新しいカテゴリを作成してください</p>
                    </div>
                \`;
                return;
            }

            container.innerHTML = \`
                <div class="categories-list">
                    \${categories.map(cat => \`
                        <div class="category-item">
                            <div class="category-info">
                                <div class="category-icon" style="background-color: \${cat.color};">
                                    \${cat.icon}
                                </div>
                                <div class="category-details">
                                    <h3>\${escapeHtml(cat.name)}</h3>
                                    <p>作成日: \${new Date(cat.created_at).toLocaleDateString('ja-JP')}</p>
                                </div>
                            </div>
                            <div class="category-actions">
                                <button class="btn-icon" onclick="editCategory('\${cat.category_id}')">
                                    <i class="fas fa-edit"></i> 編集
                                </button>
                                <button class="btn-icon delete" onclick="deleteCategory('\${cat.category_id}', '\${escapeHtml(cat.name)}')">
                                    <i class="fas fa-trash"></i> 削除
                                </button>
                            </div>
                        </div>
                    \`).join('')}
                </div>
            \`;
        }

        async function createCategory() {
            const name = document.getElementById('categoryName').value.trim();
            const color = document.getElementById('categoryColor').value;
            const icon = document.getElementById('categoryIcon').value;

            if (!name) {
                alert('カテゴリ名を入力してください');
                return;
            }

            const loginInfo = getLoginInfo();
            if (!loginInfo) return;

            try {
                const response = await fetch('/api/flashcard/category/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        appkey: loginInfo.appkey,
                        sid: loginInfo.sid,
                        name,
                        color,
                        icon
                    })
                });

                const data = await response.json();

                if (data.success) {
                    // 入力をクリア
                    document.getElementById('categoryName').value = '';
                    document.getElementById('categoryColor').value = '#8b5cf6';
                    document.getElementById('categoryIcon').value = '📚';
                    
                    // リロード
                    await loadCategories();
                    
                    alert('✅ カテゴリを作成しました！');
                } else {
                    throw new Error(data.error || 'カテゴリ作成失敗');
                }
            } catch (error) {
                console.error('Failed to create category:', error);
                alert('❌ カテゴリの作成に失敗しました: ' + error.message);
            }
        }

        async function editCategory(categoryId) {
            const category = categories.find(c => c.category_id === categoryId);
            if (!category) return;

            const newName = prompt('新しいカテゴリ名:', category.name);
            if (!newName || newName === category.name) return;

            const loginInfo = getLoginInfo();
            if (!loginInfo) return;

            try {
                const response = await fetch('/api/flashcard/category/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        appkey: loginInfo.appkey,
                        sid: loginInfo.sid,
                        categoryId,
                        name: newName
                    })
                });

                const data = await response.json();

                if (data.success) {
                    await loadCategories();
                    alert('✅ カテゴリを更新しました！');
                } else {
                    throw new Error(data.error || 'カテゴリ更新失敗');
                }
            } catch (error) {
                console.error('Failed to update category:', error);
                alert('❌ カテゴリの更新に失敗しました: ' + error.message);
            }
        }

        async function deleteCategory(categoryId, categoryName) {
            if (!confirm(\`「\${categoryName}」を削除してもよろしいですか？\\n\\nこのカテゴリに属するカードは「未分類」になります。\`)) {
                return;
            }

            const loginInfo = getLoginInfo();
            if (!loginInfo) return;

            try {
                const response = await fetch('/api/flashcard/category/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        appkey: loginInfo.appkey,
                        sid: loginInfo.sid,
                        categoryId
                    })
                });

                const data = await response.json();

                if (data.success) {
                    await loadCategories();
                    alert('✅ カテゴリを削除しました');
                } else {
                    throw new Error(data.error || 'カテゴリ削除失敗');
                }
            } catch (error) {
                console.error('Failed to delete category:', error);
                alert('❌ カテゴリの削除に失敗しました: ' + error.message);
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // 初期化
        loadCategories();
        </script>
    </body>
    </html>
  `)
})

// フラッシュカード作成ページ
router.get('/create', (c) => {
  console.log('📇 Flashcard create page requested')
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
        <title>フラッシュカード作成 | KOBEYA Study Partner</title>
        
        <!-- Google Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        
        <!-- Font Awesome -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        
        <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', sans-serif; 
          background: linear-gradient(180deg, #fafafa 0%, #f5f5f5 100%);
          min-height: 100vh;
          color: #37352f;
          padding-bottom: 100px;
        }
        
        .container { 
          max-width: 800px; 
          margin: 0 auto; 
          padding: 2rem 1.5rem;
        }

        @media (max-width: 768px) {
          .container { 
            padding: 1rem; 
          }
        }

        .header {
          text-align: center;
          margin-bottom: 2rem;
          padding: 1.5rem;
          background: white;
          border-radius: 1rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }

        .header h1 {
          font-size: 1.75rem;
          color: #7c3aed;
          margin-bottom: 0.5rem;
        }

        .header p {
          color: #6b7280;
          font-size: 0.95rem;
        }

        .input-method-selector {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 2rem;
          padding: 0.5rem;
          background: white;
          border-radius: 0.75rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }

        .method-btn {
          flex: 1;
          padding: 1rem;
          border: 2px solid #e0e0e0;
          background: white;
          border-radius: 0.5rem;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          font-size: 0.95rem;
        }

        .method-btn:hover {
          border-color: #7c3aed;
          transform: translateY(-2px);
        }

        .method-btn.active {
          border-color: #7c3aed;
          background: #f3e8ff;
          color: #7c3aed;
          font-weight: 600;
        }

        .method-btn i {
          display: block;
          font-size: 1.5rem;
          margin-bottom: 0.5rem;
        }

        .input-section {
          display: none;
          background: white;
          border-radius: 1rem;
          padding: 2rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          margin-bottom: 1.5rem;
        }

        .input-section.active {
          display: block;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .form-group label {
          display: block;
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: #37352f;
          font-size: 0.95rem;
        }

        .form-group textarea {
          width: 100%;
          padding: 1rem;
          border: 2px solid #e0e0e0;
          border-radius: 0.5rem;
          font-family: inherit;
          font-size: 1rem;
          resize: vertical;
          min-height: 120px;
          transition: border-color 0.2s;
        }

        .form-group textarea:focus {
          outline: none;
          border-color: #7c3aed;
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
        }

        .form-group textarea::placeholder {
          color: #9ca3af;
        }

        .btn {
          width: 100%;
          padding: 1rem;
          border: none;
          border-radius: 0.5rem;
          font-family: inherit;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .btn-primary {
          background: #7c3aed;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #6d28d9;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
        }

        .btn-secondary {
          background: #059669;
          color: white;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #047857;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .photo-upload-area {
          border: 3px dashed #d1d5db;
          border-radius: 0.75rem;
          padding: 3rem 2rem;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          background: #fafafa;
        }

        .photo-upload-area:hover {
          border-color: #7c3aed;
          background: #f9fafb;
        }

        .photo-upload-area.drag-over {
          border-color: #7c3aed;
          background: #f3e8ff;
        }

        .photo-upload-area i {
          font-size: 3rem;
          color: #9ca3af;
          margin-bottom: 1rem;
        }

        .photo-upload-area p {
          color: #6b7280;
          font-size: 1rem;
          margin-bottom: 0.5rem;
        }

        .photo-upload-area .hint {
          font-size: 0.875rem;
          color: #9ca3af;
        }

        .preview-image {
          max-width: 100%;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .generated-cards {
          margin-top: 2rem;
        }

        .card-item {
          background: white;
          border: 2px solid #e0e0e0;
          border-radius: 0.75rem;
          padding: 1.5rem;
          margin-bottom: 1rem;
          transition: all 0.2s;
        }

        .card-item:hover {
          border-color: #7c3aed;
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.1);
        }

        .card-item .card-side {
          margin-bottom: 1rem;
        }

        .card-item .card-side:last-child {
          margin-bottom: 0;
        }

        .card-item .card-label {
          font-weight: 600;
          color: #7c3aed;
          font-size: 0.875rem;
          margin-bottom: 0.25rem;
        }

        .card-item .card-content {
          color: #37352f;
          font-size: 1rem;
          line-height: 1.6;
        }

        .save-status {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: white;
          padding: 0.75rem 1.25rem;
          border-radius: 2rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          font-size: 0.875rem;
          color: #6b7280;
          z-index: 1000;
          display: none;
        }

        .save-status.show {
          display: block;
          animation: slideIn 0.3s ease;
        }

        .save-status.saving {
          color: #f59e0b;
        }

        .save-status.saved {
          color: #059669;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .loading-overlay {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          z-index: 9999;
          align-items: center;
          justify-content: center;
        }

        .loading-overlay.show {
          display: flex;
        }

        .loading-content {
          background: white;
          padding: 2rem;
          border-radius: 1rem;
          text-align: center;
          max-width: 300px;
        }

        .loading-spinner {
          border: 4px solid #f3f4f6;
          border-top: 4px solid #7c3aed;
          border-radius: 50%;
          width: 50px;
          height: 50px;
          animation: spin 1s linear infinite;
          margin: 0 auto 1rem;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .tab-navigation {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
          background: #f3f4f6;
          padding: 0.25rem;
          border-radius: 0.5rem;
        }

        .tab-btn {
          flex: 1;
          padding: 0.75rem;
          border: none;
          background: transparent;
          border-radius: 0.375rem;
          cursor: pointer;
          font-family: inherit;
          font-size: 0.95rem;
          transition: all 0.2s;
          color: #6b7280;
        }

        .tab-btn.active {
          background: white;
          color: #7c3aed;
          font-weight: 600;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        /* PCキーボード最適化 */
        @media (min-width: 1024px) {
          .keyboard-hint {
            display: block;
            font-size: 0.75rem;
            color: #9ca3af;
            margin-top: 0.25rem;
          }
        }

        .keyboard-hint {
          display: none;
        }
        </style>
    </head>
    <body>
        <div class="container">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <a href="/flashcard" style="color: #6b7280; text-decoration: none; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem;">
                    <i class="fas fa-arrow-left"></i> メニューに戻る
                </a>
                <a href="/flashcard/list" style="color: #7c3aed; text-decoration: none; font-size: 0.95rem; font-weight: 500; display: flex; align-items: center; gap: 0.5rem;">
                    <i class="fas fa-list"></i> カード一覧へ
                </a>
            </div>
            
            <div class="header">
                <h1>📇 フラッシュカード作成</h1>
                <p>写真から自動作成 or 手動入力で単語カードを作成</p>
            </div>

            <!-- 入力方法選択 -->
            <div class="input-method-selector">
                <button class="method-btn active" data-method="photo">
                    <i class="fas fa-camera"></i>
                    <div>写真から作成</div>
                </button>
                <button class="method-btn" data-method="manual">
                    <i class="fas fa-keyboard"></i>
                    <div>手動入力</div>
                </button>
            </div>

            <!-- 写真アップロードセクション -->
            <div class="input-section active" id="photoSection">
                <input type="file" id="photoInput" accept="image/*" capture="environment" style="display: none;">
                
                <div class="photo-upload-area" id="uploadArea">
                    <i class="fas fa-camera"></i>
                    <p>📷 写真を撮影 or 画像を選択</p>
                    <p class="hint">ノート・教科書・単語帳などを撮影してください</p>
                </div>

                <div id="photoPreviewArea" style="display: none;">
                    <img id="photoPreview" class="preview-image" alt="Preview">
                    <button class="btn btn-secondary" id="analyzePhotoBtn">
                        <i class="fas fa-magic"></i> AIで自動分析してカード作成
                    </button>
                </div>

                <div class="generated-cards" id="generatedCards"></div>
            </div>

            <!-- 手動入力セクション -->
            <div class="input-section" id="manualSection">
                <div class="tab-navigation">
                    <button class="tab-btn active" data-side="front">表面（問題）</button>
                    <button class="tab-btn" data-side="back">裏面（解答）</button>
                </div>

                <form id="manualForm">
                    <div class="form-group">
                        <label for="frontInput">
                            表面（問題・単語・質問）
                            <span class="keyboard-hint">Tab キーで次の項目へ</span>
                        </label>
                        <textarea 
                            id="frontInput" 
                            placeholder="例：apple" 
                            required
                            autocomplete="off"
                        ></textarea>
                    </div>

                    <div class="form-group">
                        <label for="backInput">
                            裏面（解答・意味・説明）
                            <span class="keyboard-hint">Ctrl/Cmd + Enter で保存</span>
                        </label>
                        <textarea 
                            id="backInput" 
                            placeholder="例：りんご" 
                            required
                            autocomplete="off"
                        ></textarea>
                    </div>

                    <button type="submit" class="btn btn-primary" id="saveCardBtn">
                        <i class="fas fa-save"></i> カードを保存
                    </button>
                </form>
            </div>

            <!-- 保存ステータス表示 -->
            <div class="save-status" id="saveStatus">
                <i class="fas fa-check-circle"></i> 保存しました
            </div>

            <!-- ローディングオーバーレイ -->
            <div class="loading-overlay" id="loadingOverlay">
                <div class="loading-content">
                    <div class="loading-spinner"></div>
                    <p>AI分析中...</p>
                </div>
            </div>
        </div>

        <script>
        // グローバル変数
        let currentMethod = 'photo';
        let selectedImage = null;
        let autoSaveTimeout = null;
        const AUTOSAVE_DELAY = 3000; // 3秒

        // ログイン情報取得（localStorageから）
        function getLoginInfo() {
            // 新しいログインシステムをチェック
            const authData = localStorage.getItem('study_partner_auth');
            if (authData) {
                try {
                    const parsed = JSON.parse(authData);
                    return { appkey: parsed.appkey, sid: parsed.sid };
                } catch (e) {
                    console.error('Failed to parse auth data:', e);
                }
            }
            
            // 古いシステムもチェック（後方互換性）
            const appkey = localStorage.getItem('appkey');
            const sid = localStorage.getItem('sid');
            
            if (!appkey || !sid) {
                alert('ログインが必要です。Study Partnerからアクセスしてください。');
                window.location.href = '/study-partner';
                return null;
            }
            
            return { appkey, sid };
        }

        // 要素取得
        const methodBtns = document.querySelectorAll('.method-btn');
        const photoSection = document.getElementById('photoSection');
        const manualSection = document.getElementById('manualSection');
        const photoInput = document.getElementById('photoInput');
        const uploadArea = document.getElementById('uploadArea');
        const photoPreviewArea = document.getElementById('photoPreviewArea');
        const photoPreview = document.getElementById('photoPreview');
        const analyzePhotoBtn = document.getElementById('analyzePhotoBtn');
        const generatedCards = document.getElementById('generatedCards');
        const manualForm = document.getElementById('manualForm');
        const frontInput = document.getElementById('frontInput');
        const backInput = document.getElementById('backInput');
        const saveStatus = document.getElementById('saveStatus');
        const loadingOverlay = document.getElementById('loadingOverlay');
        const tabBtns = document.querySelectorAll('.tab-btn');

        // 入力方法切り替え
        methodBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                methodBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                
                currentMethod = this.dataset.method;
                
                if (currentMethod === 'photo') {
                    photoSection.classList.add('active');
                    manualSection.classList.remove('active');
                } else {
                    photoSection.classList.remove('active');
                    manualSection.classList.add('active');
                    frontInput.focus();
                }
            });
        });

        // タブ切り替え（モバイル用）
        tabBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                tabBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                
                const side = this.dataset.side;
                if (side === 'front') {
                    frontInput.focus();
                } else {
                    backInput.focus();
                }
            });
        });

        // 写真アップロード
        uploadArea.addEventListener('click', function() {
            photoInput.click();
        });

        // ドラッグ&ドロップ
        uploadArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('drag-over');
        });

        uploadArea.addEventListener('dragleave', function() {
            this.classList.remove('drag-over');
        });

        uploadArea.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('drag-over');
            
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                handleImageFile(file);
            }
        });

        photoInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                handleImageFile(file);
            }
        });

        function handleImageFile(file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                photoPreview.src = e.target.result;
                selectedImage = file;
                uploadArea.style.display = 'none';
                photoPreviewArea.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }

        // 写真分析
        analyzePhotoBtn.addEventListener('click', async function() {
            if (!selectedImage) return;

            const loginInfo = getLoginInfo();
            if (!loginInfo) return;

            loadingOverlay.classList.add('show');

            try {
                const formData = new FormData();
                formData.append('appkey', loginInfo.appkey);
                formData.append('sid', loginInfo.sid);
                formData.append('image', selectedImage);

                const response = await fetch('/api/flashcard/create-from-photo', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (data.success && data.cards && data.cards.length > 0) {
                    displayGeneratedCards(data.cards);
                    showSaveStatus('saved', data.cards.length + '枚のカードを作成しました');
                } else {
                    alert('カードの作成に失敗しました: ' + (data.error || '不明なエラー'));
                }
            } catch (error) {
                console.error('Photo analysis error:', error);
                alert('エラーが発生しました: ' + error.message);
            } finally {
                loadingOverlay.classList.remove('show');
            }
        });

        function displayGeneratedCards(cards) {
            generatedCards.innerHTML = '<h3 style="margin-bottom: 1rem; color: #7c3aed;">✅ 作成されたカード (' + cards.length + '枚)</h3>';
            
            cards.forEach((card, index) => {
                const cardEl = document.createElement('div');
                cardEl.className = 'card-item';
                cardEl.innerHTML = \`
                    <div class="card-side">
                        <div class="card-label">📝 表面</div>
                        <div class="card-content">\${card.front}</div>
                    </div>
                    <div class="card-side">
                        <div class="card-label">💡 裏面</div>
                        <div class="card-content">\${card.back}</div>
                    </div>
                    \${card.tags && card.tags.length > 0 ? \`
                        <div style="margin-top: 0.5rem; font-size: 0.875rem; color: #6b7280;">
                            🏷️ \${card.tags.join(', ')}
                        </div>
                    \` : ''}
                \`;
                generatedCards.appendChild(cardEl);
            });
        }

        // 手動入力フォーム送信
        manualForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const loginInfo = getLoginInfo();
            if (!loginInfo) return;

            const front = frontInput.value.trim();
            const back = backInput.value.trim();

            if (!front || !back) {
                alert('表面と裏面の両方を入力してください');
                return;
            }

            try {
                const response = await fetch('/api/flashcard/create-manual', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        appkey: loginInfo.appkey,
                        sid: loginInfo.sid,
                        front: front,
                        back: back,
                        tags: []
                    })
                });

                const data = await response.json();

                if (data.success) {
                    // 成功メッセージを表示
                    if (confirm('✅ カードを保存しました！\\n\\n続けて新しいカードを作成しますか？\\n\\n「キャンセル」を押すとカード一覧に移動します。')) {
                        // フォームをクリア
                        frontInput.value = '';
                        backInput.value = '';
                        frontInput.focus();
                    } else {
                        // 一覧ページに移動
                        window.location.href = '/flashcard/list';
                    }
                } else {
                    alert('保存に失敗しました: ' + (data.error || '不明なエラー'));
                }
            } catch (error) {
                console.error('Manual save error:', error);
                alert('エラーが発生しました: ' + error.message);
            }
        });

        // キーボードショートカット
        document.addEventListener('keydown', function(e) {
            // Ctrl/Cmd + Enter で保存
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                if (currentMethod === 'manual') {
                    e.preventDefault();
                    manualForm.dispatchEvent(new Event('submit'));
                }
            }
            
            // Tabキーで表面→裏面への移動を最適化
            if (e.key === 'Tab' && document.activeElement === frontInput) {
                e.preventDefault();
                backInput.focus();
            }
        });

        // 自動保存（ドラフト保存）
        function setupAutoSave() {
            [frontInput, backInput].forEach(input => {
                input.addEventListener('input', function() {
                    clearTimeout(autoSaveTimeout);
                    showSaveStatus('saving', '保存中...');
                    
                    autoSaveTimeout = setTimeout(function() {
                        saveDraft();
                    }, AUTOSAVE_DELAY);
                });
            });
        }

        function saveDraft() {
            const front = frontInput.value.trim();
            const back = backInput.value.trim();
            
            if (front || back) {
                localStorage.setItem('flashcard_draft', JSON.stringify({
                    front: front,
                    back: back,
                    timestamp: Date.now()
                }));
                showSaveStatus('saved', '下書きを保存しました');
            }
        }

        function loadDraft() {
            const draft = localStorage.getItem('flashcard_draft');
            if (draft) {
                try {
                    const data = JSON.parse(draft);
                    // 24時間以内のドラフトのみ復元
                    if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
                        frontInput.value = data.front || '';
                        backInput.value = data.back || '';
                    }
                } catch (e) {
                    console.error('Draft load error:', e);
                }
            }
        }

        function showSaveStatus(type, message) {
            saveStatus.textContent = message;
            saveStatus.className = 'save-status show ' + type;
            
            setTimeout(function() {
                saveStatus.classList.remove('show');
            }, 3000);
        }

        // 初期化
        setupAutoSave();
        loadDraft();
        getLoginInfo(); // ログインチェック
        </script>
    </body>
    </html>
  `)
})

export default router
