import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const router = new Hono<{ Bindings: Bindings }>()

/**
 * Essay Coaching Setup Page Route
 * 小論文指導セットアップページ
 */
router.get('/', (c) => {
  console.log('📝 Essay Coaching page requested')
  
  // セッションID生成
  const sessionId = `essay-${Date.now()}-${Math.random().toString(36).substring(7)}`
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>小論文指導 - KOBEYA</title>
        
        <!-- Google Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        
        <!-- Font Awesome -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        
        <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Noto Sans JP', sans-serif;
          background: #f5f5f5;
          min-height: 100vh;
          padding: 1rem;
          color: #333;
        }
        
        .container {
          max-width: 900px;
          margin: 0 auto;
          background: white;
          border-radius: 1rem;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          overflow: hidden;
        }
        
        .header {
          background: linear-gradient(135deg, #7c3aed, #8b5cf6);
          color: white;
          padding: 2rem;
          text-align: center;
        }
        
        .header h1 {
          font-size: 1.75rem;
          margin-bottom: 0.5rem;
        }
        
        .header p {
          opacity: 0.9;
          font-size: 1rem;
        }
        
        .content {
          padding: 2rem;
        }
        
        .setup-section {
          background: #f8fafc;
          border-radius: 0.75rem;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }
        
        .setup-section h2 {
          font-size: 1.25rem;
          margin-bottom: 1rem;
          color: #374151;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .setup-section h2 .step-number {
          background: #7c3aed;
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.875rem;
          font-weight: 600;
        }
        
        .button-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1rem;
        }
        
        .choice-button {
          padding: 1.25rem;
          border: 2px solid #e2e8f0;
          border-radius: 0.75rem;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }
        
        .choice-button:hover {
          border-color: #7c3aed;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.15);
        }
        
        .choice-button.selected {
          border-color: #7c3aed;
          background: #f5f3ff;
        }
        
        .choice-button .title {
          font-weight: 600;
          font-size: 1.125rem;
          margin-bottom: 0.5rem;
          color: #1f2937;
        }
        
        .choice-button .description {
          font-size: 0.875rem;
          color: #6b7280;
          line-height: 1.5;
        }
        
        .choice-button .icon {
          font-size: 1.5rem;
          margin-bottom: 0.5rem;
          display: block;
        }
        
        .start-button {
          width: 100%;
          padding: 1rem 2rem;
          background: #7c3aed;
          color: white;
          border: none;
          border-radius: 0.75rem;
          font-size: 1.125rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 1.5rem;
          display: none;
        }
        
        .start-button:hover {
          background: #6d28d9;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
        }
        
        .start-button.visible {
          display: block;
        }
        

        .back-button {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: #f3f4f6;
          color: #374151;
          border: none;
          border-radius: 0.5rem;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 1.5rem;
        }
        
        .back-button:hover {
          background: #e5e7eb;
        }
        
        .hidden {
          display: none !important;
        }
        
        /* カスタム問題設定用スタイル */
        .radio-group {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        
        .radio-option {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1rem;
          border: 2px solid #e2e8f0;
          border-radius: 0.75rem;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .radio-option:hover {
          border-color: #7c3aed;
          background: #f5f3ff;
        }
        
        .radio-option.selected {
          border-color: #7c3aed;
          background: #f5f3ff;
        }
        
        .radio-option input[type="radio"] {
          margin-top: 0.25rem;
        }
        
        .radio-label {
          flex: 1;
        }
        
        .radio-title {
          font-weight: 600;
          font-size: 1rem;
          margin-bottom: 0.25rem;
          color: #1f2937;
        }
        
        .radio-description {
          font-size: 0.875rem;
          color: #6b7280;
        }
        
        .input-area {
          margin-top: 1rem;
          padding: 1rem;
          background: #f8fafc;
          border-radius: 0.5rem;
          border: 1px solid #e2e8f0;
        }
        
        .input-area textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          font-family: 'Noto Sans JP', sans-serif;
          font-size: 0.875rem;
          resize: vertical;
          min-height: 60px;
        }
        
        .input-area textarea:focus {
          outline: none;
          border-color: #7c3aed;
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
        }
        
        .char-count {
          text-align: right;
          font-size: 0.75rem;
          color: #6b7280;
          margin-top: 0.5rem;
        }
        
        .learning-style-section {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 2px solid #e2e8f0;
        }
        
        .learning-style-section h3 {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: #374151;
        }
        
        .input-ok-button {
          display: block;
          width: 100%;
          padding: 0.75rem 1.5rem;
          margin-top: 1rem;
          background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
          color: white;
          border: none;
          border-radius: 0.5rem;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 4px 6px rgba(124, 58, 237, 0.2);
        }
        
        .input-ok-button:hover {
          background: linear-gradient(135deg, #6d28d9 0%, #5b21b6 100%);
          box-shadow: 0 6px 8px rgba(124, 58, 237, 0.3);
          transform: translateY(-2px);
        }
        
        .input-ok-button:active {
          transform: translateY(0);
          box-shadow: 0 2px 4px rgba(124, 58, 237, 0.2);
        }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1><i class="fas fa-pen-fancy"></i> 小論文指導</h1>
                <p>丁寧な指導で、あなたの小論文力を伸ばします</p>
            </div>
            
            <div class="content">
                <button class="back-button" onclick="window.location.href='/study-partner'">
                    <i class="fas fa-arrow-left"></i> メインページに戻る
                </button>
                
                <!-- Step 1: 対象レベル選択 -->
                <div class="setup-section" id="levelSelection">
                    <h2>
                        <span class="step-number">1</span>
                        対象レベルを選択してください
                    </h2>
                    <div class="button-grid">
                        <button class="choice-button" onclick="selectLevel('high_school', event)">
                            <span class="icon">🎓</span>
                            <div class="title">高校入試対策</div>
                            <div class="description">字数: 200-300字<br>基本構成の習得を重視</div>
                        </button>
                        <button class="choice-button" onclick="selectLevel('vocational', event)">
                            <span class="icon">💼</span>
                            <div class="title">専門学校入試</div>
                            <div class="description">字数: 300-400字<br>実践性を重視</div>
                        </button>
                        <button class="choice-button" onclick="selectLevel('university', event)">
                            <span class="icon">🏛️</span>
                            <div class="title">大学入試対策</div>
                            <div class="description">字数: 400-600字<br>論理の深さを重視</div>
                        </button>
                    </div>
                </div>
                
                <!-- Step 2: 問題設定 -->
                <div class="setup-section hidden" id="problemSetup">
                    <h2>
                        <span class="step-number">2</span>
                        問題設定
                    </h2>
                    
                    <div class="radio-group">
                        <label class="radio-option" onclick="selectProblemMode('ai', event)">
                            <input type="radio" name="problemMode" value="ai">
                            <div class="radio-label">
                                <div class="radio-title">🤖 AIにお任せ</div>
                                <div class="radio-description">レベルに応じた最適なテーマをAIが自動選択します</div>
                            </div>
                        </label>
                        
                        <label class="radio-option" onclick="selectProblemMode('theme', event)">
                            <input type="radio" name="problemMode" value="theme">
                            <div class="radio-label">
                                <div class="radio-title">💡 テーマを入力</div>
                                <div class="radio-description">学習したいテーマ（環境問題、AI技術など）を入力してください</div>
                            </div>
                        </label>
                        
                        <label class="radio-option" onclick="selectProblemMode('problem', event)">
                            <input type="radio" name="problemMode" value="problem">
                            <div class="radio-label">
                                <div class="radio-title">📝 問題文を入力</div>
                                <div class="radio-description">過去問など、具体的な問題文を入力してください</div>
                            </div>
                        </label>
                    </div>
                    
                    <!-- テーマ入力エリア -->
                    <div class="input-area hidden" id="themeInput">
                        <label>
                            <strong>テーマを入力してください</strong>
                            <textarea id="themeText" maxlength="100" placeholder="例: 医療技術の発展と倫理、少子高齢化社会の課題、グローバル化と文化"></textarea>
                            <div class="char-count"><span id="themeCharCount">0</span>/100文字</div>
                        </label>
                        <button class="input-ok-button" onclick="confirmThemeInput()">✓ OK</button>
                    </div>
                    
                    <!-- 問題文入力エリア -->
                    <div class="input-area hidden" id="problemInput">
                        <label>
                            <strong>問題文を入力してください</strong>
                            <textarea id="problemText" maxlength="5000" placeholder="例: あなたは将来医療従事者を目指していますが、高齢化が進む日本社会において、医療・看護の専門家にはどのような役割が求められると考えますか。具体的な課題を挙げながら、あなたの考えを400字以内で述べなさい。"></textarea>
                            <div class="char-count"><span id="problemCharCount">0</span>/5000文字</div>
                        </label>
                        <button class="input-ok-button" onclick="confirmProblemInput()">✓ OK</button>
                    </div>
                    
                    <!-- 学習スタイル選択 -->
                    <div class="learning-style-section hidden" id="learningStyleSection">
                        <h3>📚 学習スタイルを選んでください</h3>
                        <div class="button-grid">
                            <button class="choice-button" onclick="selectLearningStyle('explanation', event)">
                                <span class="icon">📖</span>
                                <div class="title">テーマの解説</div>
                                <div class="description">基礎から理解したい</div>
                            </button>
                            <button class="choice-button" onclick="selectLearningStyle('example', event)">
                                <span class="icon">✨</span>
                                <div class="title">参考例を見る</div>
                                <div class="description">良い書き方を真似したい</div>
                            </button>
                            <button class="choice-button" onclick="selectLearningStyle('points', event)">
                                <span class="icon">📋</span>
                                <div class="title">論点整理</div>
                                <div class="description">何を書けばいいか迷う</div>
                            </button>
                            <button class="choice-button" onclick="selectLearningStyle('auto', event)">
                                <span class="icon">🤖</span>
                                <div class="title">AIにお任せ</div>
                                <div class="description">自動で最適なものを選ぶ</div>
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Step 3: 授業形式選択 -->
                <div class="setup-section hidden" id="formatSelection">
                    <h2>
                        <span class="step-number">3</span>
                        授業形式を選択してください
                    </h2>
                    <div class="button-grid">
                        <button class="choice-button" onclick="selectFormat('full_55min', event)">
                            <span class="icon">📚</span>
                            <div class="title">55分フル授業</div>
                            <div class="description">導入→語彙→短文→本練習→チャレンジ→まとめ<br>総合的な学習</div>
                        </button>
                        <button class="choice-button" onclick="selectFormat('vocabulary_focus', event)">
                            <span class="icon">✍️</span>
                            <div class="title">語彙力強化中心</div>
                            <div class="description">25分構成<br>多くの語彙を反復練習</div>
                        </button>
                        <button class="choice-button" onclick="selectFormat('short_essay_focus', event)">
                            <span class="icon">📝</span>
                            <div class="title">短文演習中心</div>
                            <div class="description">30分構成<br>構成力強化を重視</div>
                        </button>
                    </div>
                </div>
                
                <!-- 授業開始ボタン -->
                <button class="start-button" id="startButton" onclick="startLesson()">
                    <i class="fas fa-play-circle"></i> 授業を開始
                </button>
            </div>
        </div>
        
        <script>
        const sessionId = '${sessionId}';
        let selectedLevel = null;
        let selectedProblemMode = null;
        let customInput = null;
        let selectedLearningStyle = null;
        let selectedFormat = null;
        
        // 文字数カウント機能
        const themeTextarea = document.getElementById('themeText');
        const problemTextarea = document.getElementById('problemText');
        
        if (themeTextarea) {
            themeTextarea.addEventListener('input', function() {
                document.getElementById('themeCharCount').textContent = this.value.length;
            });
        }
        
        if (problemTextarea) {
            problemTextarea.addEventListener('input', function() {
                document.getElementById('problemCharCount').textContent = this.value.length;
            });
        }
        
        function selectLevel(level, event) {
            selectedLevel = level;
            
            // ボタンの選択状態を更新
            document.querySelectorAll('#levelSelection .choice-button').forEach(btn => {
                btn.classList.remove('selected');
            });
            event.target.closest('.choice-button').classList.add('selected');
            
            // 次のステップ（問題設定）を表示
            document.getElementById('problemSetup').classList.remove('hidden');
            
            console.log('Selected level:', level);
        }
        
        function selectProblemMode(mode, event) {
            selectedProblemMode = mode;
            
            // ラジオボタンの選択状態を更新
            document.querySelectorAll('.radio-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            event.target.closest('.radio-option').classList.add('selected');
            
            // 対応する入力エリアを表示/非表示
            document.getElementById('themeInput').classList.add('hidden');
            document.getElementById('problemInput').classList.add('hidden');
            document.getElementById('learningStyleSection').classList.add('hidden');
            document.getElementById('formatSelection').classList.add('hidden');
            
            if (mode === 'theme') {
                document.getElementById('themeInput').classList.remove('hidden');
                // 学習スタイルとフォーマット選択はOKボタン後に表示
            } else if (mode === 'problem') {
                document.getElementById('problemInput').classList.remove('hidden');
                // 学習スタイルとフォーマット選択はOKボタン後に表示
            } else if (mode === 'ai') {
                // AIにお任せの場合はすぐに次のステップへ
                document.getElementById('learningStyleSection').classList.remove('hidden');
                document.getElementById('formatSelection').classList.remove('hidden');
            }
            
            console.log('Selected problem mode:', mode);
        }
        
        function confirmThemeInput() {
            const themeText = document.getElementById('themeText').value.trim();
            if (!themeText) {
                alert('テーマを入力してください');
                return;
            }
            // 学習スタイルとフォーマット選択を表示
            document.getElementById('learningStyleSection').classList.remove('hidden');
            document.getElementById('formatSelection').classList.remove('hidden');
            console.log('Theme confirmed:', themeText);
        }
        
        function confirmProblemInput() {
            const problemText = document.getElementById('problemText').value.trim();
            if (!problemText) {
                alert('問題文を入力してください');
                return;
            }
            // 学習スタイルとフォーマット選択を表示
            document.getElementById('learningStyleSection').classList.remove('hidden');
            document.getElementById('formatSelection').classList.remove('hidden');
            console.log('Problem confirmed:', problemText);
        }
        
        function selectLearningStyle(style, event) {
            selectedLearningStyle = style;
            
            // ボタンの選択状態を更新
            document.querySelectorAll('#learningStyleSection .choice-button').forEach(btn => {
                btn.classList.remove('selected');
            });
            event.target.closest('.choice-button').classList.add('selected');
            
            console.log('Selected learning style:', style);
        }
        
        function selectFormat(format, event) {
            selectedFormat = format;
            
            // ボタンの選択状態を更新
            document.querySelectorAll('#formatSelection .choice-button').forEach(btn => {
                btn.classList.remove('selected');
            });
            event.target.closest('.choice-button').classList.add('selected');
            
            // 開始ボタンを表示
            document.getElementById('startButton').classList.add('visible');
            
            console.log('Selected format:', format);
        }
        
        async function startLesson() {
            console.log('🚀 startLesson called');
            console.log('📊 Current selections:', {
                selectedLevel,
                selectedFormat,
                selectedProblemMode,
                selectedLearningStyle
            });
            
            if (!selectedLevel || !selectedFormat || !selectedProblemMode) {
                alert('すべての項目を選択してください');
                console.log('❌ Validation failed: missing required selections');
                return;
            }
            
            console.log('✅ Validation passed');
            
            // テーマまたは問題文の取得
            if (selectedProblemMode === 'theme') {
                customInput = document.getElementById('themeText').value.trim();
                if (!customInput) {
                    alert('テーマを入力してください');
                    return;
                }
            } else if (selectedProblemMode === 'problem') {
                customInput = document.getElementById('problemText').value.trim();
                if (!customInput) {
                    alert('問題文を入力してください');
                    return;
                }
            }
            
            // 学習スタイルが選択されているか確認（AIにお任せ以外の場合）
            if (selectedProblemMode !== 'ai' && !selectedLearningStyle) {
                alert('学習スタイルを選択してください');
                return;
            }
            
            console.log('Starting lesson:', { 
                sessionId, 
                selectedLevel, 
                selectedProblemMode, 
                customInput,
                selectedLearningStyle,
                selectedFormat 
            });
            
            // セッション初期化API呼び出し
            console.log('📡 Calling API: /api/essay/init-session');
            try {
                const response = await fetch('/api/essay/init-session', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId,
                        targetLevel: selectedLevel,
                        lessonFormat: selectedFormat,
                        problemMode: selectedProblemMode,
                        customInput: customInput || null,
                        learningStyle: selectedLearningStyle || 'auto'
                    })
                });
                
                console.log('📥 API response status:', response.status);
                const result = await response.json();
                console.log('📦 API result:', result);
                
                if (result.ok) {
                    // 授業ページに遷移
                    console.log('✅ Navigating to session page:', '/essay-coaching/session/' + sessionId);
                    window.location.href = '/essay-coaching/session/' + sessionId;
                } else {
                    console.log('❌ API returned error:', result.message);
                    alert('セッションの初期化に失敗しました: ' + result.message);
                }
            } catch (error) {
                console.error('❌ Session init error:', error);
                alert('エラーが発生しました。もう一度お試しください。');
            }
        }
        

        </script>

        <!-- フローティングAIチャットボタン -->
        <button onclick="openAIChat('essay-ai-help')" style="position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 50; width: 56px; height: 56px; border: none; padding: 0; cursor: pointer; background: transparent;">
          <div style="width: 100%; height: 100%; background: linear-gradient(135deg, #7c3aed, #8b5cf6); border-radius: 50%; box-shadow: 0 10px 25px rgba(124, 58, 237, 0.5); display: flex; align-items: center; justify-content: center; transition: all 0.3s;"
               onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 15px 35px rgba(124, 58, 237, 0.6)';"
               onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 10px 25px rgba(124, 58, 237, 0.5)';">
            <svg style="width: 28px; height: 28px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
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
    </body>
    </html>
  `)
})

export default router

