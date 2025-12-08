-- Migration: Complete School Grammar Terms (70 items from official curriculum)
-- Purpose: Replace existing grammar terms with complete Japanese school curriculum data
-- Date: 2025-12-08

-- Clear existing data to avoid duplicates
DELETE FROM grammar_terms;

-- Insert complete 70 grammar terms from Japanese school curriculum
-- Schema: term_code, term_name_ja, grade_level, eiken_grade, pattern_en, pattern_ja, explanation_template, example_sentences (JSON)

-- 小学校 (9 items)
INSERT INTO grammar_terms (term_code, term_name_ja, grade_level, eiken_grade, pattern_en, pattern_ja, explanation_template, example_sentences) VALUES
('ELEM-001', 'アルファベット', '小学校', '5', 'A-Z, a-z', 'アルファベット', '大文字・小文字の読み書きです。', '[{"en":"The alphabet has 26 letters.","ja":"アルファベットは26文字あります。"}]'),
('ELEM-002', 'あいさつ・簡単な表現', '小学校', '5', 'How are you? / My name is ...', '基本的なあいさつ', '日常的なあいさつや自己紹介の表現です。', '[{"en":"How are you? My name is Tom.","ja":"お元気ですか？私の名前はトムです。"}]'),
('ELEM-003', '疑問文・答え方の基本', '小学校', '5', 'Do you like~? Yes, I do.', '基本的な質問と答え', '簡単な疑問文とその答え方です。', '[{"en":"Do you like apples? Yes, I do.","ja":"りんごは好きですか？はい、好きです。"}]'),
('ELEM-004', '命令文', '小学校', '5', 'Stand up. / Open the book.', '命令文', '動作を指示する文です。', '[{"en":"Stand up. Open your book.","ja":"立ってください。本を開けてください。"}]'),
('ELEM-005', '現在形（be動詞/一般動詞）', '小学校', '5', 'I am~ / You are~ / I play~', '現在形', '現在の状態や習慣を表します。', '[{"en":"I am a student. I play soccer.","ja":"私は学生です。私はサッカーをします。"}]'),
('ELEM-006', '三人称単数の感覚', '小学校', '5', 'He plays soccer.', '三人称単数現在形', '主語が三人称単数のとき動詞に-sをつけます。', '[{"en":"He plays soccer every day.","ja":"彼は毎日サッカーをします。"}]'),
('ELEM-007', '助動詞 can', '小学校', '5', 'I can swim.', '助動詞can（〜できる）', '能力や可能性を表します。', '[{"en":"I can swim fast.","ja":"私は速く泳ぐことができます。"}]'),
('ELEM-008', '現在進行形', '小学校', '5', 'I am playing soccer.', '現在進行形（be + 動詞ing）', '今まさに行っている動作を表します。', '[{"en":"I am playing soccer now.","ja":"私は今サッカーをしています。"}]'),
('ELEM-009', '名詞の複数形', '小学校', '5', 'cats / boxes', '名詞の複数形', '複数のものを表すときに使います。', '[{"en":"I have two cats and three boxes.","ja":"私は2匹の猫と3つの箱を持っています。"}]');

