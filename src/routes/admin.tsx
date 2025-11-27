import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const router = new Hono<{ Bindings: Bindings }>()

// Admin Login Page
router.get('/login', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>管理者ログイン | KOBEYA Study Partner</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Noto Sans JP', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    
    .login-container {
      background: white;
      border-radius: 1rem;
      padding: 3rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 400px;
      width: 100%;
    }
    
    .login-header {
      text-align: center;
      margin-bottom: 2rem;
    }
    
    .login-header h1 {
      font-size: 1.75rem;
      color: #374151;
      margin-bottom: 0.5rem;
    }
    
    .login-header p {
      color: #6b7280;
      font-size: 0.875rem;
    }
    
    .form-group {
      margin-bottom: 1.5rem;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      color: #374151;
      font-weight: 500;
      font-size: 0.875rem;
    }
    
    .form-group input {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 1rem;
      transition: all 0.2s;
    }
    
    .form-group input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    
    .btn-login {
      width: 100%;
      padding: 0.875rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .btn-login:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
    }
    
    .btn-login:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    
    .error-message {
      background: #fee2e2;
      color: #dc2626;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      margin-bottom: 1rem;
      font-size: 0.875rem;
      display: none;
    }
    
    .error-message.show {
      display: block;
    }
    
    .back-link {
      text-align: center;
      margin-top: 1.5rem;
    }
    
    .back-link a {
      color: #667eea;
      text-decoration: none;
      font-size: 0.875rem;
    }
    
    .back-link a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="login-header">
      <h1><i class="fas fa-user-shield"></i> 管理者ログイン</h1>
      <p>生徒管理システムへのアクセス</p>
    </div>
    
    <div class="error-message" id="errorMessage"></div>
    
    <form id="loginForm">
      <div class="form-group">
        <label for="password">
          <i class="fas fa-lock"></i> パスワード
        </label>
        <input 
          type="password" 
          id="password" 
          name="password"
          placeholder="管理者パスワードを入力"
          required
          autocomplete="current-password"
        >
      </div>
      
      <button type="submit" class="btn-login" id="loginBtn">
        <i class="fas fa-sign-in-alt"></i> ログイン
      </button>
    </form>
    
    <div style="text-align: center; margin-top: 1rem;">
      <a href="/admin/reset-password" style="color: #667eea; text-decoration: none; font-size: 0.875rem;">
        <i class="fas fa-key"></i> パスワードを忘れた場合
      </a>
    </div>
    
    <div class="back-link">
      <a href="/"><i class="fas fa-arrow-left"></i> ホームに戻る</a>
    </div>
  </div>
  
  <script>
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const errorMessage = document.getElementById('errorMessage');
    
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const password = document.getElementById('password').value;
      
      loginBtn.disabled = true;
      loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ログイン中...';
      errorMessage.classList.remove('show');
      
      try {
        const response = await fetch('/api/admin/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        
        if (data.success) {
          // セッショントークンを保存
          localStorage.setItem('admin_token', data.token);
          // 管理画面にリダイレクト
          window.location.href = '/admin/users';
        } else {
          errorMessage.textContent = data.error || 'ログインに失敗しました';
          errorMessage.classList.add('show');
        }
      } catch (error) {
        errorMessage.textContent = 'エラーが発生しました。もう一度お試しください。';
        errorMessage.classList.add('show');
      } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> ログイン';
      }
    });
  </script>
</body>
</html>
  `)
})

// Password Reset Request Page
router.get('/reset-password', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>パスワードリセット | KOBEYA Study Partner</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Noto Sans JP', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    
    .reset-container {
      background: white;
      border-radius: 1rem;
      padding: 3rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 450px;
      width: 100%;
    }
    
    .reset-header {
      text-align: center;
      margin-bottom: 2rem;
    }
    
    .reset-header i {
      font-size: 3rem;
      color: #667eea;
      margin-bottom: 1rem;
    }
    
    .reset-header h1 {
      font-size: 1.5rem;
      color: #374151;
      margin-bottom: 0.5rem;
    }
    
    .reset-header p {
      color: #6b7280;
      font-size: 0.875rem;
      line-height: 1.5;
    }
    
    .info-box {
      background: #dbeafe;
      border-left: 4px solid #3b82f6;
      padding: 1rem;
      border-radius: 0.5rem;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
      color: #1e40af;
    }
    
    .form-group {
      margin-bottom: 1.5rem;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      color: #374151;
      font-weight: 500;
      font-size: 0.875rem;
    }
    
    .form-group input {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 1rem;
      transition: all 0.2s;
    }
    
    .form-group input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    
    .btn {
      width: 100%;
      padding: 0.875rem;
      border: none;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
    }
    
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    
    .back-link {
      text-align: center;
      margin-top: 1.5rem;
    }
    
    .back-link a {
      color: #6b7280;
      text-decoration: none;
      font-size: 0.875rem;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      transition: color 0.2s;
    }
    
    .back-link a:hover {
      color: #374151;
    }
    
    .success-message {
      background: #d1fae5;
      border-left: 4px solid #10b981;
      padding: 1rem;
      border-radius: 0.5rem;
      color: #065f46;
      margin-bottom: 1.5rem;
      display: none;
    }
    
    .error-message {
      background: #fee2e2;
      border-left: 4px solid #ef4444;
      padding: 1rem;
      border-radius: 0.5rem;
      color: #991b1b;
      margin-bottom: 1.5rem;
      display: none;
    }
  </style>
</head>
<body>
  <div class="reset-container">
    <div class="reset-header">
      <i class="fas fa-key"></i>
      <h1>パスワードリセット</h1>
      <p>登録されているメールアドレスにリセット用のリンクを送信します</p>
    </div>
    
    <div class="info-box">
      <i class="fas fa-info-circle"></i> 
      リセット用のリンクは <strong>kobeyabkk@gmail.com</strong> に送信されます。<br>
      メールが届かない場合は、迷惑メールフォルダもご確認ください。
    </div>
    
    <div class="success-message" id="successMessage">
      <i class="fas fa-check-circle"></i>
      <strong>送信完了</strong><br>
      パスワードリセット用のリンクをメールで送信しました。メールをご確認ください。
    </div>
    
    <div class="error-message" id="errorMessage"></div>
    
    <form id="resetForm">
      <div class="form-group">
        <label for="email">
          <i class="fas fa-envelope"></i> 確認用メールアドレス
        </label>
        <input 
          type="email" 
          id="email" 
          name="email"
          placeholder="kobeyabkk@gmail.com"
          required
        >
        <small style="color: #6b7280; font-size: 0.75rem; margin-top: 0.25rem; display: block;">
          セキュリティのため、登録メールアドレスを入力してください
        </small>
      </div>
      
      <button type="submit" class="btn btn-primary" id="resetBtn">
        <i class="fas fa-paper-plane"></i> リセットリンクを送信
      </button>
    </form>
    
    <div class="back-link">
      <a href="/admin/login"><i class="fas fa-arrow-left"></i> ログインに戻る</a>
    </div>
  </div>
  
  <script>
    const resetForm = document.getElementById('resetForm');
    const resetBtn = document.getElementById('resetBtn');
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');
    
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('email').value;
      
      // Reset messages
      successMessage.style.display = 'none';
      errorMessage.style.display = 'none';
      
      // Disable button
      resetBtn.disabled = true;
      resetBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 送信中...';
      
      try {
        const response = await fetch('/api/admin/request-password-reset', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          successMessage.style.display = 'block';
          resetForm.style.display = 'none';
        } else {
          throw new Error(data.error || 'リセットリンクの送信に失敗しました');
        }
      } catch (error) {
        errorMessage.textContent = error.message;
        errorMessage.style.display = 'block';
        resetBtn.disabled = false;
        resetBtn.innerHTML = '<i class="fas fa-paper-plane"></i> リセットリンクを送信';
      }
    });
  </script>
</body>
</html>
  `)
})

