# 📋 Database Migration Guide

## 🎯 Migration 0027: Add translation_ja and vocabulary_meanings

### Purpose
Add `translation_ja` and `vocabulary_meanings` columns to `eiken_generated_questions` table to support:
- Japanese translations of question text
- Detailed vocabulary explanations for important terms

### What This Fixes
**Current Error:**
```
D1_ERROR: table eiken_generated_questions has no column named translation_ja
```

### Migration File
- **File**: `0027_add_translation_and_vocabulary_fields.sql`
- **Target Table**: `eiken_generated_questions`
- **New Columns**:
  - `translation_ja`: TEXT - Stores Japanese translation of question
  - `vocabulary_meanings`: TEXT - Stores JSON with vocabulary explanations

---

## 🚀 How to Apply This Migration

### Option A: Using wrangler CLI (Manual - Requires Cloudflare API Token)

```bash
# Navigate to project root
cd /home/user/webapp

# Apply single migration
npx wrangler d1 migrations apply kobeya-logs-db --remote

# Or apply specific migration
npx wrangler d1 execute kobeya-logs-db \
  --file=migrations/0027_add_translation_and_vocabulary_fields.sql \
  --remote
```

**Requirements:**
- `CLOUDFLARE_API_TOKEN` environment variable must be set
- Or run `wrangler login` for interactive authentication

---

### Option B: Using the migration script

```bash
# Run all pending migrations
./scripts/run-migrations.sh

# Or run specific migration
./scripts/run-migrations.sh 0027
```

---

### Option C: Automatic via Cloudflare Pages Deploy (Recommended)

The migration will be automatically applied when you:
1. Push to GitHub main branch
2. Cloudflare Pages detects the new migration file
3. Deployment pipeline runs `wrangler d1 migrations apply` automatically

**Note:** This requires Cloudflare Pages build settings to include:
```bash
npm run build && npx wrangler d1 migrations apply kobeya-logs-db --remote
```

---

## ✅ Verify Migration Success

After applying the migration, verify it worked:

```bash
# Check table schema
npx wrangler d1 execute kobeya-logs-db \
  --command="PRAGMA table_info(eiken_generated_questions);" \
  --remote

# Look for these columns:
# - translation_ja (type: TEXT)
# - vocabulary_meanings (type: TEXT)
```

Or check via SQL query:
```bash
npx wrangler d1 execute kobeya-logs-db \
  --command="SELECT name FROM pragma_table_info('eiken_generated_questions') WHERE name IN ('translation_ja', 'vocabulary_meanings');" \
  --remote
```

Expected output:
```
translation_ja
vocabulary_meanings
```

---

## 🧪 Test in Production

After migration, test the feature:

1. Go to: https://kobeyabkk-studypartner.pages.dev/eiken/practice
2. Generate a 準1級 grammar_fill question
3. Answer the question
4. Check that:
   - ✅ Question translation displays in Japanese
   - ✅ 「📖 重要な語句」section shows vocabulary with English words
   - ✅ No more `D1_ERROR` about missing `translation_ja` column

---

## 📊 Migration Status

| Migration | Status | Applied Date | Notes |
|-----------|--------|--------------|-------|
| 0027_add_translation_and_vocabulary_fields.sql | ⏳ Pending | - | Ready to apply |

---

## 🔧 Troubleshooting

### Issue: "column already exists"
This is OK! It means the column was added via a previous attempt. The migration will still succeed.

### Issue: "no such table: eiken_generated_questions"
Run earlier migrations first:
```bash
./scripts/run-migrations.sh
```

### Issue: "CLOUDFLARE_API_TOKEN not set"
Solution A: Set environment variable
```bash
export CLOUDFLARE_API_TOKEN="your-token-here"
```

Solution B: Use wrangler login
```bash
npx wrangler login
```

Solution C: Wait for automatic deployment
Just push to GitHub and let Cloudflare Pages handle it.

---

## 📝 Next Steps After Migration

Once migration is applied:
1. ✅ Verify columns exist in production DB
2. ✅ Test question generation with new fields
3. ✅ Monitor for any D1_ERROR logs
4. ✅ Proceed to Phase 7.5A (Favorite explanations cloud storage)

---

## 🎉 Expected Impact

After this migration:
- ✅ No more `translation_ja` column errors
- ✅ Question translations persist in database
- ✅ Vocabulary meanings persist in database
- ✅ Historical questions can be retrieved with full data
- ✅ Ready for Phase 7.5 features

---

**Created**: 2025-12-12  
**Author**: AI Assistant  
**Related Issue**: D1_ERROR: table eiken_generated_questions has no column named translation_ja
