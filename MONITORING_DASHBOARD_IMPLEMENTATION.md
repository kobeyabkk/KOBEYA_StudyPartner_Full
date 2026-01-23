# Option 6: モニタリング・ダッシュボード構築 - 実装ガイド

## 📊 概要

Phase 7.8.1とデータベース修正完了後、システムの健全性を監視するモニタリングダッシュボードを構築します。

---

## 🎯 目標

1. **リアルタイム監視**: 問題生成の成功率、エラー率、パフォーマンスを可視化
2. **品質指標**: 検証成功率、多様性スコア、時制分布を追跡
3. **アラート機能**: 異常検知時に通知
4. **A/Bテスト**: 異なるパラメータの効果を比較

---

## ✅ 完了した作業 (Phase 1: データ収集基盤)

### 1. データベーススキーマ (✅ 完了)

**ファイル**: `migrations/0028_create_eiken_monitoring_system.sql`

**テーブル**:
- `eiken_generation_metrics` - 個別の生成メトリクス
- `eiken_metrics_hourly` - 時間別集計メトリクス
- `eiken_alert_config` - アラート設定
- `eiken_alert_events` - アラートイベントログ
- `eiken_experiments` - A/Bテスト実験
- `eiken_system_health` - システムヘルスメトリクス

**ビュー**:
- `eiken_metrics_24h` - 過去24時間のサマリー
- `eiken_active_alerts` - アクティブなアラート
- `eiken_experiment_results` - 実験結果

### 2. MonitoringService (✅ 完了)

**ファイル**: `src/eiken/services/monitoring-service.ts`

**機能**:
- メトリクスの記録
- 24時間サマリーの取得
- アクティブアラートの取得
- アラート条件の評価
- 時間別集計（Cron Job用）

**主要メソッド**:
```typescript
logMetric(metric: GenerationMetric): Promise<void>
getMetricsSummary(grade?, format?): Promise<MetricsSummary[]>
getActiveAlerts(): Promise<AlertEvent[]>
aggregateHourlyMetrics(): Promise<void>
```

### 3. APIルート (✅ 完了)

**ファイル**: `src/eiken/routes/monitoring-routes.ts`

**エンドポイント**:
- `GET /api/eiken/monitoring/metrics` - メトリクスサマリー
- `GET /api/eiken/monitoring/alerts` - アクティブアラート
- `POST /api/eiken/monitoring/alerts/:id/acknowledge` - アラート確認
- `POST /api/eiken/monitoring/alerts/:id/resolve` - アラート解決
- `GET /api/eiken/monitoring/experiments` - A/Bテスト結果
- `GET /api/eiken/monitoring/health` - システムヘルス
- `GET /api/eiken/monitoring/stats` - 総合統計

### 4. ダッシュボードUI (✅ 完了)

**ファイル**: `public/eiken-dashboard.html`

**機能**:
- リアルタイムメトリクス表示
- グレード別・形式別統計
- アラート表示
- A/Bテスト結果表示
- 自動更新（30秒間隔）
- フィルター機能（グレード、形式）

**アクセス**: `https://kobeyabkk-studypartner.pages.dev/eiken-dashboard.html`

### 5. ルート登録 (✅ 完了)

**ファイル**: `src/index.tsx`

```typescript
import monitoringRoutes from './eiken/routes/monitoring-routes'

app.route('/api/eiken/monitoring', monitoringRoutes)
```

---

## ⏳ 残りの作業

### Phase 1.6: メトリクス収集の統合 (推定時間: 1-2時間)

**目的**: 問題生成時に自動的にメトリクスを記録

**実装箇所**: `src/eiken/services/integrated-question-generator.ts`

**実装内容**:

1. **MonitoringService のインポート**:
```typescript
import { MonitoringService, type GenerationMetric } from './monitoring-service';
```

2. **コンストラクタで初期化**:
```typescript
private monitoringService: MonitoringService;

constructor(db: D1Database) {
  this.db = db;
  this.monitoringService = new MonitoringService(db);
  // ...
}
```

