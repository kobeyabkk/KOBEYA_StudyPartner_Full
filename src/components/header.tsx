export const Header = () => (
  <header class="bg-white shadow-sm border-b sticky top-0 z-50">
    <div class="container mx-auto px-4">
      <div class="flex items-center justify-between h-16">
        {/* Logo */}
        <div class="flex items-center">
          <a href="/" class="flex items-center space-x-2">
            <div class="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
              <i class="fas fa-robot text-white text-lg"></i>
            </div>
            <div>
              <div class="font-bold text-lg text-gray-900">AI & プログラミングのKOBEYA</div>
              <div class="text-xs text-gray-600">バンコク日本人小中学生向け</div>
            </div>
          </a>
        </div>

        {/* Navigation - Desktop */}
        <nav class="hidden md:flex items-center space-x-8">
          <a href="/" class="text-gray-700 hover:text-blue-600 font-medium">ホーム</a>
          <a href="/courses" class="text-gray-700 hover:text-blue-600 font-medium">コース</a>
          <a href="/about" class="text-gray-700 hover:text-blue-600 font-medium">教室について</a>
          <a href="/news" class="text-gray-700 hover:text-blue-600 font-medium">お知らせ</a>
          <a href="/contact" class="text-gray-700 hover:text-blue-600 font-medium">お問い合わせ</a>
        </nav>

        {/* CTA Button */}
        <div class="hidden md:flex items-center space-x-4">
          <a href="/contact" class="bg-yellow-400 hover:bg-yellow-500 text-gray-900 px-6 py-2 rounded-full font-semibold transition-colors duration-200">
            無料体験を予約
          </a>
        </div>

        {/* Mobile menu button */}
        <button class="md:hidden p-2" id="mobile-menu-toggle">
          <i class="fas fa-bars text-gray-700"></i>
        </button>
      </div>

      {/* Mobile Navigation */}
      <nav class="md:hidden hidden border-t py-4" id="mobile-menu">
        <div class="flex flex-col space-y-4">
          <a href="/" class="text-gray-700 hover:text-blue-600 font-medium">ホーム</a>
          <a href="/courses" class="text-gray-700 hover:text-blue-600 font-medium">コース</a>
          <a href="/about" class="text-gray-700 hover:text-blue-600 font-medium">教室について</a>
          <a href="/news" class="text-gray-700 hover:text-blue-600 font-medium">お知らせ</a>
          <a href="/contact" class="text-gray-700 hover:text-blue-600 font-medium">お問い合わせ</a>
          <a href="/contact" class="bg-yellow-400 hover:bg-yellow-500 text-gray-900 px-6 py-3 rounded-full font-semibold text-center transition-colors duration-200">
            無料体験を予約
          </a>
        </div>
      </nav>
    </div>
  </header>
)