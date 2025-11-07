# 英検対策システム開発のアドバイス依頼

## 🎯 プロジェクト概要

英検（EIKEN - 実用英語技能検定）の学習支援システムを開発しています。
過去問をデータベース化し、AI（GPT-4）で類似問題を自動生成する機能を実装予定です。

## 📋 システム要件

### 主要機能
1. **過去問データベース**
   - 級別（5級〜1級の7段階）
   - 大問別（リーディング、リスニング、ライティング）
   - 問題文、選択肢、正解、解説を保存

2. **AI類似問題生成**
   - 過去問と同じ形式・難易度で新問題を生成
   - 文法ポイント・語彙レベルを維持

3. **リスニング対応**
   - 音声ファイル管理
   - TTS（Text-to-Speech）で生成問題の音声作成
   - 速度調整機能

4. **学習管理**
   - 解答履歴の記録
   - 正答率・弱点分析
   - おすすめ問題提案

## 🏗️ 技術スタック

- **フロントエンド**: React + TypeScript
- **バックエンド**: Cloudflare Workers (Hono framework)
- **データベース**: Cloudflare D1 (SQLite)
- **ファイルストレージ**: Cloudflare R2
- **AI API**: OpenAI GPT-4
- **TTS**: OpenAI TTS API

## 💡 相談したいポイント

### 1. データベース設計
**質問**: 以下のテーブル設計は適切でしょうか？改善点はありますか？

```sql
-- 英検問題マスタ
CREATE TABLE eiken_questions (
    id INTEGER PRIMARY KEY,
    grade TEXT NOT NULL,              -- '5', '4', '3', 'pre2', '2', 'pre1', '1'
    section TEXT,                     -- 'reading', 'listening', 'writing'
    question_type TEXT,               -- 'grammar', 'vocabulary', 'reading_comp'
    question_text TEXT NOT NULL,
    choices JSON,                     -- ["A", "B", "C", "D"]
    correct_answer TEXT,
    explanation TEXT,
    audio_url TEXT,
    grammar_points JSON,
    difficulty_level INTEGER
);

-- 生成問題
CREATE TABLE generated_questions (
    id INTEGER PRIMARY KEY,
    original_question_id INTEGER,
    question_text TEXT,
    choices JSON,
    correct_answer TEXT,
    FOREIGN KEY (original_question_id) REFERENCES eiken_questions(id)
);

-- 学習履歴
CREATE TABLE learning_history (
    id INTEGER PRIMARY KEY,
    student_id TEXT,
    question_id INTEGER,
    user_answer TEXT,
    is_correct BOOLEAN,
    attempted_at TIMESTAMP
);
```

**懸念点**:
- JSON型の使い方（Cloudflare D1での互換性）
- インデックス設計
- 正規化レベル（パフォーマンスとのバランス）

### 2. AI問題生成プロンプト
**質問**: 英検の問題を高品質に生成するためのプロンプトエンジニアリングのベストプラクティスは？

**現在の案**:
```
You are an expert EIKEN question creator.

Generate a vocabulary question similar to this:
- Grade: 2
- Type: Word form (adverb/adjective)
- Example: "The policy will _____ affect business."
  Choices: significantly, significance, significant, signify

Create a NEW question with:
1. Different context
2. Same grammar point
3. Similar difficulty (CEFR B2)
4. 4 plausible choices
```

**改善したい点**:
- 一貫した難易度の維持
- 選択肢のもっともらしさ（distractor quality）
- 文法ポイントの明確な指定方法

### 3. リスニング音声生成
**質問**: リスニング問題の音声をTTSで生成する場合の品質向上策は？

**要件**:
- 自然な発音・イントネーション
- 会話の場合は複数話者の区別
- 速度調整（0.75x, 1.0x, 1.25x）
- 音質（試験本番に近い品質）

