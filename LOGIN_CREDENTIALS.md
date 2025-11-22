# 🔑 ログイン情報

## テスト用アカウント

### ローカル開発環境用（全て追加済み）

| APP_KEY | 学生ID | 名前 | 状態 |
|---------|--------|------|------|
| 180418 | test001 | テストユーザー | ✅ 有効 |
| 180418 | komode001 | コモで | ✅ 有効 |
| 180418 | misaki001 | 笛木美咲 | ✅ 有効 |
| 180418 | emiri001 | 相馬えみり | ✅ 有効 |
| 180418 | anonymous | anonymous122 | ✅ 有効 |

### 本番環境用（リモートDB）
以下のアカウントが登録されています：

| APP_KEY | 学生ID | 名前 | 状態 |
|---------|--------|------|------|
| 180418 | anonymous | anonymous122 | ✅ 有効 |
| 180418 | misaki001 | 笛木美咲 | ✅ 有効 |
| 180418 | emiri001 | 相馬えみり | ✅ 有効 |
| 180418 | komode001 | コモで | ✅ 有効 |
| 180418 | JS2-04 | JS2-04 | ❌ 無効 |

---

## 🔧 開発環境セットアップ

### ローカルDB（開発用）

ローカル開発時は、D1データベースが空の状態から始まります。

#### 1. テストユーザーを追加
```bash
cd /home/user/webapp
wrangler d1 execute kobeya-logs-db --local --command "
  INSERT INTO users (app_key, student_id, student_name, grade, is_active, created_at) 
  VALUES ('180418', 'test001', 'テストユーザー', 'JH2', 1, datetime('now'))
"
```

#### 2. ユーザー一覧を確認
```bash
wrangler d1 execute kobeya-logs-db --local --command "
  SELECT app_key, student_id, student_name, is_active 
  FROM users
"
```

### リモートDB（本番用）

本番環境では既にユーザーが登録されています。

#### ユーザー一覧を確認
```bash
wrangler d1 execute kobeya-logs-db --remote --command "
  SELECT app_key, student_id, student_name, is_active 
  FROM users LIMIT 10
"
```

---

## 🚀 開発サーバー起動

### Vite開発サーバー（推奨）
```bash
cd /home/user/webapp
npm run dev
```
- **ポート**: 5173（自動で空いているポートを使用）
- **ローカルD1を使用**: テストユーザーでログイン可能

### Wrangler Pages Dev（本番環境シミュレーション）
```bash
cd /home/user/webapp
npm run build
npm run preview
# または
npm run dev:sandbox
```
- **ポート**: 3000
- **ローカルD1を使用**
- より本番環境に近い動作

---

## 📝 ログイン画面の場所

### メインアプリケーション
- **URL**: `/`
- **ログインフォーム**: トップページに表示

### 管理画面
- **URL**: `/admin`
- **パスワード**: `admin123`（デフォルト）

---

## ❓ よくある問題

### Q1: ログインできない（401エラー）
**原因**: ローカルD1が空
**解決策**: 上記の「テストユーザーを追加」を実行

### Q2: `/@vite/client` エラー
**原因**: 古いHTMLファイルが読み込まれている
**解決策**: 
1. `public/index.html` を削除（または .backup にリネーム）
2. ルートの `index.html` を削除（または .backup にリネーム）
3. ブラウザキャッシュをクリア (`Ctrl + Shift + R`)

### Q3: Database not available
**原因**: D1バインディングが正しく設定されていない
**解決策**: `wrangler.toml` を確認

---

## 🔐 セキュリティ注意事項

### 開発環境のみ
- テストアカウント（`test001`）は開発環境でのみ使用
- 本番環境にデプロイする前に削除

### 本番環境
- `APP_KEY: 180418` は本番環境で実際に使用されている
- このキーは変更しないこと
- 新しいユーザーを追加する際は管理画面から

---

**最終更新**: 2025-11-21
