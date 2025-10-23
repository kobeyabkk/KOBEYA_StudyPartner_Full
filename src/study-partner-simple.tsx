// Simple Study Partner SPA - Working Version
export const studyPartnerSimple = (c) => {
  console.log('📱 Simple Study Partner requested')
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>KOBEYA Study Partner - 簡易版</title>
        
        <!-- CSS Libraries -->
        <link href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    </head>
    <body>
        <div class="container">
            <header>
                <h1><i class="fas fa-graduation-cap"></i> KOBEYA Study Partner</h1>
                <p>在タイ日本人学生向け AI学習支援システム</p>
            </header>

            <main>
                <!-- Login Section -->
                <section id="loginSection">
                    <article>
                        <header><h3><i class="fas fa-key"></i> ログイン認証</h3></header>
                        <div class="grid">
                            <label>
                                APP_KEY
                                <input type="text" id="appkey" value="180418" placeholder="APP_KEY">
                            </label>
                            <label>
                                Student ID
                                <input type="text" id="sid" value="JS2-04" placeholder="Student ID">
                            </label>
                        </div>
                        <button id="btnLogin">
                            <i class="fas fa-sign-in-alt"></i> ログイン/認証して開始
                        </button>
                    </article>
                </section>

                <!-- Photo Upload Section -->
                <section id="uploadSection" style="display: none;">
                    <article>
                        <header><h3><i class="fas fa-camera"></i> 問題画像アップロード</h3></header>
                        
                        <div class="grid">
                            <label for="cameraInput">
                                <i class="fas fa-camera"></i> カメラで撮影
                                <input type="file" id="cameraInput" accept="image/*" capture="environment">
                            </label>
                            <label for="fileInput">
                                <i class="fas fa-file-image"></i> ファイル選択
                                <input type="file" id="fileInput" accept="image/*">
                            </label>
                        </div>
                        
                        <div id="imagePreview" style="display: none; text-align: center; margin: 1rem 0;">
                            <img id="previewImage" style="max-width: 100%; height: auto; border-radius: 0.5rem;">
                        </div>
                        
                        <button id="uploadButton" style="display: none;">
                            <i class="fas fa-upload"></i> AI解析開始
                        </button>
                        
                        <div id="uploadingIndicator" style="display: none; text-align: center;">
                            <p><i class="fas fa-spinner fa-spin"></i> AI解析中...</p>
                        </div>
                    </article>
                </section>

                <!-- Results Section -->
                <section id="resultsSection" style="display: none;">
                    <article>
                        <header><h3><i class="fas fa-brain"></i> AI解析結果</h3></header>
                        <div id="analysisResult"></div>
                        <div id="learningSteps"></div>
                        
                        <button id="aiChatButton" style="display: none;" onclick="openAIChat()">
                            <i class="fas fa-robot"></i> AIに質問する
                        </button>
                    </article>
                </section>
            </main>
            
            <!-- Status Display -->
            <footer>
                <div id="statusDisplay">
                    <small>Status: Ready</small>
                </div>
            </footer>
        </div>

        <script>
        console.log('📱 Simple Study Partner JavaScript loading...');
        
        // Global state
        let authenticated = false;
        let currentSession = null;
        
        // Utility functions
        function updateStatus(message) {
            const status = document.getElementById('statusDisplay');
            if (status) {
                status.innerHTML = '<small>Status: ' + message + '</small>';
            }
            console.log('📊 Status:', message);
        }
        
        function showSection(sectionId) {
            ['loginSection', 'uploadSection', 'resultsSection'].forEach(id => {
                const section = document.getElementById(id);
                if (section) {
                    section.style.display = id === sectionId ? 'block' : 'none';
                }
            });
        }
        
        // Login handler
        async function handleLogin() {
            console.log('🔑 Login attempt');
            updateStatus('Authenticating...');
            
            try {
                const appkey = document.getElementById('appkey').value;
                const sid = document.getElementById('sid').value;
                
                // Validate input fields
                if (!appkey || !sid) {
                    throw new Error('APP_KEY と Student ID を両方入力してください');
                }
                
                // Call the actual login API
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        appkey: appkey,
                        sid: sid
                    })
                });
                
                const data = await response.json();
                
                if (response.ok && data.success) {
                    authenticated = true;
                    currentSession = { appkey, sid };
                    updateStatus('Authenticated - Ready to upload');
                    showSection('uploadSection');
                    
                    alert('✅ ログイン成功!' + String.fromCharCode(10) +
                          'APP_KEY: ' + appkey + String.fromCharCode(10) +
                          'Student ID: ' + sid);
                } else {
                    throw new Error(data.message || 'ログインに失敗しました');
                }
            } catch (error) {
                console.error('❌ Login error:', error);
                alert('❌ ログインエラー: ' + error.message);
                updateStatus('Authentication failed');
                authenticated = false;
                currentSession = null;
            }
        }
        
        // File selection handler
        function handleFileSelect(event) {
            console.log('📁 File selected');
            
            if (!authenticated) {
                alert('❌ ログインが必要です');
                return;
            }
            
            const file = event.target.files[0];
            if (!file) return;
            
            updateStatus('File selected: ' + file.name);
            
            // Show preview
            const reader = new FileReader();
            reader.onload = function(e) {
                const previewImg = document.getElementById('previewImage');
                const previewDiv = document.getElementById('imagePreview');
                const uploadBtn = document.getElementById('uploadButton');
                
                if (previewImg && previewDiv && uploadBtn) {
                    previewImg.src = e.target.result;
                    previewDiv.style.display = 'block';
                    uploadBtn.style.display = 'block';
                }
            };
            reader.readAsDataURL(file);
        }
        
        // Upload and analyze
        async function uploadAndAnalyze() {
            console.log('📤 Upload and analyze');
            updateStatus('Uploading and analyzing...');
            
            if (!authenticated) {
                alert('❌ ログインが必要です');
                return;
            }
            
            const fileInput = document.getElementById('fileInput');
            const cameraInput = document.getElementById('cameraInput');
            const file = fileInput.files[0] || cameraInput.files[0];
            
            if (!file) {
                alert('❌ ファイルを選択してください');
                return;
            }
            
            try {
                // Show loading
                document.getElementById('uploadingIndicator').style.display = 'block';
                document.getElementById('uploadButton').style.display = 'none';
                
                const formData = new FormData();
                formData.append('image', file);
                formData.append('appkey', document.getElementById('appkey').value);
                formData.append('sid', document.getElementById('sid').value);
                
                const response = await fetch('/api/analyze-and-learn', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                console.log('📊 Analysis result:', result);
                
                if (result.ok) {
                    currentSession = result;
                    displayResults(result);
                    updateStatus('Analysis complete');
                    showSection('resultsSection');
                    
                    alert('✅ AI解析完了！' + String.fromCharCode(10) + '段階学習を開始します。');
                } else {
                    throw new Error(result.message || 'Analysis failed');
                }
            } catch (error) {
                console.error('❌ Upload error:', error);
                alert('❌ アップロードエラー: ' + error.message);
                updateStatus('Upload failed');
            } finally {
                document.getElementById('uploadingIndicator').style.display = 'none';
            }
        }
        
        // Display results
        function displayResults(result) {
            const analysisDiv = document.getElementById('analysisResult');
            const stepsDiv = document.getElementById('learningSteps');
            const aiBtn = document.getElementById('aiChatButton');
            
            if (analysisDiv) {
                analysisDiv.innerHTML = '<h4>解析結果</h4><p>' + 
                    (result.analysis || 'AI解析が完了しました。段階学習を開始します。') + '</p>';
            }
            
            if (stepsDiv && result.currentStep) {
                let html = '<h4>学習ステップ ' + (result.currentStep.stepNumber + 1) + '</h4>';
                html += '<p>' + result.currentStep.instruction + '</p>';
                
                if (result.currentStep.options) {
                    html += '<fieldset>';
                    result.currentStep.options.forEach((option, index) => {
                        html += '<label><input type="radio" name="answer" value="' + 
                               option.charAt(0) + '"> ' + option + '</label>';
                    });
                    html += '</fieldset>';
                    html += '<button onclick="submitAnswer()">回答する</button>';
                }
                
                stepsDiv.innerHTML = html;
            }
            
            if (aiBtn) {
                aiBtn.style.display = 'block';
            }
        }
        
        // Submit answer
        function submitAnswer() {
            const selected = document.querySelector('input[name="answer"]:checked');
            if (!selected) {
                alert('❌ 選択肢を選んでください');
                return;
            }
            
            updateStatus('Answer submitted: ' + selected.value);
            alert('✅ 回答: ' + selected.value + String.fromCharCode(10) + String.fromCharCode(10) + 'AIフィードバックシステムが動作中です。');
        }
        
        // Open AI Chat
        function openAIChat() {
            console.log('🤖 Opening AI Chat');
            updateStatus('Opening AI Chat...');
            
            const features = 'width=600,height=700,scrollbars=yes,resizable=yes';
            const aiWindow = window.open('/ai-chat', 'ai-chat', features);
            
            if (!aiWindow) {
                alert('❌ ポップアップがブロックされました');
            } else {
                aiWindow.focus();
            }
        }
        
        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            console.log('📱 DOM loaded, initializing...');
            
            // Setup event listeners
            const btnLogin = document.getElementById('btnLogin');
            if (btnLogin) {
                btnLogin.addEventListener('click', handleLogin);
                console.log('✅ Login button listener added');
            }
            
            const fileInput = document.getElementById('fileInput');
            if (fileInput) {
                fileInput.addEventListener('change', handleFileSelect);
                console.log('✅ File input listener added');
            }
            
            const cameraInput = document.getElementById('cameraInput');
            if (cameraInput) {
                cameraInput.addEventListener('change', handleFileSelect);
                console.log('✅ Camera input listener added');
            }
            
            const uploadButton = document.getElementById('uploadButton');
            if (uploadButton) {
                uploadButton.addEventListener('click', uploadAndAnalyze);
                console.log('✅ Upload button listener added');
            }
            
            updateStatus('Ready - Please login');
            console.log('✅ Simple Study Partner initialization complete');
        });
        
        console.log('✅ Simple Study Partner JavaScript loaded');
        </script>
    </body>
    </html>
  `)
}