# 英検対策システム設計案

## 🎯 プロジェクト概要

英検（EIKEN）の過去問をデータベース化し、級別・大問別に類似問題を自動生成するAI学習支援システム

## 📊 システム要件

### 1. 対応範囲
- **対象級**: 5級、4級、3級、準2級、2級、準1級、1級
- **問題タイプ**:
  - リーディング（文法、読解、語彙）
  - リスニング（会話、説明文、ニュース等）
  - ライティング（英作文）
  - スピーキング（二次試験対策）

### 2. 主要機能
1. **過去問データベース**
   - 級別・大問別に分類
   - 問題文、選択肢、正解、解説を保存
   - リスニング音声ファイルの管理

2. **類似問題生成**
   - AI（OpenAI GPT-4）による自動生成
   - 難易度・形式を過去問に合わせる
   - 文法ポイント・語彙レベルを維持

3. **学習管理**
   - 学習履歴の記録
   - 正答率の追跡
   - 弱点分野の特定

4. **リスニング対応**
   - 音声合成（Text-to-Speech）で問題音声を生成
   - 速度調整機能
   - スクリプト表示/非表示切り替え

## 🏗️ システムアーキテクチャ

### データベース設計（Cloudflare D1）

#### テーブル構造案

```sql
-- 英検問題マスタ
CREATE TABLE eiken_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade TEXT NOT NULL,              -- '5', '4', '3', 'pre2', '2', 'pre1', '1'
    section TEXT NOT NULL,             -- 'reading', 'listening', 'writing'
    question_type TEXT NOT NULL,       -- 'grammar', 'vocabulary', 'reading_comp', 'conversation', 'essay'
    year INTEGER,                      -- 実施年（2024等）
    exam_period TEXT,                  -- '1st', '2nd', '3rd'
    question_number TEXT,              -- '大問1-1', '大問2-5'等
    question_text TEXT NOT NULL,       -- 問題文
    choices JSON,                      -- 選択肢 ["A", "B", "C", "D"]
    correct_answer TEXT,               -- 正解（"A", "B"等）
    explanation TEXT,                  -- 解説
    audio_url TEXT,                    -- リスニング音声URL（該当する場合）
    audio_script TEXT,                 -- 音声スクリプト
    difficulty_level INTEGER,          -- 難易度（1-5）
    grammar_points JSON,               -- 文法ポイント ["present_perfect", "passive"]
    vocabulary_level TEXT,             -- 語彙レベル "CEFR_B1"等
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 生成された類似問題
CREATE TABLE generated_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_question_id INTEGER,      -- 元となった過去問ID
    grade TEXT NOT NULL,
    section TEXT NOT NULL,
    question_type TEXT NOT NULL,
    question_text TEXT NOT NULL,
    choices JSON,
    correct_answer TEXT,
    explanation TEXT,
    audio_url TEXT,
    audio_script TEXT,
    generation_prompt TEXT,            -- 生成に使用したプロンプト
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (original_question_id) REFERENCES eiken_questions(id)
);

-- 学習履歴
CREATE TABLE learning_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    student_id TEXT,
    question_id INTEGER,
    question_source TEXT,              -- 'original' or 'generated'
    user_answer TEXT,
    is_correct BOOLEAN,
    time_spent INTEGER,                -- 秒数
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (question_id) REFERENCES eiken_questions(id)
);

-- 学生の学習統計
CREATE TABLE student_stats (
    student_id TEXT PRIMARY KEY,
    grade TEXT,
    total_questions INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    accuracy_rate REAL DEFAULT 0.0,
    weak_areas JSON,                   -- ["grammar", "listening"]
    study_time_minutes INTEGER DEFAULT 0,
    last_study_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### インデックス
```sql
CREATE INDEX idx_grade_section ON eiken_questions(grade, section);
CREATE INDEX idx_question_type ON eiken_questions(question_type);
CREATE INDEX idx_student_history ON learning_history(student_id, attempted_at);
```

## 🔧 技術スタック

### フロントエンド
- **UI Framework**: React + TypeScript
- **音声再生**: HTML5 Audio API
- **スタイリング**: TailwindCSS または既存のスタイルシステム

### バックエンド
- **サーバー**: Cloudflare Workers (Hono)
- **データベース**: Cloudflare D1
- **ファイルストレージ**: Cloudflare R2（音声ファイル用）
- **AI**: OpenAI GPT-4 API

### 音声処理
- **TTS**: OpenAI TTS API または ElevenLabs
- **音声形式**: MP3（ストリーミング対応）

## 📁 データ構造案

### 過去問データの保存形式（JSON）

```json
{
  "grade": "2",
  "year": 2024,
  "period": "1st",
  "sections": [
    {
      "section": "reading",
      "questions": [
        {
          "number": "1-1",
          "type": "vocabulary",
          "question": "Choose the best word to complete the sentence.",
          "sentence": "The new policy will _____ affect our business.",
          "choices": [
            "significantly",
            "significance",
            "significant",
            "signify"
          ],
          "correct": "A",
          "explanation": "'Significantly' is an adverb modifying the verb 'affect'.",
          "grammar_points": ["adverbs", "word_forms"],
          "difficulty": 3
        }
      ]
    },
    {
      "section": "listening",
      "questions": [
        {
          "number": "1-1",
          "type": "conversation",
          "audio_file": "2024_1st_listening_1-1.mp3",
          "script": "Man: Did you finish the report?\nWoman: Not yet. I'll have it done by tomorrow.",
          "question": "What will the woman do?",
          "choices": [
            "Finish the report today",
            "Finish the report tomorrow",
            "Ask for help",
            "Cancel the report"
          ],
          "correct": "B",
          "explanation": "She says 'I'll have it done by tomorrow'.",
          "difficulty": 2
        }
      ]
    }
  ]
}
```

## 🚀 実装フェーズ

### Phase 1: データベースセットアップ（1-2日）
- [ ] D1データベース作成
- [ ] テーブル定義とマイグレーション
- [ ] サンプルデータ投入

### Phase 2: データ投入システム（2-3日）
- [ ] 過去問JSONからDBへのインポート機能
- [ ] 音声ファイルのR2アップロード
- [ ] データ検証機能

### Phase 3: 問題表示UI（3-4日）
- [ ] 級・大問選択インターフェース
- [ ] 問題表示画面
- [ ] リスニング音声再生機能
- [ ] 解答送信・採点機能

### Phase 4: AI類似問題生成（3-4日）
- [ ] プロンプトエンジニアリング
- [ ] 問題生成API実装
- [ ] リスニング音声合成
- [ ] 生成問題の品質チェック

### Phase 5: 学習管理機能（2-3日）
- [ ] 学習履歴記録
- [ ] 統計ダッシュボード
- [ ] 弱点分析
- [ ] おすすめ問題提案

### Phase 6: テスト・改善（2-3日）
- [ ] ユーザーテスト
- [ ] パフォーマンス最適化
- [ ] UI/UX改善

**総開発期間目安: 13-19日**

## 🎨 UI/UX設計案

### 1. トップページ
```
┌─────────────────────────────────────┐
│  🎓 KOBEYA 英検対策システム         │
├─────────────────────────────────────┤
│                                     │
│  級を選択してください:               │
│                                     │
│  [5級] [4級] [3級] [準2級]         │
│  [2級] [準1級] [1級]                │
│                                     │
│  📊 あなたの学習統計                 │
│  総問題数: 120問                     │
│  正答率: 78%                        │
│  学習時間: 8時間30分                 │
│                                     │
└─────────────────────────────────────┘
```

### 2. 問題選択画面
```
┌─────────────────────────────────────┐
│  ← 2級 問題選択                     │
├─────────────────────────────────────┤
│                                     │
│  📖 リーディング                     │
│    □ 大問1: 語彙問題 (20問)         │
│    □ 大問2: 文法問題 (15問)         │
│    □ 大問3: 読解問題 (12問)         │
│                                     │
│  🎧 リスニング                       │
│    □ Part 1: 会話問題 (15問)       │
│    □ Part 2: 説明文 (15問)         │
│                                     │
│  ✍️ ライティング                    │
│    □ 英作文問題 (1問)               │
│                                     │
│  [過去問] [類似問題] [ランダム]     │
│                                     │
└─────────────────────────────────────┘
```

### 3. 問題画面（リーディング）
```
┌─────────────────────────────────────┐
│  問題 1/20  ⏱️ 02:35               │
├─────────────────────────────────────┤
│                                     │
│  Choose the best word to complete   │
│  the sentence.                      │
│                                     │
│  The new policy will _____ affect   │
│  our business.                      │
│                                     │
│  ○ A. significantly                 │
│  ○ B. significance                  │
│  ○ C. significant                   │
│  ○ D. signify                       │
│                                     │
│  [前へ]  [次へ]  [解答する]         │
│                                     │
└─────────────────────────────────────┘
```

### 4. 問題画面（リスニング）
```
┌─────────────────────────────────────┐
│  問題 1/15  🎧 リスニング          │
├─────────────────────────────────────┤
│                                     │
│  ▶️ 音声を再生 (再生回数: 0/2)     │
│  🔊━━━━━━━━━━━━━━ 00:15           │
│  速度: [0.75x] [1.0x] [1.25x]      │
│                                     │
│  □ スクリプトを表示                 │
│                                     │
│  Question: What will the woman do?  │
│                                     │
│  ○ A. Finish the report today       │
│  ○ B. Finish the report tomorrow    │
│  ○ C. Ask for help                  │
│  ○ D. Cancel the report             │
│                                     │
│  [解答する]                         │
│                                     │
└─────────────────────────────────────┘
```

### 5. 解答・解説画面
```
┌─────────────────────────────────────┐
│  ✅ 正解！                          │
├─────────────────────────────────────┤
│                                     │
│  正解: B. Finish the report tomorrow│
│  あなたの回答: B                     │
│                                     │
│  📝 解説:                           │
│  She says "I'll have it done by     │
│  tomorrow", which means she will    │
│  finish it tomorrow.                │
│                                     │
│  🎧 スクリプト:                      │
│  Man: Did you finish the report?    │
│  Woman: Not yet. I'll have it done  │
│  by tomorrow.                       │
│                                     │
│  📚 関連文法:                        │
│  - Future tense (will)              │
│  - Causative (have + done)          │
│                                     │
│  [次の問題へ]  [類似問題を解く]     │
│                                     │
└─────────────────────────────────────┘
```

## 🤖 AI問題生成プロンプト例

### リーディング問題生成
```
You are an expert EIKEN (English proficiency test) question creator.