// Password Reset Confirmation Page
router.get('/reset-password/confirm', (c) => {
  const token = c.req.query('token')
  
  if (!token) {
    return c.redirect('/admin/reset-password')
  }
  
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>新しいパスワードの設定 | KOBEYA Study Partner</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Noto Sans JP', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    
    .reset-container {
      background: white;
      border-radius: 1rem;
      padding: 3rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 450px;
      width: 100%;
    }
    
    .reset-header {
      text-align: center;
      margin-bottom: 2rem;
    }
    
    .reset-header i {
      font-size: 3rem;
      color: #667eea;
      margin-bottom: 1rem;
    }
    
    .reset-header h1 {
      font-size: 1.5rem;
      color: #374151;
      margin-bottom: 0.5rem;
    }
    
    .reset-header p {
      color: #6b7280;
      font-size: 0.875rem;
      line-height: 1.5;
    }
    
    .form-group {
      margin-bottom: 1.5rem;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      color: #374151;
      font-weight: 500;
      font-size: 0.875rem;
    }
    
    .form-group input {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 1rem;
      transition: all 0.2s;
    }
    
    .form-group input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    
    .password-requirements {
      font-size: 0.75rem;
      color: #6b7280;
      margin-top: 0.5rem;
      line-height: 1.5;
    }
    
    .btn {
      width: 100%;
      padding: 0.875rem;
      border: none;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
    }
    
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    
    .success-message {
      background: #d1fae5;
      border-left: 4px solid #10b981;
      padding: 1rem;
      border-radius: 0.5rem;
      color: #065f46;
      margin-bottom: 1.5rem;
      display: none;
    }
    
    .error-message {
      background: #fee2e2;
      border-left: 4px solid #ef4444;
      padding: 1rem;
      border-radius: 0.5rem;
      color: #991b1b;
      margin-bottom: 1.5rem;
      display: none;
    }
    
    .back-link {
      text-align: center;
      margin-top: 1.5rem;
    }
    
    .back-link a {
      color: #6b7280;
      text-decoration: none;
      font-size: 0.875rem;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      transition: color 0.2s;
    }
    
    .back-link a:hover {
      color: #374151;
    }
  </style>
</head>
<body>
  <div class="reset-container">
    <div class="reset-header">
      <i class="fas fa-lock"></i>
      <h1>新しいパスワードの設定</h1>
      <p>新しい管理者パスワードを入力してください</p>
    </div>
    
    <div class="success-message" id="successMessage">
      <i class="fas fa-check-circle"></i>
      <strong>パスワード変更完了</strong><br>
      パスワードが正常に変更されました。新しいパスワードでログインしてください。
    </div>
    
    <div class="error-message" id="errorMessage"></div>
    
    <form id="confirmForm">
      <input type="hidden" id="token" value="${token}">
      
      <div class="form-group">
        <label for="newPassword">
          <i class="fas fa-key"></i> 新しいパスワード
        </label>
        <input 
          type="password" 
          id="newPassword" 
          name="newPassword"
          placeholder="新しいパスワードを入力"
          required
          minlength="8"
        >
        <div class="password-requirements">
          ※ 8文字以上で設定してください
        </div>
      </div>
      
      <div class="form-group">
        <label for="confirmPassword">
          <i class="fas fa-check"></i> パスワード確認
        </label>
        <input 
          type="password" 
          id="confirmPassword" 
          name="confirmPassword"
          placeholder="もう一度入力してください"
          required
          minlength="8"
        >
      </div>
      
      <button type="submit" class="btn btn-primary" id="confirmBtn">
        <i class="fas fa-save"></i> パスワードを変更
      </button>
    </form>
    
    <div class="back-link">
      <a href="/admin/login"><i class="fas fa-arrow-left"></i> ログインに戻る</a>
    </div>
  </div>
  
  <script>
    const confirmForm = document.getElementById('confirmForm');
    const confirmBtn = document.getElementById('confirmBtn');
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');
    
    confirmForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const token = document.getElementById('token').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      
      // Reset messages
      successMessage.style.display = 'none';
      errorMessage.style.display = 'none';
      
      // Validate passwords match
      if (newPassword !== confirmPassword) {
        errorMessage.textContent = 'パスワードが一致しません。もう一度入力してください。';
        errorMessage.style.display = 'block';
        return;
      }
      
      // Validate password length
      if (newPassword.length < 8) {
        errorMessage.textContent = 'パスワードは8文字以上で設定してください。';
        errorMessage.style.display = 'block';
        return;
      }
      
      // Disable button
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 変更中...';
      
      try {
        const response = await fetch('/api/admin/confirm-password-reset', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            token,
            newPassword 
          })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          successMessage.style.display = 'block';
          confirmForm.style.display = 'none';
          
          // Redirect to login after 3 seconds
          setTimeout(() => {
            window.location.href = '/admin/login';
          }, 3000);
        } else {
          throw new Error(data.error || 'パスワードの変更に失敗しました');
        }
      } catch (error) {
        errorMessage.textContent = error.message;
        errorMessage.style.display = 'block';
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="fas fa-save"></i> パスワードを変更';
      }
    });
  </script>
