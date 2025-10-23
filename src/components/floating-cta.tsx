export const FloatingCTA = () => (
  <div class="fixed bottom-6 right-6 z-50">
    <div class="flex flex-col space-y-3">
      {/* LINE Button */}
      <a 
        href="https://line.me/R/ti/p/@kobeya" 
        target="_blank" 
        class="bg-green-500 hover:bg-green-600 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110"
        title="LINEで相談"
      >
        <i class="fab fa-line text-xl"></i>
      </a>
      
      {/* Main CTA Button */}
      <a 
        href="/contact" 
        class="bg-yellow-400 hover:bg-yellow-500 text-gray-900 px-6 py-3 rounded-full shadow-lg font-semibold transition-all duration-200 hover:scale-105 animate-pulse"
        id="floating-cta"
      >
        無料体験を予約
      </a>
    </div>
  </div>
)