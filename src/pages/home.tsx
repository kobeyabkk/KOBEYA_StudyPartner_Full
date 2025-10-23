import { Header } from '../components/header'
import { Footer } from '../components/footer'
import { FloatingCTA } from '../components/floating-cta'

export const homePage = () => (
  <>
    <Header />
    
    {/* Hero Section */}
    <section class="bg-gradient-to-br from-blue-50 to-white py-20">
      <div class="container mx-auto px-4">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div class="space-y-6">
            <h1 class="text-4xl lg:text-5xl font-bold text-gray-900 leading-tight">
              バンコクの日本人小中学生に、<br />
              <span class="text-blue-600">'できた！'</span>を毎週。
            </h1>
            <p class="text-xl text-gray-600 leading-relaxed">
              スクラッチ／ロブロックス／AIコーチングで、<br />
              つまずきを分解→定着。
            </p>
            
            <div class="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
              <a href="/contact" class="bg-yellow-400 hover:bg-yellow-500 text-gray-900 px-8 py-4 rounded-full font-bold text-lg transition-colors duration-200 text-center">
                無料体験を予約
              </a>
              <a href="https://line.me/R/ti/p/@kobeya" target="_blank" class="bg-green-500 hover:bg-green-600 text-white px-8 py-4 rounded-full font-bold text-lg transition-colors duration-200 text-center flex items-center justify-center space-x-2">
                <i class="fab fa-line"></i>
                <span>LINEで相談</span>
              </a>
            </div>
            
            <div class="flex flex-wrap items-center space-x-6 text-sm text-gray-600">
              <div class="flex items-center space-x-2">
                <i class="fas fa-users text-blue-600"></i>
                <span>毎月15名が体験中</span>
              </div>
              <div class="flex items-center space-x-2">
                <i class="fas fa-star text-yellow-500"></i>
                <span>保護者満足度98%</span>
              </div>
            </div>
          </div>
          
          <div class="relative">
            <div class="bg-white rounded-2xl shadow-xl p-8">
              <img src="/static/images/hero-kids-coding.jpg" alt="プログラミングを学ぶ子どもたち" class="w-full h-64 object-cover rounded-lg mb-4" />
              <div class="text-center">
                <h3 class="font-semibold text-lg text-gray-900 mb-2">楽しく学べる環境</h3>
                <p class="text-gray-600">フジスーパー2号店2階の明るい教室で、安心して学習できます。</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* Achievement Section */}
    <section class="py-16 bg-white">
      <div class="container mx-auto px-4">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-gray-900 mb-4">安心の実績</h2>
          <p class="text-gray-600 max-w-2xl mx-auto">多くの保護者様に選ばれ、お子様の成長をサポートしています。</p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Stats Cards */}
          <div class="text-center bg-blue-50 rounded-xl p-6">
            <div class="text-3xl font-bold text-blue-600 mb-2">150+</div>
            <div class="text-gray-700 font-medium">総受講生徒数</div>
          </div>
          <div class="text-center bg-yellow-50 rounded-xl p-6">
            <div class="text-3xl font-bold text-yellow-600 mb-2">98%</div>
            <div class="text-gray-700 font-medium">保護者満足度</div>
          </div>
          <div class="text-center bg-green-50 rounded-xl p-6">
            <div class="text-3xl font-bold text-green-600 mb-2">3年</div>
            <div class="text-gray-700 font-medium">バンコク運営実績</div>
          </div>
        </div>

        {/* Testimonials */}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12">
          <div class="bg-gray-50 rounded-xl p-6">
            <div class="flex items-center mb-4">
              <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mr-4">
                <i class="fas fa-user text-blue-600"></i>
              </div>
              <div>
                <h4 class="font-semibold text-gray-900">田中様（小5保護者）</h4>
                <div class="text-yellow-500">★★★★★</div>
              </div>
            </div>
            <p class="text-gray-700 italic">"先生が優しく、子どもが毎回楽しみにしています。プログラミングを通じて論理的思考も身についてきました。"</p>
          </div>
          
          <div class="bg-gray-50 rounded-xl p-6">
            <div class="flex items-center mb-4">
              <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mr-4">
                <i class="fas fa-user text-green-600"></i>
              </div>
              <div>
                <h4 class="font-semibold text-gray-900">佐藤様（中1保護者）</h4>
                <div class="text-yellow-500">★★★★★</div>
              </div>
            </div>
            <p class="text-gray-700 italic">"Robloxでゲームを作れるようになり、息子の自信がついています。将来の選択肢が広がりそうです。"</p>
          </div>
        </div>
      </div>
    </section>

    {/* Courses Section */}
    <section class="py-16 bg-gray-50">
      <div class="container mx-auto px-4">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-gray-900 mb-4">コース紹介</h2>
          <p class="text-gray-600 max-w-2xl mx-auto">お子様のレベルと興味に合わせて選べる4つのコース</p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Course Cards */}
          <div class="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
            <div class="bg-gradient-to-br from-orange-400 to-orange-500 p-6">
              <i class="fas fa-cat text-white text-3xl mb-2"></i>
              <h3 class="text-white font-bold text-lg">Scratch入門</h3>
            </div>
            <div class="p-6">
              <p class="text-gray-600 mb-4">小学1〜3年生対象。ブロックプログラミングでゲームやアニメーションを作成。</p>
              <ul class="text-sm text-gray-700 space-y-1 mb-4">
                <li>• 基本的なプログラミング概念</li>
                <li>• 簡単なゲーム制作</li>
                <li>• 創造性の育成</li>
              </ul>
              <a href="/courses" class="text-blue-600 hover:text-blue-800 font-medium">詳細を見る →</a>
            </div>
          </div>

          <div class="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
            <div class="bg-gradient-to-br from-green-400 to-green-500 p-6">
              <i class="fas fa-gamepad text-white text-3xl mb-2"></i>
              <h3 class="text-white font-bold text-lg">Robloxゲーム制作</h3>
            </div>
            <div class="p-6">
              <p class="text-gray-600 mb-4">小学4年生〜中学生対象。3Dゲーム制作でプログラミングを実践。</p>
              <ul class="text-sm text-gray-700 space-y-1 mb-4">
                <li>• Lua言語の基礎</li>
                <li>• 3Dゲーム開発</li>
                <li>• 協調性とチームワーク</li>
              </ul>
              <a href="/courses" class="text-blue-600 hover:text-blue-800 font-medium">詳細を見る →</a>
            </div>
          </div>

          <div class="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
            <div class="bg-gradient-to-br from-purple-400 to-purple-500 p-6">
              <i class="fas fa-robot text-white text-3xl mb-2"></i>
              <h3 class="text-white font-bold text-lg">AI Coaching Lab</h3>
            </div>
            <div class="p-6">
              <p class="text-gray-600 mb-4">中学生対象。AIと一緒に学ぶ次世代プログラミング。</p>
              <ul class="text-sm text-gray-700 space-y-1 mb-4">
                <li>• Python基礎</li>
                <li>• AI活用方法</li>
                <li>• 問題解決能力</li>
              </ul>
              <a href="/courses" class="text-blue-600 hover:text-blue-800 font-medium">詳細を見る →</a>
            </div>
          </div>

          <div class="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
            <div class="bg-gradient-to-br from-blue-400 to-blue-500 p-6">
              <i class="fas fa-graduation-cap text-white text-3xl mb-2"></i>
              <h3 class="text-white font-bold text-lg">Study Partner</h3>
            </div>
            <div class="p-6">
              <p class="text-gray-600 mb-4">家庭学習支援。プログラミング+算数・数学の総合サポート。</p>
              <ul class="text-sm text-gray-700 space-y-1 mb-4">
                <li>• 個別指導</li>
                <li>• 学校課題サポート</li>
                <li>• 学習習慣の定着</li>
              </ul>
              <a href="/courses" class="text-blue-600 hover:text-blue-800 font-medium">詳細を見る →</a>
            </div>
          </div>
        </div>
        
        <div class="text-center mt-8">
          <a href="/contact" class="bg-yellow-400 hover:bg-yellow-500 text-gray-900 px-8 py-3 rounded-full font-semibold transition-colors duration-200">
            まずは無料体験から
          </a>
        </div>
      </div>
    </section>

    {/* Pricing & Schedule Section */}
    <section class="py-16 bg-white">
      <div class="container mx-auto px-4">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-gray-900 mb-4">料金・時間割</h2>
          <p class="text-gray-600">明確な料金設定で安心してご利用いただけます</p>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Pricing */}
          <div>
            <h3 class="text-xl font-semibold text-gray-900 mb-6">料金プラン</h3>
            <div class="space-y-4">
              <div class="bg-gray-50 rounded-lg p-4 flex justify-between items-center">
                <span class="font-medium">月4回コース（週1回）</span>
                <span class="text-xl font-bold text-blue-600">8,000 THB</span>
              </div>
              <div class="bg-gray-50 rounded-lg p-4 flex justify-between items-center">
                <span class="font-medium">月8回コース（週2回）</span>
                <span class="text-xl font-bold text-blue-600">15,000 THB</span>
              </div>
              <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex justify-between items-center">
                <span class="font-medium text-yellow-800">体験レッスン</span>
                <span class="text-xl font-bold text-yellow-600">無料</span>
              </div>
            </div>
            <div class="mt-4 text-sm text-gray-600">
              ※ 入会金・教材費は不要です<br />
              ※ 送迎サービス別途相談可
            </div>
          </div>
          
          {/* Schedule */}
          <div>
            <h3 class="text-xl font-semibold text-gray-900 mb-6">開講時間</h3>
            <div class="space-y-3">
              <div class="flex justify-between py-2 border-b">
                <span class="font-medium">平日</span>
                <span>16:00 - 20:00</span>
              </div>
              <div class="flex justify-between py-2 border-b">
                <span class="font-medium">土曜日</span>
                <span>9:00 - 17:00</span>
              </div>
              <div class="flex justify-between py-2 border-b">
                <span class="font-medium">日曜日</span>
                <span>9:00 - 17:00</span>
              </div>
            </div>
            <div class="mt-4 bg-blue-50 rounded-lg p-4">
              <h4 class="font-semibold text-blue-900 mb-2">人気の時間帯</h4>
              <ul class="text-sm text-blue-800 space-y-1">
                <li>• 平日 17:00-18:00（小学生）</li>
                <li>• 平日 18:00-19:00（中学生）</li>
                <li>• 土日 10:00-11:00（小学生）</li>
                <li>• 土日 14:00-15:00（中学生）</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* FAQ Section */}
    <section class="py-16 bg-gray-50">
      <div class="container mx-auto px-4">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-gray-900 mb-4">よくある質問</h2>
          <p class="text-gray-600">保護者の方からよく寄せられる質問にお答えします</p>
        </div>
        
        <div class="max-w-4xl mx-auto">
          <div class="space-y-6">
            <div class="bg-white rounded-lg shadow-sm">
              <button class="w-full text-left p-6 focus:outline-none faq-toggle">
                <div class="flex justify-between items-center">
                  <h3 class="text-lg font-semibold text-gray-900">まったくの初心者でも大丈夫ですか？</h3>
                  <i class="fas fa-chevron-down text-gray-500"></i>
                </div>
              </button>
              <div class="px-6 pb-6 faq-content hidden">
                <p class="text-gray-700">はい、大丈夫です。お子様一人ひとりのペースに合わせて丁寧に指導いたします。基礎から段階的に学習していくので、プログラミング未経験でも安心してご参加ください。</p>
              </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm">
              <button class="w-full text-left p-6 focus:outline-none faq-toggle">
                <div class="flex justify-between items-center">
                  <h3 class="text-lg font-semibold text-gray-900">途中入会はできますか？</h3>
                  <i class="fas fa-chevron-down text-gray-500"></i>
                </div>
              </button>
              <div class="px-6 pb-6 faq-content hidden">
                <p class="text-gray-700">はい、月の途中からでもご入会いただけます。料金は日割り計算いたしますので、いつからでもスタートしていただけます。</p>
              </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm">
              <button class="w-full text-left p-6 focus:outline-none faq-toggle">
                <div class="flex justify-between items-center">
                  <h3 class="text-lg font-semibold text-gray-900">体験レッスンの持ち物はありますか？</h3>
                  <i class="fas fa-chevron-down text-gray-500"></i>
                </div>
              </button>
              <div class="px-6 pb-6 faq-content hidden">
                <p class="text-gray-700">特別な持ち物は必要ありません。パソコンや教材はすべて教室で用意いたします。お子様には筆記用具をお持ちいただければ十分です。</p>
              </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm">
              <button class="w-full text-left p-6 focus:outline-none faq-toggle">
                <div class="flex justify-between items-center">
                  <h3 class="text-lg font-semibold text-gray-900">保護者の見学は可能ですか？</h3>
                  <i class="fas fa-chevron-down text-gray-500"></i>
                </div>
              </button>
              <div class="px-6 pb-6 faq-content hidden">
                <p class="text-gray-700">もちろん可能です。初回の体験レッスン時はぜひご見学ください。お子様の学習の様子を直接ご確認いただけます。</p>
              </div>
            </div>

            <div class="bg-white rounded-lg shadow-sm">
              <button class="w-full text-left p-6 focus:outline-none faq-toggle">
                <div class="flex justify-between items-center">
                  <h3 class="text-lg font-semibold text-gray-900">送迎サービスはありますか？</h3>
                  <i class="fas fa-chevron-down text-gray-500"></i>
                </div>
              </button>
              <div class="px-6 pb-6 faq-content hidden">
                <p class="text-gray-700">スクンビット周辺エリアに限り、送迎サービスをご用意しています。詳細はお問い合わせ時にご相談ください。</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* Location Section */}
    <section class="py-16 bg-white">
      <div class="container mx-auto px-4">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-gray-900 mb-4">アクセス</h2>
          <p class="text-gray-600">フジスーパー2号店2階、通いやすい立地です</p>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div class="space-y-6">
            <div>
              <h3 class="text-xl font-semibold text-gray-900 mb-4">教室所在地</h3>
              <div class="space-y-3">
                <div class="flex items-start space-x-3">
                  <i class="fas fa-map-marker-alt text-blue-600 mt-1"></i>
                  <div>
                    <div class="font-medium text-gray-900">AI & プログラミングのKOBEYA</div>
                    <div class="text-gray-700">フジスーパー2号店2階</div>
                    <div class="text-gray-600 text-sm">スクンビット・ソイ33/1周辺</div>
                  </div>
                </div>
                
                <div class="flex items-center space-x-3">
                  <i class="fas fa-train text-blue-600"></i>
                  <div class="text-gray-700">BTS プロンポン駅から徒歩5分</div>
                </div>
                
                <div class="flex items-center space-x-3">
                  <i class="fas fa-car text-blue-600"></i>
                  <div class="text-gray-700">駐車場完備（フジスーパーと共用）</div>
                </div>
              </div>
            </div>
            
            <div class="bg-blue-50 rounded-lg p-6">
              <h4 class="font-semibold text-blue-900 mb-3">アクセスのポイント</h4>
              <ul class="text-blue-800 space-y-2 text-sm">
                <li>• 日本人がよく利用するフジスーパー内で安心</li>
                <li>• BTSプロンポン駅から近く、電車でも通いやすい</li>
                <li>• 授業の前後にお買い物も可能</li>
                <li>• 明るく清潔な教室環境</li>
              </ul>
            </div>
          </div>
          
          <div class="bg-gray-200 rounded-lg h-96 flex items-center justify-center">
            <div class="text-center text-gray-600">
              <i class="fas fa-map text-4xl mb-4"></i>
              <p>Google Maps埋め込み予定地</p>
              <p class="text-sm">フジスーパー2号店周辺</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <FloatingCTA />
    <Footer />
  </>
)