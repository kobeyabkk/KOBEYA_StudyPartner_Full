# AI & プログラミングのKOBEYA - Study Partner System

バンコク在住の日本人小中学生向けプログラミング教室のAI学習パートナーシステム

## 🎯 プロジェクト概要

### 目的
- **Primary Goal**: AI学習パートナーによる個別最適化学習支援
- バンコクの日本人学生向け画像解析・段階的学習システム
- 保護者への学習進捗レポート自動生成機能

### ターゲット
- バンコク在住の日本人家庭
- 小学1年生〜中学3年生の子どもを持つ保護者
- プログラミング教育に関心のある家庭

## 🏗️ 技術スタック

- **Framework**: Hono (Cloudflare Workers)
- **Language**: TypeScript/JSX
- **Database**: Cloudflare D1 (SQLite)
- **AI**: OpenAI GPT-4o, GPT-4o Vision
- **Styling**: Tailwind CSS (CDN) + Custom CSS
- **Deployment**: Cloudflare Pages
- **Frontend**: Vanilla JavaScript (ES6+)
- **Process Manager**: PM2 (development)

## 📖 現在実装されている機能

### ✅ AI学習パートナー機能

#### 1. **画像解析・段階学習システム**
- OpenAI GPT-4o Vision による画像解析
- 問題の複雑さに応じた4-7ステップの動的段階学習生成
- **5-8問の類似問題自動生成**（easy→medium→hard）
  - **混合形式対応**: 選択問題（60%）と記述問題（40%）をミックス
  - **段階的学習・確認問題**: 必ず選択肢形式で統一表示
  - **類似問題**: choice形式とinput形式の柔軟な組み合わせ
- ステップバイステップの確認問題
- リアルタイム回答チェックとフィードバック

#### 2. **AI質問チャット機能**
- テキスト・画像対応の質問受付
- 文部科学省学習指導要領準拠の回答生成
- 学習コンテキストを考慮した個別サポート
- 別ウィンドウでの専用チャット環境

#### 3. **学習ログ記録システム**
- 学習セッション自動記録
- 学習時間・正答率・弱点タグの自動集計
- 数値正規化（全角→半角、文字列→数値変換）
- 教材マスターデータによるタグ推定

#### 4. **保護者レポート生成機能**
- 週次学習レポート自動生成
- 学習時間、正答率、弱点分析の集計
- 次回推奨アクション提案
- Webhook Secret認証によるセキュア通信

### ✅ ユーザーインターフェース

#### メイン学習画面
- ✅ ログイン認証システム（APP_KEY + 生徒ID）
- ✅ AIに質問ボタン
- ✅ カメラ撮影・ファイル選択機能
- ✅ 画像クロップ機能（Cropper.js）
- ✅ アップロード進行表示
- ✅ 段階学習・類似問題インターフェース

#### 🆕 英検対策機能（Phase 3-4 本番稼働中）
- ✅ **5形式の問題生成**: grammar_fill, opinion_speech, reading_aloud, **essay**, **long_reading**
- ✅ **語彙レベル検証**: CEFR準拠の語彙チェック（A1-C2）
- ✅ **著作権検証**: 過去問類似度チェック
- ✅ **トピック管理**: 61トピック（5級-1級）
- ✅ **Blueprint システム**: AIプロンプト最適化
- ✅ **全選択肢の語彙解説**: 正解・不正解全ての意味を表示

#### 🚀 Phase 4 語彙品質改善（本番稼働）
- ✅ **VocabularyFailureTracker**: 動的禁止語学習システム
- ✅ **Few-shot Examples**: Good/Bad対比による語彙制御
- ✅ **Optimal Temperature**: 形式別LLMパラメータ調整（0.25-0.5）
- ✅ **Adaptive Thresholds**: 形式・長さに応じた語彙検証基準
- 🎉 **実績**: essay 64%→80%, long_reading 69%→84% (Phase 4完了)

#### 新機能プレースホルダー
- ✅ 小論文対策（実装予定）
- ✅ インター生用（実装予定）

### ✅ バックエンド・データベース機能

#### API エンドポイント
- ✅ `/api/health` - システムヘルスチェック
- ✅ `/api/login` - 生徒認証
- ✅ `/api/analyze-and-learn` - 画像解析・学習開始
- ✅ `/api/step/check` - 段階学習ステップ確認
- ✅ `/api/confirmation/check` - 確認問題チェック
- ✅ `/api/similar/check` - 類似問題チェック
- ✅ `/api/ai/chat` - AI質問チャット
- ✅ `/api/logs` - 学習ログ記録（Webhook Secret認証）
- ✅ `/api/logs/health` - ログシステムヘルスチェック
- ✅ `/api/reports/weekly` - 週次レポート生成
- ✅ `/api/eiken/questions/generate` - 英検問題生成（4形式対応）
- ✅ `/api/eiken/questions/list` - 生成済み問題一覧
- ✅ `/api/eiken/questions/:id` - 問題詳細取得

