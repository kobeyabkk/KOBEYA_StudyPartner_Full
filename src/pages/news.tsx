import { Header } from '../components/header'
import { Footer } from '../components/footer'
import { FloatingCTA } from '../components/floating-cta'

// Sample news data - in a real app, this would come from a CMS or database
const newsData = [
  {
    id: 1,
    slug: 'spring-campaign-2024',
    title: '春の入会キャンペーン開始！体験レッスン無料＆初月半額',
    excerpt: '4月から始まる春の入会キャンペーンのお知らせです。無料体験に加えて、初月の月謝が半額になります。',
    content: `
4月1日より春の入会キャンペーンを開始いたします！

## キャンペーン内容

1. **体験レッスン無料**
   - 通常1,000 THBの体験レッスンが無料
   - お子様の適性を確認いただけます

2. **初月月謝50%OFF**
   - 4月中にご入会の方は初月の月謝が半額
   - 例：通常8,000 THB → 4,000 THB

3. **入会金無料**
   - 通常3,000 THBの入会金が無料

## 対象期間
- 2024年4月1日〜4月30日

## お申込み方法
LINEまたはお電話にてお気軽にお問い合わせください。

この機会にぜひプログラミング学習を始めてみませんか？
    `,
    date: '2024-03-15',
    category: 'キャンペーン',
    image: '/static/images/news-spring-campaign.jpg'
  },
  {
    id: 2,
    slug: 'programming-contest-results',
    title: 'Jr.プログラミング検定で13名が1級合格！',
    excerpt: '2024年2月に実施されたJr.プログラミング検定で、当教室の生徒13名が最高位の1級に合格しました。',
    content: `
2024年2月に実施されたJr.プログラミング検定において、当教室の生徒たちが素晴らしい成績を収めました。

## 合格実績

- **1級合格：13名**
- **2級合格：21名** 
- **3級合格：25名**
- **合計合格者：59名**

合格率は98%という驚異的な数字となりました。

## 合格者コメント

**田中花音さん（小学5年生・1級合格）**
「最初は難しかったけど、先生が優しく教えてくれて、だんだん楽しくなりました。Scratchで作ったゲームを友達に見せるのが楽しみです！」

**佐藤翔太くん（中学1年生・1級合格）**
「Robloxでゲームを作るのが好きで、検定でもその知識が活かせました。将来はゲームプログラマーになりたいです。」

## 保護者の声

多くの保護者の方からも喜びの声をいただいています。

「子どもがこんなにプログラミングを楽しんでいるとは思いませんでした。論理的思考力も身についてきて、学校の算数の成績も上がりました。」

引き続き、お子様一人ひとりの成長を大切にサポートしてまいります。
    `,
    date: '2024-03-01',
    category: '実績',
    image: '/static/images/news-contest-results.jpg'
  },
  {
    id: 3,
    slug: 'new-ai-course-launch',
    title: 'AI Coaching Lab新設！中学生向けAI活用プログラミングコース',
    excerpt: '最新のAI技術を活用した中学生向けの新コース「AI Coaching Lab」を4月より開設いたします。',
    content: `
4月より、中学生向けの新コース「AI Coaching Lab」を開設いたします。

## コースの特徴

### 1. AI支援学習
- ChatGPTやGitHub Copilotを活用した効率的なプログラミング学習
- AI との協働作業を通じて、現代的なスキルを身につける

### 2. Python実践
- データサイエンスの基礎
- Webアプリケーション開発
- 自動化ツールの作成

### 3. 個別ペース学習
- 一人ひとりの理解度に合わせた進行
- プロジェクトベースの実践的学習

## 対象・料金

- **対象：** 中学1年生〜3年生
- **授業時間：** 90分
- **月謝：** 10,000 THB（週1回）
- **定員：** 各クラス6名まで

## 無料説明会開催

3月25日（土）14:00〜15:30にて無料説明会を開催いたします。
AI時代に求められるスキルについてもお話しします。

お申込みはLINEまたはお電話にて承っております。
    `,
    date: '2024-02-20',
    category: '新コース',
    image: '/static/images/news-ai-course.jpg'
  },
  {
    id: 4,
    slug: 'student-showcase-march',
    title: '生徒作品発表会を開催しました',
    excerpt: '3月10日に生徒作品発表会を開催。各コースの生徒たちが制作したオリジナル作品を披露しました。',
    content: `
3月10日（日）に生徒作品発表会を開催いたしました。

## 発表作品

### Scratchコース
- 「おばけやしきゲーム」- 田中さくらさん（小3）
- 「算数クイズゲーム」- 山田たろうくん（小2）
- 「動物園アニメーション」- 鈴木はなちゃん（小1）

### Robloxコース  
- 「謎解きアドベンチャー」- 佐藤ひろきくん（小5）
- 「レーシングゲーム」- 高橋ゆうとくん（中1）
- 「建築シミュレーター」- 伊藤みおちゃん（小6）

### AI Coaching Lab
- 「天気予報アプリ」- 田中けんたくん（中2）
- 「英単語学習bot」- 山田あいちゃん（中3）

## 保護者の感想

「子どもがこんなに素晴らしい作品を作れるようになるとは驚きました。プレゼンテーション能力も身についていて、総合的な成長を感じます。」

「他の生徒さんの作品を見ることで、良い刺激を受けているようです。来年はもっと複雑な作品に挑戦したいと言っています。」

次回の発表会は6月を予定しております。
    `,
    date: '2024-02-15',
    category: 'イベント',
    image: '/static/images/news-showcase.jpg'
  },
  {
    id: 5,
    slug: 'golden-week-workshop',
    title: 'ゴールデンウィーク特別ワークショップ開催決定',
    excerpt: 'GW期間中に特別ワークショップを開催。普段とは違うテーマで楽しくプログラミングを学べます。',
    content: `
ゴールデンウィーク期間中（4月29日〜5月5日）に特別ワークショップを開催いたします。

## ワークショップ内容

### 5月1日（水）「ゲーム制作DAY」
- 時間：10:00-15:00（昼食持参）
- 対象：小学4年生〜中学生
- 内容：チーム戦でオリジナルゲーム制作
- 参加費：3,000 THB

### 5月3日（金）「はじめてのプログラミング」
- 時間：10:00-12:00
- 対象：年長〜小学3年生
- 内容：Scratchjrでアニメーション作成
- 参加費：1,500 THB

### 5月5日（日）「AI体験ワークショップ」
- 時間：14:00-16:00
- 対象：中学生
- 内容：ChatGPTを使ったプログラミング体験
- 参加費：2,000 THB

## お申込み

各ワークショップ定員10名。先着順となります。
LINEまたはお電話にてお申込みください。

普段の授業とは違う特別な体験をお楽しみください！
    `,
    date: '2024-02-10',
    category: 'イベント',
    image: '/static/images/news-workshop.jpg'
  }
]