3. **generateQuestion メソッドにメトリクス収集を追加**:
```typescript
async generateQuestion(request: QuestionGenerationRequest): Promise<GeneratedQuestionData> {
  const startTime = Date.now();
  const requestId = this.generateRequestId();
  
  try {
    // ... 既存の生成ロジック ...
    
    const result = await this.performGeneration(/* ... */);
    
    // ✅ メトリクス記録 (成功)
    await this.monitoringService.logMetric({
      requestId,
      studentId: request.student_id,
      sessionId: request.session_id,
      grade: request.grade,
      format: request.format,
      topicCode: result.topic_code,
      blueprintId: result.blueprint_id,
      status: 'success',
      generationTimeMs: Date.now() - startTime,
      modelUsed: result.model_used,
      validationPassed: result.validation_passed,
      vocabularyScore: result.vocabulary_score,
      copyrightScore: result.copyright_score,
      // Phase 7 metrics
      sameVerbCheck: result.same_verb_check,
      timeMarkerCheck: result.time_marker_check,
      topicDiversityScore: result.topic_diversity_score,
      verbDiversityScore: result.verb_diversity_score,
      tenseDistribution: result.tense_distribution
    });
    
    return result;
    
  } catch (error) {
    // ❌ メトリクス記録 (失敗)
    await this.monitoringService.logMetric({
      requestId,
      studentId: request.student_id,
      sessionId: request.session_id,
      grade: request.grade,
      format: request.format,
      status: 'failed',
      generationTimeMs: Date.now() - startTime,
      modelUsed: 'unknown',
      errorType: error.name,
      errorMessage: error.message
    });
    
    throw error;
  }
}
```

4. **多様性スコアの計算**:
```typescript
private calculateDiversityScores(sessionId: string, topicCode: string, verb: string): {
  topicDiversityScore: number;
  verbDiversityScore: number;
} {
  // セッション内のトピック・動詞の多様性を計算
  // 例: 過去5問で異なるトピックの数 / 5
  return {
    topicDiversityScore: 0.8,
    verbDiversityScore: 0.9
  };
}
```

5. **時制分布の計算**:
```typescript
private analyzeTenseDistribution(questionText: string): {
  past: number;
  present: number;
  future: number;
} {
  // 時制マーカーを検出
  const hasPast = /yesterday|last|ago|did|was|were|had/.test(questionText);
  const hasFuture = /tomorrow|will|going to/.test(questionText);
  const hasPresent = /every day|usually|always|now/.test(questionText);
  
  return {
    past: hasPast ? 1 : 0,
    present: hasPresent ? 1 : 0,
    future: hasFuture ? 1 : 0
  };
}
```

---

### Phase 2: マイグレーション適用とテスト (推定時間: 30分)

**手順**:

1. **マイグレーション適用**:
```bash
# Cloudflare Dashboard で実行
# または wrangler CLI で実行
wrangler d1 migrations apply kobeya-logs-db --remote
```

2. **マイグレーション確認**:
```sql
-- テーブルが作成されたことを確認
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'eiken_%';

-- ビューが作成されたことを確認
SELECT name FROM sqlite_master WHERE type='view' AND name LIKE 'eiken_%';
```

3. **初期データ確認**:
```sql
-- デフォルトアラート設定を確認
SELECT * FROM eiken_alert_config;

-- 結果: 5件のデフォルトアラート設定
```

---

### Phase 3: ダッシュボード動作確認 (推定時間: 30分)

**手順**:

1. **ビルド & デプロイ**:
```bash
cd /home/user/webapp
npm run build
git add -A
git commit -m "feat(monitoring): Add monitoring dashboard (Option 6)"
git push origin main
```

2. **ダッシュボードアクセス**:
```
https://kobeyabkk-studypartner.pages.dev/eiken-dashboard.html
```

3. **動作確認項目**:
- ✅ メトリクスが表示される
- ✅ グレード別統計が表示される
- ✅ 形式別統計が表示される
- ✅ フィルターが動作する
- ✅ 自動更新が動作する

4. **テストデータ生成**:
```javascript
// ブラウザコンソールで実行
const API_BASE = 'https://kobeyabkk-studypartner.pages.dev/api/eiken';

async function generateTestData() {
  for (let i = 0; i < 5; i++) {
    await fetch(`${API_BASE}/questions/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: `monitor_test_${i}`,
        grade: '3',
        format: 'grammar_fill',
        count: 1
      })
    });
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('✅ Test data generated');
}

