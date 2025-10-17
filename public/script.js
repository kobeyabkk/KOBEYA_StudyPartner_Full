// DOM要素
const appKeyInput = document.getElementById('appKey')
const studentIdInput = document.getElementById('studentId')
const topicInput = document.getElementById('topicInput')
const explainBtn = document.getElementById('explainBtn')
const practiceBtn = document.getElementById('practiceBtn')
const submitBtn = document.getElementById('submitBtn')
const outputArea = document.getElementById('out')
const practiceArea = document.getElementById('practiceArea')
const questionContainer = document.getElementById('questionContainer')

// 写真モード関連
const textModeTab = document.getElementById('textModeTab')
const photoModeTab = document.getElementById('photoModeTab')
const textModeSection = document.getElementById('textModeSection')
const photoModeSection = document.getElementById('photoModeSection')
const uploadArea = document.getElementById('uploadArea')
const photoInput = document.getElementById('photoInput')
const photoPreview = document.getElementById('photoPreview')
const previewImage = document.getElementById('previewImage')
const analyzeBtn = document.getElementById('analyzeBtn')
const retakeBtn = document.getElementById('retakeBtn')
const toggleJson = document.getElementById('toggleJson')
const jsonOutput = document.getElementById('jsonOutput')
const jsonContent = document.getElementById('jsonContent')

// 状態管理
let currentMode = 'text' // 'text' or 'photo'
let currentPracticeData = null
let currentQuestions = []
let photoAnalysisResult = null
let lastApiResponse = null

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    loadStoredValues()
    setupEventListeners()
    displayWelcomeMessage()
})

// ローカルストレージから値を復元
function loadStoredValues() {
    const storedAppKey = localStorage.getItem('kobeya_app_key')
    const storedStudentId = localStorage.getItem('kobeya_student_id')
    const storedTopic = localStorage.getItem('kobeya_last_topic')
    
    if (storedAppKey) appKeyInput.value = storedAppKey
    if (storedStudentId) studentIdInput.value = storedStudentId
    if (storedTopic) topicInput.value = storedTopic
}

// 値をローカルストレージに保存
function saveValues() {
    localStorage.setItem('kobeya_app_key', appKeyInput.value.trim())
    localStorage.setItem('kobeya_student_id', studentIdInput.value.trim())
    localStorage.setItem('kobeya_last_topic', topicInput.value.trim())
}

// イベントリスナー設定
function setupEventListeners() {
    // 入力フィールドの保存
    appKeyInput.addEventListener('input', saveValues)
    studentIdInput.addEventListener('input', saveValues)
    topicInput.addEventListener('input', saveValues)
    
    // モード切替タブ
    textModeTab.addEventListener('click', () => switchMode('text'))
    photoModeTab.addEventListener('click', () => switchMode('photo'))
    
    // 写真アップロード関連
    uploadArea.addEventListener('click', () => photoInput.click())
    photoInput.addEventListener('change', handleFileSelect)
    analyzeBtn.addEventListener('click', handlePhotoAnalyze)
    retakeBtn.addEventListener('click', handleRetake)
    
    // ボタンクリック
    explainBtn.addEventListener('click', handleExplain)
    practiceBtn.addEventListener('click', handlePractice)
    submitBtn.addEventListener('click', handleSubmit)
    
    // JSONデバッグ表示
    toggleJson.addEventListener('click', toggleJsonDisplay)
    
    // エンターキー対応
    topicInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleExplain()
        }
    })
}

// モード切替
function switchMode(mode) {
    currentMode = mode
    
    if (mode === 'text') {
        textModeTab.classList.add('active')
        photoModeTab.classList.remove('active')
        textModeSection.style.display = 'block'
        photoModeSection.style.display = 'none'
        
        // 写真解析結果をリセット
        photoAnalysisResult = null
    } else {
        photoModeTab.classList.add('active')
        textModeTab.classList.remove('active')
        textModeSection.style.display = 'none'
        photoModeSection.style.display = 'block'
    }
}

