# Database Migration Instructions

## Required Migration for Conversation History Feature

The conversation history system requires database schema updates to work on the production environment.

### Migration File
`migrations/0007_create_international_conversations.sql`

### What It Does
- Creates `international_sessions` table to track learning sessions
- Creates `international_conversations` table to store message history
- Adds indexes for performance

### Local Database (Already Applied ✅)
The migration has been applied to your local development database.

### Production Database (Action Required ⚠️)

#### Option 1: Using Cloudflare Dashboard (Recommended)
1. Go to https://dash.cloudflare.com
2. Navigate to **Workers & Pages** → **D1**
3. Select database: `kobeya-logs-db`
4. Go to **Console** tab
5. Copy and paste the contents of `migrations/0007_create_international_conversations.sql`
6. Click **Execute**

#### Option 2: Using Wrangler CLI (If you have proper API token)
```bash
npx wrangler d1 execute kobeya-logs-db --remote --file=./migrations/0007_create_international_conversations.sql
```

**Note:** This requires a Cloudflare API token with D1 database edit permissions.

### Current Status
- ✅ Local database: Migration applied successfully
- ⏳ Remote database: Awaiting manual application
- ✅ Code deployed: Conversation history feature is live
- 🔄 Feature behavior without migration:
  - System will work but won't store conversation history
  - Practice problems may not have full context
  - Graceful degradation - no errors

### After Migration
Once the production database migration is applied:
- 🎯 **Full context awareness**: AI remembers all previous questions
- 📚 **Accurate practice problems**: Generated based on actual topic discussed
- 💾 **Persistent history**: Survives page reloads
- 🔄 **Session continuity**: Students can continue where they left off

### Verification
After applying the migration, test by:
1. Opening International Student feature
2. Asking a geometry question
3. Clicking "類題 / Practice" button
4. Verify the practice problem is about **geometry** (not equations)

### Migration SQL (for reference)
```sql
-- International Student Conversation History
-- Cloudflare D1 SQLite

CREATE TABLE IF NOT EXISTS international_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  has_image INTEGER DEFAULT 0, -- 1 if message includes image
  image_data TEXT, -- Base64 image data (optional)
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (session_id) REFERENCES international_sessions(session_id)
);

CREATE TABLE IF NOT EXISTS international_sessions (
  session_id TEXT PRIMARY KEY,
  student_name TEXT,
  current_topic TEXT, -- Current learning topic
  last_question TEXT, -- Last question asked for context
  last_problem TEXT, -- Last practice problem generated
  status TEXT DEFAULT 'active', -- 'active', 'completed'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_international_conversations_session 
  ON international_conversations(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_international_sessions_status 
  ON international_sessions(status, updated_at);
```

### Questions?
If you encounter any issues with the migration, check:
- Cloudflare Dashboard access
- API token permissions (if using CLI)
- Database status (active/available)

---

**Important:** The application is already deployed and working. The migration adds enhanced functionality but isn't strictly required for basic operation.