export const newsPage = (slug?: string) => {
  if (slug) {
    // Show individual news article
    const article = newsData.find(item => item.slug === slug)
    
    if (!article) {
      return (
        <>
          <Header />
          <div class="container mx-auto px-4 py-16">
            <div class="text-center">
              <h1 class="text-2xl font-bold text-gray-900 mb-4">記事が見つかりません</h1>
              <a href="/news" class="text-blue-600 hover:text-blue-800">お知らせ一覧に戻る</a>
            </div>
          </div>
          <Footer />
        </>
      )
    }

    return (
      <>
        <Header />
        
        {/* Article Hero */}
        <section class="py-16 bg-gray-50">
          <div class="container mx-auto px-4">
            <div class="max-w-4xl mx-auto">
              <div class="mb-6">
                <a href="/news" class="text-blue-600 hover:text-blue-800 font-medium">
                  ← お知らせ一覧に戻る
                </a>
              </div>
              
              <div class="bg-white rounded-lg shadow-lg overflow-hidden">
                <img src={article.image} alt={article.title} class="w-full h-64 object-cover" />
                
                <div class="p-8">
                  <div class="flex items-center space-x-4 text-sm text-gray-500 mb-4">
                    <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">{article.category}</span>
                    <span>{article.date}</span>
                  </div>
                  
                  <h1 class="text-3xl font-bold text-gray-900 mb-6">{article.title}</h1>
                  
                  <div class="prose max-w-none text-gray-700 leading-relaxed">
                    {article.content.split('\n').map((paragraph, index) => {
                      if (paragraph.startsWith('## ')) {
                        return <h2 key={index} class="text-2xl font-semibold text-gray-900 mt-8 mb-4">{paragraph.replace('## ', '')}</h2>
                      } else if (paragraph.startsWith('### ')) {
                        return <h3 key={index} class="text-xl font-semibold text-gray-900 mt-6 mb-3">{paragraph.replace('### ', '')}</h3>
                      } else if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
                        return <p key={index} class="font-semibold text-gray-900 mb-3">{paragraph.replace(/\*\*/g, '')}</p>
                      } else if (paragraph.trim() === '') {
                        return null
                      } else {
                        return <p key={index} class="mb-4">{paragraph}</p>
                      }
                    })}
                  </div>
                  
                  <div class="mt-8 pt-6 border-t border-gray-200">
                    <div class="flex items-center justify-between">
                      <div class="text-sm text-gray-500">
                        この記事は {article.date} に公開されました
                      </div>
                      <div class="flex space-x-4">
                        <a href="/contact" class="bg-yellow-400 hover:bg-yellow-500 text-gray-900 px-6 py-2 rounded-full font-semibold transition-colors duration-200">
                          お問い合わせ
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        
        <FloatingCTA />
        <Footer />
      </>
    )
  }

  // Show news list
  return (
    <>
      <Header />
      
      {/* Hero Section */}
      <section class="bg-gradient-to-br from-blue-50 to-white py-16">
        <div class="container mx-auto px-4">
          <div class="text-center max-w-4xl mx-auto">
            <h1 class="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              お知らせ
            </h1>
            <p class="text-xl text-gray-600 leading-relaxed mb-8">
              教室の最新情報、イベント、生徒の活躍などをお届けします。
            </p>
          </div>
        </div>
      </section>

      {/* News List */}
      <section class="py-16 bg-white">
        <div class="container mx-auto px-4">
          <div class="max-w-4xl mx-auto">
            <div class="space-y-8">
              {newsData.map(article => (
                <article key={article.id} class="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
                  <div class="md:flex">
                    <div class="md:w-1/3">
                      <img src={article.image} alt={article.title} class="w-full h-48 md:h-full object-cover" />
                    </div>
                    <div class="md:w-2/3 p-6">
                      <div class="flex items-center space-x-4 text-sm text-gray-500 mb-3">
                        <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">{article.category}</span>
                        <span>{article.date}</span>
                      </div>
                      
                      <h2 class="text-xl font-bold text-gray-900 mb-3">
                        <a href={`/news/${article.slug}`} class="hover:text-blue-600 transition-colors duration-200">
                          {article.title}
                        </a>
                      </h2>
                      
                      <p class="text-gray-600 mb-4 leading-relaxed">
                        {article.excerpt}
                      </p>
                      
                      <a href={`/news/${article.slug}`} class="text-blue-600 hover:text-blue-800 font-medium">
                        続きを読む →
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            
            {/* Pagination - for future expansion */}
            <div class="mt-12 text-center">
              <div class="text-gray-500">
                全 {newsData.length} 件の記事を表示中
              </div>
            </div>
          </div>
        </div>
      </section>

      <FloatingCTA />
      <Footer />
    </>
  )
}