# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Phase 3 Release] - 2025-11-21

### 🎉 Added - 英検対策機能リリース

#### 新機能
- **4形式の問題生成システム**
  - `grammar_fill`: 文法穴埋め問題（4択MCQ）
  - `opinion_speech`: 意見スピーチ問題（質問+模範解答）
  - `reading_aloud`: 音読問題（50-80語パッセージ）
  - `essay`: エッセイ問題（プロンプト+模範解答+アウトライン）

#### 品質保証システム
- **語彙レベル検証**: CEFR準拠（A1-C2）の語彙チェック
  - 10,000+ 語の英検語彙データベース
  - バッチ処理で大量単語を効率的に検証（100語/クエリ）
  - 目標: 95%以上の語彙適合率
- **著作権検証**: 過去問との類似度チェック
- **トピック管理システム**: 61トピック（5級-1級）
  - 実際の過去問236問から抽出
  - 形式適性スコア175組み合わせ

#### AI生成最適化
- **Blueprint Generator**: 形式別プロンプト最適化
- **モデル選択**: gpt-4o-mini（コスト効率重視）
- **再試行ロジック**: 最大3回のリトライ

#### 学習体験向上
- **全選択肢の語彙解説**: 正解・不正解全ての意味を日本語で表示
- **詳細な解説**: 文法ポイント・選択肢の正誤理由を明示

### 🔧 Fixed

- **D1 SQL variables limit対策**: 
  - `vocabulary-validator.ts`でバッチ処理実装
  - 100語ずつ分割クエリで「too many SQL variables」エラーを解決
  - デバッグログ追加でトラブルシューティング容易化

### ⏳ Known Issues

- **long_reading形式**: 現在メンテナンス中
  - 語彙スコア69% (目標: 95%)
  - 250-300語の長文で語彙レベル調整が必要
  - 別途デバッグ予定

### 📊 Technical Details

#### API Endpoints
- `POST /api/eiken/questions/generate` - 問題生成
- `GET /api/eiken/questions/list` - 問題一覧
- `GET /api/eiken/questions/:id` - 問題詳細

#### Database Schema
- `eiken_generated_questions` - 生成問題保存
- `eiken_vocabulary_lexicon` - 語彙データベース
- `eiken_topic_areas` - トピック管理
- `eiken_topic_question_type_suitability` - 形式適性
- `eiken_topic_usage_history` - 使用履歴

#### Performance
- grammar_fill: ~9秒
- opinion_speech: ~18秒
- reading_aloud: ~22秒
- essay: ~62秒

### 🎯 Migration Steps

1. **トピックデータ投入**: `migrations/0010_create_topic_system.sql`
2. **語彙データ確認**: 10,000+ 語が存在
3. **API動作確認**: 4形式全て正常動作

### 📝 Commits

- `7ac7e57`: バッチ処理実装（D1 SQL variables limit対策）
- `06d80a0`: 全選択肢の語彙解説追加
- `[current]`: long_reading形式の一時無効化

---

## [Previous Releases]

### Phase 2 - Topic Selection System
- トピック選択システム実装
- Blueprint生成システム

### Phase 1 - Vocabulary & Copyright Validation
- 語彙レベル検証システム
- 著作権検証システム

### Initial Release
- AI学習パートナー基本機能
- 画像解析・段階学習システム
- 学習ログ記録
- 保護者レポート生成
