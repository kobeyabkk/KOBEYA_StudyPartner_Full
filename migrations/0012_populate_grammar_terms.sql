-- ========================================
-- 文法用語の初期データ投入
-- ========================================

-- 中1レベル
INSERT OR IGNORE INTO grammar_terms (term_code, term_name_ja, grade_level, eiken_grade, pattern_en, pattern_ja, explanation_template, example_sentences) VALUES
('be_verb', 'be動詞', '中1', '5', 'am / is / are', '〜です / 〜にいる', '【be動詞】主語によって am / is / are を使い分ける', '[{"en":"I am a student.","ja":"私は生徒です。"}]'),
('present_simple', '一般動詞の現在形', '中1', '5', '動詞の原形 / 三単現s', '〜する', '【一般動詞】動作や状態を表す', '[{"en":"I play tennis.","ja":"私はテニスをします。"}]'),
('third_person_singular', '三人称単数', '中1', '5', '動詞 + s/es', '〜する（三単現）', '【三人称単数】he/she/it などの主語で動詞に s/es をつける', '[{"en":"He plays soccer.","ja":"彼はサッカーをします。"}]'),
('present_progressive', '現在進行形', '中1', '5', 'be + 動詞ing', '〜している（今）', '【現在進行形】「今〜している」と進行中の動作を表す', '[{"en":"I am studying now.","ja":"今勉強しています。"}]'),
('imperative', '命令文', '中1', '5', '動詞の原形', '〜しなさい', '【命令文】動詞の原形で始める。Don''t で禁止。', '[{"en":"Open your book.","ja":"本を開きなさい。"}]'),
('can_ability', '助動詞 can', '中1', '5', 'can + 動詞の原形', '〜できる', '【助動詞 can】能力や可能性を表す', '[{"en":"I can swim.","ja":"泳げます。"}]');

-- 中2レベル
INSERT OR IGNORE INTO grammar_terms (term_code, term_name_ja, grade_level, eiken_grade, pattern_en, pattern_ja, explanation_template, example_sentences) VALUES
('past_simple_be', '過去形（be動詞）', '中2', '4', 'was / were', '〜だった / 〜にいた', '【過去形（be動詞）】was / were を使う', '[{"en":"I was tired yesterday.","ja":"昨日疲れていました。"}]'),
('past_simple', '過去形（一般動詞）', '中2', '4', '動詞の過去形', '〜した', '【過去形】過去の動作や状態を表す', '[{"en":"I played tennis.","ja":"テニスをしました。"}]'),
('past_progressive', '過去進行形', '中2', '4', 'was/were + 動詞ing', '〜していた', '【過去進行形】過去のある時点で進行中だった動作', '[{"en":"I was studying at 8.","ja":"8時に勉強していました。"}]'),
('future_will', '未来表現（will）', '中2', '4', 'will + 動詞の原形', '〜するだろう', '【未来表現】will で未来の予定や意志を表す', '[{"en":"I will study hard.","ja":"一生懸命勉強します。"}]'),
('future_be_going_to', '未来表現（be going to）', '中2', '4', 'be going to + 動詞', '〜する予定だ', '【be going to】予定や意図を表す', '[{"en":"I am going to visit Tokyo.","ja":"東京を訪れる予定です。"}]'),
('must', '助動詞 must', '中2', '4', 'must + 動詞の原形', '〜しなければならない', '【must】義務や必要性を表す', '[{"en":"You must do it.","ja":"それをしなければなりません。"}]'),
('have_to', '助動詞 have to', '中2', '4', 'have to + 動詞', '〜しなければならない', '【have to】must と同じく義務', '[{"en":"I have to go.","ja":"行かなければなりません。"}]'),
('comparative', '比較級', '中2', '4', '形容詞 + er / more + 形容詞', 'より〜', '【比較級】2つを比べる', '[{"en":"He is taller than me.","ja":"彼は私より背が高い。"}]'),
('superlative', '最上級', '中2', '4', 'the + 形容詞 + est / the most + 形容詞', '最も〜', '【最上級】3つ以上で一番', '[{"en":"He is the tallest in our class.","ja":"彼はクラスで一番背が高い。"}]'),
('infinitive_noun', '不定詞（名詞的用法）', '中2', '4', 'to + 動詞', '〜すること', '【不定詞（名詞的用法）】「〜すること」と名詞の働き', '[{"en":"I like to read books.","ja":"本を読むことが好きです。"}]'),
('infinitive_adj', '不定詞（形容詞的用法）', '中2', '4', 'to + 動詞', '〜するための', '【不定詞（形容詞的用法）】名詞を修飾', '[{"en":"I want something to drink.","ja":"何か飲むものが欲しい。"}]'),
('infinitive_adv', '不定詞（副詞的用法）', '中2', '4', 'to + 動詞', '〜するために', '【不定詞（副詞的用法）】目的や原因を表す', '[{"en":"I went to the store to buy milk.","ja":"牛乳を買うために店に行った。"}]'),
('gerund', '動名詞', '中2', '4', '動詞ing', '〜すること', '【動名詞】動詞に ing をつけて名詞の働き', '[{"en":"I enjoy playing soccer.","ja":"サッカーをすることを楽しんでいます。"}]'),
('conjunction', '接続詞', '中2', '4', 'because / when / if', '〜なので / 〜の時 / もし〜なら', '【接続詞】文と文をつなぐ', '[{"en":"I stayed home because it rained.","ja":"雨が降ったので家にいました。"}]'),
('there_is', 'There is / are', '中2', '4', 'There is/are + 名詞', '〜がある / いる', '【There is/are】存在を表す', '[{"en":"There is a book on the desk.","ja":"机の上に本があります。"}]');