-- 中1 (11 items)
INSERT INTO grammar_terms (term_code, term_name_ja, grade_level, eiken_grade, pattern_en, pattern_ja, explanation_template, example_sentences) VALUES
('JH1-001', 'be動詞', '中1', '5', 'am / is / are', 'be動詞', '主語によってam/is/areを使い分けます。', '[{"en":"I am happy. He is tall. They are students.","ja":"私は幸せです。彼は背が高いです。彼らは学生です。"}]'),
('JH1-002', '一般動詞の現在形', '中1', '5', 'I play / He plays', '一般動詞の現在形', 'be動詞以外の動詞です。三人称単数では-sをつけます。', '[{"en":"I play tennis. She plays piano.","ja":"私はテニスをします。彼女はピアノを弾きます。"}]'),
('JH1-003', '三人称単数', '中1', '5', 's, es の付け方', '三人称単数現在形', '主語がhe/she/itのとき動詞に-s/-esをつけます。', '[{"en":"He likes music. She watches TV.","ja":"彼は音楽が好きです。彼女はテレビを見ます。"}]'),
('JH1-004', '疑問文・否定文の作り方', '中1', '5', 'Do you~? / I don''t~', '疑問文・否定文', 'do/doesを使って疑問文・否定文を作ります。', '[{"en":"Do you play soccer? I don''t like cats.","ja":"サッカーをしますか？私は猫が好きではありません。"}]'),
('JH1-005', '疑問詞疑問文', '中1', '5', 'What / When / Where / Who / Why / How', '疑問詞', '具体的な情報をたずねる疑問文です。', '[{"en":"What do you like? When do you study?","ja":"何が好きですか？いつ勉強しますか？"}]'),
('JH1-006', '現在進行形', '中1', '5', 'be + 動詞ing', '現在進行形', '今まさに行っている動作を表します。', '[{"en":"I am studying English now.","ja":"私は今英語を勉強しています。"}]'),
('JH1-007', '命令文', '中1', '5', 'Please~ / Don''t~', '命令文', '相手に何かを指示したり禁止したりする文です。', '[{"en":"Please sit down. Don''t run here.","ja":"座ってください。ここで走らないでください。"}]'),
('JH1-008', '助動詞 can / cannot', '中1', '5', 'can の文・疑問文・否定文', '助動詞can', '能力や許可を表します。疑問文・否定文も作れます。', '[{"en":"Can you swim? I can''t play the piano.","ja":"泳げますか？私はピアノを弾けません。"}]'),
('JH1-009', '名詞・代名詞', '中1', '5', '所有格 my your his her / 目的格 me you him her', '代名詞', '人を指す言葉で、所有格と目的格があります。', '[{"en":"This is my book. I like him.","ja":"これは私の本です。私は彼が好きです。"}]'),
('JH1-010', '前置詞', '中1', '5', 'at / in / on / from / to など', '前置詞', '場所や時を表す語です。', '[{"en":"I live in Tokyo. I go to school at 8.","ja":"私は東京に住んでいます。8時に学校に行きます。"}]'),
('JH1-011', '日時・曜日の表現', '中1', '5', 'at 7 / in April / on Monday', '時の表現', '時刻にはat、月にはin、曜日にはonを使います。', '[{"en":"I get up at 7. School starts in April.","ja":"7時に起きます。学校は4月に始まります。"}]');

-- 中2 (13 items)
INSERT INTO grammar_terms (term_code, term_name_ja, grade_level, eiken_grade, pattern_en, pattern_ja, explanation_template, example_sentences) VALUES
('JH2-001', '過去形（be動詞）', '中2', '4', 'was / were', 'be動詞の過去形', '過去の状態を表します。was/wereを使います。', '[{"en":"I was busy yesterday. They were happy.","ja":"昨日は忙しかったです。彼らは幸せでした。"}]'),
('JH2-002', '過去形（一般動詞）', '中2', '4', 'played, studied, went, saw', '一般動詞の過去形', '過去の動作を表します。規則動詞と不規則動詞があります。', '[{"en":"I played tennis. I went to Tokyo.","ja":"テニスをしました。東京に行きました。"}]'),
('JH2-003', '過去進行形', '中2', '4', 'was/were + 動詞ing', '過去進行形', '過去のある時点で進行中だった動作を表します。', '[{"en":"I was studying at 8 yesterday.","ja":"昨日8時に勉強していました。"}]'),
('JH2-004', '未来表現', '中2', '4', 'will / be going to', '未来形', '未来のことを表します。willやbe going toを使います。', '[{"en":"I will study tomorrow. I am going to play soccer.","ja":"明日勉強します。サッカーをするつもりです。"}]'),
('JH2-005', '助動詞 must / have to', '中2', '4', 'must / have to', '義務・必要', '〜しなければならない、という義務を表します。', '[{"en":"You must finish your homework. I have to go now.","ja":"宿題を終えなければなりません。今行かなければなりません。"}]'),
('JH2-006', '比較級・最上級', '中2', '4', 'bigger / the biggest, more / most', '比較表現', 'ものを比べるときに使います。比較級と最上級があります。', '[{"en":"He is taller than me. She is the tallest in our class.","ja":"彼は私より背が高いです。彼女はクラスで一番背が高いです。"}]'),
('JH2-007', '不定詞（名詞的用法）', '中2', '4', 'to + 動詞（〜すること）', '不定詞の名詞的用法', 'to+動詞で「〜すること」という意味になります。', '[{"en":"I want to study English.","ja":"私は英語を勉強したいです。"}]'),
('JH2-008', '不定詞（形容詞的用法）', '中2', '4', '〜するための', '不定詞の形容詞的用法', '名詞を後ろから修飾して「〜するための」という意味になります。', '[{"en":"I have something to tell you.","ja":"あなたに話すことがあります。"}]'),
('JH2-009', '不定詞（副詞的用法）', '中2', '4', '〜するために', '不定詞の副詞的用法', '目的を表して「〜するために」という意味になります。', '[{"en":"I went to the library to study.","ja":"勉強するために図書館に行きました。"}]'),
('JH2-010', '動名詞（名詞的用法）', '中2', '4', 'doing（〜すること）', '動名詞', '動詞ing形で「〜すること」という意味になります。', '[{"en":"I like playing soccer.","ja":"私はサッカーをすることが好きです。"}]'),
('JH2-011', '接続詞', '中2', '4', 'because / when / if', '接続詞', '文と文をつなぐ語です。理由・時・条件などを表します。', '[{"en":"I stayed home because it rained. If it''s sunny, I''ll go out.","ja":"雨が降ったので家にいました。晴れなら外出します。"}]'),
('JH2-012', 'There is / There are', '中2', '4', '〜がある / いる', 'There is/are構文', '「〜がある/いる」と存在を表します。', '[{"en":"There is a park near my house. There are many books.","ja":"家の近くに公園があります。たくさんの本があります。"}]'),
('JH2-013', '助動詞 should', '中2', '4', '〜すべき', '助動詞should', '「〜すべきだ」という助言や提案を表します。', '[{"en":"You should study harder.","ja":"もっと一生懸命勉強すべきです。"}]');

