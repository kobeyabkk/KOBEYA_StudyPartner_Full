# 英検対策システム 実装ロードマップ

## 📅 開発スケジュール概要

**総開発期間**: 2-3週間（フルタイム換算）

## Phase 1: 基盤構築（2-3日）

### Day 1: プロジェクトセットアップ
- [ ] 新しいルート `/eiken` 作成
- [ ] 基本的なページ構造
- [ ] ナビゲーション実装

**成果物**:
```
/eiken → 英検トップページ
/eiken/:grade → 級別トップ（例: /eiken/2）
/eiken/:grade/:section → セクション別（例: /eiken/2/reading）
```

### Day 2: データベース設計・構築
- [ ] D1データベース作成
```bash
wrangler d1 create eiken-db
```

- [ ] マイグレーションファイル作成
```sql
-- migrations/0001_create_tables.sql
CREATE TABLE eiken_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade TEXT NOT NULL,
    section TEXT NOT NULL,
    question_type TEXT NOT NULL,
    question_number TEXT,
    question_text TEXT NOT NULL,
    choices TEXT,  -- JSON as TEXT for D1
    correct_answer TEXT,
    explanation TEXT,
    audio_url TEXT,
    audio_script TEXT,
    difficulty_level INTEGER,
    grammar_points TEXT,  -- JSON as TEXT
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_grade_section ON eiken_questions(grade, section);
CREATE INDEX idx_question_type ON eiken_questions(question_type);

CREATE TABLE generated_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_question_id INTEGER,
    grade TEXT NOT NULL,
    section TEXT NOT NULL,
    question_text TEXT NOT NULL,
    choices TEXT,
    correct_answer TEXT,
    explanation TEXT,
    audio_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE learning_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    student_id TEXT,
    question_id INTEGER,
    question_source TEXT,  -- 'original' or 'generated'
    user_answer TEXT,
    is_correct INTEGER,  -- 0 or 1 (boolean)
    time_spent INTEGER,
    attempted_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_student_history ON learning_history(student_id, attempted_at);
```

- [ ] マイグレーション実行
```bash
wrangler d1 execute eiken-db --file=migrations/0001_create_tables.sql
```

### Day 3: サンプルデータ投入
- [ ] サンプルJSON作成（2級・大問1を3-5問）
- [ ] データインポートAPI実装
- [ ] データ確認クエリ実行

**サンプルデータ例**:
```json
{
  "grade": "2",
  "section": "reading",
  "question_type": "vocabulary",
  "question_number": "1-1",
  "question_text": "Choose the best word to complete the sentence: The company's new policy will _____ affect employee morale.",
  "choices": ["significantly", "significance", "significant", "signify"],
  "correct_answer": "significantly",
  "explanation": "'Significantly' is an adverb that modifies the verb 'affect'. The other options are different word forms that don't fit grammatically.",
  "difficulty_level": 3,
  "grammar_points": ["adverbs", "word_forms"]
}
```

## Phase 2: 基本UI実装（3-4日）

### Day 4: 級選択画面
- [ ] トップページデザイン
- [ ] 7つの級ボタン（5級〜1級）
- [ ] 学習統計サマリー表示

**コンポーネント構造**:
```tsx
<EikenTopPage>
  <GradeSelector grades={['5', '4', '3', 'pre2', '2', 'pre1', '1']} />
  <StudyStats 
    totalQuestions={120}
    accuracy={0.78}
    studyTime={510} // minutes
  />
</EikenTopPage>
```

### Day 5: 問題選択画面
- [ ] セクション選択（Reading/Listening/Writing）
- [ ] 大問一覧表示
- [ ] 過去問 vs 類似問題 切り替え

### Day 6: 問題表示画面（リーディング）
- [ ] 問題文表示
- [ ] 選択肢UI（ラジオボタン）
- [ ] タイマー機能
- [ ] 前へ/次へナビゲーション
- [ ] 解答送信

