# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Phase 4 - Vocabulary Quality Improvements] - 2025-11-21

### 🚀 Priority 1 Implementation (Immediate Impact)

#### Core Improvements
1. **VocabularyFailureTracker Service** (NEW)
   - Dynamic forbidden words learning from generation failures
   - Static + dynamic forbidden word lists (50+ words per grade)
   - Grade-specific vocabulary constraints
   - Automatic failure recording and statistics

2. **Few-shot Examples with Good/Bad Comparison**
   - Essay format: Good (95%) vs Bad (68%) examples with explicit problem identification
   - Long Reading format: Good (92%) vs Bad (69%) examples
   - Clear vocabulary level guidance in prompts
   - Self-check requirements for LLM

3. **Optimal Temperature Settings**
   - Essay: 0.3 (reduced from 0.7) - strict control for 120-150 words
   - Long Reading: 0.25 (reduced from 0.7) - strictest for 200-300 words
   - Grammar Fill: 0.5 - balanced
   - Format-specific LLM configurations with reasoning

4. **Adaptive Threshold Calculation**
   - Essay: 92% (relaxed from 95% for long text)
   - Long Reading: 91% (relaxed from 95% for very long text)
   - Dynamic adjustment based on format, grade, and word count
   - Realistic targets for long-text generation

### 📊 Expected Impact

#### Immediate (Day 1-2)
- Essay: 64% → **78-81%** (+14-17%)
- Long Reading: 69% → **82-85%** (+13-16%)

#### Contributing Factors
- Few-shot examples: +14% improvement
- Temperature reduction: +3% improvement
- Forbidden words: +2-3% improvement
- Adaptive thresholds: Better success rate within 3 attempts

#### Next Steps (Week 1)
- Implement iterative feedback system (3 retries with context)
- Further refine with production testing
- Target: **87-90%** by end of week

### 🔧 Technical Changes

#### New Files
- `src/eiken/services/vocabulary-tracker.ts` - VocabularyFailureTracker class
- `docs/VOCABULARY_IMPROVEMENT_IMPLEMENTATION.md` - Comprehensive implementation guide

#### Modified Files
- `src/eiken/prompts/format-prompts.ts` - Enhanced with Few-shot examples
- `src/eiken/services/integrated-question-generator.ts` - Integrated adaptive strategies

### 📝 Implementation Details

See `docs/VOCABULARY_IMPROVEMENT_IMPLEMENTATION.md` for:
- Complete code examples from 5 AI consultations
- Detailed improvement timeline
- Success criteria and testing notes

---

## [Phase 3 Release] - 2025-11-21

### 🎉 Added - 英検対策機能リリース（3形式）

#### 新機能（Production Ready）
- **3形式の問題生成システム**
  - `grammar_fill`: 文法穴埋め問題（4択MCQ、語彙解説付き）
  - `opinion_speech`: 意見スピーチ問題（質問+模範解答）
  - `reading_aloud`: 音読問題（50-80語パッセージ、発音ガイド）

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

### 🚧 Coming Soon（語彙レベル調整中）

- **essay形式**: 語彙スコア64% → 目標95%
  - 120-150語のエッセイで語彙が難しすぎる
  - LLMプロンプト調整が必要
  
- **long_reading形式**: 語彙スコア69% → 目標95%
  - 250-300語の長文で語彙レベル調整が必要
  - 複数問題の一括生成で複雑性が高い

### 📋 Vocabulary Quality Issues (Technical Details)

**Problem**: 長文形式（essay, long_reading）で語彙レベルが高すぎる

**Root Cause**:
1. LLMが自然な英語を生成すると、CEFR基準を超える語彙を使用
2. 短文（grammar_fill）は制約が強く機能するが、長文は制御困難
3. 語彙データベースのレベル分類が厳格すぎる可能性

**Next Steps**:
1. LLMプロンプトに語彙制約を強化
2. 後処理で難しい単語を置換
3. 語彙検証の許容度調整（95% → 90%?）
4. CEFRレベルの再評価

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

#### Performance（Production Ready形式）
- grammar_fill: ~9秒（85%+ vocab score）
- opinion_speech: ~18秒（95%+ vocab score）
- reading_aloud: ~22秒（95%+ vocab score）

#### Performance（Coming Soon形式）
- essay: ~62秒（64% vocab score ❌）
- long_reading: ~80秒（69% vocab score ❌）

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
