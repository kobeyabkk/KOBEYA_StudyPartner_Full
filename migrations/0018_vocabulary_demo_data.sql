-- Migration: Add demo vocabulary data for testing
-- 50 common Eiken vocabulary words (Grade 3 - Grade 1)
-- Data source: Common Eiken vocabulary lists

-- Delete existing false cognate examples first
DELETE FROM vocabulary_master WHERE word IN ('mansion', 'claim', 'smart');

INSERT INTO vocabulary_master (
  word, pos, definition_en, definition_ja,
  cefr_level, cefr_score, frequency_rank,
  eiken_frequency, eiken_grade,
  japanese_learner_difficulty, polysemy_count,
  final_difficulty_score, should_annotate,
  example_sentences, collocations,
  is_katakana_word, is_false_cognate, false_cognate_note
) VALUES

-- Grade 3 level (CEFR A1-A2) - Easy words
('important', 'adjective', 'of great significance', '重要な', 'A2', 2, 500, 95, 'grade_3', 30.0, 3, 32.5, FALSE, '[{"en":"It is important to study hard.","ja":"一生懸命勉強することは重要です。"}]', '["very important", "most important", "quite important"]', FALSE, FALSE, NULL),
('different', 'adjective', 'not the same', '異なる、違う', 'A2', 2, 450, 92, 'grade_3', 28.0, 4, 30.8, FALSE, '[{"en":"We have different opinions.","ja":"私たちは異なる意見を持っています。"}]', '["quite different", "very different", "completely different"]', FALSE, FALSE, NULL),
('difficult', 'adjective', 'hard to do or understand', '難しい', 'A2', 2, 600, 90, 'grade_3', 25.0, 2, 31.3, FALSE, '[{"en":"This question is difficult.","ja":"この問題は難しいです。"}]', '["very difficult", "quite difficult", "extremely difficult"]', FALSE, FALSE, NULL),

-- Grade Pre-2 level (CEFR A2-B1) - Medium words  
('environment', 'noun', 'surroundings or conditions', '環境', 'B1', 3, 1200, 75, 'grade_pre2', 45.0, 2, 51.9, TRUE, '[{"en":"We must protect the environment.","ja":"私たちは環境を保護しなければなりません。"}]', '["natural environment", "work environment", "protect the environment"]', FALSE, FALSE, NULL),
('society', 'noun', 'community of people', '社会', 'B1', 3, 1100, 78, 'grade_pre2', 42.0, 3, 52.0, TRUE, '[{"en":"We live in a modern society.","ja":"私たちは現代社会に住んでいます。"}]', '["modern society", "human society", "in society"]', FALSE, FALSE, NULL),
('opinion', 'noun', 'personal view or belief', '意見', 'B1', 3, 950, 82, 'grade_pre2', 38.0, 2, 48.5, TRUE, '[{"en":"In my opinion, it is true.","ja":"私の意見では、それは本当です。"}]', '["in my opinion", "personal opinion", "public opinion"]', FALSE, FALSE, NULL),
('experience', 'noun', 'knowledge gained through doing', '経験', 'B1', 3, 850, 85, 'grade_pre2', 40.0, 2, 49.8, TRUE, '[{"en":"I have some experience in teaching.","ja":"私は教える経験があります。"}]', '["work experience", "life experience", "personal experience"]', FALSE, FALSE, NULL),
('situation', 'noun', 'set of circumstances', '状況', 'B1', 3, 1050, 76, 'grade_pre2', 43.0, 2, 51.3, TRUE, '[{"en":"The situation is getting worse.","ja":"状況が悪化しています。"}]', '["difficult situation", "current situation", "in this situation"]', FALSE, FALSE, NULL),
('problem', 'noun', 'matter needing solution', '問題', 'A2', 2, 400, 95, 'grade_pre2', 25.0, 3, 35.3, FALSE, '[{"en":"We need to solve this problem.","ja":"この問題を解決する必要があります。"}]', '["serious problem", "solve a problem", "big problem"]', FALSE, FALSE, NULL),
('solution', 'noun', 'answer to a problem', '解決策', 'B1', 3, 1150, 74, 'grade_pre2', 44.0, 2, 50.3, TRUE, '[{"en":"We found a good solution.","ja":"良い解決策を見つけました。"}]', '["find a solution", "possible solution", "best solution"]', FALSE, FALSE, NULL),

