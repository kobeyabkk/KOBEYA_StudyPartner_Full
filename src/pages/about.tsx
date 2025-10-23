import { Header } from '../components/header'
import { Footer } from '../components/footer'
import { FloatingCTA } from '../components/floating-cta'

export const aboutPage = () => (
  <>
    <Header />
    
    {/* Hero Section */}
    <section class="bg-gradient-to-br from-blue-50 to-white py-16">
      <div class="container mx-auto px-4">
        <div class="text-center max-w-4xl mx-auto">
          <h1 class="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            教室について
          </h1>
          <p class="text-xl text-gray-600 leading-relaxed mb-8">
            バンコクの日本人小中学生に、プログラミングの楽しさと「できた！」の体験を毎週お届けします。<br />
            安心・安全な環境で、お子様の未来を一緒に育てていきましょう。
          </p>
        </div>
      </div>
    </section>

    {/* Mission Section */}
    <section class="py-16 bg-white">
      <div class="container mx-auto px-4">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div class="space-y-6">
            <h2 class="text-3xl font-bold text-gray-900">私たちの理念</h2>
            <p class="text-lg text-gray-600 leading-relaxed">
              「AI & プログラミングのKOBEYA」は、バンコクに住む日本人のお子様たちが、
              プログラミングを通じて論理的思考力と創造性を育める場所です。
            </p>
            <div class="space-y-4">
              <div class="flex items-start space-x-4">
                <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <i class="fas fa-heart text-blue-600 text-xl"></i>
                </div>
                <div>
                  <h3 class="text-lg font-semibold text-gray-900 mb-2">楽しく学べる環境</h3>
                  <p class="text-gray-600">お子様が「楽しい！」と感じられる授業を心がけています。ゲーム制作やプロジェクト活動を通じて、自然とプログラミングスキルが身につきます。</p>
                </div>
              </div>
              
              <div class="flex items-start space-x-4">
                <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <i class="fas fa-users text-green-600 text-xl"></i>
                </div>
                <div>
                  <h3 class="text-lg font-semibold text-gray-900 mb-2">個別サポート</h3>
                  <p class="text-gray-600">一人ひとりのペースに合わせた指導で、「分からない」を「分かった！」に変える丁寧なサポートを行います。</p>
                </div>
              </div>
              
              <div class="flex items-start space-x-4">
                <div class="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <i class="fas fa-lightbulb text-yellow-600 text-xl"></i>
                </div>
                <div>
                  <h3 class="text-lg font-semibold text-gray-900 mb-2">創造性の育成</h3>
                  <p class="text-gray-600">プログラミングは論理性だけでなく、創造性も大切です。お子様のアイデアを大切にし、オリジナル作品の制作を応援します。</p>
                </div>
              </div>
            </div>
          </div>
          
          <div class="space-y-6">
            <img src="/static/images/classroom-interior.jpg" alt="教室の様子" class="w-full h-64 object-cover rounded-lg shadow-lg" />
            <div class="grid grid-cols-2 gap-4">
              <img src="/static/images/students-coding.jpg" alt="生徒たちの様子" class="w-full h-32 object-cover rounded-lg" />
              <img src="/static/images/teacher-support.jpg" alt="講師のサポート" class="w-full h-32 object-cover rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* Instructor Section */}
    <section class="py-16 bg-gray-50">
      <div class="container mx-auto px-4">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-gray-900 mb-4">講師紹介</h2>
          <p class="text-gray-600 max-w-2xl mx-auto">経験豊富な講師陣が、お子様一人ひとりに寄り添って指導します。</p>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div class="text-center lg:text-left">
            <div class="inline-block relative mb-6">
              <img src="/static/images/teacher-suzuki.jpg" alt="鈴木政路先生" class="w-48 h-48 object-cover rounded-full mx-auto shadow-lg" />
              <div class="absolute -bottom-4 -right-4 bg-blue-600 text-white w-16 h-16 rounded-full flex items-center justify-center">
                <i class="fas fa-chalkboard-teacher text-2xl"></i>
              </div>
            </div>
            <h3 class="text-2xl font-bold text-gray-900 mb-2">鈴木 政路（すずき まさみち）</h3>
            <p class="text-blue-600 font-semibold mb-4">代表・主任講師</p>
            <div class="text-gray-600 space-y-2 text-sm">
              <div class="flex items-center justify-center lg:justify-start space-x-2">
                <i class="fas fa-graduation-cap text-blue-600"></i>
                <span>算数・数学指導歴20年</span>
              </div>
              <div class="flex items-center justify-center lg:justify-start space-x-2">
                <i class="fas fa-globe-asia text-blue-600"></i>
                <span>シンガポール・タイ教育経験15年</span>
              </div>
              <div class="flex items-center justify-center lg:justify-start space-x-2">
                <i class="fas fa-code text-blue-600"></i>
                <span>Jr.プログラミング検定59名合格指導</span>
              </div>
            </div>
          </div>
          
          <div class="space-y-6">
            <div>
              <h4 class="text-xl font-semibold text-gray-900 mb-3">経歴</h4>
              <div class="space-y-3">
                <div class="bg-white rounded-lg p-4 shadow-sm">
                  <div class="font-semibold text-blue-600">1975年</div>
                  <div class="text-gray-900">宮崎県生まれ</div>
                </div>
                <div class="bg-white rounded-lg p-4 shadow-sm">
                  <div class="font-semibold text-blue-600">2004年〜</div>
                  <div class="text-gray-900">シンガポール進学塾で数学指導開始</div>
                </div>
                <div class="bg-white rounded-lg p-4 shadow-sm">
                  <div class="font-semibold text-blue-600">2012年〜</div>
                  <div class="text-gray-900">タイ移住、進学塾開校</div>
                </div>
                <div class="bg-white rounded-lg p-4 shadow-sm">
                  <div class="font-semibold text-blue-600">2023年〜</div>
                  <div class="text-gray-900">「AI & プログラミングのKOBEYA」開校</div>
                </div>
              </div>
            </div>
            
            <div>
              <h4 class="text-xl font-semibold text-gray-900 mb-3">指導方針</h4>
              <blockquote class="bg-blue-50 border-l-4 border-blue-600 p-4 italic text-gray-700">
                「楽しく学ぶ」をモットーに、子どもたちの創造性と論理的思考力を育成しています。
                一人ひとりの個性を大切にし、プログラミングを通じて未来への可能性を広げるお手伝いをします。
              </blockquote>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* Safety & Support Section */}
    <section class="py-16 bg-white">
      <div class="container mx-auto px-4">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-gray-900 mb-4">安心ポイント</h2>
          <p class="text-gray-600 max-w-2xl mx-auto">お子様と保護者様に安心してご利用いただけるよう、様々なサポートをご用意しています。</p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div class="text-center bg-gray-50 rounded-xl p-8">
            <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i class="fas fa-shield-alt text-green-600 text-2xl"></i>
            </div>
            <h3 class="text-xl font-semibold text-gray-900 mb-3">安全な環境</h3>
            <p class="text-gray-600">
              フジスーパー2号店内の明るく清潔な教室。
              日本人がよく利用する施設内で安心です。
            </p>
            <ul class="text-sm text-gray-700 mt-4 space-y-1">
              <li>• セキュリティ完備</li>
              <li>• 清潔な学習環境</li>
              <li>• アクセス良好</li>
            </ul>
          </div>
          
          <div class="text-center bg-gray-50 rounded-xl p-8">
            <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i class="fas fa-car text-blue-600 text-2xl"></i>
            </div>
            <h3 class="text-xl font-semibold text-gray-900 mb-3">送迎サービス</h3>
            <p class="text-gray-600">
              スクンビット周辺エリアへの送迎サービスをご用意。
              お忙しい保護者様をサポートします。
            </p>
            <ul class="text-sm text-gray-700 mt-4 space-y-1">
              <li>• スクンビット周辺対応</li>
              <li>• 安全運転指導</li>
              <li>• 柔軟なスケジュール</li>
            </ul>
          </div>
          
          <div class="text-center bg-gray-50 rounded-xl p-8">
            <div class="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i class="fas fa-comments text-yellow-600 text-2xl"></i>
            </div>
            <h3 class="text-xl font-semibold text-gray-900 mb-3">日本語サポート</h3>
            <p class="text-gray-600">
              日本人講師による完全日本語対応。
              お子様も保護者様も安心してご相談いただけます。
            </p>
            <ul class="text-sm text-gray-700 mt-4 space-y-1">
              <li>• 日本人講師常駐</li>
              <li>• 保護者面談対応</li>
              <li>• LINE相談窓口</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    {/* Achievements Section */}
    <section class="py-16 bg-gray-50">
      <div class="container mx-auto px-4">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-gray-900 mb-4">教室の実績</h2>
          <p class="text-gray-600">多くの生徒が成果を上げ、プログラミングスキルを身につけています。</p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div class="text-center bg-white rounded-xl p-6 shadow-sm">
            <div class="text-4xl font-bold text-blue-600 mb-2">150+</div>
            <div class="text-gray-700 font-medium">総受講生徒数</div>
            <div class="text-gray-500 text-sm mt-1">2023年開校以来</div>
          </div>
          
          <div class="text-center bg-white rounded-xl p-6 shadow-sm">
            <div class="text-4xl font-bold text-green-600 mb-2">59</div>
            <div class="text-gray-700 font-medium">Jr.検定合格者</div>
            <div class="text-gray-500 text-sm mt-1">1級合格13名含む</div>
          </div>
          
          <div class="text-center bg-white rounded-xl p-6 shadow-sm">
            <div class="text-4xl font-bold text-yellow-600 mb-2">98%</div>
            <div class="text-gray-700 font-medium">保護者満足度</div>
            <div class="text-gray-500 text-sm mt-1">継続率の高さ</div>
          </div>
          
          <div class="text-center bg-white rounded-xl p-6 shadow-sm">
            <div class="text-4xl font-bold text-purple-600 mb-2">200+</div>
            <div class="text-gray-700 font-medium">制作作品数</div>
            <div class="text-gray-500 text-sm mt-1">ゲーム・アプリ等</div>
          </div>
        </div>
      </div>
    </section>

    {/* Location & Facilities */}
    <section class="py-16 bg-white">
      <div class="container mx-auto px-4">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-gray-900 mb-4">教室環境</h2>
          <p class="text-gray-600">学習に集中できる快適な環境を整えています。</p>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div class="space-y-6">
            <div>
              <h3 class="text-xl font-semibold text-gray-900 mb-4">施設・設備</h3>
              <div class="space-y-4">
                <div class="flex items-start space-x-4">
                  <i class="fas fa-laptop text-blue-600 text-xl mt-1"></i>
                  <div>
                    <h4 class="font-semibold text-gray-900">最新パソコン完備</h4>
                    <p class="text-gray-600 text-sm">生徒一人一台の専用パソコンで快適に学習</p>
                  </div>
                </div>
                
                <div class="flex items-start space-x-4">
                  <i class="fas fa-wifi text-blue-600 text-xl mt-1"></i>
                  <div>
                    <h4 class="font-semibold text-gray-900">高速インターネット</h4>
                    <p class="text-gray-600 text-sm">ストレスなく作品制作に集中できる環境</p>
                  </div>
                </div>
                
                <div class="flex items-start space-x-4">
                  <i class="fas fa-chalkboard text-blue-600 text-xl mt-1"></i>
                  <div>
                    <h4 class="font-semibold text-gray-900">大型モニター</h4>
                    <p class="text-gray-600 text-sm">みんなで作品を共有し、学び合える設備</p>
                  </div>
                </div>
                
                <div class="flex items-start space-x-4">
                  <i class="fas fa-couch text-blue-600 text-xl mt-1"></i>
                  <div>
                    <h4 class="font-semibold text-gray-900">リラックススペース</h4>
                    <p class="text-gray-600 text-sm">休憩時間に使える快適な待機エリア</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div>
              <h3 class="text-xl font-semibold text-gray-900 mb-4">立地の特徴</h3>
              <ul class="space-y-2 text-gray-600">
                <li class="flex items-center space-x-2">
                  <i class="fas fa-check text-green-500"></i>
                  <span>フジスーパー2号店2階（日本人エリア）</span>
                </li>
                <li class="flex items-center space-x-2">
                  <i class="fas fa-check text-green-500"></i>
                  <span>BTSプロンポン駅から徒歩5分</span>
                </li>
                <li class="flex items-center space-x-2">
                  <i class="fas fa-check text-green-500"></i>
                  <span>駐車場完備（お車でも安心）</span>
                </li>
                <li class="flex items-center space-x-2">
                  <i class="fas fa-check text-green-500"></i>
                  <span>授業前後にお買い物可能</span>
                </li>
              </ul>
            </div>
          </div>
          
          <div class="space-y-4">
            <img src="/static/images/classroom-overview.jpg" alt="教室全体" class="w-full h-48 object-cover rounded-lg shadow-lg" />
            <div class="grid grid-cols-2 gap-4">
              <img src="/static/images/computer-setup.jpg" alt="パソコン環境" class="w-full h-32 object-cover rounded-lg" />
              <img src="/static/images/teaching-area.jpg" alt="指導エリア" class="w-full h-32 object-cover rounded-lg" />
            </div>
            <img src="/static/images/fuji-supermarket.jpg" alt="フジスーパー外観" class="w-full h-32 object-cover rounded-lg" />
          </div>
        </div>
      </div>
    </section>

    <FloatingCTA />
    <Footer />
  </>
)