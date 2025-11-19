# Migration 0010: Topic Management System - 実行ガイド

**ファイル**: `/home/user/webapp/migrations/0010_create_topic_system.sql`  
**サイズ**: 47KB (852行)  
**作成日**: 2025-11-19  
**Phase**: 2A - Topic Selection Infrastructure

---

## 📋 **マイグレーション概要**

### 作成されるもの

#### **5つのテーブル**
1. `eiken_topic_areas` - トピックマスターリスト（61レコード）
2. `eiken_topic_question_type_suitability` - 形式適合性スコア（175レコード）
3. `eiken_topic_usage_history` - LRU履歴追跡（初期0、使用により増加）
4. `eiken_topic_blacklist` - 失敗トピック除外（初期0、失敗により増加）
5. `eiken_topic_statistics` - パフォーマンス統計（初期0、使用により増加）

#### **13個のインデックス**
パフォーマンス最適化のための戦略的インデックス

#### **236レコードの初期データ**
- 61トピック（全7級）
- 175適合性スコア（236問の実データから算出）

---

## 🚀 **実行手順**

### **ステップ1: ローカル環境でテスト**

```bash
# ローカルD1データベースで実行
cd /home/user/webapp
npx wrangler d1 execute eiken-db --local --file=migrations/0010_create_topic_system.sql
```

**期待される出力**:
```
🌀 Executing on local database eiken-db (xxxx-xxxx-xxxx-xxxx) from migrations/0010_create_topic_system.sql:
🚣 Executed 242 commands in XXXXms
```

### **ステップ2: 検証クエリ実行**

```bash
# トピック数確認（期待値: 61）
npx wrangler d1 execute eiken-db --local --command="SELECT COUNT(*) as total FROM eiken_topic_areas"

# 級ごとのトピック数（期待値: 5=7, 4=10, 3=8, pre2=10, 2=6, pre1=9, 1=11）
npx wrangler d1 execute eiken-db --local --command="SELECT grade, COUNT(*) as count FROM eiken_topic_areas GROUP BY grade"

# 適合性スコア数（期待値: 175）
npx wrangler d1 execute eiken-db --local --command="SELECT COUNT(*) as total FROM eiken_topic_question_type_suitability"
```

### **ステップ3: 本番環境へデプロイ**

```bash
# 本番D1データベースで実行
npx wrangler d1 execute eiken-db --remote --file=migrations/0010_create_topic_system.sql
```

⚠️ **注意**: 本番実行前に必ずローカルテストを完了させてください。

---

## 📊 **期待されるデータ分布**

### トピック数（級別）

| 級 | トピック数 | 抽象度範囲 | コンテキストタイプ |
|----|-----------|-----------|------------------|
| 5級 | 7 | 1-2 | personal, daily |
| 4級 | 10 | 1-2 | personal, daily |
| 3級 | 8 | 2-3 | daily, general |
| 準2級 | 10 | 3-4 | general |
| 2級 | 6 | 4-6 | general, social |
| 準1級 | 9 | 6-7 | social, policy |
| 1級 | 11 | 7-8 | policy |
| **合計** | **61** | **1-8** | **5種類** |

### 適合性スコア分布

| スコア | レコード数 | 意味 |
|--------|-----------|------|
| 1.3 | ~20 | 高信頼（5+サンプル） |
| 1.2 | ~30 | 良好（3-4サンプル） |
| 1.0 | ~50 | 中立（2サンプル） |
| 0.9 | ~75 | 低信頼（1サンプル） |

### トピックの抽象度進行

```
Grade 5:  ●●        (1-2) - 具体的な個人体験
Grade 4:  ●●        (1-2) - より詳細な個人体験  
Grade 3:   ●●       (2-3) - 馴染みのある社会的状況
Grade Pre-2: ●●     (3-4) - 一般的な社会概念
Grade 2:      ●●●   (4-6) - 抽象的な社会問題
Grade Pre-1:    ●●● (6-7) - 政策と批判的分析
Grade 1:       ●●●● (7-8) - 哲学的・システム的
```

---

## 🔍 **検証クエリ集**

### 1. 基本カウント確認

```sql
-- 全テーブルのレコード数
SELECT 'topics' as table_name, COUNT(*) as count FROM eiken_topic_areas
UNION ALL
SELECT 'suitability', COUNT(*) FROM eiken_topic_question_type_suitability
UNION ALL
SELECT 'history', COUNT(*) FROM eiken_topic_usage_history
UNION ALL
SELECT 'blacklist', COUNT(*) FROM eiken_topic_blacklist
UNION ALL
SELECT 'statistics', COUNT(*) FROM eiken_topic_statistics;

-- 期待値:
-- topics: 61
-- suitability: 175
-- history: 0 (使用開始後に増加)
-- blacklist: 0 (失敗発生後に増加)
-- statistics: 0 (使用開始後に増加)
```

### 2. トピック詳細確認

```sql
-- 級ごとのトピック詳細
SELECT 
  grade,
  topic_code,
  topic_label_ja,
  abstractness_level,
  context_type,
  weight
FROM eiken_topic_areas
WHERE is_active = 1
ORDER BY 
  CASE grade 
    WHEN '5' THEN 1 WHEN '4' THEN 2 WHEN '3' THEN 3 
    WHEN 'pre2' THEN 4 WHEN '2' THEN 5 
    WHEN 'pre1' THEN 6 WHEN '1' THEN 7 
  END,
  abstractness_level;
```

### 3. 適合性スコア分析