#### データベーススキーマ（Cloudflare D1）
- ✅ `logs` - 学習ログデータ
- ✅ `students` - 生徒マスターデータ
- ✅ `master_materials` - 教材マスターデータ
- ✅ `eiken_generated_questions` - 英検生成問題
- ✅ `eiken_vocabulary_lexicon` - 英検語彙データベース（10,000+語）
- ✅ `eiken_topic_areas` - トピック管理（61トピック）
- ✅ `eiken_topic_question_type_suitability` - 形式適性スコア
- ✅ `eiken_topic_usage_history` - トピック使用履歴

## 🎨 デザインシステム

### カラーパレット
- **Primary Blue**: #2563eb
- **Primary Yellow**: #fbbf24 (CTA)
- **Accent Green**: #10b981 (LINE)
- **Accent Purple**: #8b5cf6 (AI)
- **Text**: #1f2937, #6b7280
- **Background**: #ffffff, #f8fafc

### タイポグラフィ
- **日本語**: Noto Sans JP (300, 400, 500, 600, 700)
- **英語**: Inter (300, 400, 500, 600, 700)

## 📱 主要URI一覧

### 🎓 学習システム
| Path | Method | 説明 | 主な機能 |
|------|--------|------|----------|
| `/` | GET | メイン学習画面 | ログイン、画像アップロード、AI学習 |
| `/ai-chat/:sessionId` | GET | AI質問チャット | 別ウィンドウでの質問・回答 |

### 🔧 学習API
| Path | Method | 認証 | 説明 |
|------|--------|------|------|
| `/api/health` | GET | なし | システムヘルスチェック |
| `/api/login` | POST | APP_KEY | 生徒認証 |
| `/api/analyze-and-learn` | POST | なし | 画像解析・学習開始 |
| `/api/step/check` | POST | なし | 段階学習ステップ確認 |
| `/api/confirmation/check` | POST | なし | 確認問題チェック |
| `/api/similar/check` | POST | なし | 類似問題チェック |
| `/api/ai/chat` | POST | なし | AI質問チャット |

### 📊 ログ・レポートAPI
| Path | Method | 認証 | 説明 |
|------|--------|------|------|
| `/api/logs/health` | GET | なし | ログシステムヘルスチェック |
| `/api/logs` | POST | Webhook Secret | 学習ログ記録 |
| `/api/reports/weekly` | POST | Webhook Secret | 週次レポート生成 |

### 🎓 英検対策API（Phase 3）
| Path | Method | 説明 | 対応形式 |
|------|--------|------|----------|
| `/api/eiken/questions/generate` | POST | 問題生成 | grammar_fill, opinion_speech, reading_aloud |
| `/api/eiken/questions/list` | GET | 問題一覧 | 全形式 |
| `/api/eiken/questions/:id` | GET | 問題詳細 | 全形式 |

#### 問題生成リクエスト例
```json
{
  "student_id": "12345",
  "grade": "pre2",
  "format": "grammar_fill",
  "mode": "practice"
}
```

#### 対応形式（Production Ready）
- ✅ `grammar_fill` - 文法穴埋め問題（4択、語彙解説付き）
- ✅ `opinion_speech` - 意見スピーチ問題（質問+模範解答）
- ✅ `reading_aloud` - 音読問題（50-80語パッセージ、発音ガイド）

#### Coming Soon（語彙レベル調整中）
- 🚧 `essay` - エッセイ問題（語彙スコア64% → 目標95%）
- 🚧 `long_reading` - 長文読解問題（語彙スコア69% → 目標95%）

#### 利用可能グレード
`5`, `4`, `3`, `pre2`, `2`, `pre1`, `1` (小文字)

## 🗄️ データ構造

### 学習ログデータ
```typescript
interface LogRequest {
  student_id: string;
  student_name?: string;
  date: string; // YYYY-MM-DD
  subject: string;
  textbook_code?: string;
  page?: number | null;
  problem_id?: string;
  error_tags?: string[];
  tasks_done?: string;
  problems_attempted?: string;
  correct?: string;
  incorrect?: string;
  mini_quiz_score?: string;
  weak_tags?: string[];
  next_action?: string;
  started_at?: string; // ISO datetime
  ended_at?: string; // ISO datetime
  flag_teacher_review?: boolean;
  request_id?: string; // 冪等性キー
}
```

