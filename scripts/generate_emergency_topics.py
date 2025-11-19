#!/usr/bin/env python3
"""
Generate 5 emergency topics each for Grade 4 and Pre-2 to reach minimum of 10 topics.
Based on official Eiken guidelines and typical exam patterns.
"""

import json
from pathlib import Path

def generate_grade4_topics():
    """Generate 5 additional topics for Grade 4."""
    return [
        {
            "grade": "4",
            "topic_code": "pets",
            "topic_label_ja": "ペット",
            "topic_label_en": "Pets",
            "abstractness_level": 2,
            "context_type": "personal",
            "scenario_description": "Topics about pets, animals at home, taking care of pets, favorite animals, visits to pet shops or zoos",
            "sub_topics": ["my_pet", "cat", "dog", "animal_care", "zoo_visit"],
            "argument_axes": ["like_dislike", "favorite", "description"],
            "weight": 1.1,
            "official_frequency": 1.3,
            "is_active": 1,
            "reasoning": "Emergency addition - common Grade 4 topic based on official guidelines"
        },
        {
            "grade": "4",
            "topic_code": "weather",
            "topic_label_ja": "天気",
            "topic_label_en": "Weather",
            "abstractness_level": 1,
            "context_type": "daily",
            "scenario_description": "Weather descriptions, seasons, favorite weather, activities in different weather conditions",
            "sub_topics": ["sunny", "rainy", "seasons", "weather_activities"],
            "argument_axes": ["description", "preference", "activities"],
            "weight": 1.0,
            "official_frequency": 1.2,
            "is_active": 1,
            "reasoning": "Emergency addition - fundamental Grade 4 topic"
        },
        {
            "grade": "4",
            "topic_code": "sports",
            "topic_label_ja": "スポーツ",
            "topic_label_en": "Sports",
            "abstractness_level": 2,
            "context_type": "personal",
            "scenario_description": "Sports activities, favorite sports, playing sports, watching sports, sports at school",
            "sub_topics": ["soccer", "baseball", "swimming", "sports_day", "team_sports"],
            "argument_axes": ["like_dislike", "participation", "watching"],
            "weight": 1.2,
            "official_frequency": 1.4,
            "is_active": 1,
            "reasoning": "Emergency addition - very common in Grade 4 exams"
        },
        {
            "grade": "4",
            "topic_code": "shopping",
            "topic_label_ja": "買い物",
            "topic_label_en": "Shopping",
            "abstractness_level": 2,
            "context_type": "daily",
            "scenario_description": "Shopping experiences, going to stores, buying things, what to buy, shopping with family",
            "sub_topics": ["supermarket", "shopping_mall", "buying_clothes", "pocket_money"],
            "argument_axes": ["experience", "preferences", "routines"],
            "weight": 1.0,
            "official_frequency": 1.1,
            "is_active": 1,
            "reasoning": "Emergency addition - practical daily life topic"
        },
        {
            "grade": "4",
            "topic_code": "festivals",
            "topic_label_ja": "お祭り・イベント",
            "topic_label_en": "Festivals and Events",
            "abstractness_level": 2,
            "context_type": "daily",
            "scenario_description": "School festivals, local festivals, events, celebrations, special occasions",
            "sub_topics": ["school_festival", "summer_festival", "christmas", "new_year", "birthday"],
            "argument_axes": ["experience", "enjoyment", "activities"],
            "weight": 1.1,
            "official_frequency": 1.2,
            "is_active": 1,
            "reasoning": "Emergency addition - culturally relevant Grade 4 topic"
        }
    ]

