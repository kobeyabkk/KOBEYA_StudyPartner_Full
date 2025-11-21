#!/usr/bin/env python3
"""
Generate comprehensive mock data for Phase 2A testing.
Creates realistic student usage history, blacklist entries, and statistics.
"""

import json
import random
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict

# Configuration
NUM_STUDENTS = 20
HISTORY_PER_STUDENT = 20  # Total: 400 records
BLACKLIST_ENTRIES = 15
STATS_RECORDS = 100

GRADES = ['5', '4', '3', 'pre2', '2', 'pre1', '1']
QUESTION_TYPES = [
    'grammar_fill', 'conversation', 'reading_aloud', 'picture_description',
    'q_and_a', 'email_reply', 'short_opinion', 'long_reading',
    'essay', 'opinion_speech', 'summary', 'writing_summary',
    'opinion_essay', 'writing_essay'
]

def load_topics() -> List[str]:
    """Load unique topic codes from suitability scores."""
    with open('/home/user/webapp/data/phase2a_prep/suitability_scores.json', 'r') as f:
        scores = json.load(f)
    return list(set(s['topic_code'] for s in scores))

def generate_student_ids() -> List[str]:
    """Generate realistic student IDs."""
    return [f"student_{i:03d}" for i in range(1, NUM_STUDENTS + 1)]

def generate_usage_history(student_ids: List[str], topics: List[str]) -> List[Dict]:
    """Generate realistic usage history for students."""
    records = []
    base_date = datetime.now() - timedelta(days=30)
    
    for student_id in student_ids:
        # Each student focuses on 1-2 grades
        student_grades = random.sample(GRADES, k=random.randint(1, 2))
        
        for i in range(HISTORY_PER_STUDENT):
            grade = random.choice(student_grades)
            
            # Pick question types relevant to grade
            if grade in ['5', '4']:
                q_type = random.choice(['grammar_fill', 'conversation'])
            elif grade == '3':
                q_type = random.choice(['grammar_fill', 'reading_aloud', 'q_and_a', 'email_reply'])
            elif grade == 'pre2':
                q_type = random.choice(['grammar_fill', 'short_opinion', 'q_and_a', 'reading_aloud'])
            elif grade == '2':
                q_type = random.choice(['opinion_speech', 'essay', 'long_reading', 'grammar_fill'])
            elif grade == 'pre1':
                q_type = random.choice(['opinion_speech', 'summary', 'opinion_essay', 'long_reading'])
            else:  # grade 1
                q_type = random.choice(['opinion_essay', 'writing_essay', 'long_reading', 'opinion_speech'])
            
            # Pick topic (prefer common topics)
            topic = random.choice(topics)
            
            # Timestamp: spread over last 30 days
            used_at = base_date + timedelta(
                days=random.randint(0, 30),
                hours=random.randint(0, 23),
                minutes=random.randint(0, 59)
            )
            
            # Session ID: group by day
            session_id = f"session_{student_id}_{used_at.strftime('%Y%m%d')}"
            
            records.append({
                'student_id': student_id,
                'grade': grade,
                'topic_code': topic,
                'question_type': q_type,
                'session_id': session_id,
                'used_at': used_at.isoformat()
            })
    
    # Sort by timestamp
    records.sort(key=lambda x: x['used_at'])
    return records

def generate_blacklist(student_ids: List[str], topics: List[str]) -> List[Dict]:
    """Generate realistic blacklist entries."""
    records = []
    reasons = [
        'timeout',
        'vocabulary_mismatch',
        'grammar_complexity',
        'coherence_low',
        'blueprint_violation'
    ]
    
    # Select subset of students who have failures
    problematic_students = random.sample(student_ids, k=min(10, len(student_ids)))
    
    for _ in range(BLACKLIST_ENTRIES):
        student_id = random.choice(problematic_students)
        topic = random.choice(topics)
        grade = random.choice(GRADES)
        q_type = random.choice(QUESTION_TYPES)
        reason = random.choice(reasons)
        
        # Set TTL based on reason
        ttl_days = {
            'timeout': 1,
            'vocabulary_mismatch': 7,
            'grammar_complexity': 14,
            'coherence_low': 3,
            'blueprint_violation': 10
        }[reason]
        
        # Some entries expired, some still active
        is_expired = random.random() < 0.3
        if is_expired:
            # Already expired
            blacklisted_at = datetime.now() - timedelta(days=ttl_days + random.randint(1, 5))
        else:
            # Still active
            blacklisted_at = datetime.now() - timedelta(days=random.randint(0, ttl_days - 1))
        
        expires_at = blacklisted_at + timedelta(days=ttl_days)
        
        records.append({
            'student_id': student_id,
            'grade': grade,
            'topic_code': topic,
            'question_type': q_type,
            'failure_reason': reason,
            'blacklisted_at': blacklisted_at.isoformat(),
            'expires_at': expires_at.isoformat()
        })
    
    return records

def generate_statistics(topics: List[str]) -> List[Dict]:
    """Generate realistic topic statistics."""
    records = []
    
    for topic in topics:
        for grade in random.sample(GRADES, k=random.randint(2, 5)):
            for q_type in random.sample(QUESTION_TYPES, k=random.randint(1, 3)):
                total_uses = random.randint(5, 50)
                successful = int(total_uses * random.uniform(0.75, 0.98))
                failed = total_uses - successful
                
                avg_time = random.randint(800, 3500)  # 0.8-3.5 seconds
                avg_score = random.uniform(0.65, 0.95)
                
                records.append({
                    'topic_code': topic,
                    'grade': grade,
                    'question_type': q_type,
                    'total_uses': total_uses,
                    'successful_generations': successful,
                    'failed_generations': failed,
                    'avg_generation_time_ms': round(avg_time, 2),
                    'avg_student_score': round(avg_score, 3),
                    'last_updated': datetime.now().isoformat()
                })
    
    # Return limited number
    return random.sample(records, min(STATS_RECORDS, len(records)))

