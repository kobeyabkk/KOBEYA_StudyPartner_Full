/**
 * ============================================================================
 * Vocabulary Master Population Script
 * ============================================================================
 * Purpose: Populate vocabulary_master table with complete difficulty scores
 * Input: NGSL/NAWL CSV files from data/vocabulary-sources/
 * Output: SQL migration file with calculated difficulty scores
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { calculateDifficultyScore, type VocabularyWord } from '../src/eiken/services/difficulty-calculator';

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

interface VocabMasterEntry {
  word: string;
  pos: string | null;
  word_family: string | null;
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
  
  // Difficulty components
  cefr_weight: number;
  zipf_penalty: number;
  ngsl_weight: number;
  japanese_learnability_weight: number;
  length_bonus: number;
  final_difficulty_score: number;
  should_annotate: boolean;
  
  source: string;
}

/**
 * Convert SFI to Zipf score
 * SFI (Standardized Frequency Index) is already log-based
 * Map SFI 40-90 to Zipf 1-7
 */
function sfiToZipf(sfi: number): number {
  if (sfi <= 0) return 1.0;
  // Linear mapping with calibration
  // SFI ~87 (the) → Zipf ~7
  // SFI ~50 → Zipf ~3.5
  // SFI ~40 → Zipf ~2
  return Math.max(1.0, Math.min(7.5, ((sfi - 30) / 10) + 1));
}

/**
 * Parse NGSL/NAWL CSV file
 */
