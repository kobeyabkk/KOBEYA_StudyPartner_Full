import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const router = new Hono<{ Bindings: Bindings }>()

router.get('/:sessionId', (c) => {
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