-- 中3 (12 items)
INSERT INTO grammar_terms (term_code, term_name_ja, grade_level, eiken_grade, pattern_en, pattern_ja, explanation_template, example_sentences) VALUES
('JH3-001', '受動態（受け身）', '中3', '3', 'be + 過去分詞', '受動態', '「〜される」という受け身の意味を表します。', '[{"en":"This book was written by him. English is spoken in many countries.","ja":"この本は彼によって書かれました。英語は多くの国で話されています。"}]'),
('JH3-002', '現在完了形（継続）', '中3', '3', 'have lived（ずっと〜している）', '現在完了形（継続）', '過去から現在まで続いている状態を表します。', '[{"en":"I have lived in Tokyo for 5 years.","ja":"私は5年間東京に住んでいます。"}]'),
('JH3-003', '現在完了形（経験）', '中3', '3', 'have been to（行ったことがある）', '現在完了形（経験）', '今までの経験を表します。', '[{"en":"I have been to Kyoto three times.","ja":"私は京都に3回行ったことがあります。"}]'),
('JH3-004', '現在完了形（完了・結果）', '中3', '3', 'have finished（〜したところだ）', '現在完了形（完了）', '「ちょうど〜したところだ」という完了を表します。', '[{"en":"I have just finished my homework.","ja":"ちょうど宿題を終えたところです。"}]'),
('JH3-005', '分詞（形容詞的用法）', '中3', '3', 'a broken window', '分詞の形容詞的用法', '現在分詞・過去分詞が名詞を修飾します。', '[{"en":"Look at that running boy. This is a broken window.","ja":"あの走っている少年を見て。これは壊れた窓です。"}]'),
('JH3-006', '間接疑問', '中3', '3', 'I don''t know what to do.', '間接疑問文', '疑問詞を使った節が文の一部になります。', '[{"en":"I don''t know what to do. Please tell me where you live.","ja":"何をすべきかわかりません。どこに住んでいるか教えてください。"}]'),
('JH3-007', '関係代名詞（主格）', '中3', '3', 'the boy who~', '関係代名詞（主格）', 'who/which/thatが主語の働きをします。', '[{"en":"I know the boy who plays soccer well.","ja":"私はサッカーが上手な少年を知っています。"}]'),
('JH3-008', '関係代名詞（目的格）', '中3', '3', 'the book which I read', '関係代名詞（目的格）', 'which/that/whomが目的語の働きをします。', '[{"en":"This is the book which I read yesterday.","ja":"これは私が昨日読んだ本です。"}]'),
('JH3-009', '現在分詞・過去分詞の修飾', '中3', '3', 'a running boy / a broken toy', '分詞による修飾', '分詞が名詞を修飾して詳しい説明をします。', '[{"en":"The girl standing there is my sister. I found a broken toy.","ja":"そこに立っている女の子は私の妹です。壊れたおもちゃを見つけました。"}]'),
('JH3-010', '原級比較', '中3', '3', 'as ~ as', '原級比較', '「〜と同じくらい...だ」という同等比較を表します。', '[{"en":"He is as tall as his brother.","ja":"彼は兄と同じくらい背が高いです。"}]'),
('JH3-011', 'so / neither 構文', '中3', '3', 'So do I. / Neither do I.', '付加疑問・同意', '「私もそうです」という同意を表します。', '[{"en":"I like music. So do I. I don''t like cats. Neither do I.","ja":"私は音楽が好きです。私もです。私は猫が好きではありません。私もです。"}]'),
('JH3-012', '助動詞 had better', '中3', '3', '〜したほうがよい', '助動詞had better', '「〜したほうがよい」という強い助言を表します。', '[{"en":"You had better see a doctor.","ja":"医者に診てもらったほうがいいですよ。"}]');

