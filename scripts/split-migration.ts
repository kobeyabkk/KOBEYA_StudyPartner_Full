/**
 * Split large migration file into smaller batches for D1 execution
 */

import fs from 'fs';
import path from 'path';

const BATCH_SIZE = 500; // 500 rows per batch

function splitMigration(inputFile: string, outputDir: string) {
  console.log('📄 Reading migration file...');
  const content = fs.readFileSync(inputFile, 'utf-8');
  
  // Extract the INSERT statement
  const insertMatch = content.match(/INSERT INTO vocabulary_master[^;]+;/s);
  if (!insertMatch) {
    console.error('❌ Could not find INSERT statement');
    return;
  }
  
  const insertStatement = insertMatch[0];
  
  // Extract header (everything before VALUES)
  const headerMatch = insertStatement.match(/(INSERT INTO[^)]+\))\s+VALUES/s);
  if (!headerMatch) {
    console.error('❌ Could not parse INSERT header');
    return;
  }
  
  const header = headerMatch[1];
  
  // Extract all value rows
  const valuesMatch = insertStatement.match(/VALUES\s+([\s\S]+?);/);
  if (!valuesMatch) {
    console.error('❌ Could not extract VALUES');
    return;
  }
  
  const valuesString = valuesMatch[1];
  
  // Split by rows (each row starts with opening parenthesis)
  const rows = valuesString.split(/,\n\s*(?=\()/);
  
  console.log(`📊 Total rows: ${rows.length}`);
  console.log(`📦 Batch size: ${BATCH_SIZE}`);
  
  const batches = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    batches.push(rows.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`🔨 Creating ${batches.length} batch files...`);
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write each batch to a file
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchNumber = String(i + 1).padStart(2, '0');
    const outputFile = path.join(outputDir, `batch_${batchNumber}.sql`);
    
    const batchSQL = `-- Vocabulary Master Data - Batch ${batchNumber} of ${batches.length}
-- Rows: ${i * BATCH_SIZE + 1} to ${Math.min((i + 1) * BATCH_SIZE, rows.length)}

${header} VALUES
${batch.join(',\n')}
ON CONFLICT(word, pos) DO UPDATE SET
  cefr_level = excluded.cefr_level,
  zipf_score = excluded.zipf_score,
  final_difficulty_score = excluded.final_difficulty_score,
  should_annotate = excluded.should_annotate,
  updated_at = CURRENT_TIMESTAMP;
`;
    
    fs.writeFileSync(outputFile, batchSQL, 'utf-8');
    console.log(`   ✅ Batch ${batchNumber}: ${batch.length} rows → ${path.basename(outputFile)}`);
  }
  
  // Create execution script
  const execScript = `#!/bin/bash
# Execute all vocabulary master batches

DB_NAME="kobeya-logs-db"

echo "🚀 Starting vocabulary master data import..."
echo "📊 Total batches: ${batches.length}"
echo ""

for i in $(seq -f "%02g" 1 ${batches.length}); do
  echo "📦 Executing batch \$i of ${batches.length}..."
  npx wrangler d1 execute \$DB_NAME --file=migrations/vocabulary-batches/batch_\${i}.sql
  
  if [ $? -eq 0 ]; then
    echo "   ✅ Batch \$i completed"
  else
    echo "   ❌ Batch \$i failed"
    exit 1
  fi
  echo ""
done

echo "✨ All batches completed successfully!"
`;
  
  const execScriptPath = path.join(outputDir, 'execute-all.sh');
  fs.writeFileSync(execScriptPath, execScript, 'utf-8');
  fs.chmodSync(execScriptPath, '755');
  
  console.log(`\n✨ Done! Created ${batches.length} batch files`);
  console.log(`\n📝 To execute:`);
  console.log(`   cd migrations/vocabulary-batches`);
  console.log(`   ./execute-all.sh`);
  console.log(`\nOr manually:`);
  console.log(`   npx wrangler d1 execute kobeya-logs-db --file=migrations/vocabulary-batches/batch_01.sql`);
}

// Execute
const inputFile = path.join(process.cwd(), 'migrations', '0026_populate_vocabulary_master.sql');
const outputDir = path.join(process.cwd(), 'migrations', 'vocabulary-batches');

splitMigration(inputFile, outputDir);