**コンポーネント**:
```tsx
<QuestionPage>
  <QuestionTimer initialTime={300} /> {/* 5 minutes */}
  <QuestionText text={question.question_text} />
  <ChoiceList 
    choices={question.choices}
    selectedAnswer={userAnswer}
    onSelect={setUserAnswer}
  />
  <NavigationButtons 
    onPrev={gotoPrev}
    onNext={gotoNext}
    onSubmit={submitAnswer}
  />
</QuestionPage>
```

### Day 7: 解答・解説画面
- [ ] 正誤判定表示
- [ ] 解説表示（英語・日本語）
- [ ] 文法ポイント表示
- [ ] 類似問題生成ボタン

## Phase 3: リスニング機能（2-3日）

### Day 8: 音声再生機能
- [ ] HTML5 Audio実装
- [ ] 再生コントロール（再生/停止/速度調整）
- [ ] 再生回数制限（試験と同じ）
- [ ] スクリプト表示切り替え

**音声プレイヤーコンポーネント**:
```tsx
<AudioPlayer
  audioUrl={question.audio_url}
  maxPlays={2}
  speeds={[0.75, 1.0, 1.25]}
  script={question.audio_script}
  showScriptByDefault={false}
/>
```

### Day 9: リスニング問題UI
- [ ] リスニング専用問題画面
- [ ] 音声再生と問題文の統合
- [ ] リスニング学習履歴記録

### Day 10: 音声ファイル管理
- [ ] Cloudflare R2バケット作成
- [ ] 音声アップロードAPI
- [ ] 音声配信エンドポイント

```bash
# R2バケット作成
wrangler r2 bucket create eiken-audio
```

## Phase 4: AI問題生成（3-4日）

### Day 11: プロンプト設計
- [ ] リーディング問題生成プロンプト
- [ ] リスニング問題生成プロンプト
- [ ] プロンプトテンプレート化

**プロンプト関数例**:
```typescript
function buildVocabularyQuestionPrompt(originalQuestion: Question): string {
  return `You are an expert EIKEN question creator.

Generate a NEW vocabulary question similar to this example:
- Grade: ${originalQuestion.grade}
- Grammar Point: ${originalQuestion.grammar_points.join(', ')}
- Difficulty: ${originalQuestion.difficulty_level}/5

Example question:
"${originalQuestion.question_text}"
Choices: ${originalQuestion.choices.join(', ')}
Correct: ${originalQuestion.correct_answer}

Requirements:
1. Create a completely NEW sentence (different context)
2. Test the SAME grammar point
3. Use vocabulary at the same difficulty level
4. Provide 4 plausible choices
5. Include explanation in English and Japanese

Output as JSON:
{
  "question_text": "...",
  "choices": ["A", "B", "C", "D"],
  "correct_answer": "A",
  "explanation_en": "...",
  "explanation_ja": "..."
}`;
}
```

### Day 12: 問題生成API実装
- [ ] `/api/eiken/generate-question` エンドポイント
- [ ] OpenAI API統合
- [ ] 生成問題の検証ロジック
- [ ] D1への保存

### Day 13: TTS音声生成
- [ ] OpenAI TTS API統合
- [ ] 会話文の話者分離（音声の変更）
- [ ] 生成音声のR2アップロード

**TTS生成関数**:
```typescript
async function generateListeningAudio(
  script: string,
  voice: 'alloy' | 'echo' | 'fable' = 'alloy'
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1-hd', // or 'tts-1' for faster/cheaper
      voice: voice,
      input: script,
      speed: 1.0,
    }),
  });
  
  const audioBuffer = await response.arrayBuffer();
  
  // Upload to R2
  const key = `generated/${Date.now()}.mp3`;
  await env.EIKEN_AUDIO.put(key, audioBuffer, {
    httpMetadata: {
      contentType: 'audio/mpeg',
    },
  });
  
  return `/audio/${key}`;
}
```

