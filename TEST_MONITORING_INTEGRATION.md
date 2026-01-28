# モニタリング統合テスト (Option 6 - Phase 1.6)

## 📊 実装完了

### コミット情報
- **コミット**: 6b79211
- **ブランチ**: main
- **内容**: MonitoringServiceをIntegratedQuestionGeneratorに統合

### 実装内容
1. **MonitoringServiceの初期化**
   - コンストラクタで`MonitoringService`インスタンスを作成
   - データベース接続を共有

2. **メトリクス記録**
   - `generateQuestion`メソッドの成功時にメトリクスを記録
   - 非同期・非ブロッキング（エラーは致命的ではない）
   - 以下のメトリクスを収集:
     - 基本: request_id, student_id, grade, format, topic_code
     - パフォーマンス: generation_time_ms, model_used
     - 品質: vocabulary_score, copyright_score, validation_passed
     - Phase 7メトリクス: same_verb_check, time_marker_check, topic_diversity_score, verb_diversity_score, tense_distribution

3. **Phase 7メトリクス計算**
   - `calculateSameVerbScore()`: 同一動詞の異なる形態チェック（Phase 7.6）
   - `calculateTimeMarkerScore()`: 時制マーカーの存在チェック（Phase 7.8.1）
   - `calculateTopicDiversity()`: トピックの語彙多様性（Phase 7.7）
   - `calculateVerbDiversity()`: 選択肢の動詞多様性（Phase 7.7）
   - `calculateTenseDistribution()`: 時制分布の計算（Phase 7.8.1）

---

## ✅ テスト手順

### 前提条件
- マイグレーション 0028 が適用済み（Cloudflare D1 Console）
- 最新コードがCloudflare Pagesにデプロイ済み（自動デプロイで約3-5分）

### テスト1: 単一問題生成

**ブラウザコンソール**で以下を実行:

```javascript
// https://kobeyabkk-studypartner.pages.dev/ を開く
// F12でコンソールを開き、以下をコピー&ペースト

(async () => {
  const apiBase = 'https://kobeyabkk-studypartner.pages.dev/api/eiken';
  
  console.log('=== Monitoring Integration Test ===');
  
  // 1. 問題生成
  console.log('\n1️⃣ Generating question...');
  const genResponse = await fetch(`${apiBase}/questions/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student_id: 'monitoring_test',
      grade: '3',
      format: 'grammar_fill',
      count: 1
    })
  });
  
  const genData = await genResponse.json();
  console.log('✅ Question generated:', genData.success);
  console.log('   Generation time:', genData.data.metadata.generation_time_ms, 'ms');
  console.log('   Model used:', genData.data.metadata.model_used);
  
  // 2. メトリクス確認（30秒待機）
  console.log('\n2️⃣ Waiting 30 seconds for metrics to be logged...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  console.log('\n3️⃣ Checking metrics...');
  const metricsResponse = await fetch(`${apiBase}/monitoring/stats`);
  const metricsData = await metricsResponse.json();
  
  if (metricsData.success && metricsData.data.overall) {
    const overall = metricsData.data.overall;
    console.log('✅ Metrics logged successfully!');
    console.log('   Total requests:', overall.total_requests);
    console.log('   Success rate:', overall.success_rate, '%');
    console.log('   Avg generation time:', overall.avg_generation_time_ms, 'ms');
    console.log('   Vocabulary score:', overall.avg_vocabulary_score);
    console.log('   Topic diversity:', overall.avg_topic_diversity);
    console.log('   Verb diversity:', overall.avg_verb_diversity);
  } else {
    console.log('⚠️ No metrics found yet');
    console.log('Response:', metricsData);
  }
  
  console.log('\n=== Test Complete ===');
})();
```

### テスト2: 複数問題生成（負荷テスト）

```javascript
(async () => {
  const apiBase = 'https://kobeyabkk-studypartner.pages.dev/api/eiken';
  
  console.log('=== Multiple Questions Test ===');
  
  const formats = ['grammar_fill', 'grammar_fill', 'grammar_fill'];
  
  for (let i = 0; i < formats.length; i++) {
    console.log(`\n${i + 1}/${formats.length} Generating ${formats[i]}...`);
    
    const response = await fetch(`${apiBase}/questions/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: `load_test_${i}`,
        grade: '3',
        format: formats[i],
        count: 1
      })
    });
    
    const data = await response.json();
    if (data.success) {
      console.log(`✅ ${i + 1}/${formats.length} Success (${data.data.metadata.generation_time_ms}ms)`);
    } else {
      console.log(`❌ ${i + 1}/${formats.length} Failed:`, data.error);
    }
    
    // リクエスト間に1秒待機
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n⏳ Waiting 30 seconds for metrics...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  console.log('\n📊 Checking dashboard metrics...');
  const metricsResponse = await fetch(`${apiBase}/monitoring/stats`);
  const metricsData = await metricsResponse.json();
  
  if (metricsData.success && metricsData.data.overall) {
    console.log('✅ Overall metrics:');
    console.log('   Total:', metricsData.data.overall.total_requests);
    console.log('   Success rate:', metricsData.data.overall.success_rate, '%');
    console.log('   Avg time:', metricsData.data.overall.avg_generation_time_ms, 'ms');
    
    console.log('\n📈 By Format:');
    metricsData.data.byFormat.forEach(fmt => {
      console.log(`   ${fmt.format}: ${fmt.total_requests} requests, ${fmt.success_rate}% success`);
    });
  }
  
  console.log('\n=== Test Complete ===');
  console.log('Open dashboard: https://kobeyabkk-studypartner.pages.dev/eiken-dashboard.html');
})();
```

---

## 📋 期待される結果

### テスト1の期待結果
```
=== Monitoring Integration Test ===

1️⃣ Generating question...
✅ Question generated: true
   Generation time: 12340 ms
   Model used: gpt-4o-mini

2️⃣ Waiting 30 seconds for metrics to be logged...

3️⃣ Checking metrics...
✅ Metrics logged successfully!
   Total requests: 1
   Success rate: 100 %
   Avg generation time: 12340 ms
   Vocabulary score: 88.5
   Topic diversity: 0.82
   Verb diversity: 0.84

=== Test Complete ===
```

### テスト2の期待結果
```
=== Multiple Questions Test ===

1/3 Generating grammar_fill...
✅ 1/3 Success (11234ms)

2/3 Generating grammar_fill...
✅ 2/3 Success (13456ms)

3/3 Generating grammar_fill...
✅ 3/3 Success (12789ms)

⏳ Waiting 30 seconds for metrics...

📊 Checking dashboard metrics...
✅ Overall metrics:
   Total: 3
   Success rate: 100 %
   Avg time: 12493 ms

📈 By Format:
   grammar_fill: 3 requests, 100% success

=== Test Complete ===
Open dashboard: https://kobeyabkk-studypartner.pages.dev/eiken-dashboard.html
```

---

## 🔍 データベース確認

Cloudflare D1 Consoleで以下のクエリを実行:

### メトリクスデータ確認
```sql
-- 最新の10件
SELECT 
  student_id,
  grade,
  format,
  status,
  generation_time_ms,
  vocabulary_score,
  topic_diversity_score,
  verb_diversity_score,
  created_at
FROM eiken_generation_metrics
ORDER BY created_at DESC
LIMIT 10;
```

### 集計データ確認
```sql
-- グレード別統計
SELECT 
  grade,
  COUNT(*) as total,
  ROUND(AVG(CASE WHEN status = 'success' THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate,
  ROUND(AVG(generation_time_ms), 2) as avg_time_ms,
  ROUND(AVG(vocabulary_score), 2) as avg_vocab_score
FROM eiken_generation_metrics
GROUP BY grade;
```

### Phase 7 メトリクス確認
```sql
-- Phase 7 メトリクスの詳細
SELECT 
  grade,
  format,
  same_verb_check,
  time_marker_check,
  topic_diversity_score,
  verb_diversity_score,
  tense_distribution
FROM eiken_generation_metrics
WHERE created_at >= datetime('now', '-1 hour')
ORDER BY created_at DESC;
```

---

## 🎯 成功基準

### Phase 1.6 完了条件
- [x] MonitoringServiceの統合
- [x] メトリクス記録の実装
- [x] Phase 7メトリクスの計算
- [ ] **テスト1**: 単一問題生成でメトリクスが記録される
- [ ] **テスト2**: 複数問題生成でメトリクスが集計される
- [ ] **データベース確認**: eiken_generation_metricsテーブルにデータが存在
- [ ] **ダッシュボード確認**: メトリクスカードに数値が表示される

---

## 🚀 次のステップ

### Phase 1.6完了後
1. **Phase 2**: ダッシュボードUI改善（2-3日）
   - チャートライブラリの統合（Chart.js）
   - 時系列グラフの実装
   - リアルタイム更新の最適化

2. **Phase 3**: アラート機能の実装（1日）
   - 閾値ベースのアラート
   - ブラウザ通知（オプション）

3. **Phase 4**: A/Bテスト基盤（1-2日）
   - 実験管理UI
   - 結果比較ダッシュボード

---

## 📝 トラブルシューティング

### メトリクスが記録されない場合

1. **マイグレーション確認**
```sql
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'eiken_%';
```
期待: 6テーブル（eiken_generation_metrics, eiken_metrics_hourly, etc.）

2. **外部キー制約確認**
```sql
PRAGMA foreign_keys;
```
期待: 1（有効）

3. **MonitoringServiceのログ確認**
- ブラウザコンソールで`[Monitoring]`で検索
- 期待: `[Monitoring] Metrics logged successfully`

4. **API エラー確認**
```javascript
fetch('https://kobeyabkk-studypartner.pages.dev/api/eiken/monitoring/stats')
  .then(r => r.json())
  .then(d => console.log(d));
```

---

## 📊 ダッシュボードURL

https://kobeyabkk-studypartner.pages.dev/eiken-dashboard.html

---

## ✅ 完了チェックリスト

- [x] Phase 1: データ収集基盤（マイグレーション、テーブル、ビュー）
- [x] Phase 1.1: MonitoringService実装
- [x] Phase 1.2: APIルート実装
- [x] Phase 1.3: ダッシュボードHTML作成
- [x] Phase 1.4: ドキュメント作成
- [x] Phase 1.5: GitHub コミット・プッシュ
- [x] **Phase 1.6: メトリクス収集統合**
- [ ] Phase 1.7: 実データテスト（本手順書）
- [ ] Phase 2: ダッシュボードUI改善
- [ ] Phase 3: アラート機能
- [ ] Phase 4: A/Bテスト基盤

---

**現在のステータス**: Phase 1.6完了 → Phase 1.7テスト実施中
