-- ========================================
-- 追加文法用語データ（30+ → 50+）
-- ========================================

-- 小学校レベル
INSERT OR IGNORE INTO grammar_terms (term_code, term_name_ja, grade_level, eiken_grade, pattern_en, pattern_ja, explanation_template, example_sentences) VALUES
('simple_present', '現在形', '小学校', '5', '動詞の原形', '〜する（普段）', '【現在形】普段の習慣や事実を表す', '[{"en":"I play tennis every day.","ja":"毎日テニスをします。"}]'),
('simple_past', '過去形', '小学校', '5', '動詞の過去形', '〜した', '【過去形】過去の出来事を表す', '[{"en":"I played tennis yesterday.","ja":"昨日テニスをしました。"}]'),
('plural_nouns', '名詞の複数形', '小学校', '5', '名詞 + s/es', '〜たち / 複数の〜', '【複数形】2つ以上のものを表す時に s/es をつける', '[{"en":"I have two cats.","ja":"2匹の猫を飼っています。"}]'),
('question_do', 'Do疑問文', '小学校', '5', 'Do/Does + 主語 + 動詞?', '〜しますか？', '【Do疑問文】一般動詞の疑問文は Do/Does を使う', '[{"en":"Do you like apples?","ja":"りんごは好きですか？"}]');

-- 中1レベル追加
INSERT OR IGNORE INTO grammar_terms (term_code, term_name_ja, grade_level, eiken_grade, pattern_en, pattern_ja, explanation_template, example_sentences) VALUES
('negative_dont', '否定文（don''t）', '中1', '5', 'don''t / doesn''t + 動詞', '〜しない', '【否定文】一般動詞の否定は don''t/doesn''t を使う', '[{"en":"I don''t like carrots.","ja":"にんじんは好きではありません。"}]'),
('wh_questions', '疑問詞疑問文', '中1', '5', 'What/When/Where/Who/Why/How', '何/いつ/どこ/誰/なぜ/どう', '【疑問詞】具体的な情報を聞く疑問文', '[{"en":"What do you like?","ja":"何が好きですか？"}]'),
('possessive', '所有格', '中1', '5', 'my/your/his/her', '私の/あなたの/彼の/彼女の', '【所有格】「〜の」という意味で名詞の前に置く', '[{"en":"This is my book.","ja":"これは私の本です。"}]'),
('object_pronoun', '目的格', '中1', '5', 'me/you/him/her', '私を/あなたを/彼を/彼女を', '【目的格】動詞や前置詞の後ろに置く', '[{"en":"She likes me.","ja":"彼女は私が好きです。"}]'),
('prepositions', '前置詞', '中1', '5', 'at/in/on/to/from', '〜で/〜に/〜へ/〜から', '【前置詞】場所や時を表す', '[{"en":"I live in Tokyo.","ja":"東京に住んでいます。"}]');

-- 中2レベル追加
INSERT OR IGNORE INTO grammar_terms (term_code, term_name_ja, grade_level, eiken_grade, pattern_en, pattern_ja, explanation_template, example_sentences) VALUES
('used_to', 'used to', '中2', '4', 'used to + 動詞', '以前は〜した', '【used to】過去の習慣や状態を表す（今はしていない）', '[{"en":"I used to play soccer.","ja":"以前はサッカーをしていました。"}]'),
('too_to', 'too ... to', '中2', '4', 'too + 形容詞 + to + 動詞', '〜すぎて...できない', '【too ... to】「〜すぎて...できない」という意味', '[{"en":"It''s too hot to play outside.","ja":"暑すぎて外で遊べません。"}]'),
('enough_to', 'enough to', '中2', '4', '形容詞 + enough to + 動詞', '〜するのに十分...だ', '【enough to】「〜するのに十分...だ」という意味', '[{"en":"He is old enough to drive.","ja":"彼は運転するのに十分な年齢です。"}]'),
('look_like', 'look like', '中2', '4', 'look like + 名詞', '〜のように見える', '【look like】外見や様子を表す', '[{"en":"She looks like her mother.","ja":"彼女はお母さんに似ています。"}]'),
('sound_like', 'sound like', '中2', '4', 'sound like + 名詞', '〜のように聞こえる', '【sound like】音や様子を表す', '[{"en":"That sounds like a good idea.","ja":"それは良い考えのように聞こえます。"}]'),
('both_and', 'both A and B', '中2', '4', 'both A and B', 'AもBも両方', '【both ... and】「AもBも両方」という意味', '[{"en":"I like both cats and dogs.","ja":"猫も犬も両方好きです。"}]'),
('either_or', 'either A or B', '中2', '4', 'either A or B', 'AかBのどちらか', '【either ... or】「AかBのどちらか」という意味', '[{"en":"You can have either tea or coffee.","ja":"紅茶かコーヒーのどちらかを飲めます。"}]'),
('neither_nor', 'neither A nor B', '中2', '4', 'neither A nor B', 'AもBもどちらも〜ない', '【neither ... nor】「AもBもどちらも〜ない」という意味', '[{"en":"I like neither cats nor dogs.","ja":"猫も犬もどちらも好きではありません。"}]');

