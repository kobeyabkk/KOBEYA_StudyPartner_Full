import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const router = new Hono<{ Bindings: Bindings }>()

// AI質問ウインドウ用ページ
router.get('/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')
  console.log('🤖 AI chat window requested for session:', sessionId)
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI学習サポート - KOBEYA</title>
        <!-- KaTeX for math rendering -->
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
        <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
        <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
        
        <!-- Google Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        
        <!-- Font Awesome -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        
        <!-- Cropper.js CSS -->
        <link rel="stylesheet" href="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.css">
        
        <!-- MathJax for math rendering -->
        <script>
        window.MathJax = {
          tex: {
            inlineMath: [['$', '$'], ['\\(', '\\)']],
            displayMath: [['$$', '$$'], ['\\[', '\\]']],
            processEscapes: true
          },
          options: {
            skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre']
          }
        };
        </script>
        <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
        
        <style>
        body { 
          font-family: 'Noto Sans JP', sans-serif;
          margin: 0;
          padding: 1rem;
          background: #f5f5f5;
          min-height: 100vh;
          color: #333;
        }
        
        .chat-container {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          border-radius: 1rem;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          overflow: hidden;
          height: calc(100vh - 2rem);
          display: flex;
          flex-direction: column;
        }
        
        .chat-header {
          background: linear-gradient(135deg, #7c3aed, #8b5cf6);
          color: white;
          padding: 1.5rem;
          text-align: center;
        }
        
        .chat-messages {
          flex: 1;
          padding: 1rem;
          overflow-y: auto;
          background: #f8fafc;
        }
        
        .message {
          margin-bottom: 1rem;
          padding: 1rem;
          border-radius: 1rem;
          line-height: 1.6;
          white-space: pre-wrap;
        }
        
        .user-message {
          background: #e0e7ff;
          margin-left: 2rem;
          border-bottom-right-radius: 0.25rem;
        }
        
        .ai-message {
          background: white;
          margin-right: 2rem;
          border: 1px solid #e2e8f0;
          border-bottom-left-radius: 0.25rem;
        }
        
        .chat-input {
          padding: 1rem;
          background: white;
          border-top: 1px solid #e2e8f0;
        }
        
        .input-row {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        
        .image-controls {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        
        .image-btn {
          padding: 0.5rem 1rem;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 0.5rem;
          cursor: pointer;
          font-size: 0.875rem;
          color: #475569;
        }
        
        .image-btn:hover {
          background: #e2e8f0;
        }
        
        .image-preview {
          max-width: 100%;
          max-height: 200px;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
          border: 1px solid #e2e8f0;
        }
        
        .crop-container {
          max-height: 300px;
          margin-bottom: 1rem;
        }
        
        #questionInput {
          padding: 0.75rem;
          border: 2px solid #e2e8f0;
          border-radius: 0.5rem;
          font-size: 1rem;
          font-family: inherit;
          resize: vertical;
          min-height: 80px;
          width: 100%;
          box-sizing: border-box;
        }
        
        #questionInput:focus {
          outline: none;
          border-color: #7c3aed;
        }
        
        #buttonRow {
          display: flex;
          gap: 0.75rem;
          justify-content: center;
        }
        
        #sendButton, #cancelCropBtn {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 0.5rem;
          font-weight: 600;
          cursor: pointer;
          min-height: 60px;
          font-size: 1rem;
          flex: 1;
          max-width: 200px;
        }
        
        #sendButton {
          background: #7c3aed;
          color: white;
        }
        
        #sendButton:hover {
          background: #6d28d9;
        }
        
        #sendButton:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
        
        #cancelCropBtn {
          background: #6b7280;
          color: white;
        }
        
        #cancelCropBtn:hover {
          background: #4b5563;
        }
        
        .loading {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: #6b7280;
          font-style: italic;
        }
        
        .loading-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid #e5e7eb;
          border-top: 2px solid #7c3aed;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .close-window {
          margin-top: 1rem;
          text-align: center;
        }
        
        .close-button {
          background: #ef4444;
          color: white;
          border: none;
          padding: 0.75rem 2rem;
          border-radius: 0.5rem;
          font-weight: 500;
          cursor: pointer;
        }
        
        .close-button:hover {
          background: #dc2626;
        }
        
        .welcome-message {
          text-align: center;
          color: #6b7280;
          padding: 2rem;
          font-style: italic;
        }
        
        /* Cropper.js のハンドルサイズを大きく調整 - メイン画面と同じサイズに */
        .cropper-point {
          width: 12px !important;
          height: 12px !important;
          background-color: #7c3aed !important;
          border-radius: 50% !important;
          opacity: 0.9 !important;
        }
        
        .cropper-point:hover {
          background-color: #5b21b6 !important;
          opacity: 1 !important;
        }
        
        /* 角の四角ハンドル */
        .cropper-point.point-nw,
        .cropper-point.point-ne,
        .cropper-point.point-sw,
        .cropper-point.point-se {
          width: 14px !important;
          height: 14px !important;
          border-radius: 3px !important;
        }
        
        /* 辺の中央ハンドル */
        .cropper-point.point-n,
        .cropper-point.point-s,
        .cropper-point.point-e,
        .cropper-point.point-w {
          width: 12px !important;
          height: 12px !important;
          border-radius: 50% !important;
        }
        
        /* クロップボックスのボーダーも見やすく */
        .cropper-crop-box {
          border: 2px solid #7c3aed !important;
        }
        
        .cropper-view-box {
          outline: 1px solid rgba(124, 58, 237, 0.75) !important;
        }
        
        /* 音声入力のパルスアニメーション */
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
        </style>
    </head>
    <body>
        <div class="chat-container">
            <div class="chat-header">
                <h1 style="margin: 0; font-size: 1.5rem;">
                    <i class="fas fa-robot" style="margin-right: 0.5rem;"></i>
                    AI学習サポート
                </h1>
                <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">何でもお聞きください！一緒に学習を進めましょう 📚</p>
            </div>
            
            <div class="chat-messages" id="chatMessages">
                <div class="welcome-message">
                    <i class="fas fa-graduation-cap" style="font-size: 2rem; color: #7c3aed; margin-bottom: 1rem; display: block;"></i>
                    こんにちは！学習でわからないことがあれば、何でも質問してください。<br>
                    丁寧に説明いたします！
                </div>
            </div>
            
            <div class="chat-input">
                <!-- 統合フローサポートインフォメーション -->
                <div id="imageAttachmentIndicator" style="display: none; background: #f0f9ff; border: 2px solid #0ea5e9; border-radius: 0.5rem; padding: 0.75rem; margin-bottom: 0.75rem; font-size: 1rem; color: #0c4a6e; font-weight: 600;">
                    <i class="fas fa-info-circle" style="margin-right: 0.5rem; color: #0ea5e9;"></i>
                    📝 質問を入力して送信ボタンを押すと、画像と一緒に送信されます
                    <button onclick="clearImage()" style="background: #fee2e2; border: 1px solid #dc2626; color: #dc2626; font-size: 0.9rem; margin-left: 1rem; cursor: pointer; padding: 0.25rem 0.5rem; border-radius: 0.25rem;">
                        <i class="fas fa-times"></i> 削除
                    </button>
                </div>
                
                <!-- 画像アップロード機能 -->
                <div class="image-controls">
                    <button class="image-btn" id="cameraBtn">
                        <i class="fas fa-camera"></i> 📷 写真を撮る
                    </button>
                    <button class="image-btn" id="fileBtn">
                        <i class="fas fa-folder-open"></i> 📁 ファイル選択
                    </button>
                    <button class="image-btn" id="voiceInputBtn">
                        <i class="fas fa-microphone"></i> 🎤 音声入力
                    </button>
                    <button class="image-btn" id="clearImageBtn" style="display: none; background: #fee2e2; color: #dc2626;">
                        <i class="fas fa-times"></i> 画像をクリア
                    </button>
                </div>
                
                <!-- 音声入力ステータス -->
                <div id="voiceInputStatus" style="display: none; background: #fef3c7; border: 2px solid #f59e0b; border-radius: 0.5rem; padding: 0.75rem; margin-bottom: 0.75rem; font-size: 1rem; color: #92400e; font-weight: 600;">
                    <i class="fas fa-microphone-alt" style="margin-right: 0.5rem; color: #f59e0b; animation: pulse 1.5s ease-in-out infinite;"></i>
                    🎤 音声を聞き取っています...
                </div>
                
                <!-- 隠し画像入力 -->
                <input type="file" id="cameraInput" accept="image/*" capture="environment" style="display: none;">
                <input type="file" id="fileInput" accept="image/*" style="display: none;">
                
                <!-- 画像プレビューエリア -->
                <div id="imagePreviewArea" style="display: none;">
                    <img id="previewImage" class="image-preview">
                    <div style="text-align: center; margin-bottom: 1rem;">
                        <button class="image-btn" id="startCropBtn" style="background: #7c3aed; color: white;">
                            <i class="fas fa-crop"></i> 範囲を調整
                        </button>
                        <button class="image-btn" id="confirmImageBtn" style="background: #059669; color: white; font-weight: 600;">
                            <i class="fas fa-paper-plane"></i> ✅ この画像で送信
                        </button>
                    </div>
                </div>
                
                <!-- クロップエリア -->
                <div id="cropArea" style="display: none;">
                    <div class="crop-container">
                        <img id="cropImage" style="max-width: 100%; max-height: 280px;">
                    </div>
                    <div style="text-align: center; margin-bottom: 1rem; color: #6b7280; font-size: 0.95rem;">
                        📝 範囲を調整してください。質問を入力後、下のボタンで送信できます。
                    </div>
                </div>
                
                <!-- テキスト入力欄（1段目） -->
                <div style="margin-bottom: 0.75rem;">
                    <textarea id="questionInput" placeholder="質問を入力してください...（画像のみの場合は空白でもOK）" style="width: 100%; min-height: 80px; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 1rem; resize: vertical;"></textarea>
                </div>
                
                <!-- ボタンエリア（2段目） -->
                <div class="input-row" id="buttonRow">
                    <!-- 通常時：送信ボタンのみ（中央配置） -->
                    <button id="sendButton" style="background: #7c3aed; color: white; font-weight: 600; min-width: 120px; flex: 1;">
                        <i class="fas fa-paper-plane"></i><br><span id="sendButtonText">送信</span>
                    </button>
                    
                    <!-- クロップ時：キャンセルボタンが追加表示 -->
                    <button id="cancelCropBtn" style="display: none; background: #6b7280; color: white; font-weight: 600; min-width: 120px; flex: 1;">
                        <i class="fas fa-times"></i><br>キャンセル
                    </button>
                </div>
            </div>
            
            <div class="close-window">
                <button class="close-button" onclick="window.close()">
                    <i class="fas fa-times"></i> ウインドウを閉じる
                </button>
            </div>
        </div>
        
        <script src="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.js"></script>
        <script>
        window.addEventListener('DOMContentLoaded', function() {
            console.log('🤖 AI Chat: DOM loaded, starting script');
            console.log('🤖 AI Chat: Cropper available:', typeof Cropper !== 'undefined');
            
            (function() {
                console.log('🤖 AI Chat: Script loaded');
                console.log('🤖 AI Chat: Cropper check:', typeof Cropper);
            
            const sessionId = ${JSON.stringify(sessionId)};
            let chatMessages, questionInput, sendButton;
            let cameraBtn, fileBtn, clearImageBtn, cameraInput, fileInput;
            let imagePreviewArea, previewImage, startCropBtn, confirmImageBtn;
            let cropArea, cropImage, cancelCropBtn;
            let cropper = null;
            let currentImageData = null;
            
            function formatErrorMessage(error, fallback = 'エラーが発生しました') {
                if (error instanceof Error) {
                    return error.message || fallback;
                }
                if (typeof error === 'string') {
                    const trimmed = error.trim();
                    return trimmed.length > 0 ? trimmed : fallback;
                }
                try {
                    const serialized = JSON.stringify(error);
                    return serialized === '{}' ? fallback : serialized;
                } catch {
                    return fallback;
                }
            }
            
            // ページ読み込み完了を待つ
            window.addEventListener('load', function() {
                console.log('🤖 AI Chat: Window loaded, starting initialization...');
                initializeAIChat();
            });
            
            // DOMが読み込まれた時点でも試す
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() {
                    console.log('🤖 AI Chat: DOM ready, starting initialization...');
                    initializeAIChat();
                });
            } else {
                console.log('🤖 AI Chat: DOM already ready, starting initialization immediately...');
                initializeAIChat();
            }
            
            function initializeAIChat() {
                try {
                    console.log('🤖 AI Chat: Initializing...');
            
            // 要素を取得
            chatMessages = document.getElementById('chatMessages');
            questionInput = document.getElementById('questionInput');
            sendButton = document.getElementById('sendButton');
            
            // 画像関連の要素
            cameraBtn = document.getElementById('cameraBtn');
            fileBtn = document.getElementById('fileBtn');
            clearImageBtn = document.getElementById('clearImageBtn');
            cameraInput = document.getElementById('cameraInput');
            fileInput = document.getElementById('fileInput');
            imagePreviewArea = document.getElementById('imagePreviewArea');
            previewImage = document.getElementById('previewImage');
            startCropBtn = document.getElementById('startCropBtn');
            confirmImageBtn = document.getElementById('confirmImageBtn');
            cropArea = document.getElementById('cropArea');
            cropImage = document.getElementById('cropImage');
            cancelCropBtn = document.getElementById('cancelCropBtn');
            
            console.log('🤖 AI Chat: Elements loaded', {
                sendButton: !!sendButton,
                cameraBtn: !!cameraBtn,
                fileBtn: !!fileBtn,
                questionInput: !!questionInput
            });
            
            // エンターキーで送信（Shift+Enterで改行）- 日本語入力中は除外
            if (questionInput) {
                questionInput.addEventListener('keydown', function(e) {
                    // 日本語入力中（IME変換中）は送信しない
                    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                        e.preventDefault();
                        sendQuestion();
                    }
                });
            }
            
            if (sendButton) {
                sendButton.addEventListener('click', sendQuestion);
                console.log('✅ Send button listener attached');
            }
            
            // 画像機能のイベントリスナー
            if (cameraBtn) cameraBtn.addEventListener('click', () => cameraInput.click());
            if (fileBtn) fileBtn.addEventListener('click', () => fileInput.click());
            if (clearImageBtn) clearImageBtn.addEventListener('click', clearImage);
            if (cameraInput) cameraInput.addEventListener('change', handleImageSelect);
            if (fileInput) fileInput.addEventListener('change', handleImageSelect);
            if (startCropBtn) startCropBtn.addEventListener('click', startCrop);
            if (confirmImageBtn) confirmImageBtn.addEventListener('click', confirmImage);
            if (cancelCropBtn) cancelCropBtn.addEventListener('click', cancelCrop);
            
            // 音声入力機能の初期化
            initVoiceInput();
            
            console.log('✅ AI Chat: All event listeners attached');
                } catch (error) {
                    console.error('❌ AI Chat initialization error:', error);
                    alert('AIチャットの初期化に失敗しました。ページを再読み込みしてください。');
                }
            }
        });
        
        // 画像選択処理
        function handleImageSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            console.log('🖼️ AI Chat: Image selected', file.name);
            
            const reader = new FileReader();
            reader.onload = function(e) {
                previewImage.src = e.target.result;
                previewImage.onload = function() {
                    console.log('🖼️ AI Chat: Image loaded, showing preview');
                    showImagePreview();
                    
                    // 画像読み込み完了後に自動的にクロップを開始
                    setTimeout(() => {
                        console.log('🖼️ AI Chat: Starting auto crop');
                        startCrop();
                    }, 800);
                };
            };
            reader.readAsDataURL(file);
        }
        
        function showImagePreview() {
            imagePreviewArea.style.display = 'block';
            cropArea.style.display = 'none';
            clearImageBtn.style.display = 'inline-block';
        }
        
        function startCrop() {
            if (!previewImage.src) {
                console.error('❌ AI Chat: No image source for crop');
                return;
            }
            
            console.log('✂️ AI Chat: Starting crop function');
            
            cropImage.src = previewImage.src;
            imagePreviewArea.style.display = 'none';
            cropArea.style.display = 'block';
            
            // クロップモード用のUI更新
            updateUIForCropMode();
            
            if (cropper) {
                cropper.destroy();
            }
            
            // Cropper.jsの初期化を遅延させる
            setTimeout(() => {
                if (window.Cropper && cropImage) {
                    cropper = new window.Cropper(cropImage, {
                        aspectRatio: NaN, // フリーサイズ
                        viewMode: 1,
                        dragMode: 'move', // メイン画面と同じ設定
                        autoCropArea: 0.95, // ほぼ全体を初期選択（メイン画面と同じ）
                        responsive: true,
                        restore: false,
                        guides: true,
                        center: true,
                        highlight: false,
                        cropBoxMovable: true,
                        cropBoxResizable: true,
                        toggleDragModeOnDblclick: false,
                        ready: function() {
                            console.log('✂️ AI Chat Cropper initialized with large crop area');
                        }
                    });
                }
            }, 100);
        }
        
        function cancelCrop() {
            console.log('❌ AI Chat: Canceling crop');
            
            cropArea.style.display = 'none';
            showImagePreview();
            
            // 通常モード用のUI更新
            updateUIForNormalMode();
            
            if (cropper) {
                cropper.destroy();
                cropper = null;
            }
        }
        
        // クロップ確定（画像データを準備、送信は統合送信ボタンで）
        function confirmCrop() {
            console.log('✂️ AI Chat: ConfirmCrop called (UI integrated flow), cropper exists:', !!cropper);
            
            if (!cropper) {
                console.error('❌ AI Chat: No cropper instance available');
                alert('クロップ機能が正しく初期化されていません。再度お試しください。');
                return;
            }
            
            console.log('✂️ AI Chat: Processing crop for integrated UI');
            
            let canvas;
            try {
                canvas = cropper.getCroppedCanvas({
                    maxWidth: 768,
                    maxHeight: 768,
                    imageSmoothingQuality: 'high'
                });
                
                console.log('✂️ AI Chat: Canvas obtained:', !!canvas);
                
                if (!canvas) {
                    console.error('❌ AI Chat: Failed to get cropped canvas');
                    alert('画像の切り取りに失敗しました。再度お試しください。');
                    return;
                }
                
            } catch (error) {
                console.error('❌ AI Chat: Error getting canvas:', error);
                alert('画像の処理中にエラーが発生しました。');
                return;
            }
            
            // 画像データをBase64に変換
            try {
                const croppedImageData = canvas.toDataURL('image/jpeg', 0.95);
                console.log('✂️ AI Chat: Image converted to base64, length:', croppedImageData.length);
                console.log('✂️ AI Chat: Image data starts with:', croppedImageData.substring(0, 50));
                console.log('✂️ AI Chat: Image data format check:', croppedImageData.startsWith('data:image/'));
                
                if (!croppedImageData || croppedImageData.length < 100) {
                    console.error('❌ AI Chat: Image data not properly set');
                    alert('画像データの設定に失敗しました。');
                    return;
                }
                
                if (!croppedImageData.startsWith('data:image/')) {
                    console.error('❌ AI Chat: Invalid image data format');
                    alert('画像データの形式が正しくありません。');
                    return;
                }
                
                // Base64部分のチェック
                const parts = croppedImageData.split(',');
                if (parts.length === 2) {
                    const base64Part = parts[1];
                    console.log('✂️ AI Chat: Base64 part length:', base64Part.length);
                    console.log('✂️ AI Chat: Base64 valid chars test:', /^[A-Za-z0-9+/=]*$/.test(base64Part));
                    
                    if (!/^[A-Za-z0-9+/=]*$/.test(base64Part)) {
                        console.error('❌ AI Chat: Invalid base64 characters');
                        alert('画像データに不正な文字が含まれています。');
                        return;
                    }
                } else {
                    console.error('❌ AI Chat: Invalid data URL format');
                    alert('画像データの形式が正しくありません。');
                    return;
                }
                
                // グローバル変数に設定
                currentImageData = croppedImageData;
                
            } catch (error) {
                console.error('❌ AI Chat: Error converting to base64:', error);
                alert('画像の変換中にエラーが発生しました。');
                return;
            }
            
            // UIを更新（クロップエリアを隠す）
            console.log('✂️ AI Chat: Updating UI for integrated flow');
            cropArea.style.display = 'none';
            imagePreviewArea.style.display = 'none';
            clearImageBtn.style.display = 'inline-block';
            
            // cropperを破棄
            if (cropper) {
                cropper.destroy();
                cropper = null;
                console.log('✂️ AI Chat: Cropper destroyed');
            }
            
            // 画像モード用のUI更新（この画像で送信、キャンセルボタン非表示）
            updateSendButtonForImageMode();
            
            // 画像添付インジケーターを表示
            const indicator = document.getElementById('imageAttachmentIndicator');
            if (indicator) {
                indicator.style.display = 'block';
            }
            
            console.log('✂️ AI Chat: Crop completed, ready for integrated send');
        }
        
        // 画像確定（クロップなし、画像データを準備）
        function confirmImage() {
            console.log('🖼️ AI Chat: Confirm image called (UI integrated flow)');
            
            if (previewImage.src && !currentImageData) {
                // クロップしていない場合は元画像を使用
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const img = new Image();
                
                img.onload = function() {
                    // 768px以下にリサイズ（文字認識のため品質重視）
                    const maxSize = 768;
                    let { width, height } = img;
                    
                    if (width > maxSize || height > maxSize) {
                        if (width > height) {
                            height = (height * maxSize) / width;
                            width = maxSize;
                        } else {
                            width = (width * maxSize) / height;
                            height = maxSize;
                        }
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    const imageData = canvas.toDataURL('image/jpeg', 0.95);
                    
                    console.log('🖼️ AI Chat: Image processed, length:', imageData.length);
                    console.log('🖼️ AI Chat: Image data starts with:', imageData.substring(0, 50));
                    console.log('🖼️ AI Chat: Image data format check:', imageData.startsWith('data:image/'));
                    
                    // 画像データの検証
                    if (!imageData.startsWith('data:image/')) {
                        console.error('❌ AI Chat: Invalid image data format in confirmImage');
                        alert('画像データの形式が正しくありません。');
                        return;
                    }
                    
                    const parts = imageData.split(',');
                    if (parts.length === 2) {
                        const base64Part = parts[1];
                        console.log('🖼️ AI Chat: Base64 part length:', base64Part.length);
                        if (!/^[A-Za-z0-9+/=]*$/.test(base64Part)) {
                            console.error('❌ AI Chat: Invalid base64 characters in confirmImage');
                            alert('画像データに不正な文字が含まれています。');
                            return;
                        }
                    } else {
                        console.error('❌ AI Chat: Invalid data URL format in confirmImage');
                        alert('画像データの形式が正しくありません。');
                        return;
                    }
                    
                    currentImageData = imageData;
                    console.log('🖼️ AI Chat: Image processed and validated, ready for integrated UI');
                    
                    // UI更新
                    imagePreviewArea.style.display = 'none';
                    clearImageBtn.style.display = 'inline-block';
                    
                    // 送信ボタンのテキストを変更
                    updateSendButtonForImageMode();
                    
                    // 画像添付インジケーターを表示
                    const indicator = document.getElementById('imageAttachmentIndicator');
                    if (indicator) {
                        indicator.style.display = 'block';
                    }
                    
                    console.log('🖼️ AI Chat: Image confirmed, ready for integrated send');
                };
                
                img.src = previewImage.src;
            } else {
                // 既に画像データがある場合
                console.log('🖼️ AI Chat: Using existing image data');
                
                // UI更新
                imagePreviewArea.style.display = 'none';
                clearImageBtn.style.display = 'inline-block';
                
                // 送信ボタンのテキストを変更
                updateSendButtonForImageMode();
                
                // 画像添付インジケーターを表示
                const indicator = document.getElementById('imageAttachmentIndicator');
                if (indicator) {
                    indicator.style.display = 'block';
                }
                
                console.log('🖼️ AI Chat: Image confirmed, ready for integrated send');
            }
        }
        
        function clearImage() {
            console.log('🗑️ AI Chat: clearImage() called, currentImageData before clear:', !!currentImageData);
            currentImageData = null;
            imagePreviewArea.style.display = 'none';
            cropArea.style.display = 'none';
            clearImageBtn.style.display = 'none';
            
            // 画像添付インジケーターを非表示
            const indicator = document.getElementById('imageAttachmentIndicator');
            if (indicator) {
                indicator.style.display = 'none';
            }
            
            if (cropper) {
                cropper.destroy();
                cropper = null;
            }
            
            // 送信ボタンをテキストモードに戻す
            updateSendButtonForTextMode();
            
            // 入力要素をリセット
            cameraInput.value = '';
            fileInput.value = '';
            
            console.log('🗑️ AI Chat: Image cleared and indicator hidden, currentImageData after clear:', currentImageData);
        }
        
        // クロップモード時のUI更新
        function updateUIForCropMode() {
            const sendButtonText = document.getElementById('sendButtonText');
            const cancelButton = document.getElementById('cancelCropBtn');
            
            if (sendButtonText) {
                sendButtonText.textContent = 'この範囲で送信';
            }
            if (cancelButton) {
                cancelButton.style.display = 'inline-block';
            }
            
            console.log('✂️ AI Chat: UI updated for crop mode - send button: "この範囲で送信", cancel button: visible');
        }
        
        // 送信ボタンのテキストを画像モード用に更新
        function updateSendButtonForImageMode() {
            const sendButtonText = document.getElementById('sendButtonText');
            const cancelButton = document.getElementById('cancelCropBtn');
            
            if (sendButtonText) {
                sendButtonText.textContent = 'この画像で送信';
            }
            if (cancelButton) {
                cancelButton.style.display = 'none';
            }
            
            console.log('🖼️ AI Chat: UI updated for image mode - send button: "この画像で送信", cancel button: hidden');
        }
        
        // 送信ボタンのテキストをテキストモード用に更新
        function updateSendButtonForTextMode() {
            const sendButtonText = document.getElementById('sendButtonText');
            const cancelButton = document.getElementById('cancelCropBtn');
            
            if (sendButtonText) {
                sendButtonText.textContent = '送信';
            }
            if (cancelButton) {
                cancelButton.style.display = 'none';
            }
            
            console.log('📝 AI Chat: UI updated for text mode - send button: "送信", cancel button: hidden');
        }
        
        // 通常モード時のUI更新
        function updateUIForNormalMode() {
            updateSendButtonForTextMode();
            console.log('🔄 AI Chat: UI updated for normal mode');
        }

        // 統合送信関数：画像とメッセージを同時に送信
        async function sendQuestionIntegrated(question, imageData) {
            console.log('📤 AI Chat: ===== INTEGRATED SEND CALLED =====');
            console.log('📤 Question text:', question || '(empty)');
            console.log('📤 Has image data:', !!imageData);
            console.log('📤 Image data length:', imageData ? imageData.length : 0);
            
            if (imageData) {
                console.log('📤 Image data starts with:', imageData.substring(0, 50));
                console.log('📤 Image data format valid:', imageData.startsWith('data:image/'));
                
                // 送信前の最終検証
                if (!imageData.startsWith('data:image/')) {
                    console.error('❌ AI Chat: Invalid image format at send time');
                    alert('画像データの形式が正しくありません。再度お試しください。');
                    return;
                }
                
                const parts = imageData.split(',');
                if (parts.length !== 2) {
                    console.error('❌ AI Chat: Invalid data URL structure at send time');
                    alert('画像データの構造が正しくありません。再度お試しください。');
                    return;
                }
                
                const base64Part = parts[1];
                if (!base64Part || !/^[A-Za-z0-9+/=]*$/.test(base64Part)) {
                    console.error('❌ AI Chat: Invalid base64 data at send time');
                    alert('画像データが破損しています。再度お試しください。');
                    return;
                }
                
                console.log('✅ AI Chat: Image data validation passed at send time');
            }
            
            if (!question && !imageData) {
                console.error('❌ AI Chat: Both question and image are empty');
                alert('質問を入力するか、画像を選択してください');
                return;
            }
            
            console.log('📤 AI Chat: Validation passed, proceeding with integrated request');
            
            // ユーザーメッセージを表示
            let displayMessage = question || '📷 画像について質問';
            if (imageData && question) {
                displayMessage = '📷 ' + question;
            }
            addMessage(displayMessage, 'user');
            
            // 画像がある場合は画像も表示
            if (imageData) {
                addImageMessage(imageData, 'user');
            }
            
            // 入力欄をクリア
            questionInput.value = '';
            
            // 送信ボタンを無効化
            sendButton.disabled = true;
            
            // AI思考中メッセージを表示
            const thinkingMessage = addMessage('', 'ai', true);
            
            try {
                console.log('📤 AI Chat: Sending integrated request to server:');
                console.log('  - sessionId:', sessionId);
                console.log('  - question:', question || '(empty)');
                console.log('  - imageData exists:', !!imageData);
                if (imageData) {
                    console.log('  - imageData length:', imageData.length);
                    console.log('  - imageData preview:', imageData.substring(0, 50) + '...');
                }
                
                const response = await fetch('/api/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        question: question,
                        image: imageData
                    })
                });
                
                const result = await response.json();
                
                // 思考中メッセージを削除
                thinkingMessage.remove();
                
                if (result.ok) {
                    addMessage(result.answer, 'ai');
                } else {
                    addMessage('申し訳ございません。エラーが発生しました: ' + result.message, 'ai');
                }
                
            } catch (error) {
                console.error('AI Chat integrated error:', error);
                thinkingMessage.remove();
                addMessage('申し訳ございません。通信エラーが発生しました。', 'ai');
            }
            
            // 送信ボタンを有効化
            sendButton.disabled = false;
            questionInput.focus();
        }

        // メイン送信関数（統合フローサポート）
        async function sendQuestion() {
            console.log('📤 AI Chat: ===== SEND QUESTION CALLED =====');
            
            // クロップモード中の場合は、まずクロップを確定してから送信
            if (cropper && cropArea.style.display !== 'none') {
                console.log('✂️ AI Chat: In crop mode, executing confirmCrop first');
                confirmCrop();
                
                // クロップ確定後、少し待ってから送信処理を実行
                setTimeout(() => {
                    console.log('✂️ AI Chat: Auto-executing send after crop confirmation');
                    sendQuestion();
                }, 100);
                return;
            }
            
            const question = questionInput.value.trim();
            console.log('📤 Question text:', question || '(empty)');
            console.log('📤 currentImageData exists:', !!currentImageData);
            
            // 画像データがある場合は統合送信を使用
            if (currentImageData) {
                console.log('📤 AI Chat: Using integrated flow (image + text)');
                const imageData = currentImageData;
                clearImage(); // UI クリア
                sendQuestionIntegrated(question, imageData);
                return;
            }
            
            // テキストのみの場合は従来の処理
            console.log('📤 AI Chat: Using text-only flow');
            
            if (!question) {
                console.error('❌ AI Chat: No question provided');
                alert('質問を入力してください');
                return;
            }
            
            console.log('📤 AI Chat: Validation passed, proceeding with text-only request');
            
            // ユーザーメッセージを表示
            addMessage(question, 'user');
            
            // 入力欄をクリア
            questionInput.value = '';
            
            // 送信ボタンを無効化
            sendButton.disabled = true;
            
            // AI思考中メッセージを表示
            const thinkingMessage = addMessage('', 'ai', true);
            
            try {
                console.log('📤 AI Chat: Sending text-only request to server:');
                console.log('  - sessionId:', sessionId);
                console.log('  - question:', question);
                
                const response = await fetch('/api/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        question: question,
                        image: null
                    })
                });
                
                const result = await response.json();
                
                // 思考中メッセージを削除
                thinkingMessage.remove();
                
                if (result.ok) {
                    addMessage(result.answer, 'ai');
                } else {
                    addMessage('申し訳ございません。エラーが発生しました: ' + result.message, 'ai');
                }
                
            } catch (error) {
                console.error('AI Chat text-only error:', error);
                thinkingMessage.remove();
                addMessage('申し訳ございません。通信エラーが発生しました。', 'ai');
            }
            
            // 送信ボタンを有効化
            sendButton.disabled = false;
            questionInput.focus();
        }
        function addMessage(text, sender, isLoading = false) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + (sender === 'user' ? 'user-message' : 'ai-message');
            
            if (isLoading) {
                messageDiv.innerHTML = '<div class="loading"><div class="loading-spinner"></div>考えています...</div>';
            } else {
                messageDiv.textContent = text;
                
                // AIメッセージの場合の処理
                if (sender === 'ai') {
                    // テキストをHTMLに変換（改行を<br>に）
                    messageDiv.innerHTML = text.replace(new RegExp('\\n', 'g'), '<br>');
                    
                    // MathJaxでレンダリング
                    if (window.MathJax) {
                        window.MathJax.typesetPromise([messageDiv]).catch((err) => {
                            console.error('MathJax rendering error:', err);
                        });
                    }
                    
                    // 音声読み上げボタンを追加
                    if (text && 'speechSynthesis' in window) {
                        const speakBtn = document.createElement('button');
                        speakBtn.innerHTML = '<i class="fas fa-volume-up"></i> 読み上げ';
                        speakBtn.style.cssText = 'margin-top: 0.5rem; padding: 0.375rem 0.75rem; background: #7c3aed; color: white; border: none; border-radius: 0.375rem; cursor: pointer; font-size: 0.875rem; display: inline-flex; align-items: center; gap: 0.375rem;';
                        speakBtn.onclick = () => speakText(text);
                        messageDiv.appendChild(speakBtn);
                    }
                }
            }
            
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            return messageDiv;
        }
        
        function addImageMessage(imageSrc, sender) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + (sender === 'user' ? 'user-message' : 'ai-message');
            
            const img = document.createElement('img');
            img.src = imageSrc;
            img.style.maxWidth = '200px';
            img.style.maxHeight = '150px';
            img.style.borderRadius = '0.5rem';
            img.style.cursor = 'pointer';
            img.onclick = () => {
                // 画像クリックで拡大表示
                const newWindow = window.open('', '_blank', 'width=800,height=600');
                newWindow.document.write('<html><head><title>画像拡大表示</title></head><body style="margin:0; display:flex; justify-content:center; align-items:center; background:#000;"><img src="' + imageSrc + '" style="max-width:100%; max-height:100%; object-fit:contain;"></body></html>');
            };
            
            messageDiv.appendChild(img);
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            return messageDiv;
        }
        
        // 音声入力機能
        let recognition = null;
        let isVoiceInputActive = false;
        
        function initVoiceInput() {
            const voiceInputBtn = document.getElementById('voiceInputBtn');
            if (!voiceInputBtn) {
                console.warn('⚠️ Voice input button not found');
                return;
            }
            
            // Web Speech API (音声認識) の初期化
            if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                recognition = new SpeechRecognition();
                recognition.lang = 'ja-JP';
                recognition.continuous = false;
                recognition.interimResults = true;
                
                recognition.onstart = () => {
                    console.log('🎤 音声認識開始');
                    isVoiceInputActive = true;
                    const statusEl = document.getElementById('voiceInputStatus');
                    if (statusEl) statusEl.style.display = 'block';
                    voiceInputBtn.style.background = '#f59e0b';
                    voiceInputBtn.style.color = 'white';
                };
                
                recognition.onresult = (event) => {
                    let interimTranscript = '';
                    let finalTranscript = '';
                    
                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        const transcript = event.results[i][0].transcript;
                        if (event.results[i].isFinal) {
                            finalTranscript += transcript;
                        } else {
                            interimTranscript += transcript;
                        }
                    }
                    
                    if (finalTranscript && questionInput) {
                        console.log('🎤 音声認識結果（確定）:', finalTranscript);
                        questionInput.value = finalTranscript;
                    }
                };
                
                recognition.onerror = (event) => {
                    console.error('🎤 音声認識エラー:', event.error);
                    isVoiceInputActive = false;
                    const statusEl = document.getElementById('voiceInputStatus');
                    if (statusEl) statusEl.style.display = 'none';
                    voiceInputBtn.style.background = '';
                    voiceInputBtn.style.color = '';
                    
                    if (event.error !== 'no-speech') {
                        alert('音声認識エラーが発生しました: ' + event.error);
                    }
                };
                
                recognition.onend = () => {
                    console.log('🎤 音声認識終了');
                    isVoiceInputActive = false;
                    const statusEl = document.getElementById('voiceInputStatus');
                    if (statusEl) statusEl.style.display = 'none';
                    voiceInputBtn.style.background = '';
                    voiceInputBtn.style.color = '';
                };
                
                // 音声入力ボタンのイベント
                voiceInputBtn.addEventListener('click', () => {
                    if (!recognition) {
                        alert('お使いのブラウザは音声入力に対応していません。Chrome、Edge、Safariをお使いください。');
                        return;
                    }
                    
                    if (isVoiceInputActive) {
                        recognition.stop();
                    } else {
                        recognition.start();
                    }
                });
                
                console.log('✅ Voice input initialized');
            } else {
                console.warn('⚠️ Speech recognition not supported');
            }
        }
        
        // 音声読み上げ機能（AI の回答を読み上げ）
        function speakText(text) {
            if ('speechSynthesis' in window) {
                // 既存の読み上げを停止
                window.speechSynthesis.cancel();
                
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'ja-JP';
                utterance.rate = 1.0;
                utterance.pitch = 1.0;
                utterance.volume = 1.0;
                
                window.speechSynthesis.speak(utterance);
                console.log('🔊 音声読み上げ開始');
            }
        }
        

        
        // 初期フォーカス
        questionInput.focus();
        
            })(); // End of IIFE
        }); // End of DOMContentLoaded
        </script>
    </body>
    </html>
  `)
})

// ==========================================

// ==========================================
// 新しいシンプル版AIチャット (v2)
// ==========================================
router.get('/ai-chat-v2/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')
  console.log('🤖 AI Chat V2: Simple version requested for session:', sessionId)
  
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI学習サポート - KOBEYA</title>
    <!-- KaTeX for math rendering -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
    <!-- Cropper.js for image cropping -->
    <link rel="stylesheet" href="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.css">
    <script src="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.js"></script>
    <!-- Font Awesome for icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600&display=swap" rel="stylesheet">
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
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
        }
        
        .chat-container {
            width: 100%;
            max-width: 800px;
            height: 90vh;
            background: white;
            border-radius: 1rem;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .chat-header {
            background: linear-gradient(135deg, #7c3aed, #8b5cf6);
            color: white;
            padding: 1.5rem;
            text-align: center;
        }
        
        .chat-header h1 {
            font-size: 1.5rem;
            font-weight: 600;
        }
        
        .chat-messages {
            flex: 1;
            padding: 1.5rem;
            overflow-y: auto;
            background: #f8fafc;
        }
        
        .message {
            margin-bottom: 1rem;
            padding: 1rem;
            border-radius: 1rem;
            max-width: 80%;
            line-height: 1.6;
            animation: slideIn 0.3s ease;
        }
        
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .message.user {
            background: #e0e7ff;
            margin-left: auto;
            text-align: right;
        }
        
        .message.ai {
            background: white;
            border: 1px solid #e5e7eb;
        }
        
        .message.loading {
            background: white;
            border: 1px solid #e5e7eb;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .loading-dots {
            display: flex;
            gap: 4px;
        }
        
        .loading-dots span {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #7c3aed;
            animation: bounce 1.4s infinite ease-in-out both;
        }
        
        .loading-dots span:nth-child(1) {
            animation-delay: -0.32s;
        }
        
        .loading-dots span:nth-child(2) {
            animation-delay: -0.16s;
        }
        
        @keyframes bounce {
            0%, 80%, 100% {
                transform: scale(0);
            }
            40% {
                transform: scale(1);
            }
        }
        
        .chat-input-area {
            padding: 1rem;
            background: white;
            border-top: 1px solid #e5e7eb;
        }
        
        .input-group {
            display: flex;
            gap: 0.5rem;
        }
        
        #messageInput {
            flex: 1;
            padding: 0.75rem 1rem;
            border: 1px solid #e5e7eb;
            border-radius: 0.5rem;
            font-size: 1rem;
            font-family: inherit;
            resize: none;
            min-height: 44px;
            max-height: 120px;
        }
        
        #messageInput:focus {
            outline: none;
            border-color: #7c3aed;
            box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
        }
        
        #sendButton {
            padding: 0.75rem 1.5rem;
            background: #7c3aed;
            color: white;
            border: none;
            border-radius: 0.5rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        #sendButton:hover {
            background: #6d28d9;
            transform: translateY(-1px);
        }
        
        #sendButton:active {
            transform: translateY(0);
        }
        
        #sendButton:disabled {
            background: #d1d5db;
            cursor: not-allowed;
            transform: none;
        }
        
        .error-message {
            background: #fee2e2;
            color: #dc2626;
            padding: 1rem;
            border-radius: 0.5rem;
            margin-bottom: 1rem;
        }
        
        /* Camera & Image Styles */
        .camera-buttons {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 0.5rem;
        }
        
        .camera-buttons button {
            flex: 1;
            padding: 0.75rem;
            background: #374151;
            font-size: 0.9rem;
        }
        
        .camera-buttons button:hover:not(:disabled) {
            background: #1f2937;
        }
        
        .image-preview-area, .crop-area {
            background: white;
            border: 2px solid #e5e7eb;
            border-radius: 0.75rem;
            margin-bottom: 1rem;
            overflow: hidden;
            display: none;
        }
        
        .image-preview-area.active, .crop-area.active {
            display: block;
        }
        
        .preview-header, .crop-header {
            background: #f3f4f6;
            padding: 0.75rem 1rem;
            border-bottom: 2px solid #e5e7eb;
            font-weight: 600;
            font-size: 0.9rem;
        }
        
        .preview-content, .crop-content {
            padding: 1rem;
            text-align: center;
        }
        
        .preview-image, .crop-image {
            max-width: 100%;
            max-height: 300px;
            border-radius: 0.5rem;
        }
        
        .preview-actions, .crop-actions {
            padding: 1rem;
            border-top: 1px solid #e5e7eb;
            display: flex;
            gap: 0.5rem;
        }
        
        .preview-actions button, .crop-actions button {
            flex: 1;
            padding: 0.75rem;
            font-size: 0.9rem;
        }
        
        .btn-secondary {
            background: #6b7280 !important;
        }
        
        .btn-secondary:hover:not(:disabled) {
            background: #4b5563 !important;
        }
        
        .btn-success {
            background: #10b981 !important;
        }
        
        .btn-success:hover:not(:disabled) {
            background: #059669 !important;
        }
        
        input[type="file"] {
            display: none;
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <h1>🤖 AI学習サポート</h1>
            <p style="font-size: 0.9rem; margin-top: 0.5rem; opacity: 0.9;">何でもお聞きください！</p>
        </div>
        
        <div class="chat-messages" id="chatMessages">
            <div class="message ai">
                こんにちは！学習でわからないことがあれば、何でも質問してください。丁寧に説明いたします！
            </div>
        </div>
        
        <!-- Image Preview Area -->
        <div class="image-preview-area" id="imagePreviewArea">
            <div class="preview-header">📸 選択された画像</div>
            <div class="preview-content">
                <img id="previewImage" class="preview-image" alt="Preview">
            </div>
            <div class="preview-actions">
                <button id="btnClearImage" class="btn-secondary">
                    <i class="fas fa-times"></i> キャンセル
                </button>
                <button id="btnStartCrop" class="btn-success">
                    <i class="fas fa-crop"></i> 範囲を調整
                </button>
                <button id="btnSendDirect" class="btn-success">
                    <i class="fas fa-paper-plane"></i> そのまま送信
                </button>
            </div>
        </div>
        
        <!-- Crop Area -->
        <div class="crop-area" id="cropArea">
            <div class="crop-header">✂️ 範囲を選択してください</div>
            <div class="crop-content">
                <img id="cropImage" class="crop-image" alt="Crop">
            </div>
            <div class="crop-actions">
                <button id="btnCancelCrop" class="btn-secondary">
                    <i class="fas fa-arrow-left"></i> 戻る
                </button>
                <button id="btnConfirmCrop" class="btn-success">
                    <i class="fas fa-check"></i> この範囲で送信
                </button>
            </div>
        </div>
        
        <div class="chat-input-area">
            <!-- Camera Buttons -->
            <div class="camera-buttons">
                <button id="cameraButton">
                    <i class="fas fa-camera"></i> カメラ
                </button>
                <button id="fileButton">
                    <i class="fas fa-folder-open"></i> ファイル
                </button>
            </div>
            <input type="file" id="cameraInput" accept="image/*" capture="environment">
            <input type="file" id="fileInput" accept="image/*">
            
            <div class="input-group">
                <textarea 
                    id="messageInput" 
                    placeholder="質問を入力してください..."
                    rows="1"
                ></textarea>
                <button id="sendButton">送信</button>
            </div>
        </div>
    </div>
    
    <script>
        console.log('🚀 AI Chat V2 script starting...');
        
        // セッションID（サーバーから注入）
        const SESSION_ID = ${JSON.stringify(sessionId)};
        console.log('📍 Session ID:', SESSION_ID);
        
        // DOM要素
        const chatMessages = document.getElementById('chatMessages');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        
        console.log('📝 Basic elements:', {
            chatMessages: !!chatMessages,
            messageInput: !!messageInput,
            sendButton: !!sendButton
        });
        
        // Camera elements
        const cameraButton = document.getElementById('cameraButton');
        const fileButton = document.getElementById('fileButton');
        const cameraInput = document.getElementById('cameraInput');
        const fileInput = document.getElementById('fileInput');
        const imagePreviewArea = document.getElementById('imagePreviewArea');
        const previewImage = document.getElementById('previewImage');
        const btnClearImage = document.getElementById('btnClearImage');
        const btnStartCrop = document.getElementById('btnStartCrop');
        const btnSendDirect = document.getElementById('btnSendDirect');
        const cropArea = document.getElementById('cropArea');
        
        console.log('📷 Camera elements:', {
            cameraButton: !!cameraButton,
            fileButton: !!fileButton,
            cameraInput: !!cameraInput,
            fileInput: !!fileInput
        });
        const cropImage = document.getElementById('cropImage');
        const btnCancelCrop = document.getElementById('btnCancelCrop');
        const btnConfirmCrop = document.getElementById('btnConfirmCrop');
        
        let cropper = null;
        let currentImageData = null;
        
        // KaTeX delimiters (simplified - only $ and $$ to avoid escaping issues)
        const mathDelimiters = [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false}
        ];
        
        // 初期化ログ
        console.log('✅ AI Chat V2 initialized');
        console.log('📍 Session ID:', SESSION_ID);
        console.log('📷 Camera button element:', cameraButton);
        console.log('📁 File button element:', fileButton);
        console.log('📸 Camera input element:', cameraInput);
        console.log('🗂️ File input element:', fileInput);
        
        // メッセージ追加関数（改行とKaTeX対応）
        function addMessage(text, type = 'user') {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + type;
            
            // AIメッセージの場合、数学記号を自動変換
            let processedText = text;
            if (type === 'ai') {
                // 「角 ABC」→「∠ABC」
                processedText = processedText.replace(/角\s*([A-Z]{2,4})/g, '∠$1');
                // 「三角形 ABC」→「△ABC」
                processedText = processedText.replace(/三角形\s*([A-Z]{3,4})/g, '△$1');
                // 「線分 AB」→「AB」（シンプルに）
                processedText = processedText.replace(/線分\s*([A-Z]{2})/g, '$1');
                // 「辺 AB」→「AB」（シンプルに）
                processedText = processedText.replace(/辺\s*([A-Z]{2})/g, '$1');
            }
            
            // 改行を<br>タグに変換（Viteビルド対応）
            const newlineChar = String.fromCharCode(10);
            const regex = new RegExp(newlineChar, 'g');
            const formattedText = processedText.replace(regex, '<br>');
            messageDiv.innerHTML = formattedText;
            
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            // AIメッセージの場合、KaTeXで数式をレンダリング
            if (type === 'ai' && typeof renderMathInElement !== 'undefined') {
                setTimeout(() => {
                    renderMathInElement(messageDiv, {
                        delimiters: mathDelimiters,
                        throwOnError: false
                    });
                }, 100);
            }
            
            return messageDiv;
        }
        
        // ローディング表示
        function showLoading() {
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'message loading';
            loadingDiv.innerHTML = '<span>考えています</span><div class="loading-dots"><span></span><span></span><span></span></div>';
            chatMessages.appendChild(loadingDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return loadingDiv;
        }
        
        // エラー表示
        function showError(message) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = '❌ ' + message;
            chatMessages.appendChild(errorDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        // メッセージ送信
        async function sendMessage() {
            const message = messageInput.value.trim();
            
            if (!message) {
                return;
            }
            
            console.log('📤 Sending message:', message);
            
            // ユーザーメッセージ表示
            addMessage(message, 'user');
            messageInput.value = '';
            messageInput.style.height = 'auto';
            
            // 送信ボタン無効化
            sendButton.disabled = true;
            
            // ローディング表示
            const loadingDiv = showLoading();
            
            try {
                // API呼び出し
                const response = await fetch('/api/ai-chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: SESSION_ID,
                        question: message
                    })
                });
                
                const data = await response.json();
                
                // ローディング削除
                loadingDiv.remove();
                
                if (data.ok && data.answer) {
                    console.log('✅ Response received');
                    addMessage(data.answer, 'ai');
                } else {
                    console.error('❌ API error:', data.message);
                    showError(data.message || 'エラーが発生しました');
                }
            } catch (error) {
                console.error('❌ Network error:', error);
                loadingDiv.remove();
                showError('通信エラーが発生しました。もう一度お試しください。');
            } finally {
                sendButton.disabled = false;
                messageInput.focus();
            }
        }
        
        // イベントリスナー
        console.log('🔗 Setting up event listeners...');
        
        if (sendButton) {
            sendButton.addEventListener('click', () => {
                console.log('🖱️ Send button clicked');
                sendMessage();
            });
            console.log('✅ Send button listener attached');
        } else {
            console.error('❌ Send button not found!');
        }
        
        if (messageInput) {
            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    console.log('⌨️ Enter key pressed');
                    sendMessage();
                }
            });
            console.log('✅ Message input listener attached');
        } else {
            console.error('❌ Message input not found!');
        }
        
        // テキストエリア自動リサイズ
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
        
        // 初期フォーカス
        messageInput.focus();
        
        console.log('✅ Event listeners attached');
        
        // 初期メッセージの数式もレンダリング
        setTimeout(() => {
            if (typeof renderMathInElement !== 'undefined') {
                renderMathInElement(document.body, {
                    delimiters: mathDelimiters,
                    throwOnError: false
                });
            }
        }, 500);
        
        // ========== Camera & Image Functions ==========
        
        console.log('🔧 Setting up camera event listeners...');
        
        // Camera button click - Trigger camera input
        if (cameraButton) {
            console.log('✅ Camera button found, adding event listener');
            cameraButton.addEventListener('click', () => {
                console.log('📷 Camera button clicked - triggering camera input');
                if (cameraInput) {
                    console.log('📸 Triggering camera input element');
                    cameraInput.click();
                } else {
                    console.error('❌ Camera input not found');
                }
            });
        } else {
            console.error('❌ Camera button not found in DOM');
        }
        
        // File button click
        if (fileButton) {
            console.log('✅ File button found, adding event listener');
            fileButton.addEventListener('click', () => {
                console.log('📁 File button clicked');
                if (fileInput) {
                    console.log('🗂️ Triggering file input');
                    fileInput.click();
                } else {
                    console.error('❌ File input not found');
                }
            });
        } else {
            console.error('❌ File button not found in DOM');
        }
        
        // Handle image selection
        function handleImageSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            console.log('📸 Image selected:', file.name);
            
            const reader = new FileReader();
            reader.onload = (e) => {
                currentImageData = e.target.result;
                previewImage.src = currentImageData;
                imagePreviewArea.classList.add('active');
                cropArea.classList.remove('active');
            };
            reader.readAsDataURL(file);
        }
        
        if (cameraInput) cameraInput.addEventListener('change', handleImageSelect);
        if (fileInput) fileInput.addEventListener('change', handleImageSelect);
        
        // Clear image
        if (btnClearImage) {
            btnClearImage.addEventListener('click', () => {
                console.log('❌ Clear image');
                imagePreviewArea.classList.remove('active');
                cropArea.classList.remove('active');
                currentImageData = null;
                if (cropper) {
                    cropper.destroy();
                    cropper = null;
                }
                cameraInput.value = '';
                fileInput.value = '';
            });
        }
        
        // Start crop
        if (btnStartCrop) {
            btnStartCrop.addEventListener('click', () => {
                console.log('✂️ Start crop');
                cropImage.src = currentImageData;
                imagePreviewArea.classList.remove('active');
                cropArea.classList.add('active');
                
                setTimeout(() => {
                    if (cropper) cropper.destroy();
                    
                    cropper = new Cropper(cropImage, {
                        aspectRatio: NaN,
                        viewMode: 1,
                        dragMode: 'move',
                        autoCropArea: 0.9,
                        restore: false,
                        guides: true,
                        center: true,
                        highlight: false,
                        cropBoxMovable: true,
                        cropBoxResizable: true,
                        toggleDragModeOnDblclick: false
                    });
                }, 100);
            });
        }
        
        // Cancel crop
        if (btnCancelCrop) {
            btnCancelCrop.addEventListener('click', () => {
                console.log('⬅️ Cancel crop');
                if (cropper) {
                    cropper.destroy();
                    cropper = null;
                }
                cropArea.classList.remove('active');
                imagePreviewArea.classList.add('active');
            });
        }
        
        // Confirm crop
        if (btnConfirmCrop) {
            btnConfirmCrop.addEventListener('click', () => {
                console.log('✅ Confirm crop');
                
                if (cropper) {
                    const canvas = cropper.getCroppedCanvas({
                        maxWidth: 2000,
                        maxHeight: 2000,
                        fillColor: '#fff',
                        imageSmoothingEnabled: true,
                        imageSmoothingQuality: 'high'
                    });
                    
                    currentImageData = canvas.toDataURL('image/jpeg', 0.8);
                    cropper.destroy();
                    cropper = null;
                }
                
                sendImageMessage(currentImageData);
            });
        }
        
        // Send direct (no crop)
        if (btnSendDirect) {
            btnSendDirect.addEventListener('click', () => {
                console.log('📤 Send direct');
                sendImageMessage(currentImageData);
            });
        }
        
        // Send image message
        async function sendImageMessage(imageData) {
            if (!imageData) return;
            
            const message = messageInput.value.trim() || '画像について教えてください';
            
            console.log('📤 Sending image message');
            
            // Hide image areas
            imagePreviewArea.classList.remove('active');
            cropArea.classList.remove('active');
            
            // Add user message
            addMessage('📷 ' + message, 'user');
            messageInput.value = '';
            
            sendButton.disabled = true;
            const loadingDiv = showLoading();
            
            try {
                // Convert base64 to blob
                const response = await fetch(imageData);
                const blob = await response.blob();
                
                // Create FormData
                const formData = new FormData();
                formData.append('image', blob, 'image.jpg');
                formData.append('sessionId', SESSION_ID);
                formData.append('message', message);
                
                // Send to API
                const apiResponse = await fetch('/api/ai-chat-image', {
                    method: 'POST',
                    body: formData
                });
                
                const data = await apiResponse.json();
                
                loadingDiv.remove();
                
                if (data.ok) {
                    console.log('✅ Image response received');
                    addMessage(data.answer, 'ai');
                } else {
                    console.error('❌ API error:', data.message);
                    showError(data.message || 'エラーが発生しました');
                }
            } catch (error) {
                console.error('❌ Network error:', error);
                loadingDiv.remove();
                showError('通信エラーが発生しました');
            } finally {
                sendButton.disabled = false;
                messageInput.focus();
                currentImageData = null;
                cameraInput.value = '';
                fileInput.value = '';
            }
        }
        
        console.log('✅ Camera functions initialized');
    </script>
</body>
</html>
  `)
})