</body>
</html>
  `)
})

// Admin Users List Page
router.get('/users', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>生徒管理 | KOBEYA Study Partner</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet">
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
      color: #374151;
    }
    
    .header {
      background: white;
      border-bottom: 2px solid #e5e7eb;
      padding: 1.5rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    
    .header h1 {
      font-size: 1.5rem;
      color: #374151;
    }
    
    .header-actions {
      display: flex;
      gap: 1rem;
    }
    
    .btn {
      padding: 0.625rem 1.25rem;
      border-radius: 0.5rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      border: none;
      font-size: 0.875rem;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    }
    
    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }
    
    .btn-secondary:hover {
      background: #e5e7eb;
    }
    
    .container {
      max-width: 1200px;
      margin: 2rem auto;
      padding: 0 2rem;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    .stat-card {
      background: white;
      padding: 1.5rem;
      border-radius: 0.75rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    
    .stat-card h3 {
      font-size: 0.875rem;
      color: #6b7280;
      margin-bottom: 0.5rem;
    }
    
    .stat-card .value {
      font-size: 2rem;
      font-weight: 700;
      color: #374151;
    }
    
    .users-card {
      background: white;
      border-radius: 0.75rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    
    .users-header {
      padding: 1.5rem;
      border-bottom: 2px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .users-header h2 {
      font-size: 1.25rem;
      color: #374151;
    }
    
    .search-box {
      padding: 0.625rem 1rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      width: 250px;
    }
    
    .search-box:focus {
      outline: none;
      border-color: #667eea;
    }
    
    .users-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .users-table thead {
      background: #f9fafb;
    }
    
    .users-table th {
      padding: 1rem 1.5rem;
      text-align: left;
      font-size: 0.875rem;
      font-weight: 600;
      color: #6b7280;
    }
    
    .users-table td {
      padding: 1rem 1.5rem;
      border-top: 1px solid #e5e7eb;
      font-size: 0.875rem;
    }
    
    .users-table tr:hover {
      background: #f9fafb;
    }
    
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    
    .badge-active {
      background: #d1fae5;
      color: #065f46;
    }
    
    .badge-inactive {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.75rem;
    }
    
    .btn-group {
      display: flex;
      gap: 0.5rem;
    }
    
    .loading {
      text-align: center;
      padding: 3rem;
      color: #6b7280;
    }
    
    .empty-state {
      text-align: center;
      padding: 3rem;
      color: #6b7280;
    }
    
    /* Filter Tabs */
    .filter-tabs {
      display: flex;
      gap: 0.5rem;
      padding: 1rem 1.5rem;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .filter-tab {
      padding: 0.625rem 1rem;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      color: #6b7280;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
    }
    
    .filter-tab:hover {
      background: #f9fafb;
      border-color: #d1d5db;
    }
    
    .filter-tab.active {
      background: #3b82f6;
      color: white;
      border-color: #3b82f6;
    }
    
    .filter-tab i {
      font-size: 0.875rem;
    }
    
    .filter-badge {
      background: #e5e7eb;
      color: #374151;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-left: 0.25rem;
    }
    
    .filter-tab.active .filter-badge {
      background: rgba(255, 255, 255, 0.2);
      color: white;
    }
    
    .filter-badge-success {
      background: #d1fae5;
      color: #065f46;
    }
    
    .filter-badge-secondary {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    
    .modal.show {
      display: flex;
    }
    
    .modal-content {
      background: white;
      border-radius: 0.75rem;
      padding: 2rem;
      max-width: 500px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
    }
    
    .modal-header {
      margin-bottom: 1.5rem;
    }
    
    .modal-header h3 {
      font-size: 1.25rem;
      color: #374151;
    }
    
    .form-group {
      margin-bottom: 1rem;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      color: #374151;
      font-weight: 500;
      font-size: 0.875rem;
    }
    
    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 0.625rem 0.875rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 0.875rem;
    }
    
    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #667eea;
    }
    
    .modal-footer {
      margin-top: 1.5rem;
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1><i class="fas fa-users"></i> 生徒管理システム</h1>
    <div class="header-actions">
      <button class="btn btn-secondary" onclick="logout()">
        <i class="fas fa-sign-out-alt"></i> ログアウト
      </button>
    </div>
  </div>
  
  <div class="container">
    <div class="stats-grid" id="statsGrid">
      <div class="stat-card">
        <h3>総生徒数</h3>
        <div class="value" id="totalUsers">-</div>
      </div>
      <div class="stat-card">
        <h3>アクティブ</h3>
        <div class="value" id="activeUsers">-</div>
      </div>
      <div class="stat-card">
        <h3>学習セッション</h3>
        <div class="value" id="totalSessions">-</div>
      </div>
    </div>
    
    <div class="users-card">
      <div class="users-header">
        <h2>生徒一覧</h2>
        <div style="display: flex; gap: 1rem; align-items: center;">
          <input type="text" class="search-box" placeholder="検索..." id="searchBox" onkeyup="filterUsers()">
          <button class="btn btn-primary" onclick="showAddUserModal()">
            <i class="fas fa-plus"></i> 新規追加
          </button>
        </div>
      </div>
      
      <!-- Status Filter Tabs -->
      <div class="filter-tabs">
        <button class="filter-tab active" data-filter="all" onclick="setStatusFilter('all')">
          <i class="fas fa-users"></i>
          すべて
          <span class="filter-badge" id="countAll">0</span>
        </button>
        <button class="filter-tab" data-filter="active" onclick="setStatusFilter('active')">
          <i class="fas fa-check-circle"></i>
          アクティブ
          <span class="filter-badge filter-badge-success" id="countActive">0</span>
        </button>
        <button class="filter-tab" data-filter="inactive" onclick="setStatusFilter('inactive')">
          <i class="fas fa-times-circle"></i>
          非アクティブ
          <span class="filter-badge filter-badge-secondary" id="countInactive">0</span>
        </button>
      </div>
      
      <div id="usersTableContainer">
        <div class="loading">
          <i class="fas fa-spinner fa-spin fa-2x"></i>
          <p style="margin-top: 1rem;">読み込み中...</p>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Add/Edit User Modal -->
  <div class="modal" id="userModal">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="modalTitle">新規生徒追加</h3>
      </div>
      
      <form id="userForm">
        <input type="hidden" id="userId">
        
        <div class="form-group">
          <label for="appKey">APP_KEY *</label>
          <input type="text" id="appKey" value="180418" required>
        </div>
        
        <div class="form-group">
          <label for="studentId">学生ID *</label>
          <input type="text" id="studentId" required placeholder="例: JS2-04">
        </div>
        
        <div class="form-group">
          <label for="studentName">氏名 *</label>
          <input type="text" id="studentName" required placeholder="例: 山田太郎">
        </div>
        
        <div class="form-group">
          <label for="grade">学年</label>
          <input type="text" id="grade" placeholder="例: 中学2年">
        </div>
        
        <div class="form-group">
          <label for="email">メールアドレス</label>
          <input type="email" id="email" placeholder="例: example@email.com">
        </div>
        
        <div class="form-group">
          <label for="notes">メモ</label>
          <textarea id="notes" rows="3" placeholder="備考やメモを入力"></textarea>
        </div>
        
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeUserModal()">キャンセル</button>
          <button type="submit" class="btn btn-primary" id="saveUserBtn">保存</button>
        </div>
      </form>
    </div>
  </div>
  
  <script>
    let allUsers = [];
    let currentStatusFilter = 'all';
    
    // Check authentication
    const token = localStorage.getItem('admin_token');
    if (!token) {
      window.location.href = '/admin/login';
    }
    
    // Load users on page load
    loadUsers();
    
    async function loadUsers() {
      try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();
        
        if (data.success) {
          allUsers = data.users;
          renderUsers(allUsers);
          updateStats(allUsers);
        } else {
          document.getElementById('usersTableContainer').innerHTML = 
            '<div class="empty-state">エラーが発生しました</div>';
        }
      } catch (error) {
        console.error('Load users error:', error);
        document.getElementById('usersTableContainer').innerHTML = 
          '<div class="empty-state">データの読み込みに失敗しました</div>';
      }
    }
    
    function renderUsers(users) {
      if (users.length === 0) {
        document.getElementById('usersTableContainer').innerHTML = 
          '<div class="empty-state"><p>生徒が登録されていません</p><p style="margin-top: 0.5rem; font-size: 0.875rem;">「新規追加」ボタンから生徒を追加してください</p></div>';
        return;
      }
      
      const html = \`
        <table class="users-table">
          <thead>
            <tr>
              <th>学生ID</th>
              <th>氏名</th>
              <th>学年</th>
              <th>状態</th>
              <th>登録日</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            \${users.map(user => \`
              <tr>
                <td><strong>\${user.student_id}</strong></td>
                <td>\${user.student_name}</td>
                <td>\${user.grade || '-'}</td>
                <td>
                  <span class="badge \${user.is_active ? 'badge-active' : 'badge-inactive'}">
                    \${user.is_active ? 'アクティブ' : '無効'}
                  </span>
                </td>
                <td>\${new Date(user.created_at).toLocaleDateString('ja-JP')}</td>
                <td>
                  <div class="btn-group">
                    <button class="btn btn-secondary btn-sm" onclick="viewUser(\${user.id})">
                      <i class="fas fa-eye"></i> 詳細
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="editUser(\${user.id})">
                      <i class="fas fa-edit"></i> 編集
                    </button>
                  </div>
                </td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      \`;
      
      document.getElementById('usersTableContainer').innerHTML = html;
    }
    
    function updateStats(users) {
      const activeCount = users.filter(u => u.is_active).length;
      const inactiveCount = users.filter(u => !u.is_active).length;
      
      document.getElementById('totalUsers').textContent = users.length;
      document.getElementById('activeUsers').textContent = activeCount;
      document.getElementById('totalSessions').textContent = '-';
      
      // Update filter count badges
      document.getElementById('countAll').textContent = users.length;
      document.getElementById('countActive').textContent = activeCount;
      document.getElementById('countInactive').textContent = inactiveCount;
    }
    
    function filterUsers() {
      const searchTerm = document.getElementById('searchBox').value.toLowerCase();
      let filtered = allUsers;
      
      // Apply status filter
      if (currentStatusFilter === 'active') {
        filtered = filtered.filter(user => user.is_active === 1);
      } else if (currentStatusFilter === 'inactive') {
        filtered = filtered.filter(user => user.is_active === 0);
      }
      
      // Apply search filter
      if (searchTerm) {
        filtered = filtered.filter(user => 
          user.student_id.toLowerCase().includes(searchTerm) ||
          user.student_name.toLowerCase().includes(searchTerm) ||
          (user.grade && user.grade.toLowerCase().includes(searchTerm))
        );
      }
      
      renderUsers(filtered);
    }
    
    function setStatusFilter(filter) {
      currentStatusFilter = filter;
      
      // Update active tab
      document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.remove('active');
      });
      document.querySelector(\`[data-filter="\${filter}"]\`).classList.add('active');
      
      // Apply filter
      filterUsers();
    }
    
    function showAddUserModal() {
      document.getElementById('modalTitle').textContent = '新規生徒追加';
      document.getElementById('userForm').reset();
      document.getElementById('userId').value = '';
      document.getElementById('appKey').value = '180418';
      document.getElementById('studentId').disabled = false;
      document.getElementById('userModal').classList.add('show');
    }
    
    function editUser(userId) {
      const user = allUsers.find(u => u.id === userId);
      if (!user) return;
      
      document.getElementById('modalTitle').textContent = '生徒情報編集';
      document.getElementById('userId').value = user.id;
      document.getElementById('appKey').value = user.app_key;
      document.getElementById('studentId').value = user.student_id;
      document.getElementById('studentId').disabled = true;
      document.getElementById('studentName').value = user.student_name;
      document.getElementById('grade').value = user.grade || '';
      document.getElementById('email').value = user.email || '';
      document.getElementById('notes').value = user.notes || '';
      document.getElementById('userModal').classList.add('show');
    }
    
    function closeUserModal() {
      document.getElementById('userModal').classList.remove('show');
    }
    
    function viewUser(userId) {
      window.location.href = \`/admin/users/\${userId}\`;
    }
    
    document.getElementById('userForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const userId = document.getElementById('userId').value;
      const isEdit = userId !== '';
      
      const userData = {
        app_key: document.getElementById('appKey').value,
        student_id: document.getElementById('studentId').value,
        student_name: document.getElementById('studentName').value,
        grade: document.getElementById('grade').value,
        email: document.getElementById('email').value,
        notes: document.getElementById('notes').value,
        is_active: 1
      };
      
      const saveBtn = document.getElementById('saveUserBtn');
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中...';
      
      try {
        const url = isEdit ? \`/api/admin/users/\${userId}\` : '/api/admin/users';
        const method = isEdit ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userData)
        });
        
        const data = await response.json();
        
        if (data.success) {
          alert(data.message);
          closeUserModal();
          loadUsers();
        } else {
          alert('エラー: ' + data.error);
        }
      } catch (error) {
        alert('保存に失敗しました');
        console.error(error);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
      }
    });
    
    function logout() {
      if (confirm('ログアウトしますか？')) {
        localStorage.removeItem('admin_token');
        window.location.href = '/admin/login';
      }
    }
  </script>
</body>
</html>
  `)
})