def generate_sql(usage: List[Dict], blacklist: List[Dict], stats: List[Dict]) -> str:
    """Generate SQL INSERT statements."""
    
    lines = [
        "-- Auto-generated mock data for Phase 2A testing",
        f"-- Generated on: {datetime.now().isoformat()}",
        f"-- Students: {NUM_STUDENTS}, History: {len(usage)}, Blacklist: {len(blacklist)}, Stats: {len(stats)}",
        "",
        "-- Clean existing mock data (optional)",
        "-- DELETE FROM eiken_topic_usage_history WHERE student_id LIKE 'student_%';",
        "-- DELETE FROM eiken_topic_blacklist WHERE student_id LIKE 'student_%';",
        "-- DELETE FROM eiken_topic_statistics;",
        ""
    ]
    
    # Usage history
    lines.append("-- Usage History")
    lines.append("INSERT INTO eiken_topic_usage_history")
    lines.append("  (student_id, grade, topic_code, question_type, session_id, used_at)")
    lines.append("VALUES")
    
    usage_values = []
    for r in usage:
        usage_values.append(
            f"  ('{r['student_id']}', '{r['grade']}', '{r['topic_code']}', "
            f"'{r['question_type']}', '{r['session_id']}', '{r['used_at']}')"
        )
    
    lines.append(",\n".join(usage_values) + ";")
    lines.append("")
    
    # Blacklist
    lines.append("-- Blacklist Entries")
    lines.append("INSERT INTO eiken_topic_blacklist")
    lines.append("  (student_id, grade, topic_code, question_type, failure_reason, blacklisted_at, expires_at)")
    lines.append("VALUES")
    
    blacklist_values = []
    for r in blacklist:
        reason = r['failure_reason'].replace("'", "''")
        blacklist_values.append(
            f"  ('{r['student_id']}', '{r['grade']}', '{r['topic_code']}', "
            f"'{r['question_type']}', '{reason}', '{r['blacklisted_at']}', '{r['expires_at']}')"
        )
    
    lines.append(",\n".join(blacklist_values) + ";")
    lines.append("")
    
    # Statistics
    lines.append("-- Topic Statistics")
    lines.append("INSERT INTO eiken_topic_statistics")
    lines.append("  (topic_code, grade, question_type, total_uses, successful_generations,")
    lines.append("   failed_generations, avg_generation_time_ms, avg_student_score, last_updated)")
    lines.append("VALUES")
    
    stats_values = []
    for r in stats:
        stats_values.append(
            f"  ('{r['topic_code']}', '{r['grade']}', '{r['question_type']}', "
            f"{r['total_uses']}, {r['successful_generations']}, {r['failed_generations']}, "
            f"{r['avg_generation_time_ms']}, {r['avg_student_score']}, '{r['last_updated']}')"
        )
    
    lines.append(",\n".join(stats_values) + ";")
    
    return "\n".join(lines)

def main():
    print("=" * 70)
    print("Mock Data Generator for Phase 2A")
    print("=" * 70)
    print()
    
    # Load topics
    print("Loading topics from suitability scores...")
    topics = load_topics()
    print(f"Found {len(topics)} unique topics")
    
    # Generate student IDs
    print(f"\nGenerating {NUM_STUDENTS} student IDs...")
    student_ids = generate_student_ids()
    
    # Generate usage history
    print(f"Generating usage history ({HISTORY_PER_STUDENT} per student)...")
    usage_history = generate_usage_history(student_ids, topics)
    print(f"  → {len(usage_history)} records")
    
    # Generate blacklist
    print(f"\nGenerating blacklist entries...")
    blacklist = generate_blacklist(student_ids, topics)
    print(f"  → {len(blacklist)} records")
    
    # Generate statistics
    print(f"\nGenerating topic statistics...")
    statistics = generate_statistics(topics)
    print(f"  → {len(statistics)} records")
    
    # Save JSON
    output_json = "/home/user/webapp/data/phase2a_prep/mock_data.json"
    print(f"\nSaving JSON to: {output_json}")
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump({
            'students': student_ids,
            'usage_history': usage_history,
            'blacklist': blacklist,
            'statistics': statistics
        }, f, ensure_ascii=False, indent=2)
    
    # Generate SQL
    output_sql = "/home/user/webapp/data/phase2a_prep/mock_data.sql"
    print(f"Generating SQL to: {output_sql}")
    sql_content = generate_sql(usage_history, blacklist, statistics)
    with open(output_sql, 'w', encoding='utf-8') as f:
        f.write(sql_content)
    
    print("\n" + "=" * 70)
    print("✓ Mock data generated successfully!")
    print("=" * 70)
    print("\nSummary:")
    print(f"  - Students: {len(student_ids)}")
    print(f"  - Usage history: {len(usage_history)} records")
    print(f"  - Blacklist: {len(blacklist)} records")
    print(f"  - Statistics: {len(statistics)} records")
    print()

if __name__ == "__main__":
    main()
