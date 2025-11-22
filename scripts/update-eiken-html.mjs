#!/usr/bin/env node

/**
 * ビルド後スクリプト: /eiken/practice/index.htmlのscriptタグを更新
 * 
 * 生成されたclient-[hash].jsを自動的に参照するように書き換える
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, '../dist');
const htmlPath = path.join(distDir, 'eiken/practice/index.html');
const assetsDir = path.join(distDir, 'assets');

// client-[hash].jsファイルを検索
if (!fs.existsSync(assetsDir)) {
  console.error(`❌ Error: ${assetsDir} not found`);
  process.exit(1);
}

const files = fs.readdirSync(assetsDir);
const clientFiles = files.filter(f => f.startsWith('client-') && f.endsWith('.js'));

if (clientFiles.length === 0) {
  console.error('❌ Error: client-*.js not found in dist/assets/');
  process.exit(1);
}

// 最初のclientファイルを使用（通常は1つのみ）
const clientFile = clientFiles[0];
console.log(`✅ Found client bundle: ${clientFile}`);

// HTMLを読み込んで書き換え
if (!fs.existsSync(htmlPath)) {
  console.error(`❌ Error: ${htmlPath} not found`);
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf-8');

// src/client.tsx を /assets/client-[hash].js に置換
html = html.replace(
  /src="\/src\/client\.tsx"/,
  `src="/assets/${clientFile}"`
);

fs.writeFileSync(htmlPath, html, 'utf-8');

console.log(`✅ Updated ${htmlPath}`);
console.log(`   Script tag now points to: /assets/${clientFile}`);
