#!/usr/bin/env python3
"""
Complete NGSL Data Downloader
Downloads full NGSL 2,801 word list from EAP Foundation
"""

import requests
from bs4 import BeautifulSoup
import csv
import re

def download_ngsl_complete():
    """Download complete NGSL from EAP Foundation"""
    
    url = "https://eapfoundation.com/vocab/general/ngsl/"
    print(f"📥 Downloading NGSL from {url}...")
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Find the vocabulary table
        table = soup.find('table')
        if not table:
            print("❌ Table not found on page")
            return None
        
        words_data = []
        rows = table.find_all('tr')[1:]  # Skip header row
        
        print(f"📊 Found {len(rows)} rows in table...")
        
        for row in rows:
            cols = row.find_all('td')
            if len(cols) >= 4:
                try:
                    rank = cols[0].get_text(strip=True)
                    headword = cols[1].get_text(strip=True).lower()
                    related_forms = cols[2].get_text(strip=True)
                    sfi = cols[3].get_text(strip=True)  # Standardized Frequency Index
                    
                    # Extract numeric rank
                    rank_num = int(re.sub(r'[^\d]', '', rank)) if rank else 0
                    
                    # Assign CEFR level based on rank
                    if rank_num <= 600:
                        cefr = 'A1'
                    elif rank_num <= 1300:
                        cefr = 'A2'
                    elif rank_num <= 2100:
                        cefr = 'B1'
                    elif rank_num <= 2600:
                        cefr = 'B2'
                    else:
                        cefr = 'C1'
                    
                    # Calculate frequency from SFI (approximate)
                    # SFI is log-based, so convert back to frequency
                    try:
                        sfi_float = float(sfi)
                        frequency = int(10 ** (sfi_float / 10))
                    except:
                        frequency = 0
                    
                    words_data.append({
                        'word': headword,
                        'rank': rank_num,
                        'frequency': frequency,
                        'cefr_level': cefr,
                        'related_forms': related_forms,
                        'sfi': sfi
                    })
                    
                except Exception as e:
                    print(f"⚠️ Error parsing row: {e}")
                    continue
        
        print(f"✅ Successfully extracted {len(words_data)} words")
        return words_data
        
    except requests.RequestException as e:
        print(f"❌ Network error: {e}")
        return None
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def save_to_csv(words_data, filename):
    """Save words to CSV file"""
    
    if not words_data:
        print("❌ No data to save")
        return False
    
    try:
        with open(filename, 'w', newline='', encoding='utf-8') as f:
            fieldnames = ['word', 'rank', 'frequency', 'cefr_level', 'related_forms', 'sfi']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            
            writer.writeheader()
            writer.writerows(words_data)
        
        print(f"💾 Saved {len(words_data)} words to {filename}")
        
        # Print statistics
        cefr_counts = {}
        for word in words_data:
            level = word['cefr_level']
            cefr_counts[level] = cefr_counts.get(level, 0) + 1
        
        print("\n📊 CEFR Distribution:")
        for level in sorted(cefr_counts.keys()):
            print(f"   {level}: {cefr_counts[level]} words")
        
        return True
        
    except Exception as e:
        print(f"❌ Error saving file: {e}")
        return False

def main():
    print("🚀 NGSL Complete Data Downloader")
    print("=" * 50)
    
    # Download NGSL
    words_data = download_ngsl_complete()
    
    if words_data:
        # Save to CSV
        output_file = "data/vocabulary-sources/ngsl-complete.csv"
        success = save_to_csv(words_data, output_file)
        
        if success:
            print("\n✨ Download complete!")
            print(f"\n📁 Output file: {output_file}")
            print("\nNext steps:")
            print("1. Run: npx tsx scripts/import-vocabulary-lexicon.ts")
            print("2. Apply migration: wrangler d1 execute DB_NAME --file=migrations/0024_populate_eiken_vocabulary_lexicon.sql")
        else:
            print("\n❌ Failed to save data")
    else:
        print("\n❌ Failed to download data")

if __name__ == "__main__":
    main()