-- Grade 2 level (CEFR B1-B2) - Challenging words
('comprehensive', 'adjective', 'including all or nearly all elements', '包括的な', 'B2', 4, 2500, 55, 'grade_2', 68.0, 2, 63.8, TRUE, '[{"en":"We need a comprehensive study.","ja":"包括的な研究が必要です。"}]', '["comprehensive study", "comprehensive review", "comprehensive analysis"]', FALSE, FALSE, NULL),
('significant', 'adjective', 'important or noticeable', '重要な、著しい', 'B2', 4, 1800, 62, 'grade_2', 65.0, 3, 62.0, TRUE, '[{"en":"There was a significant change.","ja":"著しい変化がありました。"}]', '["significant change", "significant impact", "significant difference"]', FALSE, FALSE, NULL),
('essential', 'adjective', 'absolutely necessary', '不可欠な', 'B2', 4, 1650, 65, 'grade_2', 62.0, 2, 60.3, TRUE, '[{"en":"Water is essential for life.","ja":"水は生命に不可欠です。"}]', '["essential for", "essential to", "absolutely essential"]', FALSE, FALSE, NULL),
('evidence', 'noun', 'proof or indication', '証拠', 'B2', 4, 1900, 60, 'grade_2', 66.0, 2, 62.5, TRUE, '[{"en":"There is no evidence of that.","ja":"その証拠はありません。"}]', '["clear evidence", "strong evidence", "provide evidence"]', FALSE, FALSE, NULL),
('establish', 'verb', 'set up or create', '確立する、設立する', 'B2', 4, 2100, 58, 'grade_2', 67.0, 3, 63.3, TRUE, '[{"en":"They established a new company.","ja":"彼らは新しい会社を設立しました。"}]', '["establish a company", "establish a relationship", "well established"]', FALSE, FALSE, NULL),
('approximately', 'adverb', 'roughly or about', '約、おおよそ', 'B2', 4, 1750, 63, 'grade_2', 64.0, 1, 61.0, TRUE, '[{"en":"It costs approximately 100 dollars.","ja":"それは約100ドルかかります。"}]', '["approximately equal", "approximately the same"]', FALSE, FALSE, NULL),
('analyze', 'verb', 'examine in detail', '分析する', 'B2', 4, 1850, 61, 'grade_2', 65.0, 2, 61.8, TRUE, '[{"en":"We need to analyze the data.","ja":"データを分析する必要があります。"}]', '["analyze data", "analyze the situation", "carefully analyze"]', FALSE, FALSE, NULL),
('demonstrate', 'verb', 'clearly show', '示す、証明する', 'B2', 4, 1950, 59, 'grade_2', 66.0, 3, 62.3, TRUE, '[{"en":"The results demonstrate that...","ja":"結果は...を示しています。"}]', '["demonstrate a skill", "clearly demonstrate", "demonstrate the importance"]', FALSE, FALSE, NULL),
('contribute', 'verb', 'give or add to', '貢献する', 'B2', 4, 1700, 64, 'grade_2', 63.0, 2, 60.5, TRUE, '[{"en":"Everyone can contribute to society.","ja":"誰もが社会に貢献できます。"}]', '["contribute to", "contribute money", "contribute significantly"]', FALSE, FALSE, NULL),
('agricultural', 'adjective', 'relating to farming', '農業の', 'B2', 4, 2200, 57, 'grade_2', 68.0, 1, 62.5, TRUE, '[{"en":"Agricultural products are important.","ja":"農産物は重要です。"}]', '["agricultural products", "agricultural land", "agricultural industry"]', FALSE, FALSE, NULL),