-- 中3レベル追加
INSERT OR IGNORE INTO grammar_terms (term_code, term_name_ja, grade_level, eiken_grade, pattern_en, pattern_ja, explanation_template, example_sentences) VALUES
('present_perfect_yet', '現在完了形（yet/already）', '中3', '3', 'have + 過去分詞 + yet/already', 'もう〜 / まだ〜ない', '【現在完了 yet/already】完了を強調する副詞', '[{"en":"I have already finished.","ja":"もう終わりました。"}]'),
('present_perfect_just', '現在完了形（just）', '中3', '3', 'have just + 過去分詞', 'ちょうど〜したところ', '【現在完了 just】「ちょうど〜したところ」を表す', '[{"en":"I have just arrived.","ja":"ちょうど着いたところです。"}]'),
('present_perfect_ever', '現在完了形（ever/never）', '中3', '3', 'have ever/never + 過去分詞', '今までに〜 / 一度も〜ない', '【現在完了 ever/never】経験の有無を表す', '[{"en":"Have you ever been to Paris?","ja":"パリに行ったことがありますか？"}]'),
('past_perfect', '過去完了形', '中3', '3', 'had + 過去分詞', '〜していた（過去のある時点まで）', '【過去完了】過去のある時点までの継続・完了・経験', '[{"en":"I had finished homework before dinner.","ja":"夕食前に宿題を終えていました。"}]'),
('modal_should', '助動詞 should', '中3', '3', 'should + 動詞', '〜すべきだ', '【should】義務や助言を表す（must より弱い）', '[{"en":"You should study harder.","ja":"もっと勉強すべきです。"}]'),
('modal_may', '助動詞 may', '中3', '3', 'may + 動詞', '〜かもしれない / 〜してもよい', '【may】推量や許可を表す', '[{"en":"It may rain tomorrow.","ja":"明日雨が降るかもしれません。"}]'),
('it_seems_that', 'It seems that', '中3', '3', 'It seems that + 文', '〜のようだ', '【It seems that】「〜のようだ」と推量を表す', '[{"en":"It seems that he is sick.","ja":"彼は病気のようです。"}]'),
('it_is_said_that', 'It is said that', '中3', '3', 'It is said that + 文', '〜だと言われている', '【It is said that】「〜だと言われている」と伝聞を表す', '[{"en":"It is said that he is very rich.","ja":"彼はとてもお金持ちだと言われています。"}]');

-- 高校レベル追加
INSERT OR IGNORE INTO grammar_terms (term_code, term_name_ja, grade_level, eiken_grade, pattern_en, pattern_ja, explanation_template, example_sentences) VALUES
('subjunctive_past', '仮定法過去', '高校', '2', 'If + 過去形, would/could + 動詞', 'もし〜なら（現在の仮定）', '【仮定法過去】現在の事実に反する仮定', '[{"en":"If I had time, I would help you.","ja":"もし時間があれば手伝うのに。"}]'),
('subjunctive_past_perfect', '仮定法過去完了', '高校', '2', 'If + had 過去分詞, would have + 過去分詞', 'もし〜だったら（過去の仮定）', '【仮定法過去完了】過去の事実に反する仮定', '[{"en":"If I had studied, I would have passed.","ja":"もし勉強していたら合格していたのに。"}]'),
('wish_past', 'I wish + 過去形', '高校', '2', 'I wish + 過去形', '〜だったらいいのに', '【wish + 過去形】現在の願望（実現不可能）', '[{"en":"I wish I were rich.","ja":"お金持ちだったらいいのに。"}]'),
('wish_past_perfect', 'I wish + had 過去分詞', '高校', '2', 'I wish + had 過去分詞', '〜だったらよかったのに', '【wish + 過去完了】過去の願望（実現しなかった）', '[{"en":"I wish I had studied harder.","ja":"もっと勉強していたらよかったのに。"}]'),
('as_if', 'as if / as though', '高校', '2', 'as if + 過去形', 'まるで〜のように', '【as if】「まるで〜のように」と仮定を表す', '[{"en":"He talks as if he knew everything.","ja":"彼はまるで全て知っているかのように話す。"}]'),
('so_that', 'so that', '高校', 'pre1', 'so that + can/will', '〜するために', '【so that】目的を表す（不定詞より改まった表現）', '[{"en":"I study hard so that I can pass.","ja":"合格するために一生懸命勉強します。"}]'),
('in_order_that', 'in order that', '高校', 'pre1', 'in order that + may/can', '〜するために', '【in order that】目的を表す（very formal）', '[{"en":"I came early in order that I might help.","ja":"手伝うために早く来ました。"}]'),
('not_only_but_also', 'not only A but also B', '高校', 'pre1', 'not only A but also B', 'AだけでなくBも', '【not only ... but also】「AだけでなくBも」強調表現', '[{"en":"He is not only smart but also kind.","ja":"彼は賢いだけでなく優しいです。"}]'),
('the_more_the_more', 'the 比較級, the 比較級', '高校', 'pre1', 'the + 比較級, the + 比較級', '〜すればするほど...', '【the 比較級, the 比較級】「〜すればするほど...」比例関係', '[{"en":"The more you study, the smarter you become.","ja":"勉強すればするほど賢くなります。"}]'),
('倒置_never', '否定の倒置（Never）', '高校', '1', 'Never have I ...', '一度も〜ない（強調）', '【否定の倒置】Never を文頭に置いて強調', '[{"en":"Never have I seen such a thing.","ja":"そんなものは見たことがありません。"}]'),
('倒置_not_until', '倒置（Not until）', '高校', '1', 'Not until ... did', '〜して初めて', '【Not until 倒置】「〜して初めて」を強調', '[{"en":"Not until yesterday did I know it.","ja":"昨日になって初めてそれを知りました。"}]'),
('強調構文_it_that', '強調構文（It is ... that）', '高校', 'pre1', 'It is/was ... that', '〜なのは...だ', '【強調構文】特定の部分を強調する', '[{"en":"It was yesterday that I met him.","ja":"彼に会ったのは昨日です。"}]');
