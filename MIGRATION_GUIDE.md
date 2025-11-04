# Essay Coaching AI Generation - Migration Guide

## 📋 Overview

This guide explains the database schema updates and configuration changes needed to enable AI-generated theme-specific content in the Essay Coaching system.

## 🔧 Changes Made

### 1. Database Schema Updates

Added new columns to `essay_sessions` table:
- `problem_mode` (TEXT, default 'ai') - Tracks whether using AI generation or manual input
- `custom_input` (TEXT) - Stores user's custom theme or problem text
- `learning_style` (TEXT, default 'auto') - User's preferred learning style (example/explanation/auto)
- `last_theme_content` (TEXT) - Stores the last AI-generated reading material
- `last_theme_title` (TEXT) - Stores the theme title

### 2. API Enhancements

#### New Endpoint: `/api/admin/migrate-db` (POST)
Applies database migrations programmatically. Returns:
```json
{
  "ok": true,
  "message": "Database migration completed",
  "results": [
    {"sql": "ALTER TABLE...", "status": "success"},
    {"sql": "ALTER TABLE...", "status": "skipped", "reason": "column exists"}
  ],
  "timestamp": "2025-11-04T03:30:00.000Z"
}
```

#### Enhanced OpenAI API Error Logging
- Added API key validation before calls
- Detailed HTTP status and error response logging
- Better fallback handling when API fails

### 3. Session Management Fixes

- `saveSessionToDB()` now saves all new fields (problem_mode, custom_input, learning_style, etc.)
- `loadSessionFromDB()` now restores all fields from D1 database
- Prevents session data loss after Worker restarts

### 4. Configuration Updates

- Updated `wrangler.json` with D1 database binding
- Updated `wrangler.jsonc` with correct database_id
- Created migration file `migrations/0005_add_ai_generation_fields.sql`

## 🚀 Deployment Steps

### Step 1: Wait for Cloudflare Pages Deployment

The code has been pushed to the `dev` branch. Monitor deployment at:
- **Dev Environment**: https://dash.cloudflare.com (look for commit `34fed25`)
- **Expected completion**: 2-3 minutes after push

### Step 2: Configure D1 Database Binding (IF NEEDED)

If the database binding is not automatically configured, you may need to:

1. Go to **Cloudflare Dashboard** → **Pages** → **kobeyabkk-studypartner**
2. Navigate to **Settings** → **Functions**
3. Under **D1 database bindings**, ensure:
   - **Variable name**: `DB`
   - **D1 database**: `kobeya-logs-db`
   - **Database ID**: `b5ac684a-2536-496a-916f-c2c5816a13a0`

### Step 3: Run Database Migration

After deployment completes, run the migration script:

```bash
# For dev environment
cd /home/user/StudyPartner_Full_Main
./run-migration.sh dev

# For production environment
./run-migration.sh prod
```

Or manually with curl:

```bash
# Dev environment
curl -X POST "https://dev.kobeyabkk-studypartner.pages.dev/api/admin/migrate-db" \
  -H "Content-Type: application/json"

# Production environment
curl -X POST "https://kobeyabkk-studypartner.pages.dev/api/admin/migrate-db" \
  -H "Content-Type: application/json"
```

Expected successful response:
```json
{
  "ok": true,
  "message": "Database migration completed",
  "results": [...]
}
```

### Step 4: Verify OpenAI API Key

Ensure the `OPENAI_API_KEY` environment variable is configured:

1. Go to **Cloudflare Dashboard** → **Pages** → **kobeyabkk-studypartner**
2. Navigate to **Settings** → **Environment variables**
3. Ensure `OPENAI_API_KEY` is set for both **Production** and **Preview** environments

### Step 5: Test the System

1. Visit: https://dev.kobeyabkk-studypartner.pages.dev/essay-coaching
2. Select **自分でテーマを入力** (Manual theme input)
3. Enter a theme (e.g., "量子論", "看護", "ファッション論")
4. Select a learning style (example-focused, explanation-focused, or balanced)
5. Start the session and verify:
   - Step 1 generates theme-specific reading material (500-800 characters)
   - Reading material includes concepts, definitions, history, current issues
   - Questions are related to the reading material content
   - No generic fallback text appears

## 🐛 Troubleshooting

### Issue: "Database not available" error

**Cause**: D1 database binding not configured in Cloudflare Pages

**Solution**: Follow **Step 2** above to configure the binding in Cloudflare Dashboard

### Issue: Generic fallback text still appears

**Possible causes**:
1. Migration not run yet → Run Step 3
2. Old session data cached → Start a new session (clear cookies or use incognito mode)
3. OpenAI API key missing → Check Step 4

**Debug**: Check browser console for server logs:
- Should see: `🤖 Calling OpenAI API for theme content generation...`
- Should see: `✅ OpenAI API call successful`
- Should NOT see: `❌ CRITICAL: OPENAI_API_KEY is not configured!`

### Issue: Session data lost after page reload

**Cause**: Old session created before migration

**Solution**: Click "新しいセッション" (New Session) button to create a fresh session

## 📊 Monitoring

After deployment, monitor these logs in Cloudflare Pages:

1. **Migration logs**:
   ```
   🔧 Database migration requested
   ✅ Migration executed: ALTER TABLE essay_sessions ADD COLUMN...
   ```

2. **AI generation logs**:
   ```
   🤖 Calling OpenAI API for theme content generation...
   🔑 OpenAI API Key status: Present
   📡 OpenAI API response status: 200
   ✅ OpenAI API call successful
   📊 AI Generated text length: 756
   ```

3. **Session persistence logs**:
   ```
   ✅ Session saved to D1: <session-id>
   ✅ Theme content saved to session
   ```

## 🎯 Expected Behavior

After successful deployment and migration:

1. **Theme Selection**: User can input custom themes (e.g., "量子論")
2. **Learning Style**: User's selected style (example/explanation/auto) influences content
3. **AI Generation**: 
   - Step 1: 500-800 character reading material specific to the theme
   - Reading includes: concepts, definitions, history, current issues
   - Questions are directly related to the reading content
4. **Session Persistence**: All data survives Worker restarts
5. **No Fallbacks**: Generic text only appears if OpenAI API fails (rare)

## 📝 Files Modified

- `src/index.tsx` - Added migration endpoint, enhanced logging, fixed session save/load
- `wrangler.json` - Added D1 database binding
- `wrangler.jsonc` - Updated database_id
- `migrations/0005_add_ai_generation_fields.sql` - New migration file

## 🔗 Commit References

- **b8c4a01**: Added migration endpoint and enhanced logging
- **34fed25**: Added D1 binding to wrangler.json

---

## ✅ Next Steps

1. Wait 2-3 minutes for Cloudflare Pages deployment to complete
2. Verify D1 database binding in Cloudflare Dashboard (if needed)
3. Run the migration script: `./run-migration.sh dev`
4. Test the system with custom themes
5. If successful, repeat for production environment

**Questions or issues?** Check the Troubleshooting section above or review the server logs in Cloudflare Pages dashboard.