### Day 14: 品質チェック
- [ ] 生成問題のレビュー画面
- [ ] 不適切な問題の削除機能
- [ ] 再生成機能

## Phase 5: 学習管理機能（2-3日）

### Day 15: 学習履歴記録
- [ ] 解答データの保存
- [ ] 正答率計算
- [ ] 学習時間集計

### Day 16: 統計ダッシュボード
- [ ] 総合成績表示
- [ ] 大問別正答率グラフ
- [ ] 文法ポイント別弱点分析

**ダッシュボードコンポーネント**:
```tsx
<StatsDashboard>
  <OverallStats 
    totalQuestions={150}
    correctAnswers={117}
    accuracy={0.78}
    studyTime={600}
  />
  <SectionBreakdown sections={[
    { name: '語彙', accuracy: 0.85, count: 40 },
    { name: '文法', accuracy: 0.72, count: 35 },
    { name: '読解', accuracy: 0.75, count: 45 },
    { name: 'リスニング', accuracy: 0.80, count: 30 },
  ]} />
  <WeakPointsChart 
    weakPoints={['present_perfect', 'passive_voice', 'relative_clauses']}
  />
</StatsDashboard>
```

### Day 17: おすすめ問題機能
- [ ] 弱点分野の特定アルゴリズム
- [ ] おすすめ問題の抽出
- [ ] パーソナライズされた学習プラン提案

## Phase 6: データ投入・管理（2-3日）

### Day 18: 管理画面
- [ ] 問題一覧表示
- [ ] 問題追加フォーム
- [ ] 問題編集機能
- [ ] 問題削除機能

### Day 19: CSVインポート機能
- [ ] CSVファイル読み込み
- [ ] データ検証
- [ ] 一括インポート実行

**CSV形式例**:
```csv
grade,section,question_type,question_text,choice_a,choice_b,choice_c,choice_d,correct,explanation
2,reading,vocabulary,"The policy will _____ affect business.",significantly,significance,significant,signify,A,"Adverb modifies verb"
```

### Day 20: 過去問データ投入
- [ ] AI Driveから過去問データ取得
- [ ] 手動/半自動でDB投入
- [ ] データ品質チェック

## Phase 7: テスト・改善（2-3日）

### Day 21: 機能テスト
- [ ] 全機能の動作確認
- [ ] バグ修正
- [ ] エッジケース処理

### Day 22: パフォーマンス最適化
- [ ] クエリ最適化
- [ ] キャッシング実装
- [ ] 画像・音声の遅延ロード

### Day 23: UI/UX改善
- [ ] デザイン調整
- [ ] レスポンシブ対応確認
- [ ] アクセシビリティ改善

## Phase 8: デプロイ・運用準備（1日）

### Day 24: 本番デプロイ
- [ ] 環境変数設定確認
- [ ] D1本番DB作成
- [ ] R2本番バケット作成
- [ ] Cloudflare Pagesデプロイ
- [ ] 動作確認

## 🎯 マイルストーン

### Milestone 1 (Week 1終了)
- ✅ DB構築完了
- ✅ 基本UI実装（問題表示・解答）
- ✅ リーディング問題が解ける

### Milestone 2 (Week 2終了)
- ✅ リスニング機能完成
- ✅ AI問題生成機能動作
- ✅ 学習履歴記録

### Milestone 3 (Week 3終了)
- ✅ 統計ダッシュボード
- ✅ データ投入完了（主要級）
- ✅ 本番デプロイ

## 🚀 リリース後の拡張計画

### v1.1
- [ ] ライティング問題対応（英作文添削）
- [ ] スピーキング対策（二次試験）
- [ ] 模擬試験モード（時間制限付き全問題）

### v1.2
- [ ] ソーシャル機能（学習仲間・ランキング）
- [ ] リマインダー機能
- [ ] 学習目標設定

### v1.3
- [ ] オフライン対応（PWA）
- [ ] モバイルアプリ（React Native）

---

**質問・懸念事項があれば随時相談してください！** 🚀