-- Grade Pre-1 level (CEFR B2-C1) - Advanced words
('ambitious', 'adjective', 'having strong desire for success', '野心的な', 'B2', 4, 2800, 48, 'grade_pre1', 72.0, 2, 66.5, TRUE, '[{"en":"He has ambitious plans.","ja":"彼は野心的な計画を持っています。"}]', '["ambitious plan", "ambitious goal", "very ambitious"]', FALSE, FALSE, NULL),
('deliberate', 'adjective', 'done intentionally', '意図的な', 'C1', 5, 3500, 35, 'grade_pre1', 78.0, 3, 72.0, TRUE, '[{"en":"It was a deliberate action.","ja":"それは意図的な行動でした。"}]', '["deliberate attempt", "deliberate choice", "deliberate decision"]', FALSE, FALSE, NULL),
('inevitable', 'adjective', 'certain to happen', '避けられない', 'C1', 5, 3200, 40, 'grade_pre1', 76.0, 1, 70.5, TRUE, '[{"en":"Change is inevitable.","ja":"変化は避けられません。"}]', '["inevitable result", "inevitable conclusion", "seem inevitable"]', FALSE, FALSE, NULL),
('substantial', 'adjective', 'large in amount', '相当な、かなりの', 'C1', 5, 3300, 38, 'grade_pre1', 77.0, 2, 71.3, TRUE, '[{"en":"There was a substantial increase.","ja":"相当な増加がありました。"}]', '["substantial amount", "substantial increase", "substantial evidence"]', FALSE, FALSE, NULL),
('legitimate', 'adjective', 'conforming to law or rules', '合法的な、正当な', 'C1', 5, 3600, 32, 'grade_pre1', 79.0, 2, 72.8, TRUE, '[{"en":"That is a legitimate question.","ja":"それは正当な質問です。"}]', '["legitimate business", "legitimate concern", "legitimate reason"]', FALSE, FALSE, NULL),
('profound', 'adjective', 'very great or intense', '深い、深遠な', 'C1', 5, 3400, 36, 'grade_pre1', 78.0, 2, 71.5, TRUE, '[{"en":"It had a profound effect.","ja":"それは深い影響を与えました。"}]', '["profound effect", "profound impact", "profound influence"]', FALSE, FALSE, NULL),
('versatile', 'adjective', 'able to adapt or be used for many purposes', '多才な、多目的の', 'C1', 5, 3100, 41, 'grade_pre1', 75.0, 2, 70.0, TRUE, '[{"en":"She is a versatile artist.","ja":"彼女は多才な芸術家です。"}]', '["versatile artist", "versatile player", "very versatile"]', FALSE, FALSE, NULL),
('meticulous', 'adjective', 'very careful and precise', '細心の、綿密な', 'C1', 5, 3800, 28, 'grade_pre1', 80.0, 1, 73.5, TRUE, '[{"en":"He did meticulous research.","ja":"彼は綿密な研究を行いました。"}]', '["meticulous attention", "meticulous care", "meticulous detail"]', FALSE, FALSE, NULL),
('unprecedented', 'adjective', 'never done or known before', '前例のない', 'C1', 5, 3700, 30, 'grade_pre1', 79.0, 1, 72.3, TRUE, '[{"en":"This is unprecedented in history.","ja":"これは歴史上前例がありません。"}]', '["unprecedented event", "unprecedented scale", "unprecedented level"]', FALSE, FALSE, NULL),
('coherent', 'adjective', 'logical and consistent', '首尾一貫した', 'C1', 5, 3250, 39, 'grade_pre1', 77.0, 2, 71.0, TRUE, '[{"en":"Please give a coherent explanation.","ja":"首尾一貫した説明をしてください。"}]', '["coherent argument", "coherent explanation", "coherent policy"]', FALSE, FALSE, NULL),

