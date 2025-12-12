# 🚀 Migration 0027: Manual Application Instructions

## ⚠️ IMPORTANT: Read Before Applying

This migration adds `translation_ja` and `vocabulary_meanings` columns to the `eiken_generated_questions` table in production.

---

## 📋 Prerequisites

Before running this migration, ensure you have:

1. ✅ **Cloudflare API Token** with D1 Database permissions
2. ✅ **wrangler CLI** installed (`npm install -g wrangler`)
3. ✅ **Access to kobeyabkk Cloudflare account**

---

## 🎯 Option 1: Automatic via GitHub Push (RECOMMENDED)

### Status: ✅ COMPLETED
- **Commit**: `81e422b`
- **Pushed to**: `main` branch
- **Expected**: Cloudflare Pages will auto-apply migration on next deploy

### Timeline
- Push completed: **Now**
- Cloudflare deployment: **~5-10 minutes**
- Migration applied: **Automatically during deployment**

### Verification
After ~10 minutes, check:
```bash
# Generate a new question and check browser console
# Should see no D1_ERROR about translation_ja
```

---

## 🎯 Option 2: Manual via Wrangler CLI

If automatic deployment doesn't work, apply manually:

### Step 1: Set Cloudflare API Token
```bash
export CLOUDFLARE_API_TOKEN="your-api-token-here"
```

Or use interactive login:
```bash
npx wrangler login
```

### Step 2: Apply Migration
```bash
# Navigate to project
cd /home/user/webapp

# Apply all pending migrations
npx wrangler d1 migrations apply kobeya-logs-db --remote

# Expected output:
# ✅ Successfully applied migration 0027
```

### Step 3: Verify
```bash
# Check table schema
npx wrangler d1 execute kobeya-logs-db \
  --command="PRAGMA table_info(eiken_generated_questions);" \
  --remote | grep -E "(translation_ja|vocabulary_meanings)"

# Expected output:
# translation_ja | TEXT
# vocabulary_meanings | TEXT
```

---

## 🎯 Option 3: Manual SQL Execution

If wrangler migrations don't work, execute SQL directly:

```bash
# Execute migration file directly
npx wrangler d1 execute kobeya-logs-db \
  --file=migrations/0027_add_translation_and_vocabulary_fields.sql \
  --remote
```

Or execute SQL commands one by one:

```bash
# Add translation_ja column
npx wrangler d1 execute kobeya-logs-db \
  --command="ALTER TABLE eiken_generated_questions ADD COLUMN translation_ja TEXT;" \
  --remote

# Add vocabulary_meanings column
npx wrangler d1 execute kobeya-logs-db \
  --command="ALTER TABLE eiken_generated_questions ADD COLUMN vocabulary_meanings TEXT;" \
  --remote
```

---

## ✅ How to Verify Migration Success

### Test 1: Check Database Schema
```bash
npx wrangler d1 execute kobeya-logs-db \
  --command="SELECT name, type FROM pragma_table_info('eiken_generated_questions') WHERE name IN ('translation_ja', 'vocabulary_meanings');" \
  --remote
```

**Expected Output:**
```
name                  | type
----------------------|------
translation_ja        | TEXT
vocabulary_meanings   | TEXT
```

### Test 2: Generate Question and Check Data
1. Go to: https://kobeyabkk-studypartner.pages.dev/eiken/practice
2. Clear browser cache (Ctrl+Shift+R / Cmd+Shift+R)
3. Select "準1級" → "grammar_fill"
4. Generate and answer a question
5. Open Browser Console (F12)
6. Check for logs:
   - ✅ No `D1_ERROR` about `translation_ja`
   - ✅ Question translation displays in Japanese
   - ✅ Vocabulary section shows English words

### Test 3: Check Backend Logs (Cloudflare Dashboard)
1. Go to: https://dash.cloudflare.com
2. Navigate to: **Workers & Pages** → **kobeyabkk-studypartner**
3. Click: **Logs** tab
4. Generate a question
5. Verify:
   - ✅ No errors about missing columns
   - ✅ `translation_ja` successfully saved
   - ✅ `vocabulary_meanings` successfully saved

---

## 🔧 Troubleshooting

### Issue: "column already exists"
**Cause**: Column was added in a previous migration attempt  
**Solution**: This is OK! Skip to verification steps

### Issue: "no such table: eiken_generated_questions"
**Cause**: Earlier migrations not run  
**Solution**: Run all migrations in order
```bash
./scripts/run-migrations.sh
```

### Issue: "CLOUDFLARE_API_TOKEN not set"
**Cause**: No authentication for wrangler  
**Solution A**: Set environment variable
```bash
export CLOUDFLARE_API_TOKEN="your-token"
```
**Solution B**: Use interactive login
```bash
npx wrangler login
```

### Issue: "Migration already applied"
**Cause**: Migration was already run successfully  
**Solution**: No action needed, proceed to verification

---

## 📊 Migration Status

| Status | Description | Timestamp |
|--------|-------------|-----------|
| ✅ Created | Migration file created | 2025-12-12 |
| ✅ Committed | Committed to Git | 2025-12-12 |
| ✅ Pushed | Pushed to GitHub main | 2025-12-12 |
| ⏳ Pending | Awaiting Cloudflare deployment | ~5-10 min |
| ⏳ Pending | Auto-apply via deployment pipeline | ~5-10 min |

---

## 📝 After Migration

Once migration is successfully applied:

1. ✅ **Remove D1_ERROR logs** from monitoring
2. ✅ **Verify data persistence**:
   - Generate 5 questions
   - Check that all have `translation_ja`
   - Check that all have `vocabulary_meanings`
3. ✅ **Update documentation** to reflect new schema
4. ✅ **Proceed to Phase 7.5A**: Favorite explanations cloud storage

---

## 🎉 Expected Benefits

After this migration:

✅ **No more errors**: `D1_ERROR: no column named translation_ja` resolved  
✅ **Data persistence**: Question translations saved to database  
✅ **Historical data**: Past questions can be retrieved with translations  
✅ **Feature enablement**: Ready for Phase 7.5 cloud storage features  
✅ **Better UX**: Users see consistent translations across sessions  

---

## 📞 Support

If you encounter issues:

1. **Check Cloudflare Dashboard logs**
2. **Verify wrangler authentication**: `npx wrangler whoami`
3. **Check database connection**: `npx wrangler d1 list`
4. **Review migration file**: `cat migrations/0027_add_translation_and_vocabulary_fields.sql`

---

**Migration Created**: 2025-12-12  
**Pushed to GitHub**: 2025-12-12 04:21 UTC  
**Commit Hash**: `81e422b`  
**Status**: ⏳ Awaiting automatic deployment