// ファイル選択処理
function handleFileSelect(event) {
    const file = event.target.files[0]
    if (file) {
        // ファイルサイズチェック（8MB制限）
        if (file.size > 8 * 1024 * 1024) {
            showError('ファイルサイズは8MB以下にしてください')
            return
        }
        
        // ファイル形式チェック
        const allowedTypes = ['image/jpeg', 'image/png', 'image/heic']
        if (!allowedTypes.includes(file.type)) {
            showError('JPEG, PNG, HEICファイルのみ対応しています')
            return
        }
        
        // プレビュー表示
        const reader = new FileReader()
        reader.onload = (e) => {
            previewImage.src = e.target.result
            uploadArea.style.display = 'none'
            photoPreview.style.display = 'block'
        }
        reader.readAsDataURL(file)
    }
}

// 撮り直し処理
function handleRetake() {
    photoInput.value = ''
    uploadArea.style.display = 'block'
    photoPreview.style.display = 'none'
    photoAnalysisResult = null
}

// 写真解析処理
async function handlePhotoAnalyze() {
    if (!validateAuth()) return
    
    const file = photoInput.files[0]
    if (!file) {
        showError('写真を選択してください')
        return
    }
    
    try {
        setLoading(analyzeBtn, true)
        hideMessage()
        displayOutput('📸 写真を解析中...')
        
        const formData = new FormData()
        formData.append('file', file)
        
        const response = await fetch('/api/photo/analyze', {
            method: 'POST',
            headers: {
                'x-app-key': String(appKeyInput.value || '').trim(),
                'x-student-id': String(studentIdInput.value || '').trim()
            },
            body: formData
        })
        
        const data = await response.json()
        lastApiResponse = data
        
        if (!response.ok) {
            throw new Error(data.message || 'リクエストに失敗しました')
        }
        
        if (data.ok) {
            photoAnalysisResult = data
            displayPhotoAnalysis(data)
            showSuccess('写真の解析が完了しました！')
        } else {
            throw new Error(data.message || '解析に失敗しました')
        }
        
    } catch (error) {
        handleError(error)
    } finally {
        setLoading(analyzeBtn, false)
    }
}

// 安全なヘッダー関数
function safeHeaders() {
    return {
        'Content-Type': 'application/json',
        'x-app-key': String(appKeyInput.value || '').trim(),
        'x-student-id': String(studentIdInput.value || '').trim()
    }
}

// 認証検証（写真モード用）
function validateAuth() {
    const appKey = appKeyInput.value.trim()
    const studentId = studentIdInput.value.trim()
    
    if (!appKey) {
        showError('APP_KEYを入力してください')
        appKeyInput.focus()
        return false
    }
    
    if (!studentId) {
        showError('学生IDを入力してください')
        studentIdInput.focus()
        return false
    }
    
    return true
}

// 入力検証（テキストモード用）
function validateInputs() {
    if (!validateAuth()) return false
    
    if (currentMode === 'text') {
        const topic = topicInput.value.trim()
        if (!topic) {
            showError('学習トピックを入力してください')
            topicInput.focus()
            return false
        }
    } else if (currentMode === 'photo') {
        if (!photoAnalysisResult) {
            showError('まず写真を解析してください')
            return false
        }
    }
    
    return true
}

