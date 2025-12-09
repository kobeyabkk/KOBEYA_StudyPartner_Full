// Check grammar tables schema and data
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/943a1d9c4a057a4454481f5f82927e9a444649d267bd393befef951a011b8995.sqlite');

try {
  const db = new Database(dbPath, { readonly: true });
  
  console.log('=== Grammar Terms Table ===');
  const grammarTermsSchema = db.prepare("PRAGMA table_info(grammar_terms)").all();
  console.log('Schema:', grammarTermsSchema.map(c => `${c.name} (${c.type})`).join(', '));
  
  const grammarTermsCount = db.prepare("SELECT COUNT(*) as count FROM grammar_terms").get();
  console.log('Row count:', grammarTermsCount.count);
  
  if (grammarTermsCount.count > 0) {
    const samples = db.prepare("SELECT * FROM grammar_terms LIMIT 3").all();
    console.log('Sample data:', JSON.stringify(samples, null, 2));
  }
  
  console.log('\n=== Grade Expressions Table ===');
  const gradeExpSchema = db.prepare("PRAGMA table_info(grade_expressions)").all();
  console.log('Schema:', gradeExpSchema.map(c => `${c.name} (${c.type})`).join(', '));
  
  const gradeExpCount = db.prepare("SELECT COUNT(*) as count FROM grade_expressions").get();
  console.log('Row count:', gradeExpCount.count);
  
  if (gradeExpCount.count > 0) {
    const samples = db.prepare("SELECT * FROM grade_expressions LIMIT 3").all();
    console.log('Sample data:', JSON.stringify(samples, null, 2));
  }
  
  console.log('\n=== Grammar Pattern Rules Table ===');
  const rulesSchema = db.prepare("PRAGMA table_info(grammar_pattern_rules)").all();
  console.log('Schema:', rulesSchema.map(c => `${c.name} (${c.type})`).join(', '));
  
  const rulesCount = db.prepare("SELECT COUNT(*) as count FROM grammar_pattern_rules").get();
  console.log('Row count:', rulesCount.count);
  
  if (rulesCount.count > 0) {
    const samples = db.prepare("SELECT * FROM grammar_pattern_rules LIMIT 3").all();
    console.log('Sample data:', JSON.stringify(samples, null, 2));
  }
  
  db.close();
} catch (error) {
  console.error('Error:', error.message);
}