// Admin User Detail Page
router.get('/users/:id', (c) => {
  const userId = c.req.param('id')
  
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>生徒詳細 | KOBEYA Study Partner</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f5f5;
      color: #37352f;
      min-height: 100vh;
    }
    
    .header {
      background: white;
      border-bottom: 2px solid #e5e7eb;
      padding: 1.5rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.04);
    }
    
    .header-left {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    
    .back-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      color: #374151;
      text-decoration: none;
      font-size: 0.9rem;
      transition: all 0.2s;
    }
    
    .back-btn:hover {
      background: #e5e7eb;
      transform: translateX(-2px);
    }
    
    .header h1 {
      font-size: 1.5rem;
      font-weight: 600;
      color: #1f2937;
    }
    
    .header-right {
      display: flex;
      gap: 0.75rem;
    }
    
    .btn {
      padding: 0.6rem 1.2rem;
      border-radius: 8px;
      border: none;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .btn-edit {
      background: #3b82f6;
      color: white;
    }
    
    .btn-edit:hover {
      background: #2563eb;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }
    
    .btn-logout {
      background: #6b7280;
      color: white;
    }
    
    .btn-logout:hover {
      background: #4b5563;
    }
    
    .container {
      max-width: 1200px;
      margin: 2rem auto;
      padding: 0 2rem;
    }
    
    .user-info-card {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      margin-bottom: 2rem;
    }
    
    .user-header {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .user-avatar {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      color: white;
      font-weight: 600;
    }
    
    .user-name-section h2 {
      font-size: 1.75rem;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 0.25rem;
    }
    
    .user-id {
      font-size: 0.95rem;
      color: #6b7280;
    }
    
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 1rem;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 500;
      margin-left: auto;
    }
    
    .badge-active {
      background: #d1fae5;
      color: #065f46;
    }
    
    .badge-inactive {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
    }
    
    .info-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    
    .info-label {
      font-size: 0.85rem;
      color: #6b7280;
      font-weight: 500;
    }
    
    .info-value {
      font-size: 1rem;
      color: #1f2937;
      font-weight: 500;
    }
    
    .info-value.empty {
      color: #9ca3af;
      font-style: italic;
    }
    
    .stats-section {
      margin-bottom: 2rem;
    }
    
    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    .stat-card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      transition: transform 0.2s;
    }
    
    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    }
    
    .stat-icon {
      width: 48px;
      height: 48px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }
    
    .stat-icon.blue { background: #dbeafe; color: #1e40af; }
    .stat-icon.green { background: #d1fae5; color: #065f46; }
    .stat-icon.yellow { background: #fef3c7; color: #92400e; }
    .stat-icon.purple { background: #ede9fe; color: #5b21b6; }
    
    .stat-label {
      font-size: 0.85rem;
      color: #6b7280;
      margin-bottom: 0.5rem;
    }
    
    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: #1f2937;
    }
    
    .history-card {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      margin-bottom: 1rem;
    }
    
    .history-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }
    
    .history-table thead {
      background: #f9fafb;
    }
    
    .history-table th {
      text-align: left;
      padding: 1rem;
      font-size: 0.85rem;
      font-weight: 600;
      color: #6b7280;
      border-bottom: 2px solid #e5e7eb;
    }
    
    .history-table td {
      padding: 1rem;
      border-bottom: 1px solid #f3f4f6;
      color: #374151;
    }
    
    .history-table tbody tr:hover {
      background: #f9fafb;
    }
    
    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      color: #9ca3af;
    }
    
    .empty-state i {
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }
    
    .loading {
      text-align: center;
      padding: 3rem;
      color: #6b7280;
    }
    
    .spinner {
      border: 3px solid #f3f4f6;
      border-top: 3px solid #3b82f6;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .error-message {
      background: #fee2e2;
      color: #991b1b;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    
    /* Modal Styles (reuse from list page) */
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    
    .modal.active {
      display: flex;
    }
    
    .modal-content {
      background: white;
      border-radius: 16px;
      padding: 2rem;
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    
    .modal h3 {
      font-size: 1.5rem;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 1.5rem;
    }
    
    .form-group {
      margin-bottom: 1.5rem;
    }
    
    .form-group label {
      display: block;
      font-size: 0.9rem;
      font-weight: 500;
      color: #374151;
      margin-bottom: 0.5rem;
    }
    
    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 0.95rem;
      transition: all 0.2s;
    }
    
    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
    
    .form-group input:disabled {
      background: #f3f4f6;
      color: #9ca3af;
      cursor: not-allowed;
    }
    
    .form-actions {
      display: flex;
      gap: 1rem;
      justify-content: flex-end;
      margin-top: 2rem;
    }
    
    .btn-cancel {
      background: #e5e7eb;
      color: #374151;
    }
    
    .btn-cancel:hover {
      background: #d1d5db;
    }
    
    .btn-save {
      background: #3b82f6;
      color: white;
    }
    
    .btn-save:hover {
      background: #2563eb;
    }
    
    /* History Tabs */
    .history-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      border-bottom: 2px solid #e5e7eb;
    }
    
    .history-tab {
      padding: 0.75rem 1.5rem;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: #6b7280;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 500;
      transition: all 0.2s;
      margin-bottom: -2px;
    }
    
    .history-tab:hover {
      color: #374151;
      background: #f9fafb;
    }
    
    .history-tab.active {
      color: #3b82f6;
      border-bottom-color: #3b82f6;
    }
    
    .history-tab i {
      margin-right: 0.5rem;
    }
    
    /* History Table */
    .history-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .history-table th {
      background: #f9fafb;
      padding: 0.75rem 1rem;
      text-align: left;
      font-weight: 600;
      color: #374151;
      border-bottom: 2px solid #e5e7eb;
      font-size: 0.875rem;
    }
    
    .history-table td {
      padding: 1rem;
      border-bottom: 1px solid #e5e7eb;
      color: #4b5563;
      font-size: 0.875rem;
    }
    
    .history-table tr:hover {
      background: #f9fafb;
    }
    
    .history-table .date-cell {
      color: #6b7280;
      font-size: 0.8125rem;
    }
    
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    
    .badge-success {
      background: #d1fae5;
      color: #065f46;
    }
    
    .badge-warning {
      background: #fef3c7;
      color: #92400e;
    }
    
    .badge-info {
      background: #dbeafe;
      color: #1e40af;
    }
    
    .badge-secondary {
      background: #f3f4f6;
      color: #4b5563;
    }
    
    .empty-state {
      text-align: center;
      padding: 3rem;
      color: #9ca3af;
    }
    
    .empty-state i {
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <a href="/admin/users" class="back-btn">
        <i class="fas fa-arrow-left"></i>
        戻る
      </a>
      <h1>生徒詳細</h1>
    </div>
    <div class="header-right">
      <button class="btn btn-edit" onclick="showEditModal()">
        <i class="fas fa-edit"></i>
        編集
      </button>
      <button class="btn btn-logout" onclick="logout()">
        <i class="fas fa-sign-out-alt"></i>
        ログアウト
      </button>
    </div>
  </div>

  <div class="container">
    <div id="loadingState" class="loading">
      <div class="spinner"></div>
      <div>読み込み中...</div>
    </div>

    <div id="errorState" style="display: none;"></div>

    <div id="contentState" style="display: none;">
      <!-- User Info Card -->
      <div class="user-info-card">
        <div class="user-header">
          <div class="user-avatar" id="userAvatar">?</div>
          <div class="user-name-section">
            <h2 id="userName">-</h2>
            <div class="user-id">学生ID: <span id="userStudentId">-</span></div>
          </div>
          <span id="userStatus" class="status-badge badge-active">
            <i class="fas fa-check-circle"></i>
            有効
          </span>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">APP_KEY</span>
            <span class="info-value" id="userAppKey">-</span>
          </div>
          <div class="info-item">
            <span class="info-label">学年</span>
            <span class="info-value" id="userGrade">-</span>
          </div>
          <div class="info-item">
            <span class="info-label">メールアドレス</span>
            <span class="info-value" id="userEmail">-</span>
          </div>
          <div class="info-item">
            <span class="info-label">登録日</span>
            <span class="info-value" id="userCreatedAt">-</span>
          </div>
          <div class="info-item">
            <span class="info-label">最終ログイン</span>
            <span class="info-value" id="userLastLogin">-</span>
          </div>
          <div class="info-item" style="grid-column: 1 / -1;">
            <span class="info-label">メモ</span>
            <span class="info-value" id="userNotes">-</span>
          </div>
        </div>
      </div>

      <!-- Stats Section -->
      <div class="stats-section">
        <h3 class="section-title">
          <i class="fas fa-chart-line"></i>
          学習統計
        </h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon blue">
              <i class="fas fa-folder"></i>
            </div>
            <div class="stat-label">フラッシュカードデッキ</div>
            <div class="stat-value" id="statDecks">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green">
              <i class="fas fa-pen-fancy"></i>
            </div>
            <div class="stat-label">エッセイ提出</div>
            <div class="stat-value" id="statEssays">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon yellow">
              <i class="fas fa-layer-group"></i>
            </div>
            <div class="stat-label">フラッシュカード</div>
            <div class="stat-value" id="statFlashcards">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon purple">
              <i class="fas fa-globe"></i>
            </div>
            <div class="stat-label">国際交流</div>
            <div class="stat-value" id="statConversations">0</div>
          </div>
        </div>
      </div>

      <!-- Learning History -->
      <div class="history-card">
        <h3 class="section-title">
          <i class="fas fa-history"></i>
          学習履歴詳細
        </h3>
        
        <!-- History Tabs -->
        <div class="history-tabs">
          <button class="history-tab active" onclick="switchHistoryTab('essay')">
            <i class="fas fa-pen-fancy"></i>
            小論文セッション
          </button>
          <button class="history-tab" onclick="switchHistoryTab('flashcard')">
            <i class="fas fa-layer-group"></i>
            フラッシュカード
          </button>
          <button class="history-tab" onclick="switchHistoryTab('international')">
            <i class="fas fa-globe"></i>
            国際コミュニケーション
          </button>
        </div>
        
        <!-- History Content -->
        <div id="historyContent">
          <div class="loading">
            <div class="spinner"></div>
            <div>履歴を読み込み中...</div>
          </div>
        </div>
        
        <!-- Pagination -->
        <div id="historyPagination" style="display: none; margin-top: 1.5rem; text-align: center;">
          <button class="btn" onclick="loadPreviousPage()" id="btnPrevPage" disabled>
            <i class="fas fa-chevron-left"></i>
            前へ
          </button>
          <span id="pageInfo" style="margin: 0 1rem; color: #6b7280;">-</span>
          <button class="btn" onclick="loadNextPage()" id="btnNextPage" disabled>
            次へ
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Edit Modal -->
  <div class="modal" id="editModal">
    <div class="modal-content">
      <h3>生徒情報編集</h3>
      <form id="editForm">
        <input type="hidden" id="editUserId" value="${userId}">
        
        <div class="form-group">
          <label>APP_KEY</label>
          <input type="text" id="editAppKey" disabled>
        </div>
        
        <div class="form-group">
          <label>学生ID</label>
          <input type="text" id="editStudentId" disabled>
        </div>
        
        <div class="form-group">
          <label>氏名 *</label>
          <input type="text" id="editStudentName" required>
        </div>
        
        <div class="form-group">
          <label>学年</label>
          <input type="text" id="editGrade" placeholder="例: 中学3年">
        </div>
        
        <div class="form-group">
          <label>メールアドレス</label>
          <input type="email" id="editEmail" placeholder="example@email.com">
        </div>
        
        <div class="form-group">
          <label>メモ</label>
          <textarea id="editNotes" rows="3" placeholder="生徒に関するメモ"></textarea>
        </div>
        
        <div class="form-group">
          <label>
            <input type="checkbox" id="editIsActive" style="width: auto; margin-right: 0.5rem;">
            有効な生徒
          </label>
        </div>
        
        <div class="form-actions">
          <button type="button" class="btn btn-cancel" onclick="closeEditModal()">
            キャンセル
          </button>
          <button type="submit" class="btn btn-save">
            <i class="fas fa-save"></i>
            保存
          </button>
        </div>
      </form>
    </div>
  </div>

  <script>
    const userId = '${userId}';
    let currentUser = null;

    // Check authentication
    const token = localStorage.getItem('admin_token');
    if (!token) {
      window.location.href = '/admin/login';
    }

    // Load user data
    async function loadUserData() {
      try {
        const response = await fetch(\`/api/admin/users/\${userId}\`);
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || '生徒データの取得に失敗しました');
        }

        currentUser = data.user;
        const stats = data.stats || {};

        // Hide loading, show content
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('contentState').style.display = 'block';

        // Update user info
        const initials = currentUser.student_name 
          ? currentUser.student_name.substring(0, 1).toUpperCase()
          : '?';
        document.getElementById('userAvatar').textContent = initials;
        document.getElementById('userName').textContent = currentUser.student_name || '名前未設定';
        document.getElementById('userStudentId').textContent = currentUser.student_id || '-';
        document.getElementById('userAppKey').textContent = currentUser.app_key || '-';
        document.getElementById('userGrade').textContent = currentUser.grade || '-';
        
        const emailEl = document.getElementById('userEmail');
        if (currentUser.email) {
          emailEl.textContent = currentUser.email;
          emailEl.classList.remove('empty');
        } else {
          emailEl.textContent = '未設定';
          emailEl.classList.add('empty');
        }
        
        const notesEl = document.getElementById('userNotes');
        if (currentUser.notes) {
          notesEl.textContent = currentUser.notes;
          notesEl.classList.remove('empty');
        } else {
          notesEl.textContent = 'メモなし';
          notesEl.classList.add('empty');
        }

        // Format dates
        const createdDate = currentUser.created_at 
          ? new Date(currentUser.created_at).toLocaleDateString('ja-JP')
          : '-';
        document.getElementById('userCreatedAt').textContent = createdDate;

        const lastLoginEl = document.getElementById('userLastLogin');
        if (currentUser.last_login_at) {
          lastLoginEl.textContent = new Date(currentUser.last_login_at).toLocaleDateString('ja-JP');
          lastLoginEl.classList.remove('empty');
        } else {
          lastLoginEl.textContent = 'ログイン履歴なし';
          lastLoginEl.classList.add('empty');
        }

        // Update status badge
        const statusEl = document.getElementById('userStatus');
        if (currentUser.is_active) {
          statusEl.className = 'status-badge badge-active';
          statusEl.innerHTML = '<i class="fas fa-check-circle"></i> 有効';
        } else {
          statusEl.className = 'status-badge badge-inactive';
          statusEl.innerHTML = '<i class="fas fa-times-circle"></i> 無効';
        }

        // Update stats
        document.getElementById('statDecks').textContent = stats.flashcard_decks || 0;
        document.getElementById('statEssays').textContent = stats.essay_sessions || 0;
        document.getElementById('statFlashcards').textContent = stats.flashcards || 0;
        document.getElementById('statConversations').textContent = stats.conversations || 0;

        // Load learning history
        loadLearningHistory();

      } catch (error) {
        console.error('Error loading user:', error);
        document.getElementById('loadingState').style.display = 'none';
        const errorDiv = document.getElementById('errorState');
        errorDiv.innerHTML = \`
          <div class="error-message">
            <i class="fas fa-exclamation-circle"></i>
            <span>\${error.message}</span>
          </div>
        \`;
        errorDiv.style.display = 'block';
      }
    }

    // History state
    let currentHistoryType = 'essay';
    let currentHistoryPage = 0;
    const historyPageSize = 20;
    
    // Load learning history with tabs and pagination
    async function loadLearningHistory(type = 'essay', offset = 0) {
      currentHistoryType = type;
      currentHistoryPage = offset / historyPageSize;
      
      const historyDiv = document.getElementById('historyContent');
      historyDiv.innerHTML = '<div class="loading"><div class="spinner"></div><div>読み込み中...</div></div>';
      
      try {
        const response = await fetch(\`/api/admin/users/\${userId}/history?type=\${type}&limit=\${historyPageSize}&offset=\${offset}\`);
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || '履歴の取得に失敗しました');
        }
        
        // Display history based on type
        if (data.data.length === 0) {
          historyDiv.innerHTML = \`
            <div class="empty-state">
              <i class="fas fa-inbox"></i>
              <p>まだ学習履歴がありません</p>
            </div>
          \`;
          document.getElementById('historyPagination').style.display = 'none';
          return;
        }
        
        let tableHTML = '';
        
        if (type === 'essay') {
          tableHTML = renderEssayHistory(data.data);
        } else if (type === 'flashcard') {
          tableHTML = renderFlashcardHistory(data.data);
        } else if (type === 'international') {
          tableHTML = renderInternationalHistory(data.data);
        }
        
        historyDiv.innerHTML = tableHTML;
        
        // Update pagination
        updatePagination(data);
        
      } catch (error) {
        console.error('Error loading history:', error);
        historyDiv.innerHTML = \`
          <div class="error-message">
            <i class="fas fa-exclamation-circle"></i>
            <span>\${error.message}</span>
          </div>
        \`;
      }
    }
    
    // Render essay history table
    function renderEssayHistory(sessions) {
      let html = '<table class="history-table"><thead><tr>';
      html += '<th>日付</th>';
      html += '<th>テーマ</th>';
      html += '<th>対象レベル</th>';
      html += '<th>授業形式</th>';
      html += '<th>ステップ</th>';
      html += '<th>ステータス</th>';
      html += '</tr></thead><tbody>';
      
      sessions.forEach(session => {
        const date = new Date(session.created_at).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        const targetLevelMap = {
          'high_school': '高校',
          'vocational': '専門学校',
          'university': '大学'
        };
        
        const lessonFormatMap = {
          'full_55min': '55分フル',
          'vocabulary_focus': '語彙重点',
          'short_essay_focus': '短文重点'
        };
        
        const statusBadge = session.is_completed 
          ? '<span class="badge badge-success">完了</span>'
          : '<span class="badge badge-warning">進行中</span>';
        
        html += '<tr>';
        html += \`<td class="date-cell">\${date}</td>\`;
        html += \`<td>\${session.theme || '-'}</td>\`;
        html += \`<td>\${targetLevelMap[session.target_level] || session.target_level || '-'}</td>\`;
        html += \`<td>\${lessonFormatMap[session.lesson_format] || session.lesson_format || '-'}</td>\`;
        html += \`<td>ステップ \${session.current_step || 1} / 6</td>\`;
        html += \`<td>\${statusBadge}</td>\`;
        html += '</tr>';
      });
      
      html += '</tbody></table>';
      return html;
    }
    
    // Render flashcard history table
    function renderFlashcardHistory(decks) {
      let html = '<table class="history-table"><thead><tr>';
      html += '<th>作成日</th>';
      html += '<th>デッキ名</th>';
      html += '<th>説明</th>';
      html += '<th>カード数</th>';
      html += '<th>学習回数</th>';
      html += '<th>最終学習日</th>';
      html += '</tr></thead><tbody>';
      
      decks.forEach(deck => {
        const createdDate = new Date(deck.created_at).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        
        const lastStudiedDate = deck.last_studied_at 
          ? new Date(deck.last_studied_at).toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            })
          : '未学習';
        
        html += '<tr>';
        html += \`<td class="date-cell">\${createdDate}</td>\`;
        html += \`<td><strong>\${deck.deck_name || '名前なし'}</strong></td>\`;
        html += \`<td>\${deck.description || '-'}</td>\`;
        html += \`<td>\${deck.card_count || 0} 枚</td>\`;
        html += \`<td>\${deck.study_count || 0} 回</td>\`;
        html += \`<td class="date-cell">\${lastStudiedDate}</td>\`;
        html += '</tr>';
      });
      
      html += '</tbody></table>';
      return html;
    }
    
    // Render international communication history table
    function renderInternationalHistory(conversations) {
      let html = '<table class="history-table"><thead><tr>';
      html += '<th>日時</th>';
      html += '<th>トピック</th>';
      html += '<th>ステータス</th>';
      html += '<th>役割</th>';
      html += '<th>画像</th>';
      html += '<th>メッセージ内容</th>';
      html += '</tr></thead><tbody>';
      
      conversations.forEach(conv => {
        const date = new Date(conv.timestamp).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        const roleBadge = conv.role === 'user'
          ? '<span class="badge badge-info">生徒</span>'
          : '<span class="badge badge-secondary">AI</span>';
        
        const statusBadge = conv.status === 'completed'
          ? '<span class="badge badge-success">完了</span>'
          : '<span class="badge badge-warning">進行中</span>';
        
        const hasImageBadge = conv.has_image 
          ? '<i class="fas fa-image" style="color: #3b82f6;"></i>'
          : '-';
        
        const contentPreview = conv.content 
          ? (conv.content.length > 50 ? conv.content.substring(0, 50) + '...' : conv.content)
          : '-';
        
        html += '<tr>';
        html += \`<td class="date-cell">\${date}</td>\`;
        html += \`<td>\${conv.current_topic || '-'}</td>\`;
        html += \`<td>\${statusBadge}</td>\`;
        html += \`<td>\${roleBadge}</td>\`;
        html += \`<td style="text-align: center;">\${hasImageBadge}</td>\`;
        html += \`<td>\${contentPreview}</td>\`;
        html += '</tr>';
      });
      
      html += '</tbody></table>';
      return html;
    }
    
    // Update pagination controls
    function updatePagination(data) {
      const paginationDiv = document.getElementById('historyPagination');
      const btnPrev = document.getElementById('btnPrevPage');
      const btnNext = document.getElementById('btnNextPage');
      const pageInfo = document.getElementById('pageInfo');
      
      const currentPage = Math.floor(data.offset / data.limit) + 1;
      const totalPages = Math.ceil(data.total / data.limit);
      
      pageInfo.textContent = \`\${currentPage} / \${totalPages} ページ (全 \${data.total} 件)\`;
      
      btnPrev.disabled = data.offset === 0;
      btnNext.disabled = !data.hasMore;
      
      paginationDiv.style.display = totalPages > 1 ? 'block' : 'none';
    }
    
    // Switch history tab
    function switchHistoryTab(type) {
      // Update active tab
      document.querySelectorAll('.history-tab').forEach(tab => {
        tab.classList.remove('active');
      });
      event.target.closest('.history-tab').classList.add('active');
      
      // Load history for selected type
      loadLearningHistory(type, 0);
    }
    
    // Pagination functions
    function loadNextPage() {
      const nextOffset = (currentHistoryPage + 1) * historyPageSize;
      loadLearningHistory(currentHistoryType, nextOffset);
    }
    
    function loadPreviousPage() {
      const prevOffset = Math.max(0, (currentHistoryPage - 1) * historyPageSize);
      loadLearningHistory(currentHistoryType, prevOffset);
    }

    // Show edit modal
    function showEditModal() {
      if (!currentUser) return;

      document.getElementById('editUserId').value = currentUser.id;
      document.getElementById('editAppKey').value = currentUser.app_key || '';
      document.getElementById('editStudentId').value = currentUser.student_id || '';
      document.getElementById('editStudentName').value = currentUser.student_name || '';
      document.getElementById('editGrade').value = currentUser.grade || '';
      document.getElementById('editEmail').value = currentUser.email || '';
      document.getElementById('editNotes').value = currentUser.notes || '';
      document.getElementById('editIsActive').checked = currentUser.is_active;

      document.getElementById('editModal').classList.add('active');
    }

    // Close edit modal
    function closeEditModal() {
      document.getElementById('editModal').classList.remove('active');
    }

    // Handle edit form submission
    document.getElementById('editForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = {
        student_name: document.getElementById('editStudentName').value.trim(),
        grade: document.getElementById('editGrade').value.trim(),
        email: document.getElementById('editEmail').value.trim(),
        notes: document.getElementById('editNotes').value.trim(),
        is_active: document.getElementById('editIsActive').checked ? 1 : 0
      };

      try {
        const response = await fetch(\`/api/admin/users/\${userId}\`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || '更新に失敗しました');
        }

        alert('生徒情報を更新しました');
        closeEditModal();
        
        // Reload user data
        document.getElementById('contentState').style.display = 'none';
        document.getElementById('loadingState').style.display = 'block';
        await loadUserData();

      } catch (error) {
        console.error('Error updating user:', error);
        alert(\`エラー: \${error.message}\`);
      }
    });

    // Logout function
    function logout() {
      if (confirm('ログアウトしますか?')) {
        localStorage.removeItem('admin_token');
        window.location.href = '/admin/login';
      }
    }

    // Close modal on outside click
    document.getElementById('editModal').addEventListener('click', (e) => {
      if (e.target.id === 'editModal') {
        closeEditModal();
      }
    });

    // Load data on page load
    loadUserData();
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


// Flashcard routes moved to src/routes/flashcard.tsx

// Study Partner Simple - ログイン修正版

export default router
