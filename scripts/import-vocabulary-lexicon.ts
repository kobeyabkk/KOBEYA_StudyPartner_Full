/**
 * ============================================================================
 * Eiken Vocabulary Lexicon Import Script
 * ============================================================================
 * Purpose: Import NGSL/NAWL vocabulary data into eiken_vocabulary_lexicon
 * Data Sources:
 *   - NGSL v1.2 (CC-BY-SA 4.0)
 *   - NAWL v1.2 (CC-BY-SA 4.0)
 *   - COCA Frequency Data (public domain)
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

// CEFR to Eiken grade mapping
const CEFR_TO_EIKEN: Record<string, string> = {
  'A1': '5',
  'A2': '4',
  'B1': 'pre-2',
  'B2': '2',
  'C1': 'pre-1',
  'C2': '1',
};

const CEFR_NUMERIC: Record<string, number> = {
  'A1': 1,
  'A2': 2,
  'B1': 3,
  'B2': 4,
  'C1': 5,
  'C2': 6,
};

interface VocabularyEntry {
  lemma: string;
  cefr_level: string;
  cefr_numeric: number;
  eiken_grade: string;
  zipf_score: number | null;
  frequency_rank: number;
  frequency_per_million: number;
  source_ngsl: boolean;
  source_nawl: boolean;
  source_coca: boolean;
  source_confidence: number;
  pos: string | null;
}

/**
 * Calculate Zipf frequency score
 * Zipf = log10(frequency_per_million) + 3
 * Range: ~1.0 (very rare) to ~7.0 (very common)
 */
function calculateZipf(frequencyPerMillion: number): number {
  if (frequencyPerMillion <= 0) return 0;
  return Math.log10(frequencyPerMillion) + 3;
}

/**
 * Parse NGSL CSV file
 */
async function parseNGSL(filePath: string): Promise<Map<string, VocabularyEntry>> {
  const entries = new Map<string, VocabularyEntry>();
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        const lemma = row.word?.toLowerCase().trim();
        const rank = parseInt(row.rank) || 0;
        const frequency = parseInt(row.frequency) || 0;
        const cefrLevel = row.cefr_level?.toUpperCase().trim() || 'A1';
        
        if (!lemma || !rank) return;
        
        // Calculate frequency per million (NGSL corpus is ~273 million words)
        const frequencyPerMillion = (frequency / 273) || 0;
        const zipfScore = calculateZipf(frequencyPerMillion);
        
        entries.set(lemma, {
          lemma,
          cefr_level: cefrLevel,
          cefr_numeric: CEFR_NUMERIC[cefrLevel] || 1,
          eiken_grade: CEFR_TO_EIKEN[cefrLevel] || '5',
          zipf_score: zipfScore > 0 ? zipfScore : null,
          frequency_rank: rank,
          frequency_per_million: frequencyPerMillion,
          source_ngsl: true,
          source_nawl: false,
          source_coca: false,
          source_confidence: 1,
          pos: null,
        });
      })
      .on('end', () => resolve(entries))
      .on('error', reject);
  });
}

/**
 * Generate SQL INSERT statements
 */
