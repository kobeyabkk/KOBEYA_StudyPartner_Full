# 🤖 KOBEYA Study Partner - 完全版

バンコクの日本人向けプログラミング教室「AI & プログラミングのKOBEYA」の生徒専用AI学習パートナー完全版です。

## 🎯 概要

AI技術を活用して中学生の学習をサポートする専用Webアプリケーションです。
- **Explain**: トピックの概念説明
- **Practice**: AI生成の練習問題  
- **Submit**: 自動採点とフィードバック

## 🚀 技術仕様

### フレームワーク
- **Hono** - 軽量高速なWebフレームワーク
- **Cloudflare Pages/Workers** - エッジコンピューティング
- **OpenAI API** (GPT-4o-mini) - AI学習支援
- **TypeScript** - 型安全な開発

### デプロイメント
- **Cloudflare Pages** - 静的サイトホスティング
- **Workers Functions** - サーバーサイドAPI
- **D1 Database** - 学習ログ保存

## 📦 開発

### セットアップ
```bash
npm install
```

### ローカル開発
```bash
npm run dev
```

### ビルド
```bash
npm run build
```

### プレビュー
```bash
npm run preview
```

### デプロイ
```bash
npm run deploy
```

## 🔐 認証システム

### 生徒アクセス方法
1. **APP_KEY**: 在籍生徒専用キー
2. **学生ID**: 個人識別用ID
3. **アクセス**: APIリクエスト時にヘッダーで認証

### セキュリティ機能
- ✅ 不正APP_KEY → 401 Unauthorized
- ✅ 学生ID未入力 → 400 Bad Request  
- ✅ サーバーエラー → 500 Internal Server Error
- ✅ 日本語エラーメッセージ表示

## 🤖 AI学習機能

### API エンドポイント
- `GET /health` - ヘルスチェック（認証不要）
- `GET /api/health` - 認証付きヘルスチェック
- `POST /api/explain` - トピック説明生成
- `POST /api/practice` - 練習問題生成
- `POST /api/score` - 自動採点

## 🌐 本番環境

- **URL**: https://study-partner.pages.dev/
- **マーケサイト連携**: https://kobeya-homepage2025.pages.dev/study-partner → リダイレクト

## 📱 対応環境

- **デスクトップ** (800px+)
- **タブレット** (768px以下)  
- **スマートフォン** (480px以下)

---

**🚀 Powered by OpenAI GPT-4o-mini + Hono + Cloudflare**