/**
 * ============================================================================
 * NGSL/NAWL SFI Data Processor
 * ============================================================================
 * Purpose: Convert SFI (Standardized Frequency Index) to usable format
 * Input: NGSL/NAWL CSV files with SFI scores
 * Output: Processed CSV with rank, frequency, CEFR levels, and Zipf scores
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

interface RawEntry {
  word: string;
  sfi: number;
}

interface ProcessedEntry {
  word: string;
  rank: number;
  frequency: number;
  cefr_level: string;
  sfi: number;
}

/**
 * Convert SFI to approximate frequency
 * SFI is a log-based scale where higher = more frequent
 * Approximation: frequency ≈ 10^(SFI/10)
 */
function sfiToFrequency(sfi: number): number {
  return Math.pow(10, sfi / 10);
}

/**
 * Assign CEFR level based on rank
 * This is an approximation based on vocabulary size for each level
 */
function assignCEFR(rank: number, totalWords: number): string {
  const ratio = rank / totalWords;
  
  if (ratio <= 0.20) return 'A1';      // Top 20%
  if (ratio <= 0.40) return 'A2';      // 20-40%
  if (ratio <= 0.60) return 'B1';      // 40-60%
  if (ratio <= 0.75) return 'B2';      // 60-75%
  if (ratio <= 0.90) return 'C1';      // 75-90%
  return 'C2';                          // 90-100%
}

/**
 * Parse CSV file
 */
async function parseCSV(filePath: string): Promise<RawEntry[]> {
  const entries: RawEntry[] = [];
  
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${filePath}`);
      resolve(entries);
      return;
    }
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // Handle both "word" and "Word" column names
        const word = (row.word || row.Word || row.Lemma)?.toLowerCase().trim();
        const sfi = parseFloat(row.sfi || row.SFI);
        
        if (word && !isNaN(sfi)) {
          entries.push({ word, sfi });
        }
      })
      .on('end', () => resolve(entries))
      .on('error', reject);
  });
}

/**
 * Process entries: assign ranks, CEFR levels, calculate frequencies
 */
function processEntries(entries: RawEntry[]): ProcessedEntry[] {
  // Sort by SFI (descending - higher SFI = more frequent)
  const sorted = entries.sort((a, b) => b.sfi - a.sfi);
  
  return sorted.map((entry, index) => ({
    word: entry.word,
    rank: index + 1,
    frequency: Math.round(sfiToFrequency(entry.sfi)),
    cefr_level: assignCEFR(index + 1, sorted.length),
    sfi: entry.sfi,
  }));
}

/**
 * Write processed CSV
 */
function writeCSV(entries: ProcessedEntry[], outputPath: string): void {
  const lines: string[] = [];
  lines.push('word,rank,frequency,cefr_level,sfi');
  
  for (const entry of entries) {
    lines.push(
      `${entry.word},${entry.rank},${entry.frequency},${entry.cefr_level},${entry.sfi}`
    );
  }
  
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 NGSL/NAWL SFI Data Processor');
  console.log('=' + '='.repeat(49));
  
  const dataDir = path.join(process.cwd(), 'data', 'vocabulary-sources');
  
  // Process NGSL
  console.log('\n📖 Processing NGSL...');
  const ngslPath = path.join(dataDir, 'ngsl-complete.csv');
  const ngslEntries = await parseCSV(ngslPath);
  console.log(`   Found ${ngslEntries.length} NGSL entries`);
  
  if (ngslEntries.length > 0) {
    const processedNGSL = processEntries(ngslEntries);
    const ngslOutputPath = path.join(dataDir, 'ngsl-processed.csv');
    writeCSV(processedNGSL, ngslOutputPath);
    console.log(`   ✅ Processed NGSL saved to: ngsl-processed.csv`);
    
    // Show CEFR distribution
    const cefrCounts = new Map<string, number>();
    for (const entry of processedNGSL) {
      cefrCounts.set(entry.cefr_level, (cefrCounts.get(entry.cefr_level) || 0) + 1);
    }
    console.log('   📊 CEFR Distribution:');
    for (const [level, count] of Array.from(cefrCounts.entries()).sort()) {
      console.log(`      ${level}: ${count} words (${((count / processedNGSL.length) * 100).toFixed(1)}%)`);
    }
  }
  
  // Process NAWL
  console.log('\n📖 Processing NAWL...');
  const nawlPath = path.join(dataDir, 'nawl-complete.csv');
  const nawlEntries = await parseCSV(nawlPath);
  console.log(`   Found ${nawlEntries.length} NAWL entries`);
  
  if (nawlEntries.length > 0) {
    const processedNAWL = processEntries(nawlEntries);
    const nawlOutputPath = path.join(dataDir, 'nawl-processed.csv');
    writeCSV(processedNAWL, nawlOutputPath);
    console.log(`   ✅ Processed NAWL saved to: nawl-processed.csv`);
    
    // Show CEFR distribution
    const cefrCounts = new Map<string, number>();
    for (const entry of processedNAWL) {
      cefrCounts.set(entry.cefr_level, (cefrCounts.get(entry.cefr_level) || 0) + 1);
    }
    console.log('   📊 CEFR Distribution:');
    for (const [level, count] of Array.from(cefrCounts.entries()).sort()) {
      console.log(`      ${level}: ${count} words (${((count / processedNAWL.length) * 100).toFixed(1)}%)`);
    }
  }
  
  console.log('\n✨ Processing complete!');
  console.log('\nNext step:');
  console.log('   npx tsx scripts/populate-vocabulary-master.ts');
}

main().catch(console.error);
