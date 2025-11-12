import pdfplumber
import json
import sys

def analyze_pdf(pdf_path):
    """Analyze Eiken test booklet PDF structure"""
    
    result = {
        "file": pdf_path,
        "total_pages": 0,
        "pages": []
    }
    
    try:
        with pdfplumber.open(pdf_path) as pdf:
            result["total_pages"] = len(pdf.pages)
            
            # Analyze first 5 pages in detail
            for i, page in enumerate(pdf.pages[:5]):
                page_info = {
                    "page_number": i + 1,
                    "text_preview": "",
                    "text_length": 0,
                    "has_images": False,
                    "has_tables": False
                }
                
                # Extract text
                text = page.extract_text() or ""
                page_info["text_length"] = len(text)
                page_info["text_preview"] = text[:500] if text else ""
                
                # Check for images
                page_info["has_images"] = len(page.images) > 0
                
                # Check for tables
                tables = page.extract_tables()
                page_info["has_tables"] = len(tables) > 0 if tables else False
                
                result["pages"].append(page_info)
            
            # Extract full text from pages 1-3 for detailed analysis
            print("\n" + "="*80)
            print("DETAILED TEXT ANALYSIS - First 3 Pages")
            print("="*80)
            
            for i in range(min(3, len(pdf.pages))):
                page = pdf.pages[i]
                text = page.extract_text() or ""
                
                print(f"\n{'='*80}")
                print(f"PAGE {i+1}")
                print(f"{'='*80}")
                print(text[:2000])  # First 2000 characters
                print(f"\n... (Total length: {len(text)} characters)")
                
    except Exception as e:
        result["error"] = str(e)
        print(f"Error analyzing PDF: {e}", file=sys.stderr)
    
    return result

if __name__ == "__main__":
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else "test.pdf"
    result = analyze_pdf(pdf_path)
    
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    print(json.dumps(result, ensure_ascii=False, indent=2))

