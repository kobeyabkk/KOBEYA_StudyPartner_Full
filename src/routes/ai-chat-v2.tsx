import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const router = new Hono<{ Bindings: Bindings }>()

// ==========================================
router.get('/:sessionId', (c) => {
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
        
        .image-preview-area {
            background: white;
            border: 2px solid #e5e7eb;
            border-radius: 0.75rem;
            margin-bottom: 1rem;
            overflow: hidden;
            display: none;
        }
        
        .image-preview-area.active {
            display: block;
        }
        
        /* Crop area - visible overlay when active */
        .crop-area {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.95);
            z-index: 1000;
            display: none;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 1rem;
        }
        
        .crop-area.active {
            display: flex;
        }
        
        .preview-header {
            background: #f3f4f6;
            padding: 0.75rem 1rem;
            border-bottom: 2px solid #e5e7eb;
            font-weight: 600;
            font-size: 0.9rem;
        }
        
        .crop-header {
            color: white;
            font-size: 1.2rem;
            font-weight: 600;
            margin-bottom: 1rem;
            text-align: center;
        }
        
        .preview-content {
            padding: 1rem;
        }
        
        .crop-content {
            max-width: 90vw;
            max-height: 70vh;
            overflow: auto;
            text-align: center;
        }
        
        .preview-image {
            max-width: 100%;
            max-height: 300px;
            border-radius: 0.5rem;
        }
        
        .crop-image {
            max-width: 100%;
            max-height: 60vh;
            display: block;
            background: white;
        }
        
        .preview-actions {
            padding: 1rem;
            border-top: 1px solid #e5e7eb;
            display: flex;
            gap: 0.5rem;
        }
        
        .crop-actions {
            display: flex;
            gap: 1rem;
            margin-top: 1rem;
            justify-content: center;
        }
        
        .preview-actions button {
            flex: 1;
            padding: 0.75rem;
            font-size: 0.9rem;
        }
        
        .crop-actions button {
            padding: 0.75rem 2rem;
            font-size: 1rem;
            font-weight: 600;
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .btn-secondary {
            background: #ef4444 !important;
            color: white !important;
        }
        
        .btn-secondary:hover:not(:disabled) {
            background: #dc2626 !important;
        }
        
        .btn-success {
            background: #10b981 !important;
            color: white !important;
        }
        
        .btn-success:hover:not(:disabled) {
            background: #059669 !important;
        }
        
        input[type="file"] {
            display: none;
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
            </div>
            <div style="padding: 0.5rem 1rem; background: #f0fdf4; border-top: 1px solid #e5e7eb;">
                <p style="margin: 0; font-size: 0.85rem; color: #059669;">
                    💡 下の入力欄に質問を入力して、送信ボタンを押してください
                </p>
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
                    <i class="fas fa-times"></i> キャンセル
                </button>
                <button id="btnConfirmCrop" class="btn-success">
                    <i class="fas fa-check"></i> 確定
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
            {left: '\\[', right: '\\]', display: true},
            {left: '$', right: '$', display: false},
            {left: '\\(', right: '\\)', display: false}
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
            if (type === 'ai') {
                setTimeout(() => {
                    if (typeof renderMathInElement !== 'undefined') {
                        try {
                            renderMathInElement(messageDiv, {
                                delimiters: mathDelimiters,
                                throwOnError: false
                            });
                            console.log('✅ KaTeX rendering applied');
                        } catch (error) {
                            console.error('❌ KaTeX rendering error:', error);
                        }
                    } else {
                        console.warn('⚠️ renderMathInElement not loaded yet');
                    }
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
            
            // If image preview is active, send image message instead
            if (imagePreviewArea.classList.contains('active') && currentImageData) {
                console.log('📤 Sending image message with question');
                sendImageMessage(currentImageData);
                return;
            }
            
            if (!message) {
                return;
            }
            
            console.log('📤 Sending text message:', message);
            
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
                        aspectRatio: NaN, // Free aspect ratio
                        viewMode: 1,
                        dragMode: 'move',
                        autoCropArea: 0.95,
                        responsive: true,
                        restore: false,
                        guides: true,
                        center: true,
                        highlight: false,
                        cropBoxMovable: true,
                        cropBoxResizable: true,
                        toggleDragModeOnDblclick: false,
                        ready: function() {
                            console.log('✂️ Cropper initialized');
                        }
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
                    
                    // Update preview with cropped image
                    previewImage.src = currentImageData;
                    
                    cropper.destroy();
                    cropper = null;
                }
                
                // Return to preview area for question input
                cropArea.classList.remove('active');
                imagePreviewArea.classList.add('active');
                
                // Focus on message input
                messageInput.focus();
            });
        }
        
        // btnSendDirect removed - use main send button with image preview active
        
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

export default router