function generateSQL(entries: Map<string, VocabularyEntry>): string {
  const lines: string[] = [];
  
  lines.push('-- ============================================================================');
  lines.push('-- Eiken Vocabulary Lexicon Data Import');
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Total entries: ${entries.size}`);
  lines.push('-- Source: NGSL v1.2 (CC-BY-SA 4.0)');
  lines.push('-- ============================================================================');
  lines.push('');
  lines.push('-- Clear existing data (optional - remove if you want to preserve existing data)');
  lines.push('-- DELETE FROM eiken_vocabulary_lexicon;');
  lines.push('');
  lines.push('-- Insert vocabulary entries');
  lines.push('INSERT INTO eiken_vocabulary_lexicon (');
  lines.push('  lemma, cefr_level, cefr_numeric, eiken_grade,');
  lines.push('  zipf_score, frequency_rank, frequency_per_million,');
  lines.push('  source_ngsl, source_nawl, source_coca, source_confidence, pos');
  lines.push(') VALUES');
  
  const values: string[] = [];
  for (const entry of entries.values()) {
    const zipf = entry.zipf_score !== null ? entry.zipf_score.toFixed(2) : 'NULL';
    const pos = entry.pos ? `'${entry.pos}'` : 'NULL';
    
    values.push(
      `  ('${entry.lemma}', '${entry.cefr_level}', ${entry.cefr_numeric}, '${entry.eiken_grade}', ` +
      `${zipf}, ${entry.frequency_rank}, ${entry.frequency_per_million.toFixed(2)}, ` +
      `${entry.source_ngsl ? 1 : 0}, ${entry.source_nawl ? 1 : 0}, ${entry.source_coca ? 1 : 0}, ` +
      `${entry.source_confidence}, ${pos})`
    );
  }
  
  lines.push(values.join(',\n'));
  lines.push('ON CONFLICT(lemma) DO UPDATE SET');
  lines.push('  cefr_level = excluded.cefr_level,');
  lines.push('  cefr_numeric = excluded.cefr_numeric,');
  lines.push('  eiken_grade = excluded.eiken_grade,');
  lines.push('  zipf_score = excluded.zipf_score,');
  lines.push('  frequency_rank = excluded.frequency_rank,');
  lines.push('  frequency_per_million = excluded.frequency_per_million,');
  lines.push('  source_ngsl = excluded.source_ngsl,');
  lines.push('  source_confidence = excluded.source_confidence,');
  lines.push('  updated_at = CURRENT_TIMESTAMP;');
  lines.push('');
  lines.push('-- Statistics');
  lines.push(`-- Total entries imported: ${entries.size}`);
  
  // Count by CEFR level
  const cefrCounts = new Map<string, number>();
  for (const entry of entries.values()) {
    cefrCounts.set(entry.cefr_level, (cefrCounts.get(entry.cefr_level) || 0) + 1);
  }
  
  lines.push('-- Distribution by CEFR level:');
  for (const [level, count] of Array.from(cefrCounts.entries()).sort()) {
    lines.push(`--   ${level}: ${count} words`);
  }
  
  return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting vocabulary lexicon import...');
  
  const dataDir = path.join(process.cwd(), 'data', 'vocabulary-sources');
  const ngslPath = path.join(dataDir, 'ngsl-sample.csv');
  const outputPath = path.join(process.cwd(), 'migrations', '0024_populate_eiken_vocabulary_lexicon.sql');
  
  // Check if input file exists
  if (!fs.existsSync(ngslPath)) {
    console.error(`❌ Input file not found: ${ngslPath}`);
    console.log('   Please ensure NGSL data is available in data/vocabulary-sources/');
    process.exit(1);
  }
  
  console.log(`📖 Reading NGSL data from: ${ngslPath}`);
  const entries = await parseNGSL(ngslPath);
  console.log(`✅ Parsed ${entries.size} vocabulary entries`);
  
  console.log('🔨 Generating SQL...');
  const sql = generateSQL(entries);
  
  console.log(`💾 Writing to: ${outputPath}`);
  fs.writeFileSync(outputPath, sql, 'utf-8');
  
  console.log('✨ Done! Migration file created successfully.');
  console.log('\nNext steps:');
  console.log('1. Review the generated migration file');
  console.log('2. Apply migration: wrangler d1 execute DB_NAME --file=migrations/0024_populate_eiken_vocabulary_lexicon.sql');
  console.log('\n📊 Summary:');
  console.log(`   Total entries: ${entries.size}`);
  
  // Distribution summary
  const cefrCounts = new Map<string, number>();
  for (const entry of entries.values()) {
    cefrCounts.set(entry.cefr_level, (cefrCounts.get(entry.cefr_level) || 0) + 1);
  }
  
  console.log('   CEFR Distribution:');
  for (const [level, count] of Array.from(cefrCounts.entries()).sort()) {
    console.log(`     ${level}: ${count} words`);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { parseNGSL, generateSQL, calculateZipf };