Generate a vocabulary question similar to the following example:
- Grade: 2 (Pre-1 level)
- Question Type: Vocabulary
- Example: "The new policy will _____ affect our business."
- Correct Answer: significantly (adverb)
- Grammar Point: Adverbs, Word Forms

Requirements:
1. Create a NEW sentence with a different context
2. Use vocabulary at CEFR B2 level
3. Test the same grammar point (adverbs/word forms)
4. Provide 4 choices (similar word forms)
5. Include a clear explanation in English and Japanese

Output format:
{
  "question": "...",
  "choices": ["A", "B", "C", "D"],
  "correct": "A",
  "explanation_en": "...",
  "explanation_ja": "..."
}
```

### リスニング問題生成
```
You are an expert EIKEN listening question creator.

Generate a short conversation similar to the following:
- Grade: 2
- Type: Daily conversation
- Length: 2-3 exchanges
- Difficulty: Intermediate (CEFR B1-B2)

Create:
1. A natural English conversation (2-3 speakers)
2. A comprehension question
3. 4 answer choices
4. Explanation

The conversation should test:
- Understanding of specific information
- Inference ability
- Common expressions

Output format:
{
  "script": "...",
  "question": "...",
  "choices": ["A", "B", "C", "D"],
  "correct": "B",
  "explanation": "..."
}
```

## 🔊 リスニング音声生成

### OpenAI TTS API使用例
```typescript
async function generateListeningAudio(script: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: 'alloy', // or 'echo', 'fable', 'onyx', 'nova', 'shimmer'
      input: script,
      speed: 1.0,
    }),
  });
  
  const audioBuffer = await response.arrayBuffer();
  
  // Upload to R2
  const audioUrl = await uploadToR2(audioBuffer, 'audio/mpeg');
  
  return audioUrl;
}
```

## 📊 データ投入方法

### 方法1: 手動JSONファイル作成
AI Driveの`/Eiken`フォルダに以下の構造でJSONファイルを配置:
```
/Eiken/
  ├── grade5/
  │   ├── 2024_1st.json
  │   ├── 2023_3rd.json
  │   └── audio/
  │       ├── 2024_1st_listening_1.mp3
  │       └── ...
  ├── grade4/
  ├── grade3/
  └── ...
