/**
 * Phase 2C: Blueprint Generator Service
 * 
 * Generates question blueprints based on selected topics and formats
 */

import type { D1Database } from '@cloudflare/workers-types';
import type {
  Blueprint,
  BlueprintGenerationOptions,
  BlueprintGenerationResult,
  TopicArea,
  QuestionFormat,
} from '../types';
import { TopicSelector } from './topic-selector';
import {
  GRADE_SPECIFICATIONS,
  FORMAT_SPECIFICATIONS,
  DEFAULT_RUBRICS,
} from '../constants/blueprint-specs';

export class BlueprintGenerator {
  private db: D1Database;
  private topicSelector: TopicSelector;

  constructor(db: D1Database) {
    this.db = db;
    this.topicSelector = new TopicSelector(db);
  }

  /**
   * Generate a complete blueprint for question creation
   */
  async generateBlueprint(
    options: BlueprintGenerationOptions
  ): Promise<BlueprintGenerationResult> {
    // Step 1: Select topic (or use provided topic)
    let topicSelection;
    let topic: TopicArea;

    if (options.topic_code) {
      // Use specified topic
      topic = await this.getTopicByCode(options.topic_code, options.grade);
      topicSelection = {
        topic,
        selection_method: 'manual' as const,
        weight_score: 1.0,
        suitability_score: 1.0,
        final_score: 1.0,
        metadata: {
          candidates_count: 1,
          lru_filtered: 0,
          blacklist_filtered: 0,
          exploration_probability: 0,
          selection_timestamp: new Date().toISOString(),
        },
      };
    } else {
      // Use TopicSelector
      topicSelection = await this.topicSelector.selectTopic({
        student_id: options.student_id,
        grade: options.grade,
        question_type: options.format,
        session_id: options.session_id,
      });
      topic = topicSelection.topic;
    }

    // Step 2: Get grade specifications
    const gradeSpec = GRADE_SPECIFICATIONS[options.grade];
    const formatSpec = FORMAT_SPECIFICATIONS[options.format];

    // Step 3: Apply difficulty adjustment
    const adjustedSpec = this.adjustDifficulty(gradeSpec, options.difficulty_adjustment || 0);

    // Step 4: Generate format-specific instructions
    const instructions = await this.generateInstructions(
      options.format,
      topic,
      adjustedSpec,
      formatSpec
    );

    // Step 5: Create rubric
    const rubric = this.createRubric(options.format);

    // Step 6: Assemble blueprint
    // Phase 2: Long Reading形式の場合、級別にpassage_typeを設定
    const passageType = this.selectPassageType(options.format, options.grade);
    
    const blueprint: Blueprint = {
      id: this.generateBlueprintId(),
      format: options.format,
      topic,
      grade: options.grade,
      guidelines: {
        vocabulary_level: adjustedSpec.vocabulary_level,
        grammar_patterns: adjustedSpec.typical_grammar,
        sentence_length: adjustedSpec.sentence_length_range,
        complexity: adjustedSpec.complexity,
        word_count: formatSpec.word_count,
      },
      instructions,
      rubric,
      passage_type: passageType,
      created_at: new Date().toISOString(),
      metadata: {
        generator_version: '2.0.0',
        selection_method: topicSelection.selection_method,
        topic_score: topicSelection.final_score,
      },
    };

    return {
      blueprint,
      topic_selection: topicSelection,
      generation_timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get topic by code
   */
  private async getTopicByCode(topicCode: string, grade: string): Promise<TopicArea> {
    const result = await this.db
      .prepare(`SELECT * FROM eiken_topic_areas WHERE topic_code = ? AND grade = ? AND is_active = 1`)
      .bind(topicCode, grade)
      .first<TopicArea>();

    if (!result) {
      throw new Error(`Topic not found: ${topicCode} for grade ${grade}`);
    }

    return result;
  }

  /**
   * Adjust difficulty based on modifier
   */
  private adjustDifficulty(spec: typeof GRADE_SPECIFICATIONS[keyof typeof GRADE_SPECIFICATIONS], adjustment: number) {
    // Clone spec
    const adjusted = { ...spec };

    // Adjust sentence length (±20%)
    if (adjustment !== 0) {
      const lengthModifier = 1 + (adjustment * 0.2);
      adjusted.sentence_length_range = {
        min: Math.round(spec.sentence_length_range.min * lengthModifier),
        max: Math.round(spec.sentence_length_range.max * lengthModifier),
        target: Math.round(spec.sentence_length_range.target * lengthModifier),
      };
    }

    return adjusted;
  }

  /**
   * Generate format-specific instructions
   */
  private async generateInstructions(
    format: QuestionFormat,
    topic: TopicArea,
    gradeSpec: any,
    formatSpec: any
  ) {
    const promptTemplates: Record<string, string> = {
      grammar_fill: this.getGrammarFillPrompt(topic, gradeSpec),
      opinion_speech: this.getOpinionSpeechPrompt(topic, gradeSpec),
      reading_aloud: this.getReadingAloudPrompt(topic, gradeSpec),
      long_reading: this.getLongReadingPrompt(topic, gradeSpec),
      essay: this.getEssayPrompt(topic, gradeSpec),
    };

    return {
      prompt_template: promptTemplates[format] || promptTemplates.grammar_fill,
      constraints: formatSpec.typical_constraints,
      time_limit_minutes: formatSpec.time_limit_minutes,
    };
  }

  /**
   * Grammar Fill prompt template
   */
  private getGrammarFillPrompt(topic: TopicArea, spec: any): string {
    return `Create a grammar fill-in-the-blank question about "${topic.topic_label_en}" (${topic.topic_label_ja}).

Topic Context: ${topic.scenario_description || 'General context'}
Grade Level: ${spec.cefr_level}
Vocabulary Level: ${spec.vocabulary_level}
Target Grammar: ${spec.typical_grammar.join(', ')}

Requirements:
- Create ONE sentence with ONE blank
- The blank should test a specific grammar point
- Provide context clues before and after the blank
- Sentence length: ${spec.sentence_length_range.target} words (±${Math.round((spec.sentence_length_range.max - spec.sentence_length_range.min) / 2)})
- Use natural, authentic language
- Topic-relevant vocabulary

Format:
Sentence with _____ (blank)
Answer: [correct form]
Grammar Point: [what is being tested]`;
  }

  /**
   * Opinion Speech prompt template
   */
  private getOpinionSpeechPrompt(topic: TopicArea, spec: any): string {
    const subTopics = topic.sub_topics ? JSON.parse(topic.sub_topics) : [];
    const axes = topic.argument_axes ? JSON.parse(topic.argument_axes) : [];

    return `Create an opinion speech question about "${topic.topic_label_en}" (${topic.topic_label_ja}).

Topic Context: ${topic.scenario_description || 'General context'}
Sub-topics: ${subTopics.join(', ')}
Argument Axes: ${axes.join(', ')}
Grade Level: ${spec.cefr_level}
Complexity: ${spec.complexity}

Requirements:
- Create a clear, engaging question that prompts opinion
- Question should be answerable in 40-80 words
- Allow for multiple viewpoints
- Be culturally appropriate
- Match ${spec.vocabulary_level} vocabulary level

Format:
Question: [Your question here]
Expected Structure: [Opinion + 2-3 reasons]`;
  }

  /**
   * Reading Aloud prompt template
   */
  private getReadingAloudPrompt(topic: TopicArea, spec: any): string {
    return `Create a reading aloud passage about "${topic.topic_label_en}" (${topic.topic_label_ja}).

Topic Context: ${topic.scenario_description || 'General context'}
Grade Level: ${spec.cefr_level}
Vocabulary Level: ${spec.vocabulary_level}

Requirements:
- Create a short passage (30-60 words)
- Natural, conversational tone
- Clear sentence structure
- Appropriate difficulty for pronunciation practice
- Culturally relevant content
- Include ${spec.typical_grammar.slice(0, 3).join(', ')} grammar patterns

The passage should flow naturally when read aloud.`;
  }

  /**
   * Long Reading prompt template
   */
  private getLongReadingPrompt(topic: TopicArea, spec: any): string {
    const subTopics = topic.sub_topics ? JSON.parse(topic.sub_topics) : [];

    return `Create a long reading comprehension passage about "${topic.topic_label_en}" (${topic.topic_label_ja}).

Topic Context: ${topic.scenario_description || 'General context'}
Sub-topics to cover: ${subTopics.slice(0, 3).join(', ')}
Grade Level: ${spec.cefr_level}
Target Length: 250 words (150-400 range)

Requirements:
- Cohesive narrative or exposition
- Multiple main ideas (2-3)
- Supporting details and examples
- Logical organization (intro → body → conclusion)
- ${spec.complexity} complexity
- ${spec.vocabulary_level} vocabulary level
- Use grammar: ${spec.typical_grammar.slice(0, 5).join(', ')}

Include 3-5 comprehension questions covering:
- Main idea
- Specific details
- Inference
- Vocabulary in context`;
  }

  /**
   * Essay prompt template
   */
  private getEssayPrompt(topic: TopicArea, spec: any): string {
    const axes = topic.argument_axes ? JSON.parse(topic.argument_axes) : [];

    return `Create an essay writing prompt about "${topic.topic_label_en}" (${topic.topic_label_ja}).

Topic Context: ${topic.scenario_description || 'General context'}
Argument Axes: ${axes.join(', ')}
Grade Level: ${spec.cefr_level}
Target Length: 150 words (120-200 range)

Requirements:
- Clear, thought-provoking prompt
- Allows for structured argument
- Multiple perspectives possible
- Requires thesis statement
- Needs evidence/examples
- Appropriate for ${spec.complexity} writing
- ${spec.vocabulary_level} vocabulary level

The prompt should inspire:
- Introduction with clear thesis
- 2-3 body paragraphs with evidence
- Conclusion with summary/reflection
- Formal academic style`;
  }

  /**
   * Create evaluation rubric
   */
  private createRubric(format: QuestionFormat) {
    const criteria = DEFAULT_RUBRICS[format] || DEFAULT_RUBRICS.grammar_fill;
    const total = criteria.reduce((sum, c) => sum + c.max_score, 0);

    return {
      criteria,
      total_score: total,
    };
  }

  /**
   * Phase 2: 級別にPassage Typeを選択
   * 
   * 実際の英検出題形式に基づく:
   * - 4級・3級・準2級: article, email, noticeをランダム選択
   * - 2級以上: articleのみ（説明文・論説文中心）
   */
  private selectPassageType(format: QuestionFormat, grade: EikenGrade): 'article' | 'email' | 'notice' | undefined {
    // Long Reading形式以外はpassage_typeなし
    if (format !== 'long_reading') {
      return undefined;
    }
    
    // 2級以上は説明文のみ
    if (['2', 'pre-1', '1'].includes(grade)) {
      return 'article';
    }
    
    // 4級・3級・準2級は3つの形式からランダム選択
    if (['4', '3', 'pre-2'].includes(grade)) {
      const types: ('article' | 'email' | 'notice')[] = ['article', 'email', 'notice'];
      const randomIndex = Math.floor(Math.random() * types.length);
      const selected = types[randomIndex];
      console.log(`[Passage Type] Grade ${grade}: Selected "${selected}" (random from 3 types)`);
      return selected;
    }
    
    // デフォルトは説明文
    return 'article';
  }

  /**
   * Generate unique blueprint ID
   */
  private generateBlueprintId(): string {
    return `bp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