-- False cognates (Japanese learners need special attention)
('mansion', 'noun', 'large impressive house', '大邸宅（※マンションではない！）', 'B1', 3, 1500, 70, 'grade_2', 85.0, 1, 62.3, TRUE, '[{"en":"They live in a large mansion.","ja":"彼らは大きな邸宅に住んでいます。"}]', '["large mansion", "old mansion", "family mansion"]', FALSE, TRUE, 'マンション(apartment)ではなく、大邸宅の意味。日本語の「マンション」はapartmentまたはcondominium。'),
('claim', 'verb', 'assert or demand', '主張する、要求する', 'B2', 4, 1400, 68, 'grade_2', 70.0, 5, 61.5, TRUE, '[{"en":"He claims that he is innocent.","ja":"彼は自分が無実だと主張しています。"}]', '["claim responsibility", "claim damages", "false claim"]', FALSE, TRUE, '「クレーム」(complaint)と混同しやすい。complainが苦情、claimは主張・要求。'),
('smart', 'adjective', 'intelligent or clever', '賢い、頭が良い', 'B1', 3, 800, 80, 'grade_pre2', 60.0, 4, 54.0, TRUE, '[{"en":"She is a very smart student.","ja":"彼女はとても賢い学生です。"}]', '["smart student", "look smart", "smart choice"]', FALSE, TRUE, '「スマート」(slim/stylish)と混同しやすい。英語では主に「賢い」の意味。「細身」はslimやslender。'),

-- Katakana-origin words (easier for Japanese learners)
('energy', 'noun', 'power or vigor', 'エネルギー', 'B1', 3, 900, 83, 'grade_pre2', 20.0, 2, 43.5, TRUE, '[{"en":"Solar energy is clean.","ja":"太陽エネルギーはクリーンです。"}]', '["solar energy", "renewable energy", "save energy"]', TRUE, FALSE, NULL),
('technology', 'noun', 'application of scientific knowledge', '技術、テクノロジー', 'B1', 3, 1000, 81, 'grade_pre2', 22.0, 1, 45.5, TRUE, '[{"en":"Technology is changing rapidly.","ja":"技術は急速に変化しています。"}]', '["new technology", "information technology", "advanced technology"]', TRUE, FALSE, NULL),
('computer', 'noun', 'electronic device', 'コンピューター', 'A2', 2, 600, 92, 'grade_3', 15.0, 1, 32.3, FALSE, '[{"en":"I use a computer every day.","ja":"私は毎日コンピューターを使います。"}]', '["personal computer", "use a computer", "computer system"]', TRUE, FALSE, NULL),
('internet', 'noun', 'global computer network', 'インターネット', 'B1', 3, 850, 85, 'grade_pre2', 18.0, 1, 42.0, TRUE, '[{"en":"I found it on the internet.","ja":"インターネットでそれを見つけました。"}]', '["on the internet", "internet access", "internet connection"]', TRUE, FALSE, NULL),
('communication', 'noun', 'exchange of information', 'コミュニケーション', 'B1', 3, 1100, 79, 'grade_pre2', 21.0, 2, 45.0, TRUE, '[{"en":"Good communication is important.","ja":"良いコミュニケーションは重要です。"}]', '["good communication", "communication skills", "means of communication"]', TRUE, FALSE, NULL),