-- 中3レベル
INSERT OR IGNORE INTO grammar_terms (term_code, term_name_ja, grade_level, eiken_grade, pattern_en, pattern_ja, explanation_template, example_sentences) VALUES
('passive_voice', '受動態（受け身）', '中3', '3', 'be + 過去分詞', '〜される', '【受動態】「〜される」と動作を受ける側を主語にする', '[{"en":"This book was written by him.","ja":"この本は彼によって書かれました。"}]'),
('present_perfect_cont', '現在完了形（継続）', '中3', '3', 'have + 過去分詞', 'ずっと〜している', '【現在完了（継続）】過去から今まで続いている', '[{"en":"I have lived here for 10 years.","ja":"ここに10年住んでいます。"}]'),
('present_perfect_exp', '現在完了形（経験）', '中3', '3', 'have + 過去分詞', '〜したことがある', '【現在完了（経験）】〜したことがある、という経験', '[{"en":"I have been to Tokyo.","ja":"東京に行ったことがあります。"}]'),
('present_perfect_result', '現在完了形（完了・結果）', '中3', '3', 'have + 過去分詞', '〜したところだ', '【現在完了（完了）】「〜したところだ」と完了や結果', '[{"en":"I have just finished homework.","ja":"宿題をちょうど終えたところです。"}]'),
('participle_adj', '分詞の形容詞的用法', '中3', '3', '現在分詞 / 過去分詞 + 名詞', '〜している / 〜された', '【分詞の形容詞的用法】名詞を修飾する', '[{"en":"a sleeping baby","ja":"眠っている赤ちゃん"}]'),
('relative_pronoun_subj', '関係代名詞（主格）', '中3', '3', 'who / which / that', '〜する（人・もの）', '【関係代名詞（主格）】主語の働きをする', '[{"en":"The boy who is tall is Tom.","ja":"背が高い少年はトムです。"}]'),
('relative_pronoun_obj', '関係代名詞（目的格）', '中3', '3', 'which / that / 省略可', '〜を（するもの）', '【関係代名詞（目的格）】目的語の働き。省略可能。', '[{"en":"The book (which) I read was good.","ja":"私が読んだ本は良かった。"}]'),
('as_as', '原級比較', '中3', '3', 'as + 形容詞 + as', '〜と同じくらい', '【原級比較】同じ程度を表す', '[{"en":"He is as tall as I am.","ja":"彼は私と同じくらい背が高い。"}]');

-- 高校レベル
INSERT OR IGNORE INTO grammar_terms (term_code, term_name_ja, grade_level, eiken_grade, pattern_en, pattern_ja, explanation_template, example_sentences) VALUES
('subjunctive', '仮定法', '高校', '2', 'If + 過去形, would + 動詞', 'もし〜なら', '【仮定法】現実に反する仮定', '[{"en":"If I were you, I would go.","ja":"もし私があなたなら行きます。"}]'),
('svoc', 'SVOC構文（第5文型）', '高校', 'pre2', '動詞 + O + C', 'OをCと〜する', '【SVOC構文】find / make / keep + O + C の形', '[{"en":"I found the movie interesting.","ja":"その映画を面白いと思った。"}]'),
('participial_construction', '分詞構文', '高校', '2', '分詞, S V', '〜しながら / 〜して', '【分詞構文】接続詞を省略した表現', '[{"en":"Walking along the street, I met him.","ja":"通りを歩いていたら彼に会った。"}]'),
('relative_pronoun_poss', '関係代名詞（所有格）', '高校', 'pre1', 'whose', '〜の（人・もの）', '【関係代名詞 whose】所有を表す', '[{"en":"The girl whose bag is red is Mary.","ja":"かばんが赤い女の子はメアリーです。"}]'),
('relative_adverb', '関係副詞', '高校', 'pre1', 'when / where / why', '〜する時 / 場所 / 理由', '【関係副詞】時・場所・理由を表す', '[{"en":"This is the place where I was born.","ja":"ここが私が生まれた場所です。"}]'),
('formal_subject', '形式主語', '高校', 'pre1', 'It is 〜 to ...', '〜することは...だ', '【形式主語 it】真の主語は to 以下', '[{"en":"It is important to study.","ja":"勉強することは重要です。"}]');
