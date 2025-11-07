# JavaScriptの正規表現エラーで困っています

## 問題
Cloudflare Workers上のReactアプリで、すべてのボタンが反応しません。
ブラウザコンソールに以下のエラーが出ます：

```
Uncaught SyntaxError: Invalid regular expression: /\\(/g: Unterminated group
```

## 状況
- **目的**: LaTeX記法 `\(` を `$` に置換したい
- **現在のコード**: 
  ```javascript
  text = text.replace(/\\\\(/g, '$');  // 4つのバックスラッシュ
  ```
- **結果**: ビルドは成功、でもブラウザで実行時エラー

## 試したこと
1. `/\\(/g` → エラー（2つのバックスラッシュ）
2. `/\\\\\\(/g` → エラー（6つのバックスラッシュ）
3. `/\\\\(/g` → ビルド成功、実行時エラー（4つのバックスラッシュ）← 今ここ

## 技術スタック
- TypeScript + React
- Vite でビルド
- Cloudflare Pages にデプロイ

## 質問
1. なぜビルドは成功するのに実行時にエラーが出るのでしょうか？
2. 正しいエスケープ方法は？
3. 代替の実装方法はありますか？（RegExpコンストラクタなど）

## 期待
- ブラウザで正常に動作するコード例
- 根本原因の説明
- 今後同じ問題を避ける方法

---

**デプロイURL**: https://f752050c.kobeya-studypartner-full.pages.dev
**GitHub**: https://github.com/kobeyabkk/KOBEYA_StudyPartner_Full

エラーの原因と解決方法を教えてください！🙏
