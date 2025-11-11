/**
 * CEFR-J Wordlist Ver1.6 解析スクリプト
 * Excelファイルの構造を確認し、必要なデータを抽出
 */

import XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import path from 'path';

async function analyzeCEFRJWordlist() {
  console.log('📚 Analyzing CEFR-J Wordlist Ver1.6...\n');
  
  const excelPath = path.join(process.cwd(), 'data', 'vocabulary', 'CEFR-J_Wordlist_Ver1.6.xlsx');
  
  // Excelファイルを読み込み
  const workbook = XLSX.readFile(excelPath);
  
  console.log('📊 Workbook Information:');
  console.log(`   Total sheets: ${workbook.SheetNames.length}`);
  console.log(`   Sheet names: ${workbook.SheetNames.join(', ')}\n`);
  
  // 各シートの構造を確認
  for (const sheetName of workbook.SheetNames) {
    console.log(`\n📄 Sheet: "${sheetName}"`);
    console.log('-'.repeat(60));
    
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (jsonData.length === 0) {
      console.log('   (Empty sheet)');
      continue;
    }
    
    // ヘッダー行を表示
    const headers = jsonData[0] as any[];
    console.log(`   Headers (${headers.length} columns):`);
    headers.forEach((header, index) => {
      console.log(`     [${index}] ${header}`);
    });
    
    // データ行数
    console.log(`\n   Total rows: ${jsonData.length - 1} (excluding header)`);
    
    // サンプルデータ（最初の3行）
    console.log(`\n   Sample data (first 3 rows):`);
    for (let i = 1; i <= Math.min(3, jsonData.length - 1); i++) {
      const row = jsonData[i] as any[];
      console.log(`     Row ${i}:`, row.slice(0, 5).join(' | '));
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Analysis complete!');
  console.log('\n💡 Next step: Identify which sheet and columns to use for vocabulary import.');
}

analyzeCEFRJWordlist().catch(console.error);
