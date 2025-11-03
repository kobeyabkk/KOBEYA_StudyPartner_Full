# 診断機能の追加（Diagnostic Improvements）

## 問題の概要

ユーザーが「量子力学」というテーマを選択したにもかかわらず、レッスン内容が「地球温暖化」（サンプルのフォールバックコンテンツ）のまま表示される問題が発生していました。

## 実装した改善点

### 1. サーバーサイド診断ログ（Server-side Diagnostics）

#### セッションデータ検証
```typescript
// Session data validation
if (!problemMode) {
  console.warn('⚠️ problemMode is missing in session')
}
if (!customInput && (problemMode === 'theme' || problemMode === 'problem')) {
  console.warn('⚠️ customInput is missing but problemMode is:', problemMode)
}
```

#### Step 1 テーマ生成の詳細ログ
```typescript
console.log('🔍 Step 1 Theme Generation - Conditions:', {
  problemMode,
  customInput,
  hasCustomInput: !!customInput,
  condition_theme: problemMode === 'theme' && !!customInput,
  condition_problem: problemMode === 'problem' && !!customInput
})
```

#### AI生成のステータスログ
```typescript
console.log('✅ Generating theme content for:', customInput)
console.log('📊 AI Generated text length:', generatedText?.length || 0)
console.log('✅ Using AI-generated theme content')
console.warn('⚠️ AI text too short, using custom fallback')
console.log('🔄 Using error fallback with custom theme')
```

### 2. クライアントサイド診断ログ（Client-side Diagnostics）

ブラウザのコンソールにセッション設定を表示：

```javascript
console.log('🔍 Essay Session Configuration:', {
  sessionId: sessionId,
  problemMode: 'theme',
  customInput: '量子力学',
  learningStyle: 'auto',
  targetLevel: 'high_school',
  timestamp: new Date().toISOString()
});
```

### 3. 古いセッションの検出と警告

セッションデータが不正な場合、ユーザーに明確なメッセージを表示：

```typescript
if ((problemMode === 'theme' || problemMode === 'problem') && !customInput) {
  console.error('❌ CRITICAL: customInput is missing! Session may be from before fixes.')
  response = `⚠️ セッションデータに問題があります。

このセッションは古いデータの可能性があります。
「新しいセッション」ボタンを押して、もう一度最初からやり直してください。

（デバッグ情報: problemMode=${problemMode}, customInput=${customInput ? 'exists' : 'missing'}）`
  return c.json({ ok: true, response, stepCompleted: false })
}
```

### 4. 改善されたフォールバック処理

AI生成が失敗した場合でも、カスタムテーマを反映したコンテンツを表示：

**改善前（ハードコードされたフォールバック）:**
```typescript
let themeContent = '地球温暖化は現代社会が直面する最も深刻な問題の一つです...'
```

**改善後（カスタムテーマを使用）:**
```typescript
themeContent = `${customInput}は、現代社会において重要なテーマの一つです。このテーマについて、様々な視点から考察し、自分の意見を論理的に述べることが求められています。まずは、${customInput}の背景や現状について理解を深めましょう。`
```

## テスト方法

### 1. 新しいセッションでテスト

1. **セットアップ画面で新しいセッションを作成**
   - 「テーマを選択」を選ぶ
   - カスタムテーマ（例: 量子力学）を入力
   - 「学習を開始」をクリック

2. **ブラウザのコンソールを開く**
   - Chrome/Edge: F12 → Console タブ
   - Safari: ⌘+Option+C
   - Firefox: F12 → Console タブ

3. **セッション設定を確認**
   ```
   🔍 Essay Session Configuration: {
     sessionId: "essay-1762158831876-5i5gkt",
     problemMode: "theme",
     customInput: "量子力学",  // ← ここが正しく設定されているか確認
     learningStyle: "auto",
     targetLevel: "high_school"
   }
   ```

4. **レッスンを開始（「OK」をクリック）**
   - コンソールに以下のログが表示されるはず：
   ```
   🔍 Step 1 Theme Generation - Conditions: {
     problemMode: "theme",
     customInput: "量子力学",
     hasCustomInput: true,
     condition_theme: true,
     condition_problem: false
   }
   ✅ Generating theme content for: 量子力学
   📊 AI Generated text length: 152
   ✅ Using AI-generated theme content
   ```

5. **AI生成されたコンテンツを確認**
   - 「今日のテーマは「量子力学」です。」
   - 読み物の内容が量子力学に関するものになっているか確認

### 2. 古いセッションでテスト

既存の古いセッション（`essay-1762158831876-5i5gkt`など）を使用した場合：

1. ページを開く
2. 「OK」をクリック
3. **予想される結果**:
   - 警告メッセージが表示される：
     ```
     ⚠️ セッションデータに問題があります。

     このセッションは古いデータの可能性があります。
     「新しいセッション」ボタンを押して、もう一度最初からやり直してください。

     （デバッグ情報: problemMode=theme, customInput=missing）
     ```
   - コンソールに `❌ CRITICAL: customInput is missing!` というエラーが表示される

### 3. AI生成失敗時のテスト

AI生成がエラーや短すぎる応答を返した場合：

- **従来**: ハードコードされた「地球温暖化」の文章が表示される
- **改善後**: カスタムテーマ（例: 量子力学）を使った汎用的なフォールバック文が表示される

## デバッグ情報の読み方

### コンソールログの意味

| ログメッセージ | 意味 |
|--------------|------|
| `✅ Generating theme content for: 量子力学` | カスタムテーマに基づいてAIがコンテンツを生成中 |
| `📊 AI Generated text length: 152` | AIが生成したテキストの長さ（50文字以上で採用） |
| `✅ Using AI-generated theme content` | AI生成コンテンツの使用に成功 |
| `⚠️ AI text too short, using custom fallback` | AIの応答が短すぎるため、カスタムフォールバックを使用 |
| `🔄 Using error fallback with custom theme` | AI生成エラー、カスタムテーマのフォールバックを使用 |
| `❌ CRITICAL: customInput is missing!` | セッションデータが不正（古いセッション） |

## 次のステップ

1. **新しいセッションで動作確認**
   - 完全に新しいセッションを作成してテスト
   - コンソールログを確認して問題を特定

2. **問題が続く場合**
   - コンソールログのスクリーンショットを共有
   - セッション ID を記録
   - どのステップで問題が発生したか記録

3. **Cloudflare Worker ログの確認**（開発者向け）
   - Cloudflare Dashboard → Workers & Pages → StudyPartner
   - Real-time Logs で実際のサーバーサイドログを確認
   - AI API 呼び出しのエラーがないか確認

## ビルド情報

- **コミット**: `69b387b`
- **ブランチ**: `dev`
- **PR**: #8 (自動更新済み)
- **ビルドサイズ**: 511.17 kB
- **デプロイ**: Cloudflare Pages (dev ブランチのプレビューURL)

## 関連ファイル

- `src/index.tsx` (lines 2149-2157, 2224-2287, 6659-6673)