async function parseVocabularyCSV(
  filePath: string,
  isNGSL: boolean
): Promise<Map<string, VocabMasterEntry>> {
  const entries = new Map<string, VocabMasterEntry>();
  
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${filePath}`);
      resolve(entries);
      return;
    }
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        const lemma = row.word?.toLowerCase().trim();
        const rank = parseInt(row.rank) || 0;
        const frequency = parseInt(row.frequency) || 0;
        const cefrLevel = row.cefr_level?.toUpperCase().trim() || 'A1';
        const sfi = parseFloat(row.sfi) || 0;
        
        if (!lemma || !rank) return;
        
        // Convert SFI directly to Zipf score
        const zipfScore = sfi > 0 ? sfiToZipf(sfi) : null;
        
        // Use frequency from CSV (already calculated from SFI)
        const frequencyPerMillion = frequency;
        
        // Create VocabularyWord for difficulty calculation
        const vocabWord: VocabularyWord = {
          word: lemma,
          cefr_level: cefrLevel,
          cefr_numeric: CEFR_NUMERIC[cefrLevel] || 1,
          zipf_score: zipfScore > 0 ? zipfScore : null,
          source_ngsl: isNGSL,
          source_nawl: !isNGSL,
        };
        
        // Calculate difficulty score
        const difficulty = calculateDifficultyScore(vocabWord);
        
        // Create entry
        const entry: VocabMasterEntry = {
          word: lemma,
          pos: null, // Will be filled later if needed
          word_family: null,
          cefr_level: cefrLevel,
          cefr_numeric: CEFR_NUMERIC[cefrLevel] || 1,
          eiken_grade: CEFR_TO_EIKEN[cefrLevel] || '5',
          zipf_score: zipfScore > 0 ? zipfScore : null,
          frequency_rank: rank,
          frequency_per_million: frequencyPerMillion,
          source_ngsl: isNGSL,
          source_nawl: !isNGSL,
          source_coca: false,
          source_confidence: 1,
          
          // Difficulty components
          cefr_weight: difficulty.cefr_weight,
          zipf_penalty: difficulty.zipf_penalty,
          ngsl_weight: difficulty.ngsl_weight,
          japanese_learnability_weight: difficulty.japanese_learnability,
          length_bonus: difficulty.length_bonus,
          final_difficulty_score: difficulty.final_score,
          should_annotate: difficulty.should_annotate,
          
          source: isNGSL ? 'ngsl' : 'nawl',
        };
        
        entries.set(lemma, entry);
      })
      .on('end', () => resolve(entries))
      .on('error', reject);
  });
}

/**
 * Generate SQL INSERT statements
 */
function generateSQL(entries: Map<string, VocabMasterEntry>): string {
  const lines: string[] = [];
  
  lines.push('-- ============================================================================');
  lines.push('-- Vocabulary Master Data Population');
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Total entries: ${entries.size}`);
  lines.push('-- Source: NGSL/NAWL v1.2 (CC-BY-SA 4.0)');
  lines.push('-- ============================================================================');
  lines.push('');
  lines.push('-- Insert vocabulary entries with difficulty scores');
  lines.push('INSERT INTO vocabulary_master (');
  lines.push('  word, pos, cefr_level, cefr_numeric, eiken_grade,');
  lines.push('  zipf_score, frequency_rank, frequency_per_million,');
  lines.push('  source_ngsl, source_nawl, source_coca, source_confidence,');
  lines.push('  cefr_weight, zipf_penalty, ngsl_weight,');
  lines.push('  japanese_learnability_weight, length_bonus,');
  lines.push('  final_difficulty_score, should_annotate,');
  lines.push('  source');
  lines.push(') VALUES');
  
  const values: string[] = [];
  for (const entry of entries.values()) {
    const zipf = entry.zipf_score !== null ? entry.zipf_score.toFixed(2) : 'NULL';
    const pos = entry.pos ? `'${entry.pos}'` : 'NULL';
    
    values.push(
      `  ('${entry.word}', ${pos}, '${entry.cefr_level}', ${entry.cefr_numeric}, '${entry.eiken_grade}', ` +
      `${zipf}, ${entry.frequency_rank}, ${entry.frequency_per_million.toFixed(2)}, ` +
      `${entry.source_ngsl ? 1 : 0}, ${entry.source_nawl ? 1 : 0}, ${entry.source_coca ? 1 : 0}, ` +
      `${entry.source_confidence}, ` +
      `${entry.cefr_weight.toFixed(1)}, ${entry.zipf_penalty.toFixed(1)}, ${entry.ngsl_weight.toFixed(1)}, ` +
      `${entry.japanese_learnability_weight.toFixed(1)}, ${entry.length_bonus.toFixed(1)}, ` +
      `${entry.final_difficulty_score}, ${entry.should_annotate ? 1 : 0}, ` +
      `'${entry.source}')`
    );
  }
  
  lines.push(values.join(',\n'));
  lines.push('ON CONFLICT(word, pos) DO UPDATE SET');
  lines.push('  cefr_level = excluded.cefr_level,');
  lines.push('  zipf_score = excluded.zipf_score,');
  lines.push('  final_difficulty_score = excluded.final_difficulty_score,');
  lines.push('  should_annotate = excluded.should_annotate,');
  lines.push('  updated_at = CURRENT_TIMESTAMP;');
  lines.push('');
  
  // Statistics
  lines.push('-- ============================================================================');
  lines.push('-- Statistics');
  lines.push('-- ============================================================================');
  lines.push(`-- Total entries: ${entries.size}`);
  
  // Count by CEFR level
  const cefrCounts = new Map<string, number>();
  const annotationCount = Array.from(entries.values()).filter(e => e.should_annotate).length;
  
  for (const entry of entries.values()) {
    cefrCounts.set(entry.cefr_level, (cefrCounts.get(entry.cefr_level) || 0) + 1);
  }
  
  lines.push('-- Distribution by CEFR level:');
  for (const [level, count] of Array.from(cefrCounts.entries()).sort()) {
    lines.push(`--   ${level}: ${count} words`);
  }
  
  lines.push(`-- Words requiring annotation (score >= 60): ${annotationCount}`);
  lines.push(`-- Annotation rate: ${((annotationCount / entries.size) * 100).toFixed(1)}%`);
  
  return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Vocabulary Master Population Script');
  console.log('=' * 50);
  
  const dataDir = path.join(process.cwd(), 'data', 'vocabulary-sources');
  const ngslPath = path.join(dataDir, 'ngsl-processed.csv');
  const nawlPath = path.join(dataDir, 'nawl-processed.csv');
  const outputPath = path.join(process.cwd(), 'migrations', '0026_populate_vocabulary_master.sql');
  
  // Parse NGSL
  console.log(`📖 Reading NGSL from: ${ngslPath}`);
  const ngslEntries = await parseVocabularyCSV(ngslPath, true);
  console.log(`✅ Parsed ${ngslEntries.size} NGSL entries`);
  
  // Parse NAWL (optional)
  console.log(`📖 Reading NAWL from: ${nawlPath}`);
  const nawlEntries = await parseVocabularyCSV(nawlPath, false);
  console.log(`✅ Parsed ${nawlEntries.size} NAWL entries`);
  
  // Merge entries (NGSL takes priority)
  const allEntries = new Map(ngslEntries);
  for (const [word, entry] of nawlEntries) {
    if (!allEntries.has(word)) {
      allEntries.set(word, entry);
    }
  }
  
  console.log(`📊 Total unique entries: ${allEntries.size}`);
  
  // Generate SQL
  console.log('🔨 Generating SQL...');
  const sql = generateSQL(allEntries);
  
  console.log(`💾 Writing to: ${outputPath}`);
  fs.writeFileSync(outputPath, sql, 'utf-8');
  
  console.log('✨ Done! Migration file created successfully.');
  console.log('\nNext steps:');
  console.log('1. Review the generated migration file');
  console.log('2. Apply migration: wrangler d1 execute DB_NAME --file=migrations/0026_populate_vocabulary_master.sql');
  console.log('\n📊 Summary:');
  console.log(`   Total entries: ${allEntries.size}`);
  
  // Annotation statistics
  const annotationEntries = Array.from(allEntries.values()).filter(e => e.should_annotate);
  console.log(`   Annotation candidates (score >= 60): ${annotationEntries.length}`);
  console.log(`   Annotation rate: ${((annotationEntries.length / allEntries.size) * 100).toFixed(1)}%`);
}

// Execute
main().catch(console.error);