```sql
-- スコア分布
SELECT 
  suitability_score,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM eiken_topic_question_type_suitability), 1) as percentage
FROM eiken_topic_question_type_suitability
GROUP BY suitability_score
ORDER BY suitability_score DESC;
```

### 4. インデックス確認

```sql
-- 作成されたインデックス一覧
SELECT 
  name,
  tbl_name,
  sql
FROM sqlite_master 
WHERE type = 'index' 
  AND tbl_name LIKE 'eiken_topic%'
  AND name LIKE 'idx_%'
ORDER BY tbl_name, name;

-- 期待値: 13個のインデックス
```

### 5. データ整合性チェック

```sql
-- 重複チェック（期待値: 0）
SELECT topic_code, grade, COUNT(*) as duplicates
FROM eiken_topic_areas
GROUP BY topic_code, grade
HAVING COUNT(*) > 1;

-- 抽象度範囲チェック（期待値: すべて1-8の範囲内）
SELECT 
  grade,
  MIN(abstractness_level) as min_abs,
  MAX(abstractness_level) as max_abs
FROM eiken_topic_areas
GROUP BY grade
ORDER BY CASE grade 
  WHEN '5' THEN 1 WHEN '4' THEN 2 WHEN '3' THEN 3 
  WHEN 'pre2' THEN 4 WHEN '2' THEN 5 
  WHEN 'pre1' THEN 6 WHEN '1' THEN 7 
END;
```

---

## ⚠️ **トラブルシューティング**

### エラー: "table already exists"

**原因**: テーブルが既に存在する

**解決策**:
```sql
-- テーブルを削除して再実行（開発環境のみ！）
DROP TABLE IF EXISTS eiken_topic_statistics;
DROP TABLE IF EXISTS eiken_topic_blacklist;
DROP TABLE IF EXISTS eiken_topic_usage_history;
DROP TABLE IF EXISTS eiken_topic_question_type_suitability;
DROP TABLE IF EXISTS eiken_topic_areas;

-- その後、マイグレーションを再実行
```

### エラー: "UNIQUE constraint failed"

**原因**: 重複データの挿入試行

**解決策**:
```sql
-- 既存データを確認
SELECT COUNT(*) FROM eiken_topic_areas;

-- 既にデータがある場合は、INSERTをスキップするか
-- テーブルをクリアしてから再実行
DELETE FROM eiken_topic_areas;
```

### パフォーマンスが遅い

**原因**: インデックスが作成されていない

**確認**:
```sql
-- インデックス数を確認
SELECT COUNT(*) FROM sqlite_master 
WHERE type = 'index' AND tbl_name LIKE 'eiken_topic%';

-- 期待値: 13個以上（自動作成を含む）
```

---

## 📝 **マイグレーション後の次のステップ**

### 1. TopicSelector サービス実装 ✅ 次のタスク

**ファイル**: `/home/user/webapp/src/eiken/services/topic-selector.ts`

**主要メソッド**:
```typescript
- selectTopic(options): Promise<TopicSelectionResult>
- recordTopicUsage(studentId, grade, topicCode, questionType, sessionId?)
- addToBlacklist(studentId, grade, topicCode, questionType, reason)
- getTopicStatistics(grade?, questionType?)
```

### 2. API エンドポイント作成

**ルート追加先**: `/home/user/webapp/src/eiken/routes/topic-routes.ts`

```typescript
POST   /api/eiken/topics/select       // トピック選択
POST   /api/eiken/topics/record       // 使用履歴記録
POST   /api/eiken/topics/blacklist    // ブラックリスト追加
GET    /api/eiken/topics/stats        // 統計取得
```

### 3. 統合テスト

**テスト項目**:
- トピック選択アルゴリズム（ε-greedy + weighted random）
- LRUフィルタリング（5/3/4ウィンドウ）
- ブラックリスト機能（動的TTL）
- 7段階フォールバック
- Phase 1語彙検証との連携

### 4. Blueprint テンプレート

**5つの優先形式**:
1. grammar_fill
2. opinion_speech
3. reading_aloud
4. long_reading
5. essay

---

## 📊 **マイグレーション統計**

| 項目 | 値 |
|------|-----|
| **総行数** | 852行 |
| **ファイルサイズ** | 47KB |
| **テーブル数** | 5個 |
| **インデックス数** | 13個 |
| **初期レコード数** | 236個 |
| **トピック数** | 61個 |
| **適合性スコア** | 175個 |
| **実行時間（推定）** | 5-10秒 |

---

## ✅ **完了チェックリスト**

マイグレーション実行後、以下を確認してください：

- [ ] ローカル環境で正常に実行された
- [ ] 61個のトピックが挿入された
- [ ] 175個の適合性スコアが挿入された
- [ ] 13個のインデックスが作成された
- [ ] 検証クエリがすべて成功した
- [ ] 本番環境でも正常に実行された
- [ ] データ整合性チェックが通過した
- [ ] パフォーマンステストで<10ms達成

---

## 🎯 **成功基準**

| 項目 | 目標値 | 確認方法 |
|------|-------|---------|
| トピック選択速度 | <10ms | SELECT クエリ実行時間 |
| データ整合性 | 100% | 重複・制約違反なし |
| 抽象度進行 | 正常 | Grade 5:1-2 → Grade 1:7-8 |
| スコア分布 | 正常 | 平均0.94、0.9-1.3範囲 |

---

**マイグレーション完了後、このガイドを参照してシステムが正しく動作していることを確認してください。** ✅

**次のステップ**: TopicSelector サービスの実装に進んでください！