generateTestData();
```

5. **ダッシュボード確認**:
- 「🔄 更新」ボタンをクリック
- メトリクスが更新されることを確認

---

### Phase 4: ドキュメント作成 (推定時間: 30分)

**作成するドキュメント**:

1. **MONITORING_DASHBOARD_GUIDE.md** - ダッシュボード使用ガイド
2. **MONITORING_API_REFERENCE.md** - API リファレンス
3. **MONITORING_SETUP.md** - セットアップ手順

---

## 📊 追跡する指標

### 基本指標
- **総リクエスト数**: 24時間の合計
- **成功率**: successful / total × 100
- **検証成功率**: validation_passed / successful × 100
- **平均生成時間**: 平均ms

### 品質指標
- **語彙スコア**: 平均 (目標: 85+)
- **著作権スコア**: 平均 (目標: 95+)

### Phase 7 指標
- **トピック多様性**: セッション内の異なるトピック数
- **動詞多様性**: セッション内の異なる動詞数
- **時制分布**: Past/Present/Future の比率

---

## 🚨 アラート設定

デフォルトで以下のアラートが設定されます：

| アラート名 | タイプ | 閾値 | 比較 | 時間枠 |
|-----------|-------|------|------|--------|
| Low Success Rate | success_rate | 80.0% | < | 60分 |
| Low Validation Rate | validation_rate | 90.0% | < | 60分 |
| High Generation Time | generation_time | 10000ms | > | 60分 |
| Low Quality Score | quality_score | 70.0 | < | 60分 |
| High Error Rate | error_rate | 10.0% | > | 60分 |

---

## 🧪 A/Bテスト機能

### 実験の作成例

```sql
INSERT INTO eiken_experiments (
  experiment_id, experiment_name, description,
  variants, target_grade, target_format,
  parameters, status, start_date
) VALUES (
  'temp_035_vs_02',
  'Temperature 0.35 vs 0.2',
  'Phase 7.7で導入したTemperature 0.35の効果を検証',
  '[{"name": "control", "weight": 0.5}, {"name": "treatment", "weight": 0.5}]',
  '3',
  'grammar_fill',
  '{"temperature": {"control": 0.2, "treatment": 0.35}}',
  'running',
  datetime('now')
);
```

### 実験への割り当て

問題生成時に実験IDとvariantを指定：

```typescript
const experimentConfig = await getActiveExperiment(request.grade, request.format);
if (experimentConfig) {
  const variant = assignVariant(experimentConfig.variants);
  request.experimentId = experimentConfig.experiment_id;
  request.variant = variant;
  // パラメータを適用
  applyExperimentParameters(request, experimentConfig, variant);
}
```

---

## 📈 期待される効果

1. **問題の早期発見**: エラー率や成功率の異常を即座に検知
2. **品質の可視化**: Phase 7の改善効果を数値で確認
3. **データドリブンな意思決定**: A/Bテストで最適なパラメータを発見
4. **ユーザー体験の向上**: システムの健全性を維持

---

## 🚀 次のステップ

### 即座に実施
1. ✅ Phase 1.6: メトリクス収集の統合
2. ✅ Phase 2: マイグレーション適用
3. ✅ Phase 3: ダッシュボード動作確認

### 将来的に実施
1. 🟡 Grafana/Prometheusとの統合
2. 🟡 Slack/Email通知機能
3. 🟡 機械学習による異常検知
4. 🟡 パフォーマンス最適化の自動提案

---

## 📁 ファイル一覧

### 作成したファイル
- `migrations/0028_create_eiken_monitoring_system.sql` - DBスキーマ
- `src/eiken/services/monitoring-service.ts` - モニタリングサービス
- `src/eiken/routes/monitoring-routes.ts` - APIルート
- `public/eiken-dashboard.html` - ダッシュボードUI

### 修正したファイル
- `src/index.tsx` - ルート登録

### 今後修正するファイル
- `src/eiken/services/integrated-question-generator.ts` - メトリクス収集

---

## 🔧 トラブルシューティング

### エラー: "table already exists"
**原因**: マイグレーションが既に適用済み  
**対応**: 問題なし。既存のテーブルを使用

### エラー: "Failed to fetch metrics"
**原因**: APIルートが登録されていない  
**対応**: `src/index.tsx`でルート登録を確認

### ダッシュボードにデータが表示されない
**原因**: テストデータが生成されていない  
**対応**: テストデータ生成スクリプトを実行

---

## 📝 関連ドキュメント

- [PHASE_7.8.1_PRODUCTION_READY.md](./PHASE_7.8.1_PRODUCTION_READY.md) - Phase 7.8.1 成功レポート
- [DATABASE_FIX_VERIFICATION.md](./DATABASE_FIX_VERIFICATION.md) - データベース修正検証
- [PHASE_7.7_SUCCESS.md](./PHASE_7.7_SUCCESS.md) - Phase 7.7 多様性改善
- [PHASE_7.6_SUCCESS.md](./PHASE_7.6_SUCCESS.md) - Phase 7.6 Same Verb Different Forms

---

**最終更新**: 2026-01-23  
**ステータス**: Phase 1 完了、Phase 1.6-4 保留