// 説明機能
async function handleExplain() {
    if (!validateInputs()) return
    
    try {
        setLoading(explainBtn, true)
        hideMessage()
        displayOutput('📚 概念を学習中...')
        
        let response, data
        
        if (currentMode === 'text') {
            const topic = topicInput.value.trim()
            response = await fetch('/api/explain', {
                method: 'POST',
                headers: safeHeaders(),
                body: JSON.stringify({ topic })
            })
        } else {
            response = await fetch('/api/photo/explain', {
                method: 'POST',
                headers: safeHeaders(),
                body: JSON.stringify({
                    raw_text: photoAnalysisResult.raw_text,
                    problem: photoAnalysisResult.problem
                })
            })
        }
        
        data = await response.json()
        lastApiResponse = data
        
        if (!response.ok) {
            throw new Error(data.message || 'リクエストに失敗しました')
        }
        
        if (data.ok) {
            displayExplanation(data)
            showSuccess('説明を取得しました！')
        } else {
            throw new Error(data.message || '説明の取得に失敗しました')
        }
        
    } catch (error) {
        handleError(error)
    } finally {
        setLoading(explainBtn, false)
    }
}

// 練習問題機能
async function handlePractice() {
    if (!validateInputs()) return
    
    try {
        setLoading(practiceBtn, true)
        hideMessage()
        displayOutput('🏋️ 練習問題を生成中...')
        
        let response, data
        
        if (currentMode === 'text') {
            const topic = topicInput.value.trim()
            response = await fetch('/api/practice', {
                method: 'POST',
                headers: safeHeaders(),
                body: JSON.stringify({ topic })
            })
        } else {
            response = await fetch('/api/photo/practice', {
                method: 'POST',
                headers: safeHeaders(),
                body: JSON.stringify({
                    problem: photoAnalysisResult.problem,
                    target: '同レベルの類似問題'
                })
            })
        }
        
        data = await response.json()
        lastApiResponse = data
        
        if (!response.ok) {
            throw new Error(data.message || 'リクエストに失敗しました')
        }
        
        if (data.ok && data.practice) {
            currentPracticeData = data
            displayPracticeQuestions(data.practice)
            displayOutput('✅ 練習問題が生成されました。回答してSubmitボタンを押してください。')
            showSuccess('練習問題を生成しました！')
            submitBtn.disabled = false
        } else {
            throw new Error(data.message || '練習問題の生成に失敗しました')
        }
        
    } catch (error) {
        handleError(error)
    } finally {
        setLoading(practiceBtn, false)
    }
}

// 回答提出機能
async function handleSubmit() {
    if (!currentPracticeData) {
        showError('まず練習問題を生成してください')
        return
    }
    
    try {
        setLoading(submitBtn, true)
        hideMessage()
        displayOutput('📊 回答を採点中...')
        
        const items = collectAnswers()
        if (items.length === 0) {
            showError('回答を入力してください')
            return
        }
        
        const response = await fetch('/api/score', {
            method: 'POST',
            headers: safeHeaders(),
            body: JSON.stringify({ items })
        })
        
        const data = await response.json()
        lastApiResponse = data
        
        if (!response.ok) {
            throw new Error(data.message || 'リクエストに失敗しました')
        }
        
        if (data.ok) {
            displayScore(data, items)
            showSuccess(`採点完了: ${data.message}`)
        } else {
            throw new Error(data.message || '採点に失敗しました')
        }
        
    } catch (error) {
        handleError(error)
    } finally {
        setLoading(submitBtn, false)
    }
}

// 回答収集
function collectAnswers() {
    const items = []
    
    currentPracticeData.practice.forEach((question, index) => {
        const container = document.querySelector(`.question[data-index="${index}"]`)
        if (!container) return
        
        let userAnswer = null
        
        switch (question.qtype) {
            case 'numeric':
            case 'check':
                const numInput = container.querySelector('input[type="number"]')
                userAnswer = numInput ? Number(numInput.value) : null
                break
                
            case 'choice':
                const radioInput = container.querySelector('input[type="radio"]:checked')
                userAnswer = radioInput ? radioInput.value : null
                break
                
            case 'short':
                const textInput = container.querySelector('input[type="text"]')
                userAnswer = textInput ? textInput.value.trim() : null
                break
        }
        
        if (userAnswer !== null && userAnswer !== '') {
            items.push({
                qtype: question.qtype,
                correct: question.answer,
                user: userAnswer
            })
        }
    })
    
    return items
}