// インター生用バイリンガルチャット - International Student Bilingual Chat
router.get('/international-student/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')
  console.log('🌍 International Student Chat requested for session:', sessionId)
  
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bilingual Learning Support - KOBEYA</title>
    <!-- KaTeX for math rendering -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
    <!-- Cropper.js for image cropping -->
    <link rel="stylesheet" href="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.css">
    <script src="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.js"></script>
    <!-- Font Awesome for icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Noto Sans JP', sans-serif;
            background: #f9fafb;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
        }
        
        .chat-container {
            width: 100%;
            max-width: 800px;
            height: 90vh;
            background: white;
            border-radius: 1rem;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .chat-header {
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            padding: 1.5rem;
            text-align: center;
        }
        
        .chat-header h1 {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
        }
        
        .chat-header p {
            font-size: 0.9rem;
            opacity: 0.9;
        }
        
        .chat-messages {
            flex: 1;
            padding: 1.5rem;
            overflow-y: auto;
            background: #f8fafc;
        }
        
        .message {
            margin-bottom: 1rem;
            padding: 1rem;
            border-radius: 1rem;
            max-width: 80%;
            line-height: 1.6;
            animation: slideIn 0.3s ease;
        }
        
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .message.user {
            background: #d1fae5;
            margin-left: auto;
            text-align: right;
        }
        
        .message.ai {
            background: white;
            border: 1px solid #e5e7eb;
        }
        
        .message.ai .bilingual-content {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        
        .message.ai .japanese-section,
        .message.ai .english-section {
            padding: 0.75rem;
            border-radius: 0.5rem;
        }
        
        .message.ai .japanese-section {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
        }
        
        .message.ai .english-section {
            background: #dbeafe;
            border-left: 4px solid #3b82f6;
        }
        
        .message.ai .section-label {
            font-weight: 600;
            font-size: 0.85rem;
            margin-bottom: 0.5rem;
            opacity: 0.7;
        }
        
        .message img {
            max-width: 100%;
            border-radius: 0.5rem;
            margin-top: 0.5rem;
        }
        
        /* Message content styling for better math rendering */
        .message-content {
            line-height: 1.8;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        
        .message-content .katex {
            font-size: 1.1em;
        }
        
        .message-content .katex-display {
            margin: 1em 0;
            overflow-x: auto;
            overflow-y: hidden;
        }
        
        .chat-input-container {
            padding: 1.5rem;
            background: white;
            border-top: 1px solid #e5e7eb;
        }
        
        .input-row {
            display: flex;
            gap: 0.75rem;
            align-items: center;
        }
        
        .camera-buttons {
            display: flex;
            gap: 0.5rem;
        }
        
        .camera-btn {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid #10b981;
            background: white;
            color: #10b981;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }
        
        .camera-btn:hover {
            background: #10b981;
            color: white;
        }
        
        input[type="file"] {
            display: none;
        }
        
        .message-input {
            flex: 1;
            padding: 0.75rem 1rem;
            border: 2px solid #e5e7eb;
            border-radius: 2rem;
            font-size: 1rem;
            outline: none;
            transition: border-color 0.2s;
        }
        
        .message-input:focus {
            border-color: #10b981;
        }
        
        .send-btn {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: none;
            background: #10b981;
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }
        
        .send-btn:hover {
            background: #059669;
        }
        
        .send-btn:disabled {
            background: #cbd5e1;
            cursor: not-allowed;
        }
        
        .image-preview {
            margin-top: 1rem;
            padding: 1rem;
            background: #f1f5f9;
            border-radius: 0.5rem;
            position: relative;
        }
        
        .image-preview img {
            max-width: 200px;
            border-radius: 0.5rem;
        }
        
        .remove-image-btn {
            position: absolute;
            top: 0.5rem;
            right: 0.5rem;
            background: #ef4444;
            color: white;
            border: none;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            cursor: pointer;
        }
        
        .loading {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: #64748b;
        }
        
        .spinner {
            border: 3px solid #f3f4f6;
            border-top: 3px solid #10b981;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .back-button {
            position: absolute;
            left: 1rem;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: none;
            border-radius: 0.5rem;
            padding: 0.5rem 1rem;
            cursor: pointer;
            transition: background 0.2s;
        }
        
        .back-button:hover {
            background: rgba(255, 255, 255, 0.3);
        }
        
        /* Crop area styles */
        .crop-area {
            margin-top: 1rem;
            padding: 1rem;
            background: #f8fafc;
            border-radius: 0.5rem;
            border: 2px solid #10b981;
            max-height: 60vh;
            overflow-y: auto;
        }
        
        .crop-area img {
            max-width: 100%;
            max-height: 50vh;
            display: block;
        }
        
        .crop-actions {
            display: flex;
            gap: 0.5rem;
            margin-top: 1rem;
            justify-content: center;
        }
        
        .crop-btn {
            padding: 0.5rem 1rem;
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
        }
        
        .crop-btn.confirm {
            background: #10b981;
            color: white;
        }
        
        .crop-btn.confirm:hover {
            background: #059669;
        }
        
        .crop-btn.cancel {
            background: #ef4444;
            color: white;
        }
        
        .crop-btn.cancel:hover {
            background: #dc2626;
        }
        
        /* Cropper.js handle sizes */
        .cropper-point {
            width: 12px !important;
            height: 12px !important;
            opacity: 0.95 !important;
        }
        
        .cropper-point:hover {
            opacity: 1 !important;
            transform: scale(1.2);
        }
        
        .cropper-point.point-nw,
        .cropper-point.point-ne,
        .cropper-point.point-sw,
        .cropper-point.point-se {
            background-color: #10b981 !important;
            border-radius: 50%;
        }
        
        .cropper-point.point-n,
        .cropper-point.point-s,
        .cropper-point.point-e,
        .cropper-point.point-w {
            background-color: #059669 !important;
            border-radius: 2px;
        }
        
        .cropper-crop-box {
            border: 2px solid #10b981 !important;
        }
        
        .cropper-view-box {
            outline: 2px solid #10b981 !important;
        }
        
        .image-preview-actions {
            display: flex;
            gap: 0.5rem;
            margin-top: 0.5rem;
        }
        
        .preview-btn {
            padding: 0.375rem 0.75rem;
            border: none;
            border-radius: 0.375rem;
            cursor: pointer;
            font-size: 0.875rem;
            font-weight: 500;
            transition: all 0.2s;
        }
        
        .preview-btn.start-crop {
            background: #10b981;
            color: white;
        }
        
        .preview-btn.start-crop:hover {
            background: #059669;
        }
        
        .preview-btn.remove {
            background: #ef4444;
            color: white;
        }
        
        .preview-btn.remove:hover {
            background: #dc2626;
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header" style="position: relative;">
            <button class="back-button" onclick="window.location.href='/study-partner'">
                <i class="fas fa-arrow-left"></i> 戻る
            </button>
            <h1 id="chatTitle"><i class="fas fa-robot"></i> AIに質問</h1>
            <p id="chatSubtitle">質問や問題を送ってください</p>
        </div>
        
        <div class="chat-messages" id="chatMessages">
            <!-- Initial message will be set by JavaScript based on session ID -->
        </div>
        
        <div class="chat-input-container">
            <!-- Image preview area -->
            <div id="imagePreview" class="image-preview" style="display: none;">
                <img id="previewImage" src="" alt="Preview">
                <div class="image-preview-actions">
                    <button class="preview-btn start-crop" id="startCropBtn">
                        <i class="fas fa-crop"></i> クロップ / Crop
                    </button>
                    <button class="preview-btn remove" onclick="removeImage()">
                        <i class="fas fa-times"></i> 削除 / Remove
                    </button>
                </div>
            </div>
            
            <!-- Crop area -->
            <div id="cropArea" class="crop-area" style="display: none;">
                <img id="cropImage" src="" alt="Crop">
                <div class="crop-actions">
                    <button class="crop-btn confirm" id="confirmCropBtn">
                        <i class="fas fa-check"></i> 確定 / Confirm
                    </button>
                    <button class="crop-btn cancel" id="cancelCropBtn">
                        <i class="fas fa-times"></i> キャンセル / Cancel
                    </button>
                </div>
            </div>
            
            <div class="input-row">
                <div class="camera-buttons">
                    <button class="camera-btn" onclick="document.getElementById('cameraInput').click()" title="カメラ撮影">
                        <i class="fas fa-camera"></i>
                    </button>
                    <button class="camera-btn" onclick="document.getElementById('fileInput').click()" title="ファイル選択">
                        <i class="fas fa-image"></i>
                    </button>
                </div>
                
                <input type="file" id="cameraInput" accept="image/*" capture="environment">
                <input type="file" id="fileInput" accept="image/*">
                
                <input type="text" class="message-input" id="messageInput" placeholder="質問を入力 / Enter your question...">
                
                <button class="send-btn" id="sendButton" onclick="sendMessage()">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    </div>
    
    <!-- External JavaScript - No more template literal escaping issues! -->
    <script>
        // Pass session ID to external script via data attribute
        document.body.dataset.sessionId = '${sessionId}';
    </script>
    <script src="/js/international-chat.js"></script>

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
          
          indicator.innerHTML = '<div style=\"display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 0.5rem; font-size: 0.875rem; background-color: ' + bgColor + '; color: ' + textColor + '; border: 1px solid ' + borderColor + ';\" title=\"' + title + '\"><div style=\"width: 0.5rem; height: 0.5rem; border-radius: 9999px; background-color: ' + dotColor + ';\"></div><span style=\"font-weight: 500;\">' + studentName + '</span></div>';
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