-- 高校 (16 items)
INSERT INTO grammar_terms (term_code, term_name_ja, grade_level, eiken_grade, pattern_en, pattern_ja, explanation_template, example_sentences) VALUES
('HS-001', '仮定法', '高校', '2', 'If I were you, ...', '仮定法', '現実とは異なる仮定や願望を表します。', '[{"en":"If I were you, I would study harder.","ja":"もし私があなたなら、もっと一生懸命勉強するでしょう。"}]'),
('HS-002', '分詞構文', '高校', '2', 'Walking along the street, I found~', '分詞構文', '分詞を使って理由・時・条件などを表します。', '[{"en":"Walking along the street, I found a wallet.","ja":"通りを歩いていて、財布を見つけました。"}]'),
('HS-003', '関係代名詞（所有格）', '高校', '2', 'whose', '関係代名詞（所有格）', 'whoseで所有関係を表します。', '[{"en":"I know a girl whose father is a doctor.","ja":"父親が医者である女の子を知っています。"}]'),
('HS-004', '関係副詞', '高校', '2', 'when / where / why', '関係副詞', '時・場所・理由を表す関係詞です。', '[{"en":"This is the place where I was born.","ja":"ここが私が生まれた場所です。"}]'),
('HS-005', '不定詞の高度用法', '高校', '2', 'too~to / enough to', '不定詞の応用', 'too...to（〜すぎて...できない）、enough to（十分〜である）などです。', '[{"en":"He is too young to drive. She is old enough to vote.","ja":"彼は若すぎて運転できません。彼女は投票できる年齢です。"}]'),
('HS-006', '動詞の語法', '高校', '2', 'ask 人 to~ / make 人 原形 など', '動詞の語法', '特定の動詞の後の形が決まっています。', '[{"en":"I asked him to help me. She made me laugh.","ja":"私は彼に手伝ってくれるよう頼みました。彼女は私を笑わせました。"}]'),
('HS-007', '受動態の発展', '高校', '2', 'It is said that~', '受動態の応用', 'It is said that...（〜と言われている）などの形です。', '[{"en":"It is said that he is very rich.","ja":"彼はとても金持ちだと言われています。"}]'),
('HS-008', '時制の一致', '高校', '2', 'He said that he was~', '時制の一致', '主節の時制に合わせて従属節の時制も変わります。', '[{"en":"He said that he was tired.","ja":"彼は疲れていると言いました。"}]'),
('HS-009', '助動詞の発展', '高校', '2', 'should have done / must have done', '助動詞の過去推量', '過去のことについての推量や後悔を表します。', '[{"en":"You should have studied harder. He must have been sick.","ja":"もっと勉強すべきだったのに。彼は病気だったに違いない。"}]'),
('HS-010', '比較の発展', '高校', '2', 'no more than / much 比較級', '比較の応用', 'no more than（〜しか）、much+比較級（ずっと〜）などです。', '[{"en":"He has no more than 100 yen. This is much better.","ja":"彼はたった100円しか持っていません。これはずっと良いです。"}]'),
('HS-011', '強調構文', '高校', '2', 'It is ~ that ...', '強調構文', 'It is...that〜の形で特定の語句を強調します。', '[{"en":"It was John that broke the window.","ja":"窓を壊したのはジョンでした。"}]'),
('HS-012', '倒置', '高校', '2', 'Never have I seen~', '倒置', '否定語を文頭に出して語順を逆にします。', '[{"en":"Never have I seen such a beautiful sunset.","ja":"こんなに美しい夕日を見たことがありません。"}]'),
('HS-013', '名詞節（that節/wh-節）', '高校', '2', 'I think that ... / What I need is ...', '名詞節', 'that節やwh-節が文の主語・目的語・補語になります。', '[{"en":"I think that he is honest. What I need is time.","ja":"彼は正直だと思います。私に必要なのは時間です。"}]'),
('HS-014', '準動詞の発展', '高校', '2', '分詞 vs 不定詞の使い分け', '準動詞の使い分け', '不定詞・動名詞・分詞の使い分けです。', '[{"en":"I want to go there. I enjoy playing tennis. The broken cup is here.","ja":"そこに行きたいです。テニスをするのを楽しみます。壊れたカップはここにあります。"}]'),
('HS-015', '形式主語', '高校', '2', 'It is important to~', '形式主語構文', 'It is...to〜の形で、toが本当の主語です。', '[{"en":"It is important to study English.","ja":"英語を勉強することは重要です。"}]'),
('HS-016', '省略・代用', '高校', '2', 'so / neither / do so / do it', '省略と代用', '繰り返しを避けるために省略や代用をします。', '[{"en":"I think so. I will do so. Can you do it?","ja":"私はそう思います。そうします。それができますか？"}]');
