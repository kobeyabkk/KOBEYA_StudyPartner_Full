/**
 * International Student Bilingual Chat
 * External JavaScript for留学生用バイリンガルチャット
 */

(function() {
    'use strict';
    
    // Get session ID from data attribute
    const SESSION_ID = document.body.dataset.sessionId;
    console.log('🌍 Initializing chat for session:', SESSION_ID);
    
    // DOM elements
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const chatMessages = document.getElementById('chatMessages');
    const imagePreview = document.getElementById('imagePreview');
    const previewImage = document.getElementById('previewImage');
    const cropArea = document.getElementById('cropArea');
    const cropImage = document.getElementById('cropImage');
    const startCropBtn = document.getElementById('startCropBtn');
    const confirmCropBtn = document.getElementById('confirmCropBtn');
    const cancelCropBtn = document.getElementById('cancelCropBtn');
    
    let cropper = null;
    let currentImageData = null;
    
    /**
     * Set initial welcome message based on session ID prefix
     */
    function setInitialMessage() {
        const isInternational = SESSION_ID.startsWith('intl_');
        
        const chatTitle = document.getElementById('chatTitle');
        const chatSubtitle = document.getElementById('chatSubtitle');
        
        if (isInternational) {
            // Update header for international students
            chatTitle.innerHTML = '<i class="fas fa-globe"></i> Bilingual Learning Support';
            chatSubtitle.textContent = 'バイリンガル学習サポート - 日本語と英語で解説';
            
            // Bilingual welcome message for international students
            chatMessages.innerHTML = '<div class="message ai"><div class="bilingual-content"><div class="japanese-section"><div class="section-label">🇯🇵 日本語</div><p>こんにちは！バイリンガル学習サポートです。質問や問題の画像を送ってください。日本語と英語の両方で詳しく解説します。</p></div><div class="english-section"><div class="section-label">🇺🇸 English</div><p>Hello! Welcome to Bilingual Learning Support. Please send your questions or images of problems. I will provide detailed explanations in both Japanese and English.</p></div></div></div>';
        } else {
            // Keep standard header for other pages
            chatTitle.innerHTML = '<i class="fas fa-robot"></i> AIに質問';
            chatSubtitle.textContent = '質問や問題を送ってください';
            
            // Standard Japanese welcome message for other pages
            chatMessages.innerHTML = '<div class="message ai"><div class="message-content"><h3>AIに質問</h3><p>こんにちは！質問や問題の画像を送ってください。詳しく解説します。</p></div></div>';
        }
    }
    
    /**
     * Load conversation history on page load
     */
    async function loadConversationHistory() {
        try {
            const response = await fetch('/api/unified-ai-chat/history/' + SESSION_ID);
            const result = await response.json();
            
            if (result.ok && result.conversations && result.conversations.length > 0) {
                // Clear initial message
                chatMessages.innerHTML = '';
                
                // Add all historical messages
                result.conversations.forEach(function(conv) {
                    if (conv.role === 'user') {
                        addMessage(conv.content || '[画像]', 'user');
                    } else if (conv.role === 'assistant') {
                        addMessage(conv.content, 'ai');
                    }
                });
            }
        } catch (error) {
            console.error('Failed to load conversation history:', error);
        }
    }
    
    /**
     * Add a message to the chat
     * @param {string} content - Message content
     * @param {string} type - 'user' or 'ai'
     */
    function addMessage(content, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message ' + type;
        
        if (type === 'ai' && content.includes('【日本語】') && content.includes('【English】')) {
            // Parse bilingual content - Using Unicode range [\u0000-\uFFFF] to match any character including newlines
            // This avoids Cloudflare minification issues with [\s\S] pattern
            // Unicode range is not affected by minification and works in all browsers
            const japaneseMatch = content.match(/【日本語】([\u0000-\uFFFF]*?)(?=【English】|$)/);
            const englishMatch = content.match(/【English】([\u0000-\uFFFF]*?)$/);
            
            const japaneseText = japaneseMatch ? japaneseMatch[1].trim() : '';
            const englishText = englishMatch ? englishMatch[1].trim() : '';
            
            messageDiv.innerHTML = '<div class="bilingual-content">' +
                '<div class="japanese-section">' +
                '<div class="section-label">🇯🇵 日本語</div>' +
                '<div class="content-text">' + japaneseText.replace(/\n/g, '<br>') + '</div>' +
                '</div>' +
                '<div class="english-section">' +
                '<div class="section-label">🇺🇸 English</div>' +
                '<div class="content-text">' + englishText.replace(/\n/g, '<br>') + '</div>' +
                '</div>' +
                '</div>';
        } else {
            // Use innerHTML to preserve formatting and allow math rendering
            const formattedContent = content.replace(/\n/g, '<br>');
            messageDiv.innerHTML = '<div class="message-content">' + formattedContent + '</div>';
        }
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Render math with KaTeX (now it works without escaping issues!)
        if (window.renderMathInElement && type === 'ai') {
            try {
                renderMathInElement(messageDiv, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false}
                    ],
                    throwOnError: false
                });
            } catch (error) {
                console.error('KaTeX rendering error:', error);
            }
        }
    }
    
    /**
     * Handle image file selection
     */
    function handleImageSelect(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                previewImage.src = e.target.result;
                previewImage.onload = function() {
                    imagePreview.style.display = 'block';
                    cropArea.style.display = 'none';
                    
                    // Auto-start crop after 800ms
                    setTimeout(() => {
                        startCrop();
                    }, 800);
                };
            };
            reader.readAsDataURL(file);
        }
    }
    
    /**
     * Start crop mode
     */
    function startCrop() {
        if (!previewImage.src) {
            console.error('No image source for crop');
            return;
        }
        
        console.log('✂️ Starting crop');
        
        cropImage.src = previewImage.src;
        imagePreview.style.display = 'none';
        cropArea.style.display = 'block';
        
        if (cropper) {
            cropper.destroy();
        }
        
        // Initialize Cropper.js
        setTimeout(() => {
            if (window.Cropper && cropImage) {
                cropper = new window.Cropper(cropImage, {
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
            }
        }, 100);
    }
    
    /**
     * Confirm crop and process image
     */
    function confirmCrop() {
        if (!cropper) {
            alert('クロップ機能が正しく初期化されていません。\nCrop function not properly initialized.');
            return;
        }
        
        console.log('✂️ Confirming crop');
        
        try {
            const canvas = cropper.getCroppedCanvas({
                maxWidth: 768,
                maxHeight: 768,
                imageSmoothingQuality: 'high'
            });
            
            if (!canvas) {
                alert('画像の切り取りに失敗しました。\nFailed to crop image.');
                return;
            }
            
            currentImageData = canvas.toDataURL('image/jpeg', 0.95);
            console.log('✂️ Crop completed, image data length:', currentImageData.length);
            
            // Update preview
            previewImage.src = currentImageData;
            cropArea.style.display = 'none';
            imagePreview.style.display = 'block';
            
            if (cropper) {
                cropper.destroy();
                cropper = null;
            }
            
        } catch (error) {
            console.error('Error during crop:', error);
            alert('画像の処理中にエラーが発生しました。\nError processing image.');
        }
    }
    
    /**
     * Cancel crop and return to preview
     */
    function cancelCrop() {
        console.log('❌ Canceling crop');
        
        cropArea.style.display = 'none';
        imagePreview.style.display = 'block';
        
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
    }
    
    /**
     * Remove selected image
     */
    function removeImage() {
        currentImageData = null;
        imagePreview.style.display = 'none';
        cropArea.style.display = 'none';
        document.getElementById('cameraInput').value = '';
        document.getElementById('fileInput').value = '';
        
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
    }
    
    /**
     * Send message to AI
     */
    async function sendMessage() {
        const message = messageInput.value.trim();
        
        if (!message && !currentImageData) {
            return;
        }
        
        // Add user message
        if (message) {
            addMessage(message, 'user');
        }
        
        if (currentImageData) {
            const img = document.createElement('img');
            img.src = currentImageData;
            const imgDiv = document.createElement('div');
            imgDiv.className = 'message user';
            imgDiv.appendChild(img);
            chatMessages.appendChild(imgDiv);
        }
        
        messageInput.value = '';
        sendButton.disabled = true;
        
        // Show loading
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message ai loading';
        loadingDiv.innerHTML = '<div class="spinner"></div> <span>AIが回答を生成中...</span>';
        chatMessages.appendChild(loadingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        try {
            const formData = new FormData();
            if (currentImageData) {
                const blob = await (await fetch(currentImageData)).blob();
                formData.append('image', blob, 'image.jpg');
            }
            formData.append('sessionId', SESSION_ID);
            formData.append('message', message);
            
            // Determine context type based on session ID prefix
            // Only international students get special bilingual context, others use general
            let contextType = 'general';
            if (SESSION_ID.startsWith('intl_')) {
                contextType = 'international';
            }
            // All other contexts (eiken, essay, flashcard, main) use 'general' for standard ChatGPT-like responses
            
            formData.append('contextType', contextType);
            console.log('🤖 Sending message with contextType:', contextType, 'for session:', SESSION_ID);
            
            const response = await fetch('/api/unified-ai-chat', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                console.error('❌ HTTP Error:', response.status, response.statusText);
                const errorText = await response.text();
                console.error('Error response:', errorText);
                loadingDiv.remove();
                addMessage('サーバーエラーが発生しました: ' + response.status, 'ai');
                return;
            }
            
            const data = await response.json();
            console.log('📩 Received response:', data);
            
            loadingDiv.remove();
            
            if (data.ok) {
                console.log('✅ Success! Adding AI message:', data.answer.substring(0, 100) + '...');
                addMessage(data.answer, 'ai');
            } else {
                console.error('❌ API returned error:', data.message);
                addMessage('エラーが発生しました: ' + (data.message || 'Unknown error'), 'ai');
            }
        } catch (error) {
            console.error('❌ Exception occurred:', error);
            console.error('Error details:', error.stack);
            loadingDiv.remove();
            addMessage('通信エラーが発生しました: ' + error.message, 'ai');
        } finally {
            sendButton.disabled = false;
            messageInput.focus();
            removeImage();
        }
    }
    
    // Event listeners
    const cameraInput = document.getElementById('cameraInput');
    const fileInput = document.getElementById('fileInput');
    
    if (cameraInput) {
        cameraInput.addEventListener('change', handleImageSelect);
    }
    if (fileInput) {
        fileInput.addEventListener('change', handleImageSelect);
    }
    
    // Event listeners for crop buttons
    if (startCropBtn) {
        startCropBtn.addEventListener('click', startCrop);
    }
    if (confirmCropBtn) {
        confirmCropBtn.addEventListener('click', confirmCrop);
    }
    if (cancelCropBtn) {
        cancelCropBtn.addEventListener('click', cancelCrop);
    }
    
    // Make sendMessage available globally
    window.sendMessage = sendMessage;
    window.removeImage = removeImage;
    
    // Initialize
    setInitialMessage();
    loadConversationHistory();
    messageInput.focus();
})();
