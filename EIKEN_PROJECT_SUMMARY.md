# 英検対策システム プロジェクトサマリー 📚

## 📁 作成したドキュメント

### 1. システム設計書（詳細版）
**ファイル**: `eiken-system-design.md`

**内容**:
- ✅ システム要件定義
- ✅ データベース設計（テーブル定義・インデックス）
- ✅ 技術スタック選定
- ✅ データ構造設計（JSON形式）
- ✅ UI/UX設計（画面モックアップ）
- ✅ AIプロンプト設計
- ✅ リスニング音声生成方法
- ✅ 実装フェーズ計画
- ✅ 注意点・課題

**対象読者**: 開発者、技術レビュアー

---

### 2. 他AI相談用プロンプト（詳細版・英語）
**ファイル**: `eiken-consultation-prompt.md`

**内容**:
- ✅ プロジェクト概要
- ✅ 技術スタック説明
- ✅ 8つの具体的な相談ポイント
  1. データベース設計のレビュー
  2. AI問題生成プロンプトの改善
  3. TTS選択のアドバイス
  4. データ投入方法の推奨
  5. 著作権・法的問題
  6. パフォーマンス最適化
  7. UI/UX設計
  8. セキュリティ
- ✅ 英検の構造説明
- ✅ 期待する回答形式

**用途**: Claude、ChatGPT、Gemini等の他AIに相談する際のプロンプト

---

### 3. 他AI相談用プロンプト（簡潔版・日本語）
**ファイル**: `eiken-consultation-prompt-ja-simple.md`

**内容**:
- ✅ やりたいことの要約
- ✅ 技術スタック
- ✅ 7つの質問（簡潔版）
- ✅ 特に知りたいポイント（優先度付き）

**用途**: 素早く要点を伝えたい場合、日本語でのコミュニケーション

---

### 4. 実装ロードマップ（詳細版）
**ファイル**: `eiken-implementation-roadmap.md`

**内容**:
- ✅ 8つのPhaseに分けた開発計画
- ✅ Phase 1: 基盤構築（2-3日）
- ✅ Phase 2: 基本UI実装（3-4日）
- ✅ Phase 3: リスニング機能（2-3日）
- ✅ Phase 4: AI問題生成（3-4日）
- ✅ Phase 5: 学習管理機能（2-3日）
- ✅ Phase 6: データ投入・管理（2-3日）
- ✅ Phase 7: テスト・改善（2-3日）
- ✅ Phase 8: デプロイ（1日）
- ✅ 具体的なコード例・コンポーネント設計
- ✅ マイルストーン設定
- ✅ リリース後の拡張計画

**総開発期間**: 2-3週間（フルタイム換算）

**用途**: 実装時の工程管理、タスク管理

---

## 🎯 プロジェクト概要（再掲）

### 目的
英検の過去問をデータベース化し、AIで類似問題を自動生成する学習支援システムを構築

### 主要機能
1. **過去問データベース** - 級別・大問別に分類保存
2. **AI類似問題生成** - GPT-4で新問題を自動作成
3. **リスニング対応** - TTS音声生成、速度調整
4. **学習管理** - 履歴記録、統計分析、弱点特定

### 技術スタック
- **Frontend**: React + TypeScript
- **Backend**: Cloudflare Workers (Hono)
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2
- **AI**: OpenAI GPT-4 + TTS API

---

## 📋 データベース設計（要約）

### 主要テーブル
```
eiken_questions (過去問マスタ)
├─ grade, section, question_type
├─ question_text, choices, correct_answer
└─ audio_url, explanation, grammar_points

generated_questions (生成問題)
├─ original_question_id
└─ 問題データ（同上）

learning_history (学習履歴)
├─ student_id, question_id
├─ user_answer, is_correct
└─ time_spent, attempted_at
```

---

## 🤖 AI活用ポイント

### 1. 問題生成
- 過去問と同じ形式・難易度で新問題作成
- 文法ポイント・語彙レベルを維持
- 選択肢の妥当性を確保

### 2. 音声生成
- OpenAI TTS APIで自然な英語音声
- 会話問題は複数話者の使い分け
- 速度調整対応（0.75x, 1.0x, 1.25x）

### 3. 学習分析
- 解答傾向から弱点分野を特定
- パーソナライズされたおすすめ問題提案

---

## 📊 UI/UX設計（要約）

### 画面構成
```
/eiken
  ├─ トップページ（級選択）
  ├─ /eiken/:grade
  │    └─ 級別トップ（セクション選択）
  ├─ /eiken/:grade/:section
  │    └─ 大問選択
  ├─ /eiken/:grade/:section/question/:id
  │    └─ 問題画面
  └─ /eiken/stats
       └─ 統計ダッシュボード
```

### 主要コンポーネント
- `<GradeSelector>` - 級選択
- `<QuestionPage>` - 問題表示
- `<AudioPlayer>` - リスニング再生
- `<StatsDashboard>` - 学習統計
- `<AnswerExplanation>` - 解説表示

---

## ⚠️ 重要な注意点

### 1. 著作権
- 英検の過去問は英検協会の著作物
- 教育目的・個人利用の範囲で使用
- 商用展開には許諾が必要

### 2. データの取り扱い
- AI Driveの`/Eiken`フォルダから過去問データを読み込み
- 現在はフォルダが空 → データ投入が必要

### 3. 品質管理
- AI生成問題の難易度調整
- TTS音声の品質確認
- 定期的なコンテンツレビュー

---

## 🚀 次のステップ

### すぐにできること
1. **AI Driveにデータアップロード**
   - `/Eiken`フォルダを作成
   - 過去問データ（JSON or PDF）を配置

2. **他AIに相談**
   - `eiken-consultation-prompt.md` を使用
   - DB設計やAI生成のアドバイスを求める

3. **プロトタイプ開発開始**
   - Phase 1から順に実装
   - まず1つの級（2級推奨）で試作

### 意思決定が必要な項目
- [ ] 最初に対応する級は？（推奨: 2級 or 準2級）
- [ ] データ投入方法は？（手動 / OCR+AI / 管理画面）
- [ ] TTS音声はどのサービス？（OpenAI / ElevenLabs / 人間収録）
- [ ] リリース目標日は？

---

## 📞 サポート・質問

開発中に困ったら：
1. `eiken-system-design.md` で設計を確認
2. `eiken-implementation-roadmap.md` で実装手順を確認
3. `eiken-consultation-prompt.md` で他AIに相談
4. 既存コードを参考に実装（International Student システム等）

---

## 🎉 まとめ

英検対策システムの設計書・相談プロンプト・実装ロードマップを作成しました！

**作成ファイル**:
1. ✅ `eiken-system-design.md` - 詳細設計書
2. ✅ `eiken-consultation-prompt.md` - 他AI相談用（詳細・英語）
3. ✅ `eiken-consultation-prompt-ja-simple.md` - 他AI相談用（簡潔・日本語）
4. ✅ `eiken-implementation-roadmap.md` - 実装ロードマップ

**次の行動**:
- AI Driveにデータを準備
- 他AIにアドバイスを求める
- 準備ができたら実装開始！

何か質問があれば遠慮なくお聞きください！ 🚀
