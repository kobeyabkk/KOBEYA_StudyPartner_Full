// Check database schema for eiken_generated_questions table
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = path.join(__dirname, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/943a1d9c4a057a4454481f5f82927e9a444649d267bd393befef951a011b8995.sqlite');

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Get table schema
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='eiken_generated_questions'").get();
  
  if (schema) {
    console.log('Table Schema:');
    console.log(schema.sql);
    
    // Get columns
    const columns = db.prepare("PRAGMA table_info(eiken_generated_questions)").all();
    console.log('\nColumns:');
    columns.forEach(col => {
      console.log(`  ${col.name} (${col.type})`);
    });
  } else {
    console.log('Table eiken_generated_questions does not exist');
  }
  
  db.close();
} catch (error) {
  console.error('Error:', error.message);
}
