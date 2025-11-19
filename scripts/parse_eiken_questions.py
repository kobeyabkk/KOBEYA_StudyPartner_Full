#!/usr/bin/env python3
"""
Parse uploaded Eiken question data file and extract all grade sections.
The file contains multiple JSON objects, but they span multiple lines.
Each grade starts with { "grade": and we need to find the complete object.
"""

import json
import re
import unicodedata
from pathlib import Path

def clean_unicode(text: str) -> str:
    """Remove problematic Unicode characters that break JSON parsing."""
    cleaned = []
    for char in text:
        cat = unicodedata.category(char)
        if cat in ('Zl', 'Zp'):  # Line/Paragraph separators like U+2028
            cleaned.append(' ')
        elif cat == 'Zs' and char != ' ':  # Other space separators
            cleaned.append(' ')
        else:
            cleaned.append(char)
    return ''.join(cleaned)

def fix_json_errors(text: str) -> str:
    """Fix common JSON formatting errors."""
    # "question_number": 5" -> "question_number": 5
    text = re.sub(r'"question_number":\s*(\d+)"', r'"question_number": \1', text)
    # Fix other numeric fields with misplaced quotes
    text = re.sub(r':\s*(\d+)"([,}\]])', r': \1\2', text)
    # Fix missing commas between objects: } \n { -> }, \n {
    text = re.sub(r'}\s*\n\s*{', r'},\n{', text)
    return text

def extract_grade_sections(file_path: str) -> list[dict]:
    """
    Extract all grade JSON objects from the uploaded file.
    Read the entire file, clean it, then parse JSON objects by brace matching.
    """
    # Read entire file
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"Original file size: {len(content)} characters")
    
    # Clean Unicode issues
    content = clean_unicode(content)
    print(f"After Unicode cleanup: {len(content)} characters")
    
    # Fix JSON errors
    content = fix_json_errors(content)
    print(f"Applied JSON fixes")
    
    # Find all grade object positions
    grade_pattern = r'\{\s*"grade":\s*"([^"]+)"'
    matches = list(re.finditer(grade_pattern, content))
    
    print(f"Found {len(matches)} grade sections\n")
    
    grade_objects = []
    
    for i, match in enumerate(matches):
        grade_value = match.group(1)
        start_pos = match.start()
        
        # Find the matching closing brace by counting
        brace_count = 0
        pos = start_pos
        in_string = False
        escape_next = False
        
        while pos < len(content):
            char = content[pos]
            
            # Handle escaping
            if escape_next:
                escape_next = False
                pos += 1
                continue
            
            if char == '\\':
                escape_next = True
                pos += 1
                continue
            
            # Handle strings
            if char == '"':
                in_string = not in_string
                pos += 1
                continue
            
            # Count braces outside strings
            if not in_string:
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        # Found complete object
                        json_str = content[start_pos:pos+1]
                        
                        try:
                            obj = json.loads(json_str)
                            questions = obj.get('questions', [])
                            grade_objects.append(obj)
                            print(f"✓ Grade {grade_value}: {len(questions)} questions parsed successfully")
                        except json.JSONDecodeError as e:
                            print(f"✗ Grade {grade_value}: JSON parse error - {e}")
                            # Try to show context
                            error_pos = getattr(e, 'pos', 0) if hasattr(e, 'pos') else 0
                            snippet_start = max(0, error_pos - 100)
                            snippet_end = min(len(json_str), error_pos + 100)
                            snippet = json_str[snippet_start:snippet_end]
                            print(f"  Context near error: {repr(snippet[:150])}\n")
                        break
            
            pos += 1
        else:
            print(f"✗ Grade {grade_value}: No matching closing brace found\n")
    
    return grade_objects

def main():
    input_file = "/home/user/uploaded_files/eikendate.txt"
    output_file = "/home/user/webapp/data/eiken_questions.json"
    
    print("=" * 70)
    print("Eiken Question Data Parser")
    print("=" * 70)
    print()
    
    # Extract all grade sections
    grade_objects = extract_grade_sections(input_file)
    
    # Sort by grade for consistency
    grade_order = ["5", "4", "3", "pre2", "2", "pre1", "1"]
    grade_objects.sort(key=lambda x: grade_order.index(x.get("grade", "999")) if x.get("grade") in grade_order else 999)
    
    # Create output directory if needed
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Save as proper JSON array
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(grade_objects, f, ensure_ascii=False, indent=2)
    
    print("\n" + "=" * 70)
    print("Summary Statistics")
    print("=" * 70)
    
    total_questions = 0
    for grade_obj in grade_objects:
        grade = grade_obj.get("grade", "unknown")
        questions = grade_obj.get("questions", [])
        q_count = len(questions)
        total_questions += q_count
        
        # Count by question type
        type_counts = {}
        topics = set()
        for q in questions:
            q_type = q.get("question_type", "unknown")
            type_counts[q_type] = type_counts.get(q_type, 0) + 1
            topic = q.get("topic", "")
            if topic:
                topics.add(topic)
        
        print(f"\nGrade {grade}: {q_count} questions, {len(topics)} unique topics")
        for q_type, count in sorted(type_counts.items()):
            print(f"  - {q_type}: {count}")
    
    print(f"\n{'=' * 70}")
    print(f"✓ Total: {total_questions} questions across {len(grade_objects)} grades")
    print(f"✓ Output: {output_file}")
    print("=" * 70)

if __name__ == "__main__":
    main()