// 表示機能
function displayOutput(message) {
    outputArea.textContent = message
}

function displayJSON(data) {
    outputArea.textContent = JSON.stringify(data, null, 2)
}

function displayPhotoAnalysis(data) {
    let output = `📸 写真解析結果\n\n`
    output += `📋 トピック: ${data.topic}\n\n`
    
    if (data.problem) {
        output += `📝 問題タイトル: ${data.problem.title}\n`
        output += `📊 与えられた条件: ${data.problem.given}\n`
        output += `🎯 レベル: ${data.problem.grade_hint}\n\n`
        
        if (data.problem.questions && data.problem.questions.length > 0) {
            output += `❓ 検出された質問 (${data.problem.questions.length}問):\n`
            data.problem.questions.forEach((q, i) => {
                output += `${i + 1}. [${q.qtype}] ${q.prompt}\n`
            })
            output += '\n'
        }
        
        if (data.problem.notes && data.problem.notes.length > 0) {
            output += `📌 ノート:\n`
            data.problem.notes.forEach((note, i) => {
                output += `• ${note}\n`
            })
        }
    }
    
    output += '\n✅ 解析完了！ExplainまたはPracticeボタンを押して学習を続けてください。'
    
    outputArea.textContent = output
}

function displayExplanation(data) {
    let output = `📚 ${data.topic}\n\n`
    
    if (data.explain_bullets) {
        output += '【概要】\n'
        data.explain_bullets.forEach((bullet, i) => {
            output += `${i + 1}. ${bullet}\n`
        })
        output += '\n'
    }
    
    if (data.steps) {
        output += '【学習ステップ】\n'
        data.steps.forEach((step, i) => {
            output += `Step ${i + 1}: ${step}\n`
        })
        output += '\n'
    }
    
    if (data.example) {
        output += '【例】\n'
        output += `${data.example}\n`
    }
    
    outputArea.textContent = output
}

function displayPracticeQuestions(questions) {
    currentQuestions = questions
    questionContainer.innerHTML = ''
    
    questions.forEach((question, index) => {
        const questionDiv = document.createElement('div')
        questionDiv.className = 'question'
        questionDiv.setAttribute('data-index', index)
        
        let html = `<div class="question-title">問題 ${index + 1}: ${question.prompt}</div>`
        
        switch (question.qtype) {
            case 'numeric':
            case 'check':
                html += `<input type="number" placeholder="数値を入力" style="width: 200px;">`
                break
                
            case 'choice':
                html += '<div class="choices">'
                question.choices.forEach(choice => {
                    html += `
                        <label class="choice">
                            <input type="radio" name="q${index}" value="${choice}">
                            <span>${choice}</span>
                        </label>
                    `
                })
                html += '</div>'
                break
                
            case 'short':
                html += `<input type="text" placeholder="回答を入力" style="width: 300px;">`
                break
        }
        
        questionDiv.innerHTML = html
        questionContainer.appendChild(questionDiv)
    })
    
    practiceArea.style.display = 'block'
    practiceArea.scrollIntoView({ behavior: 'smooth' })
}

function displayScore(data, items) {
    let output = `🎯 採点結果\n\n`
    output += `スコア: ${data.score}/${data.total} (${data.percentage}%)\n\n`
    
    data.results.forEach((correct, index) => {
        const question = currentQuestions[index]
        const item = items[index]
        const icon = correct ? '✅' : '❌'
        
        output += `問題 ${index + 1}: ${icon}\n`
        output += `  質問: ${question.prompt}\n`
        output += `  あなたの回答: ${item.user}\n`
        output += `  正解: ${item.correct}\n\n`
    })
    
    outputArea.textContent = output
}