**選択肢**:
- OpenAI TTS (voices: alloy, echo, fable, onyx, nova, shimmer)
- ElevenLabs (よりリアルな音声）
- Google Cloud TTS
- 人間による収録（コスト高）

**質問**: どのTTSサービスが英検レベルの学習教材に適していますか？

### 4. データ投入方法
**質問**: 過去問データをどのようにDB化するのが効率的ですか？

**選択肢**:
1. **手動JSON作成**
   - メリット: 正確性
   - デメリット: 時間がかかる

2. **PDF OCR + GPT-4抽出**
   - PDFをOCRで文字認識
   - GPT-4で構造化データに変換
   - メリット: 効率的
   - デメリット: 誤認識のリスク

3. **管理画面UI**
   - Webフォームから手動入力
   - CSVインポート機能

**推奨**: どの方法が最も実用的でしょうか？

### 5. 著作権・法的問題
**質問**: 英検の過去問を使用する際の法的留意点は？

- 過去問の著作権は英検協会にあります
- 教育目的・個人利用の範囲での使用を想定
- 商用展開の場合の許諾取得方法

**相談**: 類似問題を生成する場合、どの程度まで「類似」にして良いのか？

### 6. パフォーマンス最適化
**質問**: 以下の点でパフォーマンス最適化のアドバイスをください

- **大量の問題データ（数千問）の取り扱い**
  - ページング vs 仮想スクロール
  - キャッシング戦略
  
- **AI生成のレスポンス時間**
  - ストリーミングレスポンス
  - 事前生成 vs オンデマンド生成
  
- **音声ファイルの配信**
  - Cloudflare R2からの効率的配信
  - ブラウザキャッシュ活用

### 7. UI/UX設計
**質問**: 学習効果を最大化するUI/UXのベストプラクティスは？

**考慮点**:
- タイマー機能（試験本番を想定）
- 復習機能（間違えた問題の再挑戦）
- 進捗可視化（モチベーション維持）
- フィードバックの表示方法（即時 vs 後から）

### 8. セキュリティ・データ保護
**質問**: 学生の学習データを保護するためのベストプラクティスは？

- セッション管理
- 個人情報の最小化
- データの暗号化
- GDPR/個人情報保護法への対応

## 🤔 特に知りたいこと

### 優先度高
1. **データベース設計の妥当性**（インデックス、正規化レベル）
2. **AI問題生成の品質担保**（プロンプト、検証方法）
3. **データ投入の効率化**（OCR+AI vs 手動）

### 優先度中
4. **TTS選択**（品質とコストのバランス）
5. **パフォーマンス最適化**（特にAI生成）
6. **UI/UX設計**（学習効果の最大化）

### 優先度低
7. **著作権対策**
8. **セキュリティ**

## 📊 参考情報

### 英検の構成（例: 2級）
- **リーディング**: 38問、85分
  - 大問1: 語彙問題（20問）
  - 大問2: 長文の語句空所補充（6問）
  - 大問3: 長文の内容一致選択（12問）
  
- **リスニング**: 30問、約25分
  - Part 1: 会話の内容一致選択（15問）
  - Part 2: 文の内容一致選択（15問）
  
- **ライティング**: 英作文1問、80-100語

### 想定ユーザー
- 中学生〜高校生（主に2級、準2級受験者）
- 自宅学習での利用
- スマホ・タブレット対応必須

## 🎯 期待する回答

- **具体的なコード例** or **設計パターン**
- **類似システムの事例**（EdTech分野）
- **避けるべきアンチパターン**
- **段階的な実装ロードマップ**

## 📎 追加情報

現在、同じプラットフォームで以下の機能が稼働中です：
- AI質問応答システム
- 小論文添削システム
- インター生向けバイリンガル学習システム

新しい英検対策機能は、これらと統合する形で実装予定です。

---

**どんな視点からのアドバイスでも歓迎です！**
技術面、教育面、ビジネス面、どの角度からでも構いません。

よろしくお願いします！ 🙏
