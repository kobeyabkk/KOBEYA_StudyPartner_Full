import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const router = new Hono<{ Bindings: Bindings }>()

router.get('/session/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')
  console.log('📝 Essay session page requested:', sessionId)
  
  // セッション情報を取得（D1から復元も試みる）
  const db = c.env?.DB
  const session = await getOrCreateSession(db, sessionId)
  if (!session || !session.essaySession) {
    return c.html('<h1>セッションが見つかりません</h1><p>セッションIDが無効か、有効期限が切れている可能性があります。</p><a href="/essay-coaching">新しいセッションを開始</a>')
  }
  
  const essaySession = session.essaySession
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>小論文授業 - KOBEYA</title>
        
        <!-- Google Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        
        <!-- Font Awesome -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        
        <!-- Eruda Mobile Console (for debugging on mobile/tablet) -->
        <script src="https://cdn.jsdelivr.net/npm/eruda"></script>
        <script>
          // URLパラメータで ?debug=true または 画面幅が1024px以下の場合に有効化
          const urlParams = new URLSearchParams(window.location.search);
          const isDebugMode = urlParams.get('debug') === 'true';
          const isMobile = window.innerWidth < 1024;
          
          if (isDebugMode || isMobile) {
            eruda.init();
            console.log('🐛 Eruda mobile console initialized');
          }
        </script>
        
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
          max-width: 1200px;
          margin: 0 auto;
          background: white;
          border-radius: 1rem;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          overflow: hidden;
        }
        
        .header {
          background: linear-gradient(135deg, #7c3aed, #8b5cf6);
          color: white;
          padding: 1.5rem 2rem;
        }
        
        .header-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        
        .header h1 {
          font-size: 1.5rem;
        }
        
        .session-info {
          font-size: 0.875rem;
          opacity: 0.9;
        }
        
        /* ステップ進捗バー */
        .progress-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0;
          margin-top: 1rem;
        }
        
        .step {
          flex: 1;
          text-align: center;
          position: relative;
        }
        
        .step::before {
          content: '';
          position: absolute;
          top: 15px;
          left: 0;
          right: 0;
          height: 2px;
          background: #d1d5db;
          z-index: 0;
        }
        
        .step:first-child::before {
          left: 50%;
        }
        
        .step:last-child::before {
          right: 50%;
        }
        
        .step-circle {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #e5e7eb;
          border: 2px solid #9ca3af;
          color: #374151;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          position: relative;
          z-index: 1;
          margin-bottom: 0.5rem;
        }
        
        .step.completed .step-circle {
          background: #10b981;
          border-color: #10b981;
          color: white;
        }
        
        .step.current .step-circle {
          background: white;
          color: #7c3aed;
          border-color: white;
          box-shadow: 0 0 0 4px rgba(255,255,255,0.3);
        }
        
        .step-label {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.8);
        }
        
        .step.current .step-label {
          color: white;
          font-weight: 600;
        }
        
        .content {
          padding: 2rem;
        }
        
        .chat-section {
          background: #f9fafb;
          border-radius: 0.75rem;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }
        
        .messages {
          min-height: 400px;
          max-height: 70vh;
          overflow-y: auto;
          margin-bottom: 1rem;
        }
        
        .message {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 1rem;
          padding: 1rem;
          border-radius: 0.75rem;
        }
        
        .message.teacher {
          background: #ede9fe;
          border-left: 4px solid #7c3aed;
        }
        
        .message.student {
          background: white;
          border: 1px solid #e5e7eb;
        }
        
        .message .icon {
          font-size: 1.5rem;
          flex-shrink: 0;
        }
        
        .input-area {
          display: flex;
          gap: 0.75rem;
        }
        
        textarea {
          flex: 1;
          min-height: 80px;
          padding: 0.75rem;
          border: 2px solid #e5e7eb;
          border-radius: 0.5rem;
          font-family: 'Noto Sans JP', sans-serif;
          font-size: 1rem;
          resize: vertical;
        }
        
        textarea:focus {
          outline: none;
          border-color: #7c3aed;
        }
        
        button {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 0.5rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        /* カメラ入力ボタン（入力エリア内） */
        .camera-input-btn {
          background: #f59e0b;
          color: white;
          padding: 0.75rem 1rem;
          min-width: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
        }
        
        .camera-input-btn:hover {
          background: #d97706;
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(245, 158, 11, 0.3);
        }
        
        .camera-input-btn i {
          margin: 0;
        }
        
        #sendBtn {
          background: #7c3aed;
          color: white;
          min-width: 100px;
        }
        
        #sendBtn:hover {
          background: #6d28d9;
        }
        
        #sendBtn:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
        
        .action-buttons {
          display: flex;
          gap: 1rem;
          justify-content: space-between;
        }
        
        .btn {
          padding: 0.875rem 1.75rem;
          border: none;
          border-radius: 0.5rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .btn-secondary {
          background: #e5e7eb;
          color: #374151;
        }
        
        .btn-secondary:hover {
          background: #d1d5db;
        }
        
        .btn-primary {
          background: #7c3aed;
          color: white;
        }
        
        .btn-primary:hover {
          background: #6d28d9;
        }
        
        .hidden {
          display: none !important;
        }
        
        .completion-message {
          background: #d1fae5;
          border: 2px solid #10b981;
          border-radius: 0.75rem;
          padding: 1rem;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-weight: 600;
          color: #065f46;
        }
        
        .completion-message i {
          font-size: 1.5rem;
          color: #10b981;
        }
        
        /* カメラボタン（ヘッダー - 非表示） */
        .camera-btn {
          display: none;
        }
        
        /* カメラモーダル */
        .modal {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.8);
          z-index: 1000;
          align-items: center;
          justify-content: center;
        }
        
        .modal.active {
          display: flex;
        }
        
        .modal-content {
          background: white;
          border-radius: 1rem;
          padding: 2rem;
          max-width: 600px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
        }
        
        @media (max-width: 768px) {
          .modal-content {
            width: 95%;
            padding: 1rem;
            max-height: 95vh;
          }
        }
        
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        
        .modal-header h2 {
          color: #7c3aed;
          font-size: 1.5rem;
        }
        
        .close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #6b7280;
          padding: 0;
          width: 2rem;
          height: 2rem;
        }
        
        .close-btn:hover {
          color: #374151;
        }
        
        #cameraPreview, #cameraPreviewSP {
          width: 100%;
          max-height: 50vh;
          max-width: 100%;
          height: auto;
          background: #000;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
          object-fit: contain;
        }
        
        #capturedImage, #capturedImageSP {
          width: 100%;
          max-height: 50vh;
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
          object-fit: contain;
        }
        
        /* Mobile adjustments for camera */
        @media (max-width: 768px) {
          #cameraPreview, #cameraPreviewSP {
            max-height: 40vh;
          }
          
          #capturedImage, #capturedImageSP {
            max-height: 40vh;
          }
        }
        
        .camera-controls {
          display: flex;
          gap: 0.75rem;
          justify-content: center;
          margin-top: 1rem;
        }
        
        .camera-controls button {
          flex: 1;
          max-width: 200px;
        }
        
        .btn-capture {
          background: #7c3aed;
          color: white;
        }
        
        .btn-capture:hover {
          background: #6d28d9;
        }
        
        .btn-retake {
          background: #f59e0b;
          color: white;
        }
        
        .btn-retake:hover {
          background: #d97706;
        }
        
        .btn-crop {
          background: #f59e0b;
          color: white;
        }
        
        .btn-crop:hover {
          background: #d97706;
        }
        
        .btn-crop-confirm {
          background: #3b82f6;
          color: white;
        }
        
        .btn-crop-confirm:hover {
          background: #2563eb;
        }
        
        .btn-upload {
          background: #10b981;
          color: white;
        }
        
        .btn-upload:hover {
          background: #059669;
        }
        
        /* ワークフロー説明 */
        .workflow-instructions {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          padding: 1rem;
          background: #e5e7eb;
          border-radius: 0.75rem;
          color: #374151;
          border: 2px solid #d1d5db;
        }
        
        .workflow-step {
          font-size: 0.875rem;
          font-weight: 600;
          padding: 0.5rem 1rem;
          background: #e5e7eb;
          border-radius: 0.5rem;
          color: #374151;
        }
        
        .workflow-arrow {
          font-size: 1.25rem;
          font-weight: bold;
        }
        
        /* カメラステータス */
        .camera-status {
          text-align: center;
          padding: 0.75rem;
          margin: 1rem 0;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          font-weight: 600;
          display: none;
        }
        
        .camera-status.active {
          display: block;
        }
        
        .camera-status.info {
          background: #dbeafe;
          color: #1e40af;
          border: 1px solid #3b82f6;
        }
        
        .camera-status.success {
          background: #dcfce7;
          color: #166534;
          border: 1px solid #22c55e;
        }
        
        /* Crop Canvas */
        #cropCanvas {
          width: 100%;
          max-height: 400px;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
          cursor: crosshair;
          border: 2px solid #7c3aed;
        }
        
        .camera-container {
          position: relative;
          width: 100%;
          max-height: 60vh;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000;
          border-radius: 0.5rem;
        }
        
        .btn-cancel {
          background: #6b7280;
          color: white;
        }
        
        .btn-cancel:hover {
          background: #4b5563;
        }
        
        /* OCR結果表示 */
        .ocr-result {
          background: #f3f4f6;
          border-radius: 0.75rem;
          padding: 1.5rem;
          margin: 1rem 0;
        }
        
        .ocr-result h3 {
          color: #7c3aed;
          margin-bottom: 1rem;
          font-size: 1.125rem;
        }
        
        .ocr-text {
          background: white;
          padding: 1rem;
          border-radius: 0.5rem;
          border: 1px solid #e5e7eb;
          line-height: 1.8;
          white-space: pre-wrap;
          max-height: 300px;
          overflow-y: auto;
        }
        
        .ocr-stats {
          display: flex;
          gap: 1rem;
          margin-top: 1rem;
          font-size: 0.875rem;
        }
        
        .ocr-stat {
          background: white;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          border: 1px solid #e5e7eb;
        }
        
        .ocr-stat strong {
          color: #7c3aed;
        }
        
        .ocr-issues {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 0.5rem;
          padding: 1rem;
          margin-top: 1rem;
        }
        
        .ocr-issues h4 {
          color: #dc2626;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
        }
        
        .ocr-issues ul {
          margin-left: 1.5rem;
          color: #991b1b;
          font-size: 0.875rem;
        }
        
        .loading {
          text-align: center;
          padding: 2rem;
          color: #7c3aed;
        }
        
        .loading i {
          font-size: 2rem;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .hidden {
          display: none !important;
        }
        
        /* AI添削結果表示 */
        .ai-feedback {
          background: #f9fafb;
          border-radius: 1rem;
          padding: 2rem;
          margin: 1.5rem 0;
          color: #374151;
          border: 2px solid #e5e7eb;
        }
        
        .ai-feedback h3 {
          font-size: 1.5rem;
          margin-bottom: 1.5rem;
          text-align: center;
        }
        
        .ai-feedback h3 i {
          margin-right: 0.5rem;
        }
        
        .feedback-score {
          text-align: center;
          margin-bottom: 2rem;
        }
        
        .score-circle {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: white;
          color: #7c3aed;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.5rem;
          font-weight: bold;
          margin: 0 auto 0.5rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        
        .score-label {
          font-size: 1rem;
          opacity: 0.9;
        }
        
        .feedback-section {
          background: white;
          border-radius: 0.75rem;
          padding: 1.5rem;
          margin-bottom: 1rem;
          border: 1px solid #e5e7eb;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        
        .feedback-section h4 {
          font-size: 1.125rem;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .feedback-section ul {
          margin-left: 1.5rem;
          line-height: 1.8;
        }
        
        .feedback-section ul li {
          margin-bottom: 0.75rem;
        }
        
        .feedback-section.good-points {
          border-left: 4px solid #10b981;
        }
        
        .feedback-section.improvements {
          border-left: 4px solid #f59e0b;
        }
        
        .feedback-section.example {
          border-left: 4px solid #3b82f6;
        }
        
        .feedback-section.next-steps {
          border-left: 4px solid #8b5cf6;
        }
        
        .example-text {
          background: #f9fafb;
          padding: 1rem;
          border-radius: 0.5rem;
          line-height: 1.8;
          white-space: pre-wrap;
          color: #374151;
        }
        
        /* クイックアクションボタン */
        .quick-actions {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
          flex-wrap: wrap;
        }
        
        .quick-action-btn {
          padding: 0.5rem 1rem;
          background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
          color: white;
          border: none;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 2px 4px rgba(124, 58, 237, 0.2);
        }
        
        .quick-action-btn:hover {
          background: linear-gradient(135deg, #6d28d9 0%, #5b21b6 100%);
          box-shadow: 0 4px 6px rgba(124, 58, 237, 0.3);
          transform: translateY(-2px);
        }
        
        .quick-action-btn:active {
          transform: translateY(0);
        }
        
        .quick-action-btn.hidden {
          display: none;
        }
        /* レスポンシブ対応 */
        @media (max-width: 640px) {
          .input-area {
            gap: 0.5rem;
          }
          
          textarea {
            min-height: 60px;
            font-size: 0.875rem;
          }
          
          .camera-input-btn {
            padding: 0.625rem 0.75rem;
            min-width: 50px;
            font-size: 1.125rem;
          }
          
          #sendBtn {
            padding: 0.625rem 1rem;
            min-width: 80px;
            font-size: 0.875rem;
          }
          
          .quick-actions {
            gap: 0.375rem;
          }
          
          .quick-action-btn {
            padding: 0.375rem 0.75rem;
            font-size: 0.8125rem;
          }
        }
        
        /* 開発者用クイックジャンプボタン */
        .dev-quick-jump {
          position: fixed;
          bottom: 80px;
          right: 20px;
          z-index: 9998;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: white;
          border: none;
          border-radius: 50%;
          width: 60px;
          height: 60px;
          font-size: 1.5rem;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .dev-quick-jump:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 20px rgba(245, 158, 11, 0.6);
        }
        
        .dev-quick-jump:active {
          transform: scale(0.95);
        }
        
        .dev-quick-jump-label {
          position: fixed;
          bottom: 85px;
          right: 90px;
          z-index: 9998;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          font-size: 0.75rem;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        
        .dev-quick-jump:hover + .dev-quick-jump-label {
          opacity: 1;
        }
        
        @media (max-width: 768px) {
          .dev-quick-jump {
            width: 50px;
            height: 50px;
            font-size: 1.2rem;
            bottom: 70px;
            right: 15px;
          }
          
          .dev-quick-jump-label {
            bottom: 75px;
            right: 75px;
            font-size: 0.7rem;
            padding: 0.4rem 0.8rem;
          }
        }
        
        /* スピナーアニメーション */
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .fa-spin {
          animation: spin 1s linear infinite;
        }
        
        /* ローディングインジケーター用の追加スタイル */
        .loading-indicator {
          opacity: 0.8;
        }
        
        .loading-indicator .fa-spin {
          display: inline-block;
          margin-right: 0.5rem;
        }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="header-top">
                    <h1>📝 小論文指導</h1>
                    <div class="session-info">
                        <button class="camera-btn" id="cameraBtn" onclick="openCamera()">
                            <i class="fas fa-camera"></i>
                            撮影
                        </button>
                    </div>
                </div>
                
                <!-- 進捗バー -->
                <div class="progress-bar">
                    <div class="step current" id="step-1">
                        <div class="step-circle">1</div>
                        <div class="step-label">導入</div>
                    </div>
                    <div class="step" id="step-2">
                        <div class="step-circle">2</div>
                        <div class="step-label">語彙</div>
                    </div>
                    <div class="step" id="step-3">
                        <div class="step-circle">3</div>
                        <div class="step-label">短文</div>
                    </div>
                    <div class="step" id="step-4">
                        <div class="step-circle">4</div>
                        <div class="step-label">本練習</div>
                    </div>
                    <div class="step" id="step-5">
                        <div class="step-circle">5</div>
                        <div class="step-label">チャレンジ</div>
                    </div>
                    <div class="step" id="step-6">
                        <div class="step-circle">6</div>
                        <div class="step-label">まとめ</div>
                    </div>
                </div>
            </div>
            
            <div class="content">
                <!-- チャットエリア -->
                <div class="chat-section">
                    <div class="messages" id="messages">
                        <div class="message teacher">
                            <span class="icon">👨‍🏫</span>
                            <div>
                              こんにちは！小論文指導を始めましょう。<br>
                              まずは今日のテーマについて読み物を読んでいただきます。<br>
                              準備ができたら「OK」と入力して、送信ボタンを押してください。
                            </div>
                        </div>
                    </div>
                    
                    <!-- クイックアクションボタン -->
                    <div class="quick-actions" id="quickActions">
                        <button class="quick-action-btn" id="btnOK" onclick="quickAction('OK')">✓ OK</button>
                        <button class="quick-action-btn hidden" id="btnYonda" onclick="quickAction('読んだ')">📖 読んだ</button>
                        <button class="quick-action-btn hidden" id="btnPass" onclick="quickAction('パス')">⏭️ パス</button>
                        <button class="quick-action-btn hidden" id="btnKanryo" onclick="quickAction('完了')">✅ 完了</button>
                    </div>
                    
                    <!-- 入力エリア -->
                    <div class="input-area">
                        <textarea id="userInput" placeholder="ここに回答を入力してください..."></textarea>
                        <button id="cameraInputBtn" onclick="openCamera()" class="camera-input-btn" title="原稿を撮影">
                            <i class="fas fa-camera"></i>
                        </button>
                        <button id="sendBtn" onclick="sendMessage()">
                            <i class="fas fa-paper-plane"></i> 送信
                        </button>
                    </div>
                </div>
                
                <!-- アクションボタン -->
                <div class="action-buttons">
                    <button class="btn btn-secondary" onclick="window.location.href='/essay-coaching'">
                        <i class="fas fa-arrow-left"></i> 戻る
                    </button>
                    <button class="btn btn-primary hidden" id="nextStepBtn" onclick="moveToNextStep()">
                        <i class="fas fa-arrow-right"></i> 次のステップへ
                    </button>
                </div>
            </div>
        </div>
        
        <!-- カメラモーダル -->
        <div class="modal" id="cameraModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-camera"></i> 原稿を撮影</h2>
                    <button class="close-btn" onclick="closeCamera()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- ワークフロー説明 -->
                <div class="workflow-instructions">
                    <div class="workflow-step">1️⃣ 原稿を撮影</div>
                    <div class="workflow-arrow">→</div>
                    <div class="workflow-step">2️⃣ 範囲を調整</div>
                    <div class="workflow-arrow">→</div>
                    <div class="workflow-step">3️⃣ OCR処理</div>
                </div>
                
                <div class="camera-container">
                    <video id="cameraPreview" autoplay playsinline></video>
                    <canvas id="cropCanvas" class="hidden"></canvas>
                    <img id="capturedImage" class="hidden" alt="撮影した画像">
                </div>
                
                <!-- ステータス表示 -->
                <div id="cameraStatus" class="camera-status"></div>
                
                <div class="camera-controls">
                    <button class="btn btn-capture" id="captureBtn" onclick="capturePhoto()">
                        <i class="fas fa-camera"></i> 撮影する
                    </button>
                    <button class="btn btn-retake hidden" id="retakeBtn" onclick="retakePhoto()">
                        <i class="fas fa-redo"></i> 再撮影
                    </button>
                    <button class="btn btn-crop hidden" id="cropBtn" onclick="showCropInterface()">
                        <i class="fas fa-crop"></i> 範囲を調整
                    </button>
                    <button class="btn btn-crop-confirm hidden" id="cropConfirmBtn" onclick="applyCrop()">
                        <i class="fas fa-check"></i> この範囲でOK
                    </button>
                    <button class="btn btn-upload hidden" id="uploadBtn" onclick="uploadAndProcessImage()">
                        <i class="fas fa-check-circle"></i> OCR処理を開始
                    </button>
                    <button class="btn btn-cancel" onclick="closeCamera()">
                        <i class="fas fa-times"></i> キャンセル
                    </button>
                </div>
                
                <div class="camera-tips" style="margin-top: 1.5rem; padding: 1rem; background: #f3f4f6; border-radius: 0.5rem; font-size: 0.875rem;">
                    <h4 style="color: #7c3aed; margin-bottom: 0.5rem;">📝 撮影のコツ</h4>
                    <ul style="margin-left: 1.5rem; line-height: 1.8;">
                        <li>原稿用紙全体が画面に入るように撮影してください</li>
                        <li>明るい場所で撮影し、影ができないようにしてください</li>
                        <li>文字がはっきり見えるように、ピントを合わせてください</li>
                        <li>原稿用紙を平らに置いて撮影してください</li>
                    </ul>
                </div>
            </div>
        </div>
        
        <script>
        const sessionId = '${sessionId}';
        let currentStep = 1;
        
        // セッション設定をコンソールに表示（デバッグ用）
        console.log('🔍 Essay Session Configuration:', {
          sessionId: sessionId,
          problemMode: '${essaySession.problemMode}',
          customInput: '${essaySession.customInput || "(empty)"}',
          learningStyle: '${essaySession.learningStyle}',
          targetLevel: '${essaySession.targetLevel}',
          timestamp: new Date().toISOString()
        });
        
        function addMessage(text, isTeacher = false) {
            const messagesDiv = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + (isTeacher ? 'teacher' : 'student');
            
            const icon = isTeacher ? '👨‍🏫' : '👤';
            const formattedText = text.split('\\n').join('<br>');
            messageDiv.innerHTML = '<span class="icon">' + icon + '</span><div>' + formattedText + '</div>';
            
            messagesDiv.appendChild(messageDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
        
        // 重複リクエスト防止フラグ
        let isProcessing = false;
        
        async function sendMessage() {
            const input = document.getElementById('userInput');
            const text = input.value.trim();
            
            if (!text) return;
            
            // 重複リクエスト防止
            if (isProcessing) {
                console.warn('⚠️ Already processing a request, please wait...');
                return;
            }
            
            isProcessing = true;
            
            // ユーザーメッセージを表示
            addMessage(text, false);
            input.value = '';
            
            // 送信ボタンを無効化してローディング状態を表示
            const sendBtn = document.getElementById('sendBtn');
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> しばらくお待ちください...';
            sendBtn.style.opacity = '0.6';
            sendBtn.style.cursor = 'not-allowed';
            
            // 入力エリアも無効化
            input.disabled = true;
            input.style.opacity = '0.6';
            
            // ローディングメッセージを追加
            const loadingMsg = document.createElement('div');
            loadingMsg.className = 'message teacher loading-indicator';
            loadingMsg.innerHTML = '<span class="icon">⏳</span><div><i class="fas fa-spinner fa-spin"></i> 回答を生成しています...</div>';
            loadingMsg.id = 'loading-indicator';
            document.getElementById('messages').appendChild(loadingMsg);
            document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
            
            try {
                console.log('📤 Sending message:', { sessionId, message: text, currentStep });
                
                // AIに送信
                const response = await fetch('/api/essay/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId,
                        message: text,
                        currentStep
                    })
                });
                
                console.log('📥 Response status:', response.status);
                const result = await response.json();
                console.log('📥 Response data:', result);
                
                if (result.ok) {
                    // AI応答を表示
                    addMessage(result.response, true);
                    
                    // クイックアクションボタンを更新
                    updateQuickActions(result.response);
                    
                    // Step 4 または Step 5で「確認完了」「修正完了」または修正テキスト入力の場合、AI添削を実行
                    if ((currentStep === 4 || currentStep === 5) && 
                        (text.includes('確認完了') || text.includes('修正完了') || 
                         (text.length > 10 && !text.includes('OK') && !text.includes('ok') && !text.includes('はい')))) {
                        // OCR結果があることを確認してからAI添削を実行
                        await requestAIFeedback();
                    }
                    
                    // ステップ完了チェック
                    console.log('🔍 Checking step completion:', result.stepCompleted);
                    if (result.stepCompleted) {
                        console.log('✅ Step completed! Showing completion message');
                        showStepCompletion();
                    }
                } else {
                    addMessage('エラーが発生しました: ' + result.message, true);
                }
            } catch (error) {
                console.error('❌ Send message error:', error);
                addMessage('通信エラーが発生しました。もう一度お試しください。', true);
            } finally {
                // ローディングインジケーターを削除
                const loadingIndicator = document.getElementById('loading-indicator');
                if (loadingIndicator) {
                    loadingIndicator.remove();
            }
            
            // 送信ボタンを有効化
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> 送信';
                sendBtn.style.opacity = '1';
                sendBtn.style.cursor = 'pointer';
                
                // 入力エリアを有効化
                input.disabled = false;
                input.style.opacity = '1';
                input.focus();
                
                // 重複防止フラグをリセット
                isProcessing = false;
            }
        }
        
        function formatErrorMessage(error, fallback = '不明なエラー') {
            if (error instanceof Error) {
                return error.message || fallback;
            }
            if (typeof error === 'string') {
                return error.trim() || fallback;
            }
            try {
                return JSON.stringify(error);
            } catch (jsonError) {
                console.error('Error stringifying error object:', jsonError);
                return fallback;
            }
        }
        
        function quickAction(text) {
            const input = document.getElementById('userInput');
            input.value = text;
            sendMessage();
        }
        
        function updateQuickActions(aiResponse) {
            // AIの応答内容に基づいてクイックアクションボタンを表示/非表示
            const btnOK = document.getElementById('btnOK');
            const btnYonda = document.getElementById('btnYonda');
            const btnPass = document.getElementById('btnPass');
            const btnKanryo = document.getElementById('btnKanryo');
            
            // すべてのボタンを非表示にする
            btnOK.classList.add('hidden');
            btnYonda.classList.add('hidden');
            btnPass.classList.add('hidden');
            btnKanryo.classList.add('hidden');
            
            if (!aiResponse) return;
            
            // 応答内容に応じてボタンを表示
            if (aiResponse.includes('「OK」と入力') || aiResponse.includes('準備ができたら')) {
                btnOK.classList.remove('hidden');
            }
            
            if (aiResponse.includes('「読んだ」と入力') || aiResponse.includes('読み終えたら')) {
                btnYonda.classList.remove('hidden');
            }
            
            if (aiResponse.includes('「パス」と入力') || aiResponse.includes('わからない場合は')) {
                btnPass.classList.remove('hidden');
            }
            
            if (aiResponse.includes('「完了」と入力') || aiResponse.includes('書いたつもりで')) {
                btnKanryo.classList.remove('hidden');
            }
        }
        
        function showStepCompletion() {
            console.log('🎯 showStepCompletion called');
            const messagesDiv = document.getElementById('messages');
            
            const completionDiv = document.createElement('div');
            completionDiv.className = 'completion-message';
            completionDiv.innerHTML = '<i class="fas fa-check-circle"></i> このステップが完了しました。次のステップに進みましょう！';
            messagesDiv.appendChild(completionDiv);
            
            // 次へボタンを表示
            const nextBtn = document.getElementById('nextStepBtn');
            nextBtn.classList.remove('hidden');
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
        
        function moveToNextStep() {
            currentStep++;
            if (currentStep > 6) {
                alert('全てのステップが完了しました！');
                window.location.href = '/essay-coaching';
                return;
            }
            
            // 進捗バーを更新
            updateProgressBar();
            
            // 次へボタンを非表示
            document.getElementById('nextStepBtn').classList.add('hidden');
            
            // 新しいステップのメッセージを表示
            const introMessage = getStepIntroMessage(currentStep);
            addMessage(introMessage, true);
            
            // クイックアクションボタンを更新
            updateQuickActions(introMessage);
        }
        
        function updateProgressBar() {
            for (let i = 1; i <= 6; i++) {
                const stepDiv = document.getElementById('step-' + i);
                stepDiv.classList.remove('current', 'completed');
                
                if (i < currentStep) {
                    stepDiv.classList.add('completed');
                } else if (i === currentStep) {
                    stepDiv.classList.add('current');
                }
            }
        }
        
        function getStepIntroMessage(step) {
            const messages = {
                1: '【導入】まずは今日のテーマについて読み物を読んでいただきます。\\n\\n準備ができたら「OK」と入力して送信してください。',
                2: '【語彙力強化】口語表現を小論文風に言い換える練習をしましょう。\\n\\n準備ができたら「OK」と入力して送信してください。',
                3: '【短文演習】指定字数で短い小論文を書いてみましょう。\\n\\n準備ができたら「OK」と入力して送信してください。',
                4: '【本練習】より長い小論文に挑戦します。\\n\\n準備ができたら「OK」と入力して送信してください。',
                5: '【チャレンジ問題】応用的なテーマに取り組みます。\\n\\n準備ができたら「OK」と入力して送信してください。',
                6: '【まとめ】今日の学習を振り返りましょう。\\n\\n準備ができたら「OK」と入力して送信してください。'
            };
            return messages[step] || 'ステップを進めましょう。';
        }
        
        // AI添削をリクエスト
        async function requestAIFeedback() {
            try {
                console.log('🤖 Requesting AI feedback...', {
                    sessionId: sessionId,
                    currentStep: currentStep
                });
                
                addMessage('AI添削を実行中です。少々お待ちください...', true);
                
                const response = await fetch('/api/essay/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: sessionId })
                });
                
                console.log('🤖 Feedback API response status:', response.status);
                
                const result = await response.json();
                console.log('🤖 Feedback API result:', result);
                
                if (result.ok && result.feedback) {
                    displayFeedback(result.feedback);
                } else {
                    console.error('❌ Feedback API error:', result);
                    addMessage('AI添削でエラーが発生しました: ' + (result.message || result.error || '不明なエラー'), true);
                }
            } catch (error) {
                console.error('❌ AI feedback error:', error);
                addMessage('AI添削の通信エラーが発生しました。', true);
            }
        }
        
        // フィードバックを表示
        function displayFeedback(feedback) {
            const feedbackHtml = '<div class="ai-feedback">' +
                '<h3><i class="fas fa-robot"></i> AI自動添削結果</h3>' +
                '<div class="feedback-score">' +
                '<div class="score-circle">' + (feedback.overallScore || 0) + '</div>' +
                '<div class="score-label">総合評価</div>' +
                '</div>' +
                '<div class="feedback-section good-points">' +
                '<h4><i class="fas fa-thumbs-up"></i> 良い点</h4>' +
                '<ul>' + (feedback.goodPoints || []).map(p => '<li>' + p + '</li>').join('') + '</ul>' +
                '</div>' +
                '<div class="feedback-section improvements">' +
                '<h4><i class="fas fa-wrench"></i> 改善点</h4>' +
                '<ul>' + (feedback.improvements || []).map(p => '<li>' + p + '</li>').join('') + '</ul>' +
                '</div>' +
                '<div class="feedback-section example">' +
                '<h4><i class="fas fa-lightbulb"></i> 改善例文</h4>' +
                '<div class="example-text">' + (feedback.exampleImprovement || '').split('\\n').join('<br>') + '</div>' +
                '</div>' +
                '<div class="feedback-section next-steps">' +
                '<h4><i class="fas fa-flag-checkered"></i> 次のアクション</h4>' +
                '<ul>' + (feedback.nextSteps || []).map(p => '<li>' + p + '</li>').join('') + '</ul>' +
                '</div>' +
                '</div>';
            
            addMessage(feedbackHtml, true);
            addMessage('添削が完了しました！\\n内容を確認して、「完了」と入力してください。', true);
        }
        
        // カメラ関連の変数
        let stream = null;
        let capturedImageData = null;
        let originalImageData = null;
        let cropArea = null;
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        
        // カメラモーダルを開く
        function openCamera() {
            // カメラ機能はStep 1, 3, 4, 5で使用可能
            if (currentStep !== 1 && currentStep !== 3 && currentStep !== 4 && currentStep !== 5) {
                alert('カメラ機能はStep 1（導入）、Step 3（短文）、Step 4（本練習）、Step 5（チャレンジ）で使用できます。');
                return;
            }
            
            document.getElementById('cameraModal').classList.add('active');
            updateCameraStatus('カメラを起動しています...', 'info');
            startCamera();
        }
        
        // ステータス更新
        function updateCameraStatus(message, type) {
            const statusDiv = document.getElementById('cameraStatus');
            statusDiv.textContent = message;
            statusDiv.className = 'camera-status active ' + type;
        }
        
        // カメラを起動
        async function startCamera() {
            try {
                const preview = document.getElementById('cameraPreview');
                const cropCanvas = document.getElementById('cropCanvas');
                const capturedImg = document.getElementById('capturedImage');
                
                preview.classList.remove('hidden');
                cropCanvas.classList.add('hidden');
                capturedImg.classList.add('hidden');
                
                document.getElementById('captureBtn').classList.remove('hidden');
                document.getElementById('retakeBtn').classList.add('hidden');
                document.getElementById('cropBtn').classList.add('hidden');
                document.getElementById('cropConfirmBtn').classList.add('hidden');
                document.getElementById('uploadBtn').classList.add('hidden');
                
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { 
                        facingMode: 'environment',
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    } 
                });
                preview.srcObject = stream;
                preview.play();
                updateCameraStatus('原稿用紙を画面に収めて「撮影する」を押してください', 'info');
            } catch (error) {
                console.error('Camera error:', error);
                alert('カメラの起動に失敗しました。\\nブラウザの設定でカメラへのアクセスを許可してください。');
                closeCamera();
            }
        }
        
        // 写真を撮影
        function capturePhoto() {
            const preview = document.getElementById('cameraPreview');
            
            // ビデオのサイズを確認
            console.log('📹 Video dimensions:', {
                videoWidth: preview.videoWidth,
                videoHeight: preview.videoHeight,
                readyState: preview.readyState
            });
            
            if (preview.videoWidth === 0 || preview.videoHeight === 0) {
                alert('カメラの準備ができていません。\\nもう一度お試しください。');
                console.error('❌ Video dimensions are 0');
                return;
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = preview.videoWidth;
            canvas.height = preview.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(preview, 0, 0);
            
            capturedImageData = canvas.toDataURL('image/jpeg', 0.9);
            originalImageData = capturedImageData;
            
            console.log('📸 Image captured:', {
                dataLength: capturedImageData.length,
                dataPrefix: capturedImageData.substring(0, 50)
            });
            
            // 画像データが空でないか確認
            if (!capturedImageData || capturedImageData.length < 100) {
                alert('画像の撮影に失敗しました。\\nもう一度お試しください。');
                console.error('❌ Captured image data is empty or too small');
                return;
            }
            
            // プレビューを停止
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
            }
            
            // 撮影した画像を表示
            document.getElementById('cameraPreview').classList.add('hidden');
            const img = document.getElementById('capturedImage');
            img.src = capturedImageData;
            img.classList.remove('hidden');
            
            // ボタンを切り替え
            document.getElementById('captureBtn').classList.add('hidden');
            document.getElementById('retakeBtn').classList.remove('hidden');
            document.getElementById('cropBtn').classList.remove('hidden');
            document.getElementById('uploadBtn').classList.remove('hidden');
            
            updateCameraStatus('撮影完了！必要に応じて「範囲を調整」してから「OCR処理を開始」を押してください', 'success');
        }
        
        // クロップインターフェースを表示
        function showCropInterface() {
            const img = document.getElementById('capturedImage');
            const cropCanvas = document.getElementById('cropCanvas');
            
            // キャンバスに画像を描画
            const image = new Image();
            image.onload = function() {
                cropCanvas.width = image.width;
                cropCanvas.height = image.height;
                
                const ctx = cropCanvas.getContext('2d');
                ctx.drawImage(image, 0, 0);
                
                // デフォルトのクロップ領域を設定（画像全体の90%）
                const margin = Math.min(image.width, image.height) * 0.05;
                cropArea = {
                    x: margin,
                    y: margin,
                    width: image.width - margin * 2,
                    height: image.height - margin * 2
                };
                
                drawCropArea();
            };
            image.src = originalImageData;
            
            // UI切り替え
            img.classList.add('hidden');
            cropCanvas.classList.remove('hidden');
            document.getElementById('cropBtn').classList.add('hidden');
            document.getElementById('cropConfirmBtn').classList.remove('hidden');
            document.getElementById('uploadBtn').classList.add('hidden');
            
            updateCameraStatus('マウスでドラッグして範囲を選択してください', 'info');
            
            // イベントリスナーを追加
            setupCropListeners(cropCanvas);
        }
        // クロップリスナー設定
        function setupCropListeners(canvas) {
            canvas.onmousedown = function(e) {
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                
                startX = (e.clientX - rect.left) * scaleX;
                startY = (e.clientY - rect.top) * scaleY;
                isDragging = true;
            };
            
            canvas.onmousemove = function(e) {
                if (!isDragging) return;
                
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                
                const currentX = (e.clientX - rect.left) * scaleX;
                const currentY = (e.clientY - rect.top) * scaleY;
                
                cropArea = {
                    x: Math.min(startX, currentX),
                    y: Math.min(startY, currentY),
                    width: Math.abs(currentX - startX),
                    height: Math.abs(currentY - startY)
                };
                
                drawCropArea();
            };
            
            canvas.onmouseup = function() {
                isDragging = false;
            };
            
            // タッチイベント対応
            canvas.ontouchstart = function(e) {
                e.preventDefault();
                const touch = e.touches[0];
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                
                startX = (touch.clientX - rect.left) * scaleX;
                startY = (touch.clientY - rect.top) * scaleY;
                isDragging = true;
            };
            
            canvas.ontouchmove = function(e) {
                e.preventDefault();
                if (!isDragging) return;
                
                const touch = e.touches[0];
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                
                const currentX = (touch.clientX - rect.left) * scaleX;
                const currentY = (touch.clientY - rect.top) * scaleY;
                
                cropArea = {
                    x: Math.min(startX, currentX),
                    y: Math.min(startY, currentY),
                    width: Math.abs(currentX - startX),
                    height: Math.abs(currentY - startY)
                };
                
                drawCropArea();
            };
            
            canvas.ontouchend = function() {
                isDragging = false;
            };
        }
        
        // クロップ領域を描画
        function drawCropArea() {
            const canvas = document.getElementById('cropCanvas');
            const ctx = canvas.getContext('2d');
            
            // 画像を再描画
            const img = new Image();
            img.onload = function() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                
                // 暗い背景
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // クロップ領域をクリア（明るく表示）
                ctx.clearRect(cropArea.x, cropArea.y, cropArea.width, cropArea.height);
                ctx.drawImage(img, 
                    cropArea.x, cropArea.y, cropArea.width, cropArea.height,
                    cropArea.x, cropArea.y, cropArea.width, cropArea.height
                );
                
                // 枠線
                ctx.strokeStyle = '#7c3aed';
                ctx.lineWidth = 3;
                ctx.strokeRect(cropArea.x, cropArea.y, cropArea.width, cropArea.height);
                
                // コーナーマーカー
                const cornerSize = 20;
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 4;
                
                // 左上
                ctx.beginPath();
                ctx.moveTo(cropArea.x, cropArea.y + cornerSize);
                ctx.lineTo(cropArea.x, cropArea.y);
                ctx.lineTo(cropArea.x + cornerSize, cropArea.y);
                ctx.stroke();
                
                // 右上
                ctx.beginPath();
                ctx.moveTo(cropArea.x + cropArea.width - cornerSize, cropArea.y);
                ctx.lineTo(cropArea.x + cropArea.width, cropArea.y);
                ctx.lineTo(cropArea.x + cropArea.width, cropArea.y + cornerSize);
                ctx.stroke();
                
                // 左下
                ctx.beginPath();
                ctx.moveTo(cropArea.x, cropArea.y + cropArea.height - cornerSize);
                ctx.lineTo(cropArea.x, cropArea.y + cropArea.height);
                ctx.lineTo(cropArea.x + cornerSize, cropArea.y + cropArea.height);
                ctx.stroke();
                
                // 右下
                ctx.beginPath();
                ctx.moveTo(cropArea.x + cropArea.width - cornerSize, cropArea.y + cropArea.height);
                ctx.lineTo(cropArea.x + cropArea.width, cropArea.y + cropArea.height);
                ctx.lineTo(cropArea.x + cropArea.width, cropArea.y + cropArea.height - cornerSize);
                ctx.stroke();
            };
            img.src = originalImageData;
        }
        
        // クロップを適用
        function applyCrop() {
            if (!cropArea || cropArea.width < 10 || cropArea.height < 10) {
                alert('クロップ範囲が小さすぎます。もう一度選択してください。');
                return;
            }
            
            const sourceCanvas = document.getElementById('cropCanvas');
            const resultCanvas = document.createElement('canvas');
            resultCanvas.width = cropArea.width;
            resultCanvas.height = cropArea.height;
            
            const ctx = resultCanvas.getContext('2d');
            ctx.drawImage(sourceCanvas,
                cropArea.x, cropArea.y, cropArea.width, cropArea.height,
                0, 0, cropArea.width, cropArea.height
            );
            
            capturedImageData = resultCanvas.toDataURL('image/jpeg', 0.9);
            
            // 結果を表示
            const img = document.getElementById('capturedImage');
            img.src = capturedImageData;
            img.classList.remove('hidden');
            document.getElementById('cropCanvas').classList.add('hidden');
            
            // ボタンを切り替え
            document.getElementById('cropConfirmBtn').classList.add('hidden');
            document.getElementById('cropBtn').classList.remove('hidden');
            document.getElementById('uploadBtn').classList.remove('hidden');
            
            updateCameraStatus('範囲調整完了！「OCR処理を開始」を押してください', 'success');
        }
        
        // 再撮影
        function retakePhoto() {
            capturedImageData = null;
            originalImageData = null;
            cropArea = null;
            document.getElementById('cropCanvas').classList.add('hidden');
            document.getElementById('capturedImage').classList.add('hidden');
            startCamera();
        }
        
        // 画像をアップロードしてOCR処理
        async function uploadAndProcessImage() {
            console.log('🔍 Checking capturedImageData...', {
                exists: !!capturedImageData,
                type: typeof capturedImageData,
                length: capturedImageData ? capturedImageData.length : 0
            });
            
            if (!capturedImageData) {
                alert('画像が撮影されていません。\\nもう一度撮影してください。');
                console.error('❌ capturedImageData is null or undefined');
                return;
            }
            
            if (capturedImageData.length < 100) {
                alert('画像データが不正です。\\nもう一度撮影してください。');
                console.error('❌ capturedImageData is too small:', capturedImageData.length);
                return;
            }
            
            // closeCamera()を呼ぶ前に画像データをローカル変数に保存
            const imageDataToUpload = capturedImageData;
            
            console.log('💾 Saved image data to local variable:', {
                length: imageDataToUpload.length,
                prefix: imageDataToUpload.substring(0, 50)
            });
            
            closeCamera();
            
            // ローディングメッセージを表示
            addMessage('📸 画像をアップロード中...', true);
            
            try {
                console.log('🚀 Starting image upload...', {
                    sessionId: sessionId,
                    imageDataLength: imageDataToUpload.length,
                    imageDataPrefix: imageDataToUpload.substring(0, 50),
                    currentStep: currentStep
                });
                
                // 画像をアップロード
                const uploadResponse = await fetch('/api/essay/upload-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        imageData: imageDataToUpload,
                        currentStep: currentStep
                    })
                });
                
                console.log('📤 Upload response status:', uploadResponse.status);
                
                if (!uploadResponse.ok) {
                    const errorText = await uploadResponse.text();
                    console.error('❌ Upload failed:', errorText);
                    throw new Error('アップロードに失敗しました (ステータス: ' + uploadResponse.status + ')');
                }
                
                const uploadResult = await uploadResponse.json();
                console.log('✅ Upload successful:', uploadResult);
                
                // OCR処理を開始
                addMessage('🔍 OCR処理を開始しています。しばらくお待ちください...', true);
                
                const ocrResponse = await fetch('/api/essay/ocr', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        imageData: imageDataToUpload,
                        currentStep: currentStep
                    })
                });
                
                console.log('🔍 OCR response status:', ocrResponse.status);
                
                if (!ocrResponse.ok) {
                    const errorText = await ocrResponse.text();
                    console.error('❌ OCR failed:', errorText);
                    throw new Error('OCR処理に失敗しました (ステータス: ' + ocrResponse.status + ')');
                }
                
                const ocrResult = await ocrResponse.json();
                console.log('📄 OCR result:', ocrResult);
                
                if (ocrResult.ok && ocrResult.result) {
                    displayOCRResult(ocrResult.result);
                } else {
                    throw new Error('OCR結果が無効です: ' + JSON.stringify(ocrResult));
                }
                
            } catch (error) {
                console.error('❌ Upload/OCR error:', error);
                const errorMessage = formatErrorMessage(error, 'エラーが発生しました');
                addMessage('❌ ' + errorMessage + '\\n\\nもう一度お試しください。\\n問題が続く場合は、ブラウザのコンソール（F12キー）でエラー詳細を確認してください。', true);
            }
        }
        
        // OCR結果を表示
        function displayOCRResult(result) {
            const resultHtml = '<div class="ocr-result">' +
                '<h3><i class="fas fa-file-alt"></i> OCR読み取り結果</h3>' +
                '<div class="ocr-text">' + (result.text || '読み取れませんでした') + '</div>' +
                '<div class="ocr-stats">' +
                '<div class="ocr-stat"><strong>文字数:</strong> ' + (result.charCount || 0) + '字</div>' +
                '<div class="ocr-stat"><strong>読取率:</strong> ' + (result.readabilityScore || 0) + '%</div>' +
                '</div>' +
                (result.issues && result.issues.length > 0 ? 
                    '<div class="ocr-issues">' +
                    '<h4><i class="fas fa-exclamation-triangle"></i> 改善点</h4>' +
                    '<ul>' + result.issues.map(issue => '<li>' + issue + '</li>').join('') + '</ul>' +
                    '</div>' : '') +
                '</div>';
            
            addMessage(resultHtml, true);
            
            if (result.readable) {
                const instructionHtml = '<div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 1rem; margin: 1rem 0; border-radius: 0.5rem;">' +
                    '<h4 style="color: #1e40af; margin-bottom: 0.5rem;"><i class="fas fa-info-circle"></i> 次のステップ</h4>' +
                    '<p style="margin: 0.5rem 0; line-height: 1.6;">OCR処理が完了しました。上記の読み取り結果を確認してください。</p>' +
                    '<div style="background: white; padding: 0.75rem; margin-top: 0.5rem; border-radius: 0.375rem;">' +
                    '<strong>✅ 内容が正しい場合：</strong><br>' +
                    '下の入力欄に「<strong>確認完了</strong>」と入力して送信ボタンを押してください。<br>' +
                    '<span style="color: #059669; font-size: 0.9em;">→ すぐにAI添削が開始されます</span><br><br>' +
                    '<strong>✏️ 修正が必要な場合：</strong><br>' +
                    '修正後の正しいテキスト全文を入力して送信してください。<br>' +
                    '<span style="color: #059669; font-size: 0.9em;">→ 修正内容が保存され、AI添削が開始されます</span>' +
                    '</div>' +
                    '</div>';
                addMessage(instructionHtml, true);
            } else {
                addMessage('❌ 画像の読み取りに問題があります。\\n上記の改善点を参考に、カメラボタン（📷）を押してもう一度撮影してください。', true);
            }
        }
        
        // カメラを閉じる
        function closeCamera() {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
            }
            document.getElementById('cameraModal').classList.remove('active');
            capturedImageData = null;
        }
        
        // Enterキーで改行可能（送信は送信ボタンのみ）
        // キーイベントリスナーは不要
        
        // 開発者用：Step 4へクイックジャンプ
        function quickJumpToStep4() {
            if (confirm('開発者モード：Step 4（本練習）へジャンプしますか？')) {
                console.log('🚀 Quick jump to Step 4 (Camera step)');
                currentStep = 4;
                
                // 進捗バーを更新
                for (let i = 1; i <= 6; i++) {
                    const stepDiv = document.getElementById('step-' + i);
                    if (stepDiv) {
                        if (i < 4) {
                            stepDiv.classList.add('completed');
                            stepDiv.classList.remove('current');
                        } else if (i === 4) {
                            stepDiv.classList.add('current');
                            stepDiv.classList.remove('completed');
                        } else {
                            stepDiv.classList.remove('completed', 'current');
                        }
                    }
                }
                
                // Step 4のメッセージを表示
                addMessage('【開発者モード】Step 4（本練習）へジャンプしました！\\n\\nこれから800字程度の小論文を書いていただきます。\\n原稿用紙に手書きで書いて、カメラボタン📷で撮影してください。', true);
                addMessage('準備ができたら、下のオレンジ色のカメラボタン📷をタップして原稿を撮影してください。', true);
                
                // カメラボタンを有効化
                document.getElementById('cameraBtn').style.display = 'flex';
                document.getElementById('cameraInputBtn').style.display = 'flex';
            }
        }
        
        // URLパラメータで ?dev=true の場合のみクイックジャンプボタンを表示
        window.addEventListener('DOMContentLoaded', function() {
            const urlParams = new URLSearchParams(window.location.search);
            const isDevMode = urlParams.get('dev') === 'true';
            const isDebugMode = urlParams.get('debug') === 'true';
            
            if (isDevMode) {
                // クイックジャンプボタンを追加
                const jumpBtn = document.createElement('button');
                jumpBtn.className = 'dev-quick-jump';
                jumpBtn.innerHTML = '⚡';
                jumpBtn.onclick = quickJumpToStep4;
                jumpBtn.title = 'Step 4へジャンプ（開発者用）';
                
                const jumpLabel = document.createElement('div');
                jumpLabel.className = 'dev-quick-jump-label';
                jumpLabel.textContent = 'Step 4へジャンプ';
                
                document.body.appendChild(jumpBtn);
                document.body.appendChild(jumpLabel);
                
                console.log('🛠️ Developer mode enabled. Quick jump button added.');
                console.log('💡 Click the ⚡ button to jump to Step 4 (Camera step)');
                
                // 開発者モードの案内メッセージを追加
                addMessage('🛠️ 【開発者モード有効】\\n右下の⚡ボタンでStep 4（カメラ機能）へ直接ジャンプできます。', true);
            }
            
            // デバッグモードまたはモバイルの場合の案内
            if (isDebugMode || window.innerWidth < 1024) {
                setTimeout(function() {
                    console.log('📱 Eruda console is active. Tap the 🐛 button in the bottom-right corner to open the console.');
                    addMessage('📱 デバッグモード：画面右下の🐛ボタンをタップすると、コンソールログが確認できます。', true);
                }, 1000);
            }
        });
        </script>
    </body>
    </html>
  `)
})

export default router
