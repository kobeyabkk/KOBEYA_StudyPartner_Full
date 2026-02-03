# パブリックリポジトリ化チェックリスト

## ✅ 完了した項目

### 🔒 セキュリティ修正

- [x] **管理者メールアドレスの環境変数化**
  - `src/api/routes/admin.ts` の修正完了
  - `kobeyabkk@gmail.com` をハードコードから削除
  - `c.env.ADMIN_EMAIL` から取得するように変更

- [x] **開発用シークレットの削除**
  - `wrangler.toml` から `WEBHOOK_SECRET` を削除
  - wrangler secretでの設定方法を明記

- [x] **環境変数の文書化**
  - `.env.example` に `ADMIN_EMAIL` を追加
  - すべての必須環境変数を明記

- [x] **セキュリティポリシーの作成**
  - `SECURITY.md` ファイルの作成
  - 脆弱性報告の手順を明記
  - セキュリティベストプラクティスを文書化

- [x] **README更新**
  - 英語版READMEにセキュリティセクション追加
  - 日本語版READMEにセキュリティセクション追加
  - デプロイ手順に環境変数設定を追加

### 📝 ドキュメント整備

- [x] **プロフェッショナルな英語README**
  - GitHub国際標準に準拠
  - バッジ、ライブデモリンク
  - 明確なセクション構成

- [x] **日本語ドキュメント保持**
  - `README.ja.md` に完全な日本語ドキュメント
  - 相互リンク設定

- [x] **ライセンスファイル**
  - MIT License設定
  - 著作権表示

### 🔍 セキュリティ監査

- [x] ハードコードされたAPIキーなし
- [x] 機密ファイルのコミット履歴なし
- [x] `.gitignore` 適切に設定
- [x] 個人情報の露出なし
- [x] データベースID（公開しても安全）

### 📤 Git管理

- [x] すべての変更をコミット
- [x] GitHubにプッシュ完了
- [x] コミットメッセージ適切

---

## ⚠️ パブリック化前に必要なアクション

### 🔧 Cloudflare Pages設定

パブリック化する前に、Cloudflare Pagesで以下の環境変数を設定してください：

#### 方法1: Cloudflare Pagesダッシュボード

1. https://dash.cloudflare.com/ にログイン
2. **Pages** → プロジェクト `kobeyabkk-studypartner` を選択
3. **Settings** → **Environment variables** に移動
4. 以下の変数を追加：

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `OPENAI_API_KEY` | OpenAI APIキー | `sk-proj-...` |
| `WEBHOOK_SECRET` | Webhook認証シークレット | 強力なランダム文字列 |
| `ADMIN_EMAIL` | 管理者メールアドレス | `your-email@example.com` |

5. **Production** と **Preview** の両方に設定

#### 方法2: Wrangler CLI

```bash
# ターミナルで以下を実行
wrangler secret put OPENAI_API_KEY
wrangler secret put WEBHOOK_SECRET
wrangler secret put ADMIN_EMAIL
```

各コマンド実行時に値の入力を求められます。

---

## 📋 パブリック化手順

### ステップ1: 環境変数の設定確認

```bash
# Cloudflare Pagesダッシュボードで確認
# または wrangler コマンドで確認
wrangler pages project list
```

### ステップ2: GitHubでリポジトリをパブリック化

1. https://github.com/kobeyabkk/KOBEYA_StudyPartner_Full に移動
2. **Settings** タブをクリック
3. 下にスクロールして **Danger Zone** を見つける
4. **Change visibility** → **Change to public** をクリック
5. リポジトリ名 `KOBEYA_StudyPartner_Full` を入力して確認
6. **I understand, change repository visibility** をクリック

### ステップ3: デプロイテスト

```bash
# ローカルで動作確認
npm run build
npm run dev:sandbox

# 問題なければ本番デプロイ
npm run deploy:prod
```

### ステップ4: 動作確認

- [ ] https://kobeyabkk-studypartner.pages.dev/ にアクセス
- [ ] AI学習機能が正常に動作
- [ ] エッセイコーチング機能が正常に動作
- [ ] 英検問題生成機能が正常に動作
- [ ] エラーログを確認（Cloudflare Dashboard）

---

## 🚨 緊急時の対応

### もし機密情報が漏洩した場合

1. **即座にリポジトリをプライベートに戻す**
   - GitHub Settings → Danger Zone → Change to private

2. **漏洩したシークレットを無効化**
   - OpenAI API キー: https://platform.openai.com/api-keys で削除
   - 新しいキーを生成してCloudflareに設定

3. **Gitヒストリーからシークレットを削除**
   ```bash
   # BFG Repo-Cleaner を使用（推奨）
   # または git filter-branch（上級者向け）
   ```

4. **チームに通知**
   - セキュリティインシデントとして記録
   - 影響範囲を確認

---

## 📊 パブリック化のメリット

### ✅ 期待される効果

1. **コミュニティ貢献**
   - 教育システムのオープンソース化
   - 他の教育機関への知見共有

2. **コード品質向上**
   - 外部レビューによる改善提案
   - バグ報告の増加

3. **ポートフォリオ価値**
   - 技術力の証明
   - 採用・営業での活用

4. **透明性向上**
   - 保護者・生徒への信頼性向上
   - 教育機関としてのブランド強化

---

## 📞 サポート

### 質問・相談先

- **技術的な質問**: このドキュメントのIssueで質問
- **セキュリティ問題**: info@kobeya-programming.com
- **一般的な問い合わせ**: kobeya.com

---

## 🎯 最終確認

パブリック化する前に、以下を再確認してください：

- [ ] Cloudflare Pagesに環境変数を設定した
- [ ] ローカルでビルド・動作確認した
- [ ] README.mdが正しく表示されることを確認した
- [ ] LICENSEファイルが存在する
- [ ] SECURITY.mdが存在する
- [ ] .gitignoreに機密ファイルが含まれている
- [ ] 過去のコミット履歴に機密情報がないことを確認した

**すべてチェックできたら、パブリック化を実行してください！**

---

**作成日**: 2026-02-03  
**最終更新**: 2026-02-03  
**担当者**: AI Assistant  
**承認者**: Masamichi Suzuki
