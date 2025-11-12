/**
 * Generate SQL INSERT statements from expanded vocabulary JSON
 * 
 * Purpose: Convert cefrj-a1-expanded.json to SQL INSERT statements
 * Output: db/import-a1-vocabulary.sql
 */

// Read the expanded vocabulary JSON
const jsonPath = './data/cefrj-a1-expanded.json';
const sqlOutputPath = './db/import-a1-vocabulary.sql';

console.log('🚀 Generating SQL import script\n');

// 1. Read JSON file
console.log('📖 Reading JSON file...');
const jsonContent = await Deno.readTextFile(jsonPath);
const data = JSON.parse(jsonContent);

console.log(`✅ Loaded ${data.vocabulary.length} vocabulary entries\n`);

// 2. Generate SQL INSERT statements
console.log('⚙️  Generating SQL INSERT statements...\n');

const sqlStatements: string[] = [];

// Add header comment
sqlStatements.push(`-- ============================================================================`);
sqlStatements.push(`-- EIKEN A1 Vocabulary Import`);
sqlStatements.push(`-- Generated: ${new Date().toISOString()}`);
sqlStatements.push(`-- Source: CEFR-J Wordlist Ver1.6`);
sqlStatements.push(`-- Total entries: ${data.metadata.total_expanded_forms}`);
sqlStatements.push(`-- ============================================================================`);
sqlStatements.push('');
sqlStatements.push('-- Begin transaction for batch insert');
sqlStatements.push('BEGIN TRANSACTION;');
sqlStatements.push('');

let totalInserts = 0;
let batchNumber = 1;
const BATCH_SIZE = 500; // Insert 500 rows at a time

// Process each vocabulary entry
for (const entry of data.vocabulary) {
  const baseForm = entry.base;
  const pos = entry.pos;
  const cefrLevel = entry.cefr_level;
  const eikenGrade = entry.eiken_grade;
  const zipfScore = entry.zipf_score || 0;
  const expansionType = entry.expansion_type || 'regular';
  const sources = entry.sources || '[]';
  const confidence = entry.confidence || 1.0;
  
  // Insert each form (including base form)
  for (let i = 0; i < entry.forms.length; i++) {
    const form = entry.forms[i];
    const isBaseForm = (form === baseForm) ? 1 : 0;
    
    // Escape single quotes in strings
    const escapedForm = form.replace(/'/g, "''");
    const escapedBaseForm = baseForm.replace(/'/g, "''");
    const escapedSources = sources.replace(/'/g, "''");
    
    // Generate INSERT statement
    const insertSQL = `INSERT INTO eiken_vocabulary_lexicon (word, base_form, pos, cefr_level, eiken_grade, zipf_score, is_base_form, expansion_type, sources, confidence) VALUES ('${escapedForm}', '${escapedBaseForm}', '${pos}', '${cefrLevel}', '${eikenGrade}', ${zipfScore}, ${isBaseForm}, '${expansionType}', '${escapedSources}', ${confidence});`;
    
    sqlStatements.push(insertSQL);
    totalInserts++;
    
    // Add batch comments every BATCH_SIZE inserts
    if (totalInserts % BATCH_SIZE === 0) {
      sqlStatements.push('');
      sqlStatements.push(`-- Batch ${batchNumber} completed (${totalInserts} total inserts)`);
      sqlStatements.push('');
      batchNumber++;
    }
  }
}

// Commit transaction
sqlStatements.push('');
sqlStatements.push('-- Commit transaction');
sqlStatements.push('COMMIT;');
sqlStatements.push('');

// Add verification queries
sqlStatements.push('-- ============================================================================');
sqlStatements.push('-- Verification Queries');
sqlStatements.push('-- ============================================================================');
sqlStatements.push('');
sqlStatements.push('-- Count total entries');
sqlStatements.push('SELECT COUNT(*) as total_entries FROM eiken_vocabulary_lexicon;');
sqlStatements.push('');
sqlStatements.push('-- Count by CEFR level');
sqlStatements.push('SELECT cefr_level, COUNT(*) as count FROM eiken_vocabulary_lexicon GROUP BY cefr_level;');
sqlStatements.push('');
sqlStatements.push('-- Count by part of speech');
sqlStatements.push('SELECT pos, COUNT(*) as count FROM eiken_vocabulary_lexicon GROUP BY pos ORDER BY count DESC;');
sqlStatements.push('');
sqlStatements.push('-- Count by expansion type');
sqlStatements.push('SELECT expansion_type, COUNT(*) as count FROM eiken_vocabulary_lexicon GROUP BY expansion_type;');
sqlStatements.push('');
sqlStatements.push('-- Sample: First 10 entries');
sqlStatements.push('SELECT word, base_form, pos, cefr_level, is_base_form FROM eiken_vocabulary_lexicon LIMIT 10;');
sqlStatements.push('');
sqlStatements.push('-- Sample: Irregular verbs');
sqlStatements.push('SELECT DISTINCT base_form FROM eiken_vocabulary_lexicon WHERE pos = "verb" AND expansion_type = "irregular" ORDER BY base_form LIMIT 20;');
sqlStatements.push('');

// 3. Write to file
console.log('💾 Writing SQL file...');
const sqlContent = sqlStatements.join('\n');
await Deno.writeTextFile(sqlOutputPath, sqlContent);

// 4. Statistics
const fileSizeKB = (sqlContent.length / 1024).toFixed(1);
console.log(`✅ SQL file generated: ${sqlOutputPath}`);
console.log(`📦 File size: ${fileSizeKB} KB`);
console.log(`📊 Total INSERT statements: ${totalInserts}`);
console.log(`📊 Total batches: ${batchNumber - 1}`);
console.log('');

// 5. Summary
console.log('=== 📊 SUMMARY ===\n');
console.log(`Source: ${jsonPath}`);
console.log(`Output: ${sqlOutputPath}`);
console.log(`Vocabulary entries: ${data.vocabulary.length}`);
console.log(`Total words (all forms): ${totalInserts}`);
console.log(`Average forms per entry: ${(totalInserts / data.vocabulary.length).toFixed(2)}`);
console.log('');

// 6. Next steps
console.log('=== 📝 NEXT STEPS ===\n');
console.log('1. Create schema:');
console.log('   wrangler d1 execute kobeya-logs-db --local --file=./db/schema.sql');
console.log('');
console.log('2. Import data:');
console.log('   wrangler d1 execute kobeya-logs-db --local --file=./db/import-a1-vocabulary.sql');
console.log('');
console.log('3. Verify import:');
console.log('   wrangler d1 execute kobeya-logs-db --local --command="SELECT COUNT(*) FROM eiken_vocabulary_lexicon"');
console.log('');
console.log('4. Deploy to remote (after local testing):');
console.log('   wrangler d1 execute kobeya-logs-db --remote --file=./db/schema.sql');
console.log('   wrangler d1 execute kobeya-logs-db --remote --file=./db/import-a1-vocabulary.sql');
console.log('');

console.log('✅ SQL generation completed!');
