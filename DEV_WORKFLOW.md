# 🔀 開発フロー - 簡単ガイド

## 📌 基本ルール

- **開発・テスト**: `dev` ブランチで作業
- **本番環境**: `main` ブランチ（生徒が使用中）

---

## 🚀 日常の開発フロー

### 1️⃣ 新機能を開発する

```bash
# devブランチにいることを確認
git checkout dev

# いつも通りコードを編集
# ...

# ビルド
npm run build

# コミット
git add .
git commit -m "feat: マイク機能追加"

# devブランチにプッシュ
git push origin dev
```

**テスト用URL（自動生成）**:
- `https://dev.kobeyabkk-studypartner.pages.dev`
- または Cloudflare Pages のダッシュボードで確認

---

### 2️⃣ テストして動作確認

テスト用URLにアクセスして、新機能をテストします。

**問題があった場合**:
- コードを修正
- ビルド、コミット、プッシュを繰り返す
- devブランチで何度でもテスト可能

---

### 3️⃣ 本番環境に反映（OKの場合のみ）

動作確認が完了したら、本番環境に反映します。

```bash
# mainブランチに切り替え
git checkout main

# mainを最新状態に更新
git pull origin main

# devの内容をmainにコピー
git merge dev

# 本番環境にプッシュ
git push origin main
```

**本番URL**:
- `https://kobeyabkk-studypartner.pages.dev`

これで生徒が使っている本番環境に反映されます！

---

## 🔄 コマンドまとめ

### 開発時（何度でもOK）
```bash
git checkout dev
# コード編集
npm run build
git add .
git commit -m "説明"
git push origin dev
# → テスト用URLで確認
```

### 本番反映時（OKの場合のみ）
```bash
git checkout main
git pull origin main
git merge dev
git push origin main
# → 本番環境に反映
```

---

## 📍 現在どのブランチにいるか確認

```bash
git branch
```

`*` が付いているのが現在のブランチです。

---

## ⚠️ 注意事項

1. **mainブランチに直接プッシュしない**
   - 必ず `dev` で開発・テスト
   - OKなら `main` にマージ

2. **本番反映前に必ずテスト**
   - devブランチのプレビューURLで確認
   - 問題がないことを確認してから反映

3. **迷ったら現在のブランチを確認**
   ```bash
   git branch
   ```

---

## 🎯 よくある質問

**Q: 今どのブランチで作業すればいい？**
A: `dev` ブランチで作業してください。

**Q: テストURLはどこ？**
A: `https://dev.kobeyabkk-studypartner.pages.dev` または Cloudflare Pages のダッシュボードで確認。

**Q: 本番に反映するタイミングは？**
A: 新機能が完成して、テストURLで動作確認できたら反映してください。

**Q: 間違えてmainにプッシュしてしまった場合は？**
A: すぐに連絡してください。巻き戻し方法をお伝えします。

---

**最終更新**: 2025-11-03
