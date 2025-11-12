/**
 * Vocabulary Constraints for Each Grade Level
 * 
 * 目的: 各級で使用可能な語彙リストと禁止パターンを定義
 * データソース: eiken_vocabulary_lexicon (2,518 A1 words)
 */

export interface VocabularyConstraints {
  level: string;
  cefrLevel: string;
  totalVocabularyCount: number;
  allowedVocabulary: {
    verbs: string[];
    nouns: string[];
    adjectives: string[];
    adverbs: string[];
    other: string[];
  };
  prohibitedPatterns: string[];
  guidelines: string[];
  examples: {
    good: string[];
    bad: string[];
  };
}

/**
 * Grade 5 (A1 / CEFR-J) Vocabulary Constraints
 * Total: 2,518 words in database
 */
export const grade5Constraints: VocabularyConstraints = {
  level: "Eiken Grade 5",
  cefrLevel: "A1 / CEFR-J",
  totalVocabularyCount: 2518,
  
  allowedVocabulary: {
    // Top 50 A1 verbs (most frequent)
    verbs: [
      "be", "have", "do", "go", "get", "make", "see", "come", "want", "know",
      "take", "give", "think", "say", "tell", "play", "like", "love", "help", "work",
      "live", "look", "use", "find", "walk", "talk", "eat", "drink", "read", "write",
      "watch", "listen", "study", "learn", "teach", "buy", "sell", "open", "close", "start",
      "finish", "stop", "try", "need", "call", "ask", "answer", "meet", "visit", "swim"
    ],
    
    // Top 100 A1 nouns (most frequent)
    nouns: [
      "time", "day", "year", "week", "month", "hour", "morning", "afternoon", "evening", "night",
      "people", "person", "man", "woman", "child", "boy", "girl", "baby", "friend", "family",
      "mother", "father", "sister", "brother", "parent", "son", "daughter", "grandfather", "grandmother", "aunt",
      "uncle", "cousin", "husband", "wife", "boyfriend", "girlfriend",
      "school", "class", "teacher", "student", "classmate", "desk", "book", "pen", "pencil", "paper",
      "bag", "box", "chair", "table", "door", "window", "room", "house", "home", "bedroom",
      "bathroom", "kitchen", "garden", "car", "bus", "train", "bike", "bicycle", "airplane", "airport",
      "food", "water", "coffee", "tea", "milk", "bread", "rice", "egg", "apple", "banana",
      "cake", "cookie", "lunch", "dinner", "breakfast", "restaurant", "store", "shop", "bank", "hospital",
      "park", "library", "church", "station", "street", "city", "town", "country", "place", "building"
    ],
    
    // Top 40 A1 adjectives
    adjectives: [
      "good", "bad", "big", "small", "old", "new", "young", "long", "short", "tall",
      "happy", "sad", "tired", "hungry", "hot", "cold", "warm", "cool", "easy", "hard",
      "fast", "slow", "high", "low", "clean", "dirty", "cheap", "expensive", "beautiful", "pretty",
      "nice", "kind", "friendly", "busy", "free", "ready", "important", "interesting", "favorite", "special"
    ],
    
    // Top 20 A1 adverbs
    adverbs: [
      "very", "too", "so", "well", "now", "then", "here", "there", "today", "yesterday",
      "tomorrow", "always", "usually", "often", "sometimes", "never", "again", "already", "just", "only"
    ],
    
    // Other high-frequency words
    other: [
      "and", "or", "but", "because", "if", "when", "where", "what", "who", "how",
      "this", "that", "these", "those", "my", "your", "his", "her", "our", "their",
      "I", "you", "he", "she", "it", "we", "they", "me", "him", "her",
      "a", "an", "the", "some", "any", "all", "no", "not"
    ]
  },
  
  prohibitedPatterns: [
    "❌ Academic vocabulary (analyze, demonstrate, evaluate, comprehensive, fundamental)",
    "❌ Business terms (promotion, conference, colleague, negotiate, strategy)",
    "❌ Advanced verbs (delighted, concerned, accomplished, overwhelmed, astonished)",
    "❌ Complex adjectives (magnificent, extraordinary, substantial, remarkable, sophisticated)",
    "❌ Formal vocabulary (commence, conclude, proceed, utilize, facilitate)",
    "❌ Abstract nouns (phenomenon, concept, perspective, implications, dimensions)",
    "❌ Technical terms (algorithm, protocol, mechanism, infrastructure, methodology)"
  ],
  
  guidelines: [
    "✅ Use simple present, past, and future tenses (will/going to)",
    "✅ Use common everyday nouns (house, school, food, family, friend)",
    "✅ Use basic adjectives (good, bad, big, small, happy, sad, hot, cold)",
    "✅ Use high-frequency verbs (go, come, make, take, give, get, have, be)",
    "✅ Avoid phrasal verbs with multiple meanings (put up with, get over, look into)",
    "✅ Avoid idioms and expressions (raining cats and dogs, piece of cake)",
    "✅ Keep sentences short and simple (max 15 words recommended)",
    "✅ Use concrete, familiar topics (daily life, school, family, food, hobbies)"
  ],
  
  examples: {
    good: [
      "I go to school every day.",
      "My mother is a teacher.",
      "We played soccer yesterday.",
      "She likes to read books.",
      "They will visit us tomorrow.",
      "The weather is nice today.",
      "Can you help me with my homework?",
      "I want to eat pizza for dinner."
    ],
    bad: [
      "❌ She was delighted to receive the promotion. (delighted=B2, receive=B1, promotion=B1)",
      "❌ The conference will commence next week. (conference=B1, commence=C1)",
      "❌ He demonstrated exceptional leadership skills. (demonstrate=B1, exceptional=B2, leadership=B1)",
      "❌ The scientist conducted a complex experiment. (scientist=B1, conduct=B2, complex=B1, experiment=B1)",
      "❌ They discussed the implications of the decision. (discuss=B1, implications=C1, decision=B1)"
    ]
  }
};