```

### 方法2: 管理画面からの登録
- 問題文入力フォーム
- CSV/Excelインポート機能
- 音声ファイルアップロード

### 方法3: PDFからのOCR + AI抽出
- PDF過去問をアップロード
- OCRで文字認識
- GPT-4で構造化データに変換

## ⚠️ 注意点・課題

### 1. 著作権
- 実際の過去問は英検協会に著作権があります
- 商用利用の場合は許諾が必要
- 教育目的・個人利用の範囲で運用

### 2. 音声品質
- TTS生成音声は人間の発音と異なる
- 本番試験前は実際の過去問音声での練習を推奨

### 3. 問題の難易度調整
- AI生成問題の難易度を過去問と合わせる調整が必要
- 定期的な品質チェック

### 4. データ量
- 過去問データの蓄積に時間がかかる
- 最初は主要級（2級、準1級等）に絞る

## 🎯 次のステップ

1. **データ収集**: AI Driveに過去問データをアップロード
2. **データベース設計レビュー**: 上記テーブル設計の確認・調整
3. **プロトタイプ作成**: 1つの級・1つのセクションで実装
4. **テスト**: 実際に問題を解いてフィードバック
5. **拡張**: 他の級・セクションに展開

---

**質問・要望があれば遠慮なくお知らせください！** 🚀