def generate_pre2_topics():
    """Generate 5 additional topics for Pre-2."""
    return [
        {
            "grade": "pre2",
            "topic_code": "hobbies",
            "topic_label_ja": "趣味",
            "topic_label_en": "Hobbies",
            "abstractness_level": 3,
            "context_type": "personal",
            "scenario_description": "Personal hobbies, interests, leisure activities, developing skills, hobby benefits",
            "sub_topics": ["reading", "music", "sports", "collecting", "creative_activities"],
            "argument_axes": ["benefits", "time_management", "skill_development"],
            "weight": 1.2,
            "official_frequency": 1.4,
            "is_active": 1,
            "reasoning": "Emergency addition - fundamental Pre-2 topic"
        },
        {
            "grade": "pre2",
            "topic_code": "part_time_jobs",
            "topic_label_ja": "アルバイト",
            "topic_label_en": "Part-time Jobs",
            "abstractness_level": 4,
            "context_type": "general",
            "scenario_description": "Student part-time work, job experiences, balancing work and study, earning money",
            "sub_topics": ["work_experience", "responsibility", "time_balance", "earning_money"],
            "argument_axes": ["pros_cons", "learning", "responsibility"],
            "weight": 1.1,
            "official_frequency": 1.3,
            "is_active": 1,
            "reasoning": "Emergency addition - relevant to Pre-2 age group"
        },
        {
            "grade": "pre2",
            "topic_code": "technology",
            "topic_label_ja": "テクノロジー",
            "topic_label_en": "Technology",
            "abstractness_level": 4,
            "context_type": "general",
            "scenario_description": "Technology in daily life, smartphones, computers, internet, social media basics",
            "sub_topics": ["smartphones", "internet", "social_media", "online_learning", "apps"],
            "argument_axes": ["benefits_problems", "usage", "impact"],
            "weight": 1.3,
            "official_frequency": 1.5,
            "is_active": 1,
            "reasoning": "Emergency addition - highly relevant modern topic"
        },
        {
            "grade": "pre2",
            "topic_code": "food",
            "topic_label_ja": "食生活",
            "topic_label_en": "Food and Diet",
            "abstractness_level": 3,
            "context_type": "daily",
            "scenario_description": "Food preferences, healthy eating, cooking, restaurants, food culture",
            "sub_topics": ["healthy_eating", "cooking", "restaurants", "food_culture", "diet"],
            "argument_axes": ["health", "preferences", "culture"],
            "weight": 1.0,
            "official_frequency": 1.2,
            "is_active": 1,
            "reasoning": "Emergency addition - practical life topic"
        },
        {
            "grade": "pre2",
            "topic_code": "transportation",
            "topic_label_ja": "交通",
            "topic_label_en": "Transportation",
            "abstractness_level": 3,
            "context_type": "daily",
            "scenario_description": "Transportation methods, commuting, public transportation, travel, traffic",
            "sub_topics": ["trains", "buses", "bicycles", "commuting", "traffic_issues"],
            "argument_axes": ["convenience", "environment", "safety"],
            "weight": 1.0,
            "official_frequency": 1.1,
            "is_active": 1,
            "reasoning": "Emergency addition - practical daily life topic"
        }
    ]

def generate_sql(topics):
    """Generate SQL INSERT statement for topics."""
    lines = [
        "-- Emergency topics for Grade 4 and Pre-2",
        f"-- Generated to reach minimum 10 topics per grade",
        "-- Total: 10 new topics (5 per grade)",
        "",
        "INSERT INTO eiken_topic_areas",
        "  (grade, topic_code, topic_label_ja, topic_label_en, abstractness_level,",
        "   context_type, scenario_description, sub_topics, argument_axes,",
        "   weight, official_frequency, is_active)",
        "VALUES"
    ]
    
    values = []
    for t in topics:
        sub_topics_json = json.dumps(t['sub_topics'])
        axes_json = json.dumps(t['argument_axes'])
        scenario = t['scenario_description'].replace("'", "''")
        
        values.append(
            f"  ('{t['grade']}', '{t['topic_code']}', '{t['topic_label_ja']}', '{t['topic_label_en']}',\n"
            f"   {t['abstractness_level']}, '{t['context_type']}', '{scenario}',\n"
            f"   '{sub_topics_json}', '{axes_json}',\n"
            f"   {t['weight']}, {t['official_frequency']}, {t['is_active']})"
        )
    
    lines.append(",\n".join(values) + ";")
    
    return "\n".join(lines)

def main():
    print("=" * 70)
    print("Emergency Topic Generator (Grade 4 & Pre-2)")
    print("=" * 70)
    print()
    
    # Generate topics
    print("Generating Grade 4 topics...")
    grade4_topics = generate_grade4_topics()
    print(f"  → {len(grade4_topics)} topics")
    
    print("\nGenerating Pre-2 topics...")
    pre2_topics = generate_pre2_topics()
    print(f"  → {len(pre2_topics)} topics")
    
    all_topics = grade4_topics + pre2_topics
    
    # Save JSON
    output_json = "/home/user/webapp/data/phase2a_prep/emergency_topics.json"
    print(f"\nSaving JSON to: {output_json}")
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(all_topics, f, ensure_ascii=False, indent=2)
    
    # Generate SQL
    output_sql = "/home/user/webapp/data/phase2a_prep/emergency_topics.sql"
    print(f"Generating SQL to: {output_sql}")
    sql_content = generate_sql(all_topics)
    with open(output_sql, 'w', encoding='utf-8') as f:
        f.write(sql_content)
    
    print("\n" + "=" * 70)
    print("✓ Emergency topics generated successfully!")
    print("=" * 70)
    print("\nSummary:")
    print(f"  - Grade 4 topics: {len(grade4_topics)}")
    print(f"  - Pre-2 topics: {len(pre2_topics)}")
    print(f"  - Total: {len(all_topics)} topics")
    print("\nNew topic codes:")
    print("  Grade 4:", ", ".join(t['topic_code'] for t in grade4_topics))
    print("  Pre-2:", ", ".join(t['topic_code'] for t in pre2_topics))
    print()

if __name__ == "__main__":
    main()
