import { Header } from '../components/header'
import { Footer } from '../components/footer'
import { FloatingCTA } from '../components/floating-cta'

export const contactPage = () => (
  <>
    <Header />
    
    {/* Hero Section */}
    <section class="bg-gradient-to-br from-blue-50 to-white py-16">
      <div class="container mx-auto px-4">
        <div class="text-center max-w-4xl mx-auto">
          <h1 class="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            お問い合わせ・無料体験予約
          </h1>
          <p class="text-xl text-gray-600 leading-relaxed mb-8">
            まずは無料体験から始めませんか？<br />
            お気軽にお問い合わせください。3営業日以内にご連絡いたします。
          </p>
        </div>
      </div>
    </section>

    {/* Contact Methods */}
    <section class="py-12 bg-white">
      <div class="container mx-auto px-4">
        <div class="max-w-6xl mx-auto">
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
            {/* LINE Contact */}
            <div class="bg-green-50 rounded-xl p-6 text-center">
              <div class="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <i class="fab fa-line text-white text-2xl"></i>
              </div>
              <h3 class="text-xl font-semibold text-gray-900 mb-3">LINE相談（推奨）</h3>
              <p class="text-gray-600 mb-4">最も早く返信できます。お気軽にメッセージください。</p>
              <a href="https://line.me/R/ti/p/@kobeya" target="_blank" class="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-full font-semibold transition-colors duration-200 inline-block">
                友だち追加
              </a>
              <div class="mt-4">
                <img src="/static/images/line-qr-code.png" alt="LINE QRコード" class="w-24 h-24 mx-auto" />
                <p class="text-xs text-gray-500 mt-2">QRコードを読み取り</p>
              </div>
            </div>
            
            {/* Phone Contact */}
            <div class="bg-blue-50 rounded-xl p-6 text-center">
              <div class="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <i class="fas fa-phone text-white text-2xl"></i>
              </div>
              <h3 class="text-xl font-semibold text-gray-900 mb-3">お電話</h3>
              <p class="text-gray-600 mb-4">お急ぎの方はお電話でも承ります。</p>
              <a href="tel:066-123-4567" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-full font-semibold transition-colors duration-200 inline-block">
                066-123-4567
              </a>
              <div class="mt-4 text-sm text-gray-600">
                <div>受付時間</div>
                <div>平日 16:00-20:00</div>
                <div>土日 9:00-17:00</div>
              </div>
            </div>
            
            {/* Email Contact */}
            <div class="bg-yellow-50 rounded-xl p-6 text-center">
              <div class="w-16 h-16 bg-yellow-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <i class="fas fa-envelope text-white text-2xl"></i>
              </div>
              <h3 class="text-xl font-semibold text-gray-900 mb-3">メール</h3>
              <p class="text-gray-600 mb-4">詳しい資料をご希望の方はメールでどうぞ。</p>
              <a href="mailto:info@kobeya-programming.com" class="bg-yellow-500 hover:bg-yellow-600 text-gray-900 px-6 py-3 rounded-full font-semibold transition-colors duration-200 inline-block">
                メール送信
              </a>
              <div class="mt-4 text-sm text-gray-600">
                <div>info@kobeya-programming.com</div>
                <div class="mt-2">返信まで1-2営業日</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* Contact Form */}
    <section class="py-16 bg-gray-50">
      <div class="container mx-auto px-4">
        <div class="max-w-4xl mx-auto">
          <div class="text-center mb-12">
            <h2 class="text-3xl font-bold text-gray-900 mb-4">体験申込フォーム</h2>
            <p class="text-gray-600">以下のフォームからもお申し込みいただけます。</p>
          </div>
          
          <div class="bg-white rounded-lg shadow-lg p-8">
            <form id="contact-form" class="space-y-6">
              {/* Parent Information */}
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label for="parent-name" class="block text-sm font-semibold text-gray-900 mb-2">
                    保護者様お名前 <span class="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    id="parent-name" 
                    name="parentName" 
                    required 
                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="例：田中 太郎"
                  />
                </div>
                
                <div>
                  <label for="phone" class="block text-sm font-semibold text-gray-900 mb-2">
                    電話番号 <span class="text-red-500">*</span>
                  </label>
                  <input 
                    type="tel" 
                    id="phone" 
                    name="phone" 
                    required 
                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="例：066-123-4567"
                  />
                </div>
              </div>

              <div>
                <label for="email" class="block text-sm font-semibold text-gray-900 mb-2">
                  メールアドレス <span class="text-red-500">*</span>
                </label>
                <input 
                  type="email" 
                  id="email" 
                  name="email" 
                  required 
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="例：tanaka@example.com"
                />
              </div>

              {/* Child Information */}
              <div class="border-t pt-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">お子様の情報</h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label for="child-name" class="block text-sm font-semibold text-gray-900 mb-2">
                      お子様のお名前 <span class="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      id="child-name" 
                      name="childName" 
                      required 
                      class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="例：田中 花子"
                    />
                  </div>
                  
                  <div>
                    <label for="child-grade" class="block text-sm font-semibold text-gray-900 mb-2">
                      学年 <span class="text-red-500">*</span>
                    </label>
                    <select 
                      id="child-grade" 
                      name="childGrade" 
                      required 
                      class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">選択してください</option>
                      <option value="年長">年長</option>
                      <option value="小学1年">小学1年生</option>
                      <option value="小学2年">小学2年生</option>
                      <option value="小学3年">小学3年生</option>
                      <option value="小学4年">小学4年生</option>
                      <option value="小学5年">小学5年生</option>
                      <option value="小学6年">小学6年生</option>
                      <option value="中学1年">中学1年生</option>
                      <option value="中学2年">中学2年生</option>
                      <option value="中学3年">中学3年生</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Course Selection */}
              <div>
                <label class="block text-sm font-semibold text-gray-900 mb-3">
                  ご希望のコース <span class="text-red-500">*</span>
                </label>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label class="flex items-center space-x-3 p-4 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="radio" name="course" value="scratch" class="text-blue-600" />
                    <div>
                      <div class="font-medium">Scratch入門</div>
                      <div class="text-sm text-gray-600">小1〜3年対象</div>
                    </div>
                  </label>
                  
                  <label class="flex items-center space-x-3 p-4 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="radio" name="course" value="roblox" class="text-blue-600" />
                    <div>
                      <div class="font-medium">Robloxゲーム制作</div>
                      <div class="text-sm text-gray-600">小4〜中学生対象</div>
                    </div>
                  </label>
                  
                  <label class="flex items-center space-x-3 p-4 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="radio" name="course" value="ai-coaching" class="text-blue-600" />
                    <div>
                      <div class="font-medium">AI Coaching Lab</div>
                      <div class="text-sm text-gray-600">中学生対象</div>
                    </div>
                  </label>
                  
                  <label class="flex items-center space-x-3 p-4 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="radio" name="course" value="study-partner" class="text-blue-600" />
                    <div>
                      <div class="font-medium">Study Partner</div>
                      <div class="text-sm text-gray-600">家庭学習サポート</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Preferred Schedule */}
              <div>
                <label class="block text-sm font-semibold text-gray-900 mb-3">
                  ご希望の曜日・時間帯
                </label>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {['平日夕方', '平日夜', '土曜午前', '土曜午後', '日曜午前', '日曜午後', '要相談', 'オンライン希望'].map(time => (
                    <label key={time} class="flex items-center space-x-2">
                      <input type="checkbox" name="preferredTime" value={time} class="text-blue-600" />
                      <span class="text-sm">{time}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Contact Method */}
              <div>
                <label class="block text-sm font-semibold text-gray-900 mb-3">
                  ご希望の連絡方法 <span class="text-red-500">*</span>
                </label>
                <div class="flex flex-wrap gap-4">
                  <label class="flex items-center space-x-2">
                    <input type="radio" name="contactMethod" value="line" class="text-blue-600" required />
                    <span>LINE</span>
                  </label>
                  <label class="flex items-center space-x-2">
                    <input type="radio" name="contactMethod" value="phone" class="text-blue-600" required />
                    <span>電話</span>
                  </label>
                  <label class="flex items-center space-x-2">
                    <input type="radio" name="contactMethod" value="email" class="text-blue-600" required />
                    <span>メール</span>
                  </label>
                </div>
              </div>

              {/* Message */}
              <div>
                <label for="message" class="block text-sm font-semibold text-gray-900 mb-2">
                  ご質問・ご要望など
                </label>
                <textarea 
                  id="message" 
                  name="message" 
                  rows="4" 
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="プログラミング経験、お子様の興味のあること、送迎の希望など、ご自由にお書きください。"
                ></textarea>
              </div>

              {/* Submit Button */}
              <div class="text-center">
                <button 
                  type="submit" 
                  class="bg-yellow-400 hover:bg-yellow-500 text-gray-900 px-12 py-4 rounded-full font-bold text-lg transition-colors duration-200"
                >
                  無料体験を申し込む
                </button>
                <p class="text-sm text-gray-500 mt-3">
                  送信後、3営業日以内にご連絡いたします。
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>

    {/* Location & Access */}
    <section class="py-16 bg-white">
      <div class="container mx-auto px-4">
        <div class="max-w-6xl mx-auto">
          <div class="text-center mb-12">
            <h2 class="text-3xl font-bold text-gray-900 mb-4">教室案内</h2>
            <p class="text-gray-600">フジスーパー2号店2階の通いやすい立地です。</p>
          </div>
          
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Location Info */}
            <div class="space-y-6">
              <div>
                <h3 class="text-xl font-semibold text-gray-900 mb-4">アクセス情報</h3>
                <div class="space-y-4">
                  <div class="flex items-start space-x-3">
                    <i class="fas fa-map-marker-alt text-blue-600 text-xl mt-1"></i>
                    <div>
                      <div class="font-semibold text-gray-900">住所</div>
                      <div class="text-gray-700">フジスーパー2号店2階</div>
                      <div class="text-gray-600">スクンビット・ソイ33/1周辺</div>
                    </div>
                  </div>
                  
                  <div class="flex items-start space-x-3">
                    <i class="fas fa-train text-blue-600 text-xl mt-1"></i>
                    <div>
                      <div class="font-semibold text-gray-900">最寄り駅</div>
                      <div class="text-gray-700">BTS プロンポン駅から徒歩5分</div>
                    </div>
                  </div>
                  
                  <div class="flex items-start space-x-3">
                    <i class="fas fa-car text-blue-600 text-xl mt-1"></i>
                    <div>
                      <div class="font-semibold text-gray-900">駐車場</div>
                      <div class="text-gray-700">フジスーパー駐車場利用可能</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 class="text-xl font-semibold text-gray-900 mb-4">開講時間</h3>
                <div class="bg-gray-50 rounded-lg p-6">
                  <div class="space-y-3">
                    <div class="flex justify-between items-center border-b pb-2">
                      <span class="font-medium">平日</span>
                      <span>16:00 - 20:00</span>
                    </div>
                    <div class="flex justify-between items-center border-b pb-2">
                      <span class="font-medium">土曜日</span>
                      <span>9:00 - 17:00</span>
                    </div>
                    <div class="flex justify-between items-center border-b pb-2">
                      <span class="font-medium">日曜日</span>
                      <span>9:00 - 17:00</span>
                    </div>
                    <div class="flex justify-between items-center text-red-600">
                      <span class="font-medium">定休日</span>
                      <span>なし（祝日は要確認）</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Map placeholder */}
            <div>
              <div class="bg-gray-200 rounded-lg h-96 flex items-center justify-center">
                <div class="text-center text-gray-600">
                  <i class="fas fa-map text-6xl mb-4"></i>
                  <p class="text-lg font-medium">Google Maps</p>
                  <p class="text-sm">フジスーパー2号店周辺</p>
                  <p class="text-xs mt-2">実装時にGoogle Maps埋め込み予定</p>
                </div>
              </div>
              
              <div class="mt-6 text-center">
                <a 
                  href="https://maps.google.com/?q=Fuji+Supermarket+2nd+Sukhumvit" 
                  target="_blank"
                  class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors duration-200 inline-block"
                >
                  Google Mapsで開く
                </a>
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