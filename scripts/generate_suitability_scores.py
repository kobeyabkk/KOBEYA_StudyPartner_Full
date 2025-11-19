#!/usr/bin/env python3
"""
Generate initial format suitability scores from parsed 236 questions.
Calculates success rates and performance metrics for each topic-format combination.
"""

import json
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Tuple

def load_questions(file_path: str) -> List[dict]:
    """Load parsed question data."""
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def calculate_suitability_scores(questions_data: List[dict]) -> List[dict]:
    """
    Calculate format suitability scores from actual question data.
    
    Scoring logic:
    - Present in data with multiple examples: 0.9-1.3 (based on frequency)
    - Present in data with few examples: 0.8-1.0
    - Not present in data: 1.0 (neutral default)
    """
    
    # Collect statistics
    stats = defaultdict(lambda: {'count': 0, 'grades': set(), 'topics': set()})
    
    for grade_data in questions_data:
        grade = grade_data['grade']
        questions = grade_data.get('questions', [])
        
        for q in questions:
            topic = q.get('topic', 'unknown')
            q_type = q.get('question_type', 'unknown')
            
            key = (topic, grade, q_type)
            stats[key]['count'] += 1
            stats[key]['grades'].add(grade)
            stats[key]['topics'].add(topic)
    
    # Generate suitability scores
    suitability_records = []
    
    for (topic, grade, q_type), data in stats.items():
        count = data['count']
        
        # Calculate suitability score based on frequency
        if count >= 5:
            suitability_score = 1.3  # High confidence, frequently tested
        elif count >= 3:
            suitability_score = 1.2  # Good confidence
        elif count >= 2:
            suitability_score = 1.0  # Neutral, sufficient data
        else:
            suitability_score = 0.9  # Single occurrence, lower confidence
        
        # Reasoning
        reasoning = f"Based on {count} actual exam question(s) in grade {grade}"
        
        suitability_records.append({
            'topic_code': topic.replace(' ', '_').lower(),
            'topic_label': topic,
            'grade': grade,
            'question_type': q_type,
            'suitability_score': round(suitability_score, 2),
            'sample_count': count,
            'reasoning': reasoning
        })
    
    # Sort by grade, then topic, then question type
    grade_order = {'5': 0, '4': 1, '3': 2, 'pre2': 3, '2': 4, 'pre1': 5, '1': 6}
    suitability_records.sort(key=lambda x: (
        grade_order.get(x['grade'], 999),
        x['topic_code'],
        x['question_type']
    ))
    
    return suitability_records

def generate_sql_insert(records: List[dict]) -> str:
    """Generate SQL INSERT statements for suitability scores."""
    
    sql_lines = [
        "-- Auto-generated format suitability scores from 236 real exam questions",
        "-- Generated on: 2025-11-19",
        "-- Total records: " + str(len(records)),
        "",
        "INSERT INTO eiken_topic_question_type_suitability",
        "  (topic_code, grade, question_type, suitability_score, reasoning)",
        "VALUES"
    ]
    
    value_lines = []
    for record in records:
        topic = record['topic_code']
        grade = record['grade']
        q_type = record['question_type']
        score = record['suitability_score']
        reason = record['reasoning'].replace("'", "''")  # SQL escape
        
        value_lines.append(
            f"  ('{topic}', '{grade}', '{q_type}', {score}, '{reason}')"
        )
    
    sql_lines.append(",\n".join(value_lines) + ";")
    
    return "\n".join(sql_lines)

def generate_summary_report(records: List[dict]) -> str:
    """Generate human-readable summary report."""
    
    lines = [
        "=" * 70,
        "Format Suitability Scores - Summary Report",
        "=" * 70,
        "",
        f"Total Combinations: {len(records)}",
        ""
    ]
    
    # Group by grade
    by_grade = defaultdict(list)
    for r in records:
        by_grade[r['grade']].append(r)
    
    grade_order = ['5', '4', '3', 'pre2', '2', 'pre1', '1']
    
    for grade in grade_order:
        if grade not in by_grade:
            continue
        
        grade_records = by_grade[grade]
        lines.append(f"\n{'=' * 70}")
        lines.append(f"Grade {grade}: {len(grade_records)} combinations")
        lines.append('=' * 70)
        
        # Group by question type
        by_type = defaultdict(list)
        for r in grade_records:
            by_type[r['question_type']].append(r)
        
        for q_type in sorted(by_type.keys()):
            type_records = by_type[q_type]
            lines.append(f"\n  {q_type}:")
            
            for r in sorted(type_records, key=lambda x: x['suitability_score'], reverse=True):
                lines.append(
                    f"    • {r['topic_label']:25} → {r['suitability_score']:.2f} "
                    f"({r['sample_count']} samples)"
                )
    
    lines.append("\n" + "=" * 70)
    lines.append("Score Distribution:")
    lines.append("=" * 70)
    
    score_dist = defaultdict(int)
    for r in records:
        score_dist[r['suitability_score']] += 1
    
    for score in sorted(score_dist.keys(), reverse=True):
        count = score_dist[score]
        lines.append(f"  {score:.2f}: {count} combinations")
    
    return "\n".join(lines)

def main():
    input_file = "/home/user/webapp/data/eiken_questions.json"
    output_sql = "/home/user/webapp/data/phase2a_prep/suitability_scores.sql"
    output_json = "/home/user/webapp/data/phase2a_prep/suitability_scores.json"
    output_report = "/home/user/webapp/data/phase2a_prep/suitability_report.txt"
    
    print("=" * 70)
    print("Format Suitability Score Generator")
    print("=" * 70)
    print()
    
    # Load data
    print(f"Loading questions from: {input_file}")
    questions_data = load_questions(input_file)
    print(f"Loaded {len(questions_data)} grade sections")
    
    # Calculate scores
    print("\nCalculating suitability scores...")
    suitability_records = calculate_suitability_scores(questions_data)
    print(f"Generated {len(suitability_records)} suitability scores")
    
    # Save JSON
    print(f"\nSaving JSON to: {output_json}")
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(suitability_records, f, ensure_ascii=False, indent=2)
    
    # Generate SQL
    print(f"Generating SQL to: {output_sql}")
    sql_content = generate_sql_insert(suitability_records)
    with open(output_sql, 'w', encoding='utf-8') as f:
        f.write(sql_content)
    
    # Generate report
    print(f"Generating report to: {output_report}")
    report = generate_summary_report(suitability_records)
    with open(output_report, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print("\n" + "=" * 70)
    print("✓ All files generated successfully!")
    print("=" * 70)
    
    # Print summary
    print("\nQuick Stats:")
    print(f"  - Total combinations: {len(suitability_records)}")
    print(f"  - Unique topics: {len(set(r['topic_code'] for r in suitability_records))}")
    print(f"  - Unique formats: {len(set(r['question_type'] for r in suitability_records))}")
    print(f"  - Average score: {sum(r['suitability_score'] for r in suitability_records) / len(suitability_records):.2f}")
    print()

if __name__ == "__main__":
    main()
