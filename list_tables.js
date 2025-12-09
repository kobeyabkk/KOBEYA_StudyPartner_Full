// List all tables in the database
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/943a1d9c4a057a4454481f5f82927e9a444649d267bd393befef951a011b8995.sqlite');

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Get all tables
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  
  console.log('All tables in database:');
  tables.forEach(table => {
    console.log(`  - ${table.name}`);
  });
  
  db.close();
} catch (error) {
  console.error('Error:', error.message);
}