### 週次レポートデータ
```typescript
interface WeeklyReport {
  student_id: string;
  period: {
    start: string; // YYYY-MM-DD
    end: string; // YYYY-MM-DD
  };
  summary: {
    sessions: number; // セッション数
    minutes: number; // 学習時間（分）
    avg_score: number; // 平均点
    weak_tags_top3: string[]; // 弱点タグTOP3
    student_name: string;
    next_action: string;
  };
  logs_count: number;
}
```

### 生徒データ
```typescript
interface StudentInfo {
  student_id: string;
  student_name: string;
  grade: number;
  subjects: string[];
  weakSubjects: string[];
  lastLogin: string;
}
```

## 🎓 教育方針フレームワーク (ninsoku.json)

### 文部科学省学習指導要領準拠
- **主体的・対話的で深い学び（アクティブラーニング）**: 段階的思考プロセス支援
- **3つの観点評価**: 知識・技能、思考・判断・表現、学習態度の統合指導
- **教科横断的能力**: 言語能力、情報活用能力、問題解決能力の育成
- **個別最適化支援**: 学習履歴と理解度に応じた説明方法選択
- **安全性・倫理**: デジタル・シティズンシップ、教育倫理の遵守

### AI指導プロトコル
- **コミュニケーションスタイル**: 中学生に適した敬語、励ましと支援姿勢
- **質問技法**: ソクラテス式問答法、スキャフォールディング活用
- **エラーハンドリング**: 失敗を学習機会として前向きに活用

## 🚀 デプロイ状況

### 本番環境
- **Status**: ✅ 稼働中
- **URL**: https://kobeyabkk-studypartner.pages.dev/
- **Platform**: Cloudflare Pages

### 開発環境
- **Status**: ✅ 動作中
- **Command**: `npm run build && npm run dev:sandbox`
- **Local URL**: http://localhost:3000

### ⚠️ 重要：環境変数の設定

デプロイ前に、以下のシークレットをCloudflare PagesダッシュボードまたはWrangler CLIで設定してください：

```bash
# 必須のシークレットを設定（ターミナルで実行）
wrangler secret put OPENAI_API_KEY
wrangler secret put WEBHOOK_SECRET
wrangler secret put ADMIN_EMAIL
```

または**Cloudflare Pagesダッシュボード**から設定：
1. プロジェクト設定を開く
2. 「環境変数」に移動
3. 以下の変数を追加：
   - `OPENAI_API_KEY`: OpenAI APIキー
   - `WEBHOOK_SECRET`: Webhook認証用シークレット
   - `ADMIN_EMAIL`: 管理者メールアドレス

---

## 🔒 セキュリティ

### 環境変数

このプロジェクトには以下の環境変数が必要です：

| 変数名 | 説明 | 必須 |
|--------|------|------|
| `OPENAI_API_KEY` | OpenAI API キー (GPT-4o用) | ✅ 必須 |
| `WEBHOOK_SECRET` | Webhook認証用シークレット | ✅ 必須 |
| `ADMIN_EMAIL` | 管理者メールアドレス | ✅ 必須 |

**これらの値は絶対にGitにコミットしないでください。** 必ず以下を使用してください：
- ローカル開発: `.env` ファイル（gitignore済み）
- 本番環境: Cloudflare Pages環境変数
- 機密データ: `wrangler secret` コマンド

### セキュリティ問題の報告

セキュリティ脆弱性を発見した場合は、以下にご連絡ください：  
📧 info@kobeya-programming.com

48時間以内に返信し、問題解決に向けて協力させていただきます。

---

## 📋 次のステップ

### 🔄 今後の実装予定

#### 1. 画像最適化
- [ ] 全ページの画像を実際の教室写真に差し替え
- [ ] WebP形式への変換
- [ ] 適切なalt属性の設定

#### 2. 機能拡張
- [ ] Google Maps埋め込み
- [ ] LINE Bot連携
- [ ] Google Analytics 4設定
- [ ] 送信フォームの通知機能強化

#### 3. コンテンツ充実
- [ ] 生徒作品ギャラリー
- [ ] 保護者の声の追加
- [ ] ブログ機能の拡張

#### 4. パフォーマンス最適化
- [ ] 画像の遅延読み込み
- [ ] CDNキャッシュ最適化
- [ ] Core Web Vitals改善

## 🛠️ 開発・デプロイ手順

### ローカル開発
```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run build
npm run dev:sandbox
```

### デプロイ
```bash
# ビルド
npm run build

# Cloudflare Pages デプロイ
npm run deploy:prod
```