/**
 * Grade 4 (A2 level) Constraints
 * TODO: Implement when A2 vocabulary data is available
 */
export const grade4Constraints: Partial<VocabularyConstraints> = {
  level: "Eiken Grade 4",
  cefrLevel: "A2 / CEFR-J",
  totalVocabularyCount: 0, // To be populated
  prohibitedPatterns: [
    "Same as Grade 5 but allows some B1 vocabulary with caution"
  ]
};

/**
 * Get vocabulary constraints for specific grade
 */
export function getVocabularyConstraints(grade: string): VocabularyConstraints {
  if (grade === '5') {
    return grade5Constraints;
  }
  
  if (grade === '4') {
    return grade4Constraints as VocabularyConstraints;
  }
  
  // Default to Grade 5 for now
  return grade5Constraints;
}

/**
 * Format vocabulary constraints for prompt
 */
export function formatVocabularyConstraints(constraints: VocabularyConstraints): string {
  const sections: string[] = [];
  
  sections.push(`# VOCABULARY CONSTRAINTS FOR ${constraints.level} (${constraints.cefrLevel})`);
  sections.push(`Total allowed vocabulary: ${constraints.totalVocabularyCount} words\n`);
  
  sections.push('## ✅ ALLOWED VOCABULARY (High-Frequency Words Only):\n');
  
  sections.push(`**Verbs** (${constraints.allowedVocabulary.verbs.length}):`);
  sections.push(constraints.allowedVocabulary.verbs.join(', ') + '\n');
  
  sections.push(`**Nouns** (${constraints.allowedVocabulary.nouns.length}):`);
  sections.push(constraints.allowedVocabulary.nouns.join(', ') + '\n');
  
  sections.push(`**Adjectives** (${constraints.allowedVocabulary.adjectives.length}):`);
  sections.push(constraints.allowedVocabulary.adjectives.join(', ') + '\n');
  
  sections.push(`**Adverbs** (${constraints.allowedVocabulary.adverbs.length}):`);
  sections.push(constraints.allowedVocabulary.adverbs.join(', ') + '\n');
  
  sections.push('## ❌ PROHIBITED PATTERNS:\n');
  constraints.prohibitedPatterns.forEach(pattern => {
    sections.push(pattern);
  });
  sections.push('');
  
  sections.push('## 📋 GUIDELINES:\n');
  constraints.guidelines.forEach(guideline => {
    sections.push(guideline);
  });
  sections.push('');
  
  sections.push('## 💡 EXAMPLES:\n');
  sections.push('✅ Good sentences (A1 vocabulary only):');
  constraints.examples.good.forEach(ex => {
    sections.push(`   ${ex}`);
  });
  sections.push('');
  sections.push('❌ Bad sentences (contains B1-B2 vocabulary):');
  constraints.examples.bad.forEach(ex => {
    sections.push(`   ${ex}`);
  });
  
  return sections.join('\n');
}