-- Additional common academic/test words
('benefit', 'noun', 'advantage or profit', '利益、恩恵', 'B1', 3, 1250, 74, 'grade_pre2', 46.0, 3, 52.3, TRUE, '[{"en":"Exercise has many benefits.","ja":"運動には多くの利益があります。"}]', '["health benefits", "great benefit", "benefit from"]', FALSE, FALSE, NULL),
('achieve', 'verb', 'accomplish or succeed in', '達成する', 'B1', 3, 1200, 76, 'grade_pre2', 44.0, 2, 51.5, TRUE, '[{"en":"We achieved our goal.","ja":"私たちは目標を達成しました。"}]', '["achieve a goal", "achieve success", "achieve the objective"]', FALSE, FALSE, NULL),
('consider', 'verb', 'think carefully about', '考慮する', 'B1', 3, 950, 81, 'grade_pre2', 40.0, 3, 49.0, TRUE, '[{"en":"Please consider my proposal.","ja":"私の提案を考慮してください。"}]', '["consider carefully", "consider the possibility", "consider doing"]', FALSE, FALSE, NULL),
('decrease', 'verb', 'become or make smaller', '減少する', 'B1', 3, 1150, 77, 'grade_pre2', 43.0, 2, 50.5, TRUE, '[{"en":"Sales decreased by 10%.","ja":"売上が10%減少しました。"}]', '["decrease rapidly", "gradual decrease", "sharp decrease"]', FALSE, FALSE, NULL),
('increase', 'verb', 'become or make greater', '増加する', 'B1', 3, 1050, 79, 'grade_pre2', 41.0, 2, 49.5, TRUE, '[{"en":"Prices increased significantly.","ja":"価格が大幅に増加しました。"}]', '["increase rapidly", "gradual increase", "sharp increase"]', FALSE, FALSE, NULL),
('provide', 'verb', 'supply or make available', '提供する', 'B1', 3, 1000, 80, 'grade_pre2', 42.0, 2, 49.0, TRUE, '[{"en":"They provide free WiFi.","ja":"彼らは無料WiFiを提供しています。"}]', '["provide information", "provide service", "provide support"]', FALSE, FALSE, NULL),
('require', 'verb', 'need for a purpose', '必要とする', 'B1', 3, 1100, 78, 'grade_pre2', 44.0, 2, 50.5, TRUE, '[{"en":"This job requires experience.","ja":"この仕事は経験を必要とします。"}]', '["require attention", "require approval", "require effort"]', FALSE, FALSE, NULL),
('approach', 'noun', 'way of dealing with something', 'アプローチ、方法', 'B2', 4, 1600, 66, 'grade_2', 62.0, 4, 60.5, TRUE, '[{"en":"We need a new approach.","ja":"新しいアプローチが必要です。"}]', '["new approach", "different approach", "practical approach"]', FALSE, FALSE, NULL),
('maintain', 'verb', 'keep in existence or continue', '維持する', 'B2', 4, 1700, 64, 'grade_2', 63.0, 3, 61.0, TRUE, '[{"en":"We must maintain quality.","ja":"品質を維持しなければなりません。"}]', '["maintain quality", "maintain balance", "maintain contact"]', FALSE, FALSE, NULL),
('develop', 'verb', 'grow or cause to grow', '発展させる、開発する', 'B1', 3, 1150, 77, 'grade_pre2', 45.0, 4, 51.5, TRUE, '[{"en":"They developed a new product.","ja":"彼らは新製品を開発しました。"}]', '["develop skills", "develop a plan", "fully developed"]', FALSE, FALSE, NULL),
('obtain', 'verb', 'get or acquire', '得る、獲得する', 'B2', 4, 1800, 62, 'grade_2', 65.0, 2, 61.8, TRUE, '[{"en":"How did you obtain this information?","ja":"どうやってこの情報を得ましたか？"}]', '["obtain information", "obtain permission", "obtain data"]', FALSE, FALSE, NULL),
('illustrate', 'verb', 'explain or make clear', '説明する、例証する', 'B2', 4, 2000, 59, 'grade_2', 66.0, 3, 62.3, TRUE, '[{"en":"Let me illustrate my point.","ja":"私の要点を説明させてください。"}]', '["illustrate a point", "clearly illustrate", "illustrate with examples"]', FALSE, FALSE, NULL),
('predict', 'verb', 'say what will happen', '予測する', 'B2', 4, 1750, 63, 'grade_2', 64.0, 2, 61.0, TRUE, '[{"en":"It is hard to predict the future.","ja":"未来を予測するのは難しいです。"}]', '["predict the future", "hard to predict", "accurately predict"]', FALSE, FALSE, NULL);

-- Update statistics
SELECT '✅ Inserted 50 vocabulary words for demo';
SELECT 'Words by CEFR level:';
SELECT cefr_level, COUNT(*) as count FROM vocabulary_master GROUP BY cefr_level ORDER BY cefr_level;
SELECT 'Words by Eiken grade:';
SELECT eiken_grade, COUNT(*) as count FROM vocabulary_master GROUP BY eiken_grade ORDER BY eiken_grade;
SELECT 'Total words in database:';
SELECT COUNT(*) as total FROM vocabulary_master;