## 📞 サポート情報

### 連絡先
- **教室名**: AI & プログラミングのKOBEYA
- **代表**: 鈴木政路（すずき まさみち）
- **所在地**: フジスーパー2号店2階
- **電話**: 066-123-4567
- **LINE**: @kobeya
- **メール**: info@kobeya-programming.com

### 開講時間
- **平日**: 16:00-20:00
- **土日**: 9:00-17:00
- **定休日**: なし（祝日は要確認）

## 🔄 最新の更新履歴

### v2.1.0 - 類似問題混合形式対応実装 (2025-10-13)

#### ✅ 類似問題形式多様化
**新機能**: 類似問題で選択問題と記述問題を混合表示する機能を実装

#### 📚 学習体験の改善
- **段階的学習**: 必ず選択肢形式で統一（学習効果の確実性重視）
- **確認問題**: 必ず選択肢形式で統一（復習効果の確実性重視） 
- **類似問題**: 選択問題（60%）+ 記述問題（40%）の混合形式
  - choice形式: 4つの選択肢から選択
  - input形式: テキストエリアでの自由記述回答

#### 🤖 AI生成プロンプト強化
- OpenAI GPT-4o に類似問題の混合形式生成を指示
- easy問題の60%をchoice、40%をinputで自動配分
- 各問題タイプに応じた適切な正答パターン生成

#### 💻 フロントエンド・バックエンド対応
- **フロントエンド**: choice/input両形式のUI自動切替
- **バックエンド**: 両形式の回答検証と採点ロジック
- **既存機能保護**: 段階学習・確認問題の動作維持

#### 🎯 将来対応準備
- 記述問題での写真アップロード機能（手書き回答のAI採点）
- チャット形式での対話型回答機能
- より高度なAI採点アルゴリズム

---

### v2.0.0 - 学習ログ・保護者レポートシステム実装 (2025-10-12)

#### ✅ 新機能実装
**追加機能**: 生徒の学習ログ記録と保護者向け週次レポート自動生成システム

#### 🗄️ データベース機能
- **Cloudflare D1データベース導入**: SQLite ベースの分散データベース
- **3つのテーブル**: logs（学習ログ）、students（生徒マスター）、master_materials（教材マスター）
- **自動マイグレーション**: 開発・本番環境の自動スキーマ同期

#### 📊 ログ収集システム
- **数値正規化**: 全角→半角、文字列→数値の自動変換
- **タグ推定**: 教材マスターデータに基づく弱点タグ自動推定
- **時間計算**: 学習開始・終了時刻からの自動時間計算
- **冪等性保証**: request_id による重複防止機能

#### 📈 レポート生成機能
- **週次サマリ**: セッション数、学習時間、平均点の自動集計
- **弱点分析**: 頻度TOP3の弱点タグ自動抽出
- **推奨アクション**: 学習成果に基づく次回アクション提案
- **保護者通知**: JSON形式での構造化レポート生成

#### 🔐 セキュリティ機能
- **Webhook Secret認証**: X-Webhook-Secret ヘッダーによる認証
- **環境変数管理**: WEBHOOK_SECRET、VERSION の設定
- **API分離**: 認証不要の学習API と認証必要なログAPI の分離

#### 🔧 技術的改善
- **TypeScript型安全性**: 全APIの型定義強化
- **エラーハンドリング**: 包括的なエラー処理とログ出力
- **開発環境最適化**: PM2 + D1 ローカル環境の構築
- **ユーティリティ関数**: 再利用可能なログ処理関数群

#### 📋 新しいプレースホルダー機能
- **英検対策（実装予定）**: 英語能力試験対応学習
- **小論文対策（実装予定）**: 論文・作文指導機能
- **インター生用（実装予定）**: 国際学校生向けサポート

#### 🧪 テスト・検証
- **API動作確認**: ヘルスチェック、ログ収集、週次レポート生成
- **データ正規化検証**: 「練習３問完了」→ tasks_done=3 の自動変換
- **タグ推定検証**: MATH2A-25ページ → 「二次方程式」「因数分解」「代数」推定
- **既存機能保護**: 画像解析・AI学習機能の動作維持確認

---

### v1.1.0 - AI段階学習の動的生成機能強化 (2025-01-11)
- 段階学習: 4-7ステップの動的生成
- 類似問題: 5-8問の段階的難易度生成
- AIプロンプト強化と品質保証機能

---

**Last Updated**: 2025-10-13
**Version**: 2.1.0
**Status**: ✅ Mixed Format Similar Problems Implemented & Learning Analytics System Active# ビルドテスト
