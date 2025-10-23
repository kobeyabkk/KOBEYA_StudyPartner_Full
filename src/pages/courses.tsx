import { Header } from '../components/header'
import { Footer } from '../components/footer'
import { FloatingCTA } from '../components/floating-cta'

export const coursesPage = () => (
  <>
    <Header />
    
    {/* Hero Section */}
    <section class="bg-gradient-to-br from-blue-50 to-white py-16">
      <div class="container mx-auto px-4">
        <div class="text-center max-w-4xl mx-auto">
          <h1 class="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            コース紹介
          </h1>
          <p class="text-xl text-gray-600 leading-relaxed mb-8">
            お子様の年齢と興味に合わせて選べる4つのコース。<br />
            基礎から応用まで、段階的にスキルアップできます。
          </p>
          <a href="/contact" class="bg-yellow-400 hover:bg-yellow-500 text-gray-900 px-8 py-3 rounded-full font-semibold transition-colors duration-200">
            無料体験を予約
          </a>
        </div>
      </div>
    </section>

    {/* Scratch Course */}
    <section class="py-16 bg-white">
      <div class="container mx-auto px-4">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-16">
          <div class="order-2 lg:order-1">
            <div class="bg-gradient-to-br from-orange-400 to-orange-500 inline-block p-4 rounded-xl mb-6">
              <i class="fas fa-cat text-white text-4xl"></i>
            </div>
            <h2 class="text-3xl font-bold text-gray-900 mb-4">Scratch入門コース</h2>
            <p class="text-lg text-gray-600 mb-6">
              小学1〜3年生対象。ブロックを組み合わせてプログラミングの基礎を学びます。
            </p>
            
            <div class="space-y-6">
              <div>
                <h3 class="text-xl font-semibold text-gray-900 mb-3">こんなお子様におすすめ</h3>
                <ul class="space-y-2 text-gray-700">
                  <li class="flex items-center space-x-2">
                    <i class="fas fa-check text-green-500"></i>
                    <span>プログラミングが初めて</span>
                  </li>
                  <li class="flex items-center space-x-2">
                    <i class="fas fa-check text-green-500"></i>
                    <span>ゲームやアニメが好き</span>
                  </li>
                  <li class="flex items-center space-x-2">
                    <i class="fas fa-check text-green-500"></i>
                    <span>創造力を伸ばしたい</span>
                  </li>
                  <li class="flex items-center space-x-2">
                    <i class="fas fa-check text-green-500"></i>
                    <span>論理的思考を身につけたい</span>
                  </li>
                </ul>
              </div>
              
              <div>
                <h3 class="text-xl font-semibold text-gray-900 mb-3">カリキュラム例（3ヶ月）</h3>
                <div class="space-y-3">
                  <div class="bg-orange-50 rounded-lg p-4">
                    <h4 class="font-semibold text-orange-900">1ヶ月目：基礎操作</h4>
                    <p class="text-orange-800 text-sm">Scratchの使い方、キャラクターの動かし方</p>
                  </div>
                  <div class="bg-orange-50 rounded-lg p-4">
                    <h4 class="font-semibold text-orange-900">2ヶ月目：インタラクション</h4>
                    <p class="text-orange-800 text-sm">音や効果の追加、簡単なゲーム制作</p>
                  </div>
                  <div class="bg-orange-50 rounded-lg p-4">
                    <h4 class="font-semibold text-orange-900">3ヶ月目：オリジナル作品</h4>
                    <p class="text-orange-800 text-sm">自分だけのゲームやアニメーション制作</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="order-1 lg:order-2">
            <div class="bg-gradient-to-br from-orange-100 to-orange-200 rounded-2xl p-8">
              <img src="/static/images/scratch-course.jpg" alt="Scratchプログラミング" class="w-full h-64 object-cover rounded-lg mb-4" />
              <div class="grid grid-cols-2 gap-4">
                <div class="bg-white rounded-lg p-4 text-center">
                  <div class="text-2xl font-bold text-orange-600">1-3年</div>
                  <div class="text-sm text-gray-600">対象学年</div>
                </div>
                <div class="bg-white rounded-lg p-4 text-center">
                  <div class="text-2xl font-bold text-orange-600">60分</div>
                  <div class="text-sm text-gray-600">授業時間</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="text-center">
          <a href="/contact" class="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-full font-semibold transition-colors duration-200">
            Scratchコースの体験予約
          </a>
        </div>
      </div>
    </section>

    {/* Roblox Course */}
    <section class="py-16 bg-gray-50">
      <div class="container mx-auto px-4">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-16">
          <div class="order-1">
            <div class="bg-gradient-to-br from-green-100 to-green-200 rounded-2xl p-8">
              <img src="/static/images/roblox-course.jpg" alt="Robloxゲーム制作" class="w-full h-64 object-cover rounded-lg mb-4" />
              <div class="grid grid-cols-2 gap-4">
                <div class="bg-white rounded-lg p-4 text-center">
                  <div class="text-2xl font-bold text-green-600">4年-中学</div>
                  <div class="text-sm text-gray-600">対象学年</div>
                </div>
                <div class="bg-white rounded-lg p-4 text-center">
                  <div class="text-2xl font-bold text-green-600">90分</div>
                  <div class="text-sm text-gray-600">授業時間</div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="order-2">
            <div class="bg-gradient-to-br from-green-400 to-green-500 inline-block p-4 rounded-xl mb-6">
              <i class="fas fa-gamepad text-white text-4xl"></i>
            </div>
            <h2 class="text-3xl font-bold text-gray-900 mb-4">Robloxゲーム制作コース</h2>
            <p class="text-lg text-gray-600 mb-6">
              小学4年生〜中学生対象。人気のRobloxプラットフォームで本格的な3Dゲームを制作します。
            </p>
            
            <div class="space-y-6">
              <div>
                <h3 class="text-xl font-semibold text-gray-900 mb-3">習得できるスキル</h3>
                <ul class="space-y-2 text-gray-700">
                  <li class="flex items-center space-x-2">
                    <i class="fas fa-check text-green-500"></i>
                    <span>Lua言語の基礎プログラミング</span>
                  </li>
                  <li class="flex items-center space-x-2">
                    <i class="fas fa-check text-green-500"></i>
                    <span>3Dゲームデザインの概念</span>
                  </li>
                  <li class="flex items-center space-x-2">
                    <i class="fas fa-check text-green-500"></i>
                    <span>チームでの協力開発</span>
                  </li>
                  <li class="flex items-center space-x-2">
                    <i class="fas fa-check text-green-500"></i>
                    <span>創造性と問題解決能力</span>
                  </li>
                </ul>
              </div>
              
              <div>
                <h3 class="text-xl font-semibold text-gray-900 mb-3">作品例</h3>
                <div class="grid grid-cols-2 gap-3">
                  <div class="bg-green-50 rounded-lg p-3 text-center">
                    <i class="fas fa-running text-green-600 text-2xl mb-2"></i>
                    <div class="text-sm font-medium">アクションゲーム</div>
                  </div>
                  <div class="bg-green-50 rounded-lg p-3 text-center">
                    <i class="fas fa-puzzle-piece text-green-600 text-2xl mb-2"></i>
                    <div class="text-sm font-medium">パズルゲーム</div>
                  </div>
                  <div class="bg-green-50 rounded-lg p-3 text-center">
                    <i class="fas fa-car text-green-600 text-2xl mb-2"></i>
                    <div class="text-sm font-medium">レーシングゲーム</div>
                  </div>
                  <div class="bg-green-50 rounded-lg p-3 text-center">
                    <i class="fas fa-home text-green-600 text-2xl mb-2"></i>
                    <div class="text-sm font-medium">シミュレーション</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="text-center">
          <a href="/contact" class="bg-green-500 hover:bg-green-600 text-white px-8 py-3 rounded-full font-semibold transition-colors duration-200">
            Robloxコースの体験予約
          </a>
        </div>
      </div>
    </section>

    {/* AI Coaching Course */}
    <section class="py-16 bg-white">
      <div class="container mx-auto px-4">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-16">
          <div class="order-2 lg:order-1">
            <div class="bg-gradient-to-br from-purple-400 to-purple-500 inline-block p-4 rounded-xl mb-6">
              <i class="fas fa-robot text-white text-4xl"></i>
            </div>
            <h2 class="text-3xl font-bold text-gray-900 mb-4">AI Coaching Lab</h2>
            <p class="text-lg text-gray-600 mb-6">
              中学生対象。最新のAI技術を活用しながら、次世代のプログラミングスキルを身につけます。
            </p>
            
            <div class="space-y-6">
              <div>
                <h3 class="text-xl font-semibold text-gray-900 mb-3">特徴</h3>
                <ul class="space-y-2 text-gray-700">
                  <li class="flex items-center space-x-2">
                    <i class="fas fa-check text-purple-500"></i>
                    <span>AIアシスタントと一緒に学習</span>
                  </li>
                  <li class="flex items-center space-x-2">
                    <i class="fas fa-check text-purple-500"></i>
                    <span>Python言語の実践的活用</span>
                  </li>
                  <li class="flex items-center space-x-2">
                    <i class="fas fa-check text-purple-500"></i>
                    <span>個別ペースでの学習進行</span>
                  </li>
                  <li class="flex items-center space-x-2">
                    <i class="fas fa-check text-purple-500"></i>
                    <span>実社会につながるスキル習得</span>
                  </li>
                </ul>
              </div>
              
              <div>
                <h3 class="text-xl font-semibold text-gray-900 mb-3">学習内容</h3>
                <div class="space-y-3">
                  <div class="bg-purple-50 rounded-lg p-4">
                    <h4 class="font-semibold text-purple-900">基礎プログラミング</h4>
                    <p class="text-purple-800 text-sm">Python言語の基本文法と活用方法</p>
                  </div>
                  <div class="bg-purple-50 rounded-lg p-4">
                    <h4 class="font-semibold text-purple-900">AI活用術</h4>
                    <p class="text-purple-800 text-sm">ChatGPTやCopilotを使った効率的な開発</p>
                  </div>
                  <div class="bg-purple-50 rounded-lg p-4">
                    <h4 class="font-semibold text-purple-900">実践プロジェクト</h4>
                    <p class="text-purple-800 text-sm">Webアプリやデータ分析の実務体験</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="order-1 lg:order-2">
            <div class="bg-gradient-to-br from-purple-100 to-purple-200 rounded-2xl p-8">
              <img src="/static/images/ai-course.jpg" alt="AIコーチング" class="w-full h-64 object-cover rounded-lg mb-4" />
              <div class="grid grid-cols-2 gap-4">
                <div class="bg-white rounded-lg p-4 text-center">
                  <div class="text-2xl font-bold text-purple-600">中学生</div>
                  <div class="text-sm text-gray-600">対象学年</div>
                </div>
                <div class="bg-white rounded-lg p-4 text-center">
                  <div class="text-2xl font-bold text-purple-600">90分</div>
                  <div class="text-sm text-gray-600">授業時間</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="text-center">
          <a href="/contact" class="bg-purple-500 hover:bg-purple-600 text-white px-8 py-3 rounded-full font-semibold transition-colors duration-200">
            AI Coaching Labの体験予約
          </a>
        </div>
      </div>
    </section>

    {/* Study Partner Course */}
    <section class="py-16 bg-gray-50">
      <div class="container mx-auto px-4">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-16">
          <div class="order-1">
            <div class="bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl p-8">
              <img src="/static/images/study-partner.jpg" alt="学習サポート" class="w-full h-64 object-cover rounded-lg mb-4" />
              <div class="grid grid-cols-2 gap-4">
                <div class="bg-white rounded-lg p-4 text-center">
                  <div class="text-2xl font-bold text-blue-600">全学年</div>
                  <div class="text-sm text-gray-600">対象学年</div>
                </div>
                <div class="bg-white rounded-lg p-4 text-center">
                  <div class="text-2xl font-bold text-blue-600">個別対応</div>
                  <div class="text-sm text-gray-600">授業形式</div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="order-2">
            <div class="bg-gradient-to-br from-blue-400 to-blue-500 inline-block p-4 rounded-xl mb-6">
              <i class="fas fa-graduation-cap text-white text-4xl"></i>
            </div>
            <h2 class="text-3xl font-bold text-gray-900 mb-4">Study Partner</h2>
            <p class="text-lg text-gray-600 mb-6">
              家庭学習支援サービス。プログラミングと併せて、算数・数学の総合的なサポートを行います。
            </p>
            
            <div class="space-y-6">
              <div>
                <h3 class="text-xl font-semibold text-gray-900 mb-3">サポート内容</h3>
                <ul class="space-y-2 text-gray-700">
                  <li class="flex items-center space-x-2">
                    <i class="fas fa-check text-blue-500"></i>
                    <span>学校の宿題・課題サポート</span>
                  </li>
                  <li class="flex items-center space-x-2">
                    <i class="fas fa-check text-blue-500"></i>
                    <span>算数・数学の個別指導</span>
                  </li>
                  <li class="flex items-center space-x-2">
                    <i class="fas fa-check text-blue-500"></i>
                    <span>プログラミング思考の育成</span>
                  </li>
                  <li class="flex items-center space-x-2">
                    <i class="fas fa-check text-blue-500"></i>
                    <span>学習習慣の定着指導</span>
                  </li>
                </ul>
              </div>
              
              <div>
                <h3 class="text-xl font-semibold text-gray-900 mb-3">こんな方におすすめ</h3>
                <div class="space-y-2 text-gray-700">
                  <div class="flex items-start space-x-2">
                    <i class="fas fa-star text-yellow-500 mt-1"></i>
                    <span>学校の勉強でつまずいている</span>
                  </div>
                  <div class="flex items-start space-x-2">
                    <i class="fas fa-star text-yellow-500 mt-1"></i>
                    <span>家庭学習の習慣をつけたい</span>
                  </div>
                  <div class="flex items-start space-x-2">
                    <i class="fas fa-star text-yellow-500 mt-1"></i>
                    <span>プログラミングと勉強を両方頑張りたい</span>
                  </div>
                  <div class="flex items-start space-x-2">
                    <i class="fas fa-star text-yellow-500 mt-1"></i>
                    <span>個別のペースで学習したい</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="text-center">
          <a href="/contact" class="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-full font-semibold transition-colors duration-200">
            Study Partnerの相談予約
          </a>
        </div>
      </div>
    </section>

    {/* Comparison Table */}
    <section class="py-16 bg-white">
      <div class="container mx-auto px-4">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-gray-900 mb-4">コース比較表</h2>
          <p class="text-gray-600">お子様に最適なコースを見つけてください</p>
        </div>
        
        <div class="overflow-x-auto">
          <table class="w-full bg-white rounded-lg shadow-lg overflow-hidden">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-4 text-left text-gray-900 font-semibold"></th>
                <th class="px-6 py-4 text-center text-gray-900 font-semibold">Scratch入門</th>
                <th class="px-6 py-4 text-center text-gray-900 font-semibold">Roblox制作</th>
                <th class="px-6 py-4 text-center text-gray-900 font-semibold">AI Coaching</th>
                <th class="px-6 py-4 text-center text-gray-900 font-semibold">Study Partner</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr>
                <td class="px-6 py-4 font-medium text-gray-900">対象学年</td>
                <td class="px-6 py-4 text-center">小1〜3年</td>
                <td class="px-6 py-4 text-center">小4年〜中学</td>
                <td class="px-6 py-4 text-center">中学生</td>
                <td class="px-6 py-4 text-center">全学年</td>
              </tr>
              <tr class="bg-gray-50">
                <td class="px-6 py-4 font-medium text-gray-900">授業時間</td>
                <td class="px-6 py-4 text-center">60分</td>
                <td class="px-6 py-4 text-center">90分</td>
                <td class="px-6 py-4 text-center">90分</td>
                <td class="px-6 py-4 text-center">個別対応</td>
              </tr>
              <tr>
                <td class="px-6 py-4 font-medium text-gray-900">使用言語</td>
                <td class="px-6 py-4 text-center">ビジュアル</td>
                <td class="px-6 py-4 text-center">Lua</td>
                <td class="px-6 py-4 text-center">Python</td>
                <td class="px-6 py-4 text-center">状況に応じて</td>
              </tr>
              <tr class="bg-gray-50">
                <td class="px-6 py-4 font-medium text-gray-900">難易度</td>
                <td class="px-6 py-4 text-center">★☆☆</td>
                <td class="px-6 py-4 text-center">★★☆</td>
                <td class="px-6 py-4 text-center">★★★</td>
                <td class="px-6 py-4 text-center">★〜★★★</td>
              </tr>
              <tr>
                <td class="px-6 py-4 font-medium text-gray-900">月謝（週1回）</td>
                <td class="px-6 py-4 text-center font-semibold text-blue-600">8,000 THB</td>
                <td class="px-6 py-4 text-center font-semibold text-blue-600">8,000 THB</td>
                <td class="px-6 py-4 text-center font-semibold text-blue-600">10,000 THB</td>
                <td class="px-6 py-4 text-center font-semibold text-blue-600">要相談</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div class="text-center mt-8">
          <a href="/contact" class="bg-yellow-400 hover:bg-yellow-500 text-gray-900 px-8 py-3 rounded-full font-semibold transition-colors duration-200">
            まずは無料体験から始めよう
          </a>
        </div>
      </div>
    </section>

    <FloatingCTA />
    <Footer />
  </>
)