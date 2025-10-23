export const Footer = () => (
  <footer class="bg-gray-900 text-white">
    <div class="container mx-auto px-4 py-12">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Logo & Description */}
        <div class="md:col-span-2">
          <div class="flex items-center space-x-2 mb-4">
            <div class="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
              <i class="fas fa-robot text-white text-lg"></i>
            </div>
            <div>
              <div class="font-bold text-lg">AI & プログラミングのKOBEYA</div>
              <div class="text-sm text-gray-400">バンコク日本人小中学生向け</div>
            </div>
          </div>
          <p class="text-gray-300 mb-4 leading-relaxed">
            バンコクの日本人小中学生に、プログラミングの楽しさと「できた！」の体験を毎週お届けします。
          </p>
          <div class="flex space-x-4">
            <a href="#" class="text-yellow-400 hover:text-yellow-300 text-2xl">
              <i class="fab fa-line"></i>
            </a>
            <a href="#" class="text-blue-400 hover:text-blue-300 text-2xl">
              <i class="fas fa-envelope"></i>
            </a>
            <a href="#" class="text-green-400 hover:text-green-300 text-2xl">
              <i class="fas fa-phone"></i>
            </a>
          </div>
        </div>

        {/* Quick Links */}
        <div>
          <h3 class="font-semibold text-lg mb-4">サイトマップ</h3>
          <ul class="space-y-2">
            <li><a href="/" class="text-gray-300 hover:text-yellow-400">ホーム</a></li>
            <li><a href="/courses" class="text-gray-300 hover:text-yellow-400">コース</a></li>
            <li><a href="/about" class="text-gray-300 hover:text-yellow-400">教室について</a></li>
            <li><a href="/news" class="text-gray-300 hover:text-yellow-400">お知らせ</a></li>
            <li><a href="/contact" class="text-gray-300 hover:text-yellow-400">お問い合わせ</a></li>
          </ul>
        </div>

        {/* Contact Info */}
        <div>
          <h3 class="font-semibold text-lg mb-4">お問い合わせ</h3>
          <div class="space-y-3">
            <div class="flex items-center space-x-2">
              <i class="fas fa-map-marker-alt text-yellow-400"></i>
              <span class="text-gray-300 text-sm">フジスーパー2号店2階<br />スクンビット周辺</span>
            </div>
            <div class="flex items-center space-x-2">
              <i class="fas fa-phone text-yellow-400"></i>
              <span class="text-gray-300 text-sm">066-123-4567</span>
            </div>
            <div class="flex items-center space-x-2">
              <i class="fas fa-envelope text-yellow-400"></i>
              <span class="text-gray-300 text-sm">info@kobeya-programming.com</span>
            </div>
            <div class="flex items-center space-x-2">
              <i class="fas fa-clock text-yellow-400"></i>
              <span class="text-gray-300 text-sm">平日 16:00-20:00<br />土日 9:00-17:00</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Bottom Bar */}
    <div class="border-t border-gray-800">
      <div class="container mx-auto px-4 py-4">
        <div class="flex flex-col md:flex-row justify-between items-center">
          <div class="text-gray-400 text-sm">
            © 2024 AI & プログラミングのKOBEYA. All rights reserved.
          </div>
          <div class="text-gray-400 text-sm mt-2 md:mt-0">
            運営：プログラミングのKOBEYA バンコク
          </div>
        </div>
      </div>
    </div>
  </footer>
)