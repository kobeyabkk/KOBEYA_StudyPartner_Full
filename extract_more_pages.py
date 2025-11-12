import pdfplumber

pdf_path = "eiken_past_papers/英検過去問/準1級/2025年度第1回_問題冊子.pdf"

with pdfplumber.open(pdf_path) as pdf:
    print(f"Total pages: {len(pdf.pages)}\n")
    
    # Extract pages 3-8 to see question patterns
    for i in range(2, min(8, len(pdf.pages))):
        page = pdf.pages[i]
        text = page.extract_text() or ""
        
        print("="*80)
        print(f"PAGE {i+1}")
        print("="*80)
        print(text)
        print("\n")