// JSONデバッグ表示
function toggleJsonDisplay() {
    if (jsonOutput.style.display === 'none') {
        if (lastApiResponse) {
            jsonContent.textContent = JSON.stringify(lastApiResponse, null, 2)
            jsonOutput.style.display = 'block'
            toggleJson.innerHTML = '<i class="fas fa-code"></i> JSONを隠す'
        } else {
            showError('APIレスポンスがありません')
        }
    } else {
        jsonOutput.style.display = 'none'
        toggleJson.innerHTML = '<i class="fas fa-code"></i> JSONを表示'
    }
}

// UI制御
function setLoading(button, loading) {
    button.disabled = loading
    if (loading) {
        button.style.opacity = '0.6'
        const icon = button.querySelector('i')
        if (icon) {
            icon.className = 'fas fa-spinner fa-spin'
        }
    } else {
        button.style.opacity = '1'
        const icon = button.querySelector('i')
        if (icon) {
            // 元のアイコンに戻す
            if (button.id === 'explainBtn') icon.className = 'fas fa-lightbulb'
            if (button.id === 'practiceBtn') icon.className = 'fas fa-dumbbell'
            if (button.id === 'submitBtn') icon.className = 'fas fa-check-circle'
            if (button.id === 'analyzeBtn') icon.className = 'fas fa-search'
        }
    }
}

// メッセージ表示
function showError(message) {
    hideMessage()
    const errorDiv = document.createElement('div')
    errorDiv.className = 'error'
    errorDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`
    
    const container = currentMode === 'text' ? 
        document.querySelector('.topic-section') : 
        document.querySelector('.photo-section')
    container.appendChild(errorDiv)
    
    setTimeout(() => {
        errorDiv.remove()
    }, 5000)
}

function showSuccess(message) {
    hideMessage()
    const successDiv = document.createElement('div')
    successDiv.className = 'success'
    successDiv.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`
    
    const container = currentMode === 'text' ? 
        document.querySelector('.topic-section') : 
        document.querySelector('.photo-section')
    container.appendChild(successDiv)
    
    setTimeout(() => {
        successDiv.remove()
    }, 3000)
}

function hideMessage() {
    const messages = document.querySelectorAll('.error, .success')
    messages.forEach(msg => msg.remove())
}

// エラーハンドリング
function handleError(error) {
    console.error('Error:', error)
    
    if (error.message.includes('APP_KEYが一致しません')) {
        showError('APP_KEYが一致しません。正しいKEYを入力してください。')
        displayOutput('❌ 認証エラー: APP_KEYを確認してください')
    } else if (error.message.includes('学生IDが必要です')) {
        showError('学生IDが入力されていません')
        displayOutput('❌ 学生IDエラー: IDを入力してください')
    } else if (error.message.includes('サーバで問題が発生しました')) {
        showError('サーバーで問題が発生しました。しばらく待ってから再試行してください。')
        displayOutput('❌ サーバーエラー: 時間をおいて再試行してください')
    } else {
        showError('エラーが発生しました: ' + error.message)
        displayOutput('❌ エラー: ' + error.message)
    }
}

// ウェルカムメッセージ
function displayWelcomeMessage() {
    const welcomeMessage = `🤖 KOBEYA Study Partner へようこそ！

AI学習パートナーで効果的に学習しましょう。

📋 使い方:
1. APP_KEY と 学生ID を入力
2. 【テキスト入力】または【写真から】を選択
3. Explain で概念を学ぶ
4. Practice で練習問題に取り組む
5. Submit Answers で回答を提出

📸 写真モードの流れ:
1. 「写真から」タブを選択
2. カメラで問題を撮影またはファイル選択
3. 「解析開始」で問題を読み取り
4. ExplainやPracticeで学習継続

🎯 学習例:
• 数学: 二次方程式, 関数, 確率, 図形
• 理科: 化学反応, 物理現象, 生物
• 英語: 文法, 単語, 読解

準備ができたら学習を始めましょう！`

    outputArea.textContent = welcomeMessage
}