# 🔧 Cloudflare Pages デプロイメント修正チェックリスト

## 📋 実施済みの修正（コードレベル）

- ✅ `.nvmrc` ファイル追加（Node.js 20 指定）
- ✅ `package.json` に `engines` フィールド追加
- ✅ `prebuild` / `postbuild` スクリプト追加（ビルド検証）
- ✅ ローカルビルドテスト成功確認
- ✅ `wrangler.toml` 設定確認（正しく設定済み）

## 🎯 次に実行すべきこと（Cloudflare Dashboard での操作）

### 1. 環境変数の設定 【最優先】

場所: `Cloudflare Dashboard → Pages → kobeyabkk-studypartner → Settings → Environment variables`

#### Production 環境に追加：
```
NODE_VERSION = 20
NPM_FLAGS = --legacy-peer-deps
```

#### Preview 環境に追加：
```
NODE_VERSION = 20
NPM_FLAGS = --legacy-peer-deps
```

#### 既存の環境変数を確認：
- ✅ `OPENAI_API_KEY` が設定されているか確認
- ✅ `GEMINI_API_KEY` は削除済みか確認（もう使用していない）

### 2. ビルド設定の確認

場所: `Settings → Builds & deployments → Build configuration`

以下の値が正しいか確認：

| 設定項目 | 正しい値 |
|---------|---------|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory (path) | `/` (空欄でも可) |

### 3. ビルドログの確認手順

1. `Deployments` タブを開く
2. 失敗したデプロイメント（赤い表示）をクリック
3. `View logs` または `ビルドログを表示` をクリック
4. 以下のエラーメッセージを探す：
   - `Node version` に関するエラー
   - `npm ERR!` メッセージ
   - `Module not found` エラー
   - `dist` ディレクトリに関するメッセージ

### 4. 再デプロイの実行

**方法A: Dashboard から再デプロイ**
```
1. Deployments タブを開く
2. 最新のコミットを見つける
3. "Retry deployment" をクリック
```

**方法B: Git Push で新しいデプロイ**
```bash
# 修正をコミット
git add .
git commit -m "fix: add Node.js version config and build validation"
git push origin main
```

**方法C: Wrangler CLI で直接デプロイ（緊急時）**
```bash
cd /home/user/StudyPartner_Full_Main
npm run build
npx wrangler pages deploy dist --project-name kobeyabkk-studypartner
```

## 🔍 トラブルシューティング

### ケース1: まだデプロイが失敗する場合

1. ビルドログの最後50行をコピー
2. 具体的なエラーメッセージを確認
3. 以下の可能性を調査：
   - D1 データベースバインディングの問題
   - 環境変数の設定漏れ
   - Cloudflare Pages の一時的な障害

### ケース2: "利用可能なデプロイがありません" が続く場合

これは通常、以下のいずれかが原因：
- ビルドプロセスが開始前に失敗している
- プロジェクト名の不一致
- ブランチ設定の問題

確認手順：
```
1. Settings → General で Production branch が "main" になっているか確認
2. プロジェクト名が "kobeyabkk-studypartner" で一致しているか確認
```

### ケース3: D1 データベース関連エラー

D1 バインディングが正しく設定されているか確認：
```bash
npx wrangler d1 info kobeya-logs-db
```

出力に `database_id: b5ac684a-2536-496a-916f-c2c5816a13a0` が含まれているか確認。

## 📊 成功の確認方法

デプロイが成功したら：

1. ✅ Deployments タブで緑色の "Success" 表示
2. ✅ デプロイメントのURLが表示される
3. ✅ ブラウザでアクセスして正常動作を確認
4. ✅ Step 1 で読み物生成が動作するか確認

## 🆘 それでも解決しない場合

以下の情報を収集して共有してください：

1. **ビルドログ全体**（失敗したデプロイメントから）
2. **Cloudflare Pages の設定スクリーンショット**：
   - Build configuration
   - Environment variables
   - Bindings
3. **エラーメッセージの正確なコピー**

---

## 📝 参考：3つのAIからの主な推奨事項

### ChatGPT の推奨
- ✅ NODE_VERSION=20 環境変数の設定
- ✅ NPM_FLAGS=--legacy-peer-deps の設定
- ✅ compatibility_flags = ["nodejs_compat"]（既に設定済み）

### Claude の推奨
- ✅ Build output directory の確認
- ✅ _worker.js の生成確認
- ✅ Vite SSR 設定の検証

### Genspark の推奨
- ✅ .nvmrc ファイルの追加
- ✅ engines フィールドの追加
- ✅ Build validation スクリプト

すべての推奨事項を実装済みです！
