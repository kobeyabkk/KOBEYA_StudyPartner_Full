/**
 * AI Chat V2 JavaScript
 * Handles chat functionality with image support and KaTeX math rendering
 */

(function() {
    console.log('🚀 AI Chat V2 script starting...');
    
    // Get SESSION_ID and student info from data attributes (will be set by server)
    const SESSION_ID = document.body.getAttribute('data-session-id');
    const STUDENT_ID = document.body.getAttribute('data-student-id');
    const STUDENT_NAME = document.body.getAttribute('data-student-name');
    const STUDENT_GRADE = document.body.getAttribute('data-student-grade');
    
    console.log('📍 Session ID:', SESSION_ID);
    console.log('👨‍🎓 Student Info:', { STUDENT_ID, STUDENT_NAME, STUDENT_GRADE });
    
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
    
    // KaTeX delimiters
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
        
        // 改行を<br>タグに変換
        const formattedText = text.replace(/\n/g, '<br>');
        messageDiv.innerHTML = formattedText;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // AIメッセージの場合、KaTeXで数式をレンダリング
        if (type === 'ai' && typeof window.renderMathInElement !== 'undefined') {
            try {
                window.renderMathInElement(messageDiv, {
                    delimiters: mathDelimiters,
                    throwOnError: false
                });
                console.log('✅ KaTeX rendering applied');
            } catch (error) {
                console.error('❌ KaTeX rendering error:', error);
            }
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
            // API呼び出し（生徒情報を含む）
            const response = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: SESSION_ID,
                    question: message,
                    studentId: STUDENT_ID,
                    studentName: STUDENT_NAME,
                    grade: parseInt(STUDENT_GRADE) || 0
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
    
    // Handle Enter key press with IME support (Japanese input)
    // isComposing flag prevents sending during IME conversion (漢字変換中)
    if (messageInput) {
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                console.log('⌨️ Enter key pressed (not composing)');
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
    
    // Send image message
    async function sendImageMessage(imageData) {
        if (!imageData) return;
        
        const message = messageInput.value.trim() || '画像について教えてください';
        
        console.log('📤 Sending image message');
        
        // Hide image areas
        imagePreviewArea.classList.remove('active');
        cropArea.classList.remove('active');
        
        // Add user message with text
        if (message) {
            addMessage(message, 'user');
        }
        
        // Add user message with image
        const img = document.createElement('img');
        img.src = imageData;
        img.style.maxWidth = '100%';
        img.style.borderRadius = '0.5rem';
        img.style.marginTop = '0.5rem';
        const imgDiv = document.createElement('div');
        imgDiv.className = 'message user';
        imgDiv.appendChild(img);
        chatMessages.appendChild(imgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        messageInput.value = '';
        
        sendButton.disabled = true;
        const loadingDiv = showLoading();
        
        try {
            // Convert base64 to blob
            const response = await fetch(imageData);
            const blob = await response.blob();
            
            // Create FormData（生徒情報を含む）
            const formData = new FormData();
            formData.append('image', blob, 'image.jpg');
            formData.append('sessionId', SESSION_ID);
            formData.append('message', message);
            formData.append('studentId', STUDENT_ID || '');
            formData.append('studentName', STUDENT_NAME || '');
            formData.append('grade', STUDENT_GRADE || '0');
            
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
})();
