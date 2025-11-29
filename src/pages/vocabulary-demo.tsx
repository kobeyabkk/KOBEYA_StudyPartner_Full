import { useState } from 'react'
import { VocabularyAnnotation } from '../components/vocabulary/VocabularyAnnotation'

export default function VocabularyDemo() {
  const [inputText, setInputText] = useState(
    'The technological infrastructure necessitates unprecedented collaboration. Sophisticated algorithms demonstrate remarkable capabilities in unprecedented circumstances.'
  )
  const [displayText, setDisplayText] = useState(inputText)
  const [difficultyThreshold, setDifficultyThreshold] = useState(60)

  const sampleTexts = [
    {
      title: '基本レベル（易しい）',
      text: 'The environment is a comprehensive system that includes all living and non-living things. Scientists demonstrate that protecting our planet requires immediate action.'
    },
    {
      title: '中級レベル',
      text: 'The technological infrastructure necessitates unprecedented collaboration. Sophisticated algorithms demonstrate remarkable capabilities in unprecedented circumstances.'
    },
    {
      title: '上級レベル（難しい）',
      text: 'The paradigm necessitates comprehensive infrastructure modifications. Unprecedented methodologies demonstrate sophisticated capabilities through meticulous implementation.'
    }
  ]

  const handleApply = () => {
    setDisplayText(inputText)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            📚 Vocabulary Annotation System
          </h1>
          <p className="text-gray-600">
            難しい英単語に自動で語注を付けるシステム
          </p>
        </div>

        {/* Input Section */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            ✏️ テキスト入力
          </h2>

          {/* Sample Texts */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              サンプルテキスト:
            </label>
            <div className="flex flex-wrap gap-2">
              {sampleTexts.map((sample, index) => (
                <button
                  key={index}
                  onClick={() => setInputText(sample.text)}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm transition"
                >
                  {sample.title}
                </button>
              ))}
            </div>
          </div>

          {/* Text Input */}
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="w-full p-4 border rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={4}
            placeholder="英文テキストを入力してください..."
          />

          {/* Difficulty Threshold */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              難易度閾値: <span className="font-bold text-blue-600">{difficultyThreshold}</span>
              <span className="text-xs text-gray-500 ml-2">
                (この値以上の単語に語注を付けます)
              </span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={difficultyThreshold}
              onChange={(e) => setDifficultyThreshold(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0 (簡単)</span>
              <span>50</span>
              <span>100 (難しい)</span>
            </div>
          </div>

          <button
            onClick={handleApply}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-bold transition"
          >
            適用
          </button>
        </div>

        {/* Annotation Display */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            📖 語注付きテキスト
          </h2>
          <VocabularyAnnotation
            text={displayText}
            difficultyThreshold={difficultyThreshold}
          />
        </div>

        {/* Info Section */}
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-bold text-yellow-900 mb-2">💡 使い方</h3>
          <ol className="list-decimal list-inside text-sm text-yellow-800 space-y-1">
            <li>英文テキストを入力（またはサンプルを選択）</li>
            <li>難易度閾値を調整（デフォルト: 60点）</li>
            <li>「適用」ボタンをクリック</li>
            <li>「語注を表示」ボタンで難しい単語をハイライト</li>
            <li>黄色くハイライトされた単語にマウスオーバーで定義を表示</li>
          </ol>
        </div>

        {/* Stats Section */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-bold text-blue-900 mb-2">📊 データベース情報</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">3,764</div>
              <div className="text-xs text-gray-600">総語彙数</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">43</div>
              <div className="text-xs text-gray-600">日本語定義あり</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">3,721</div>
              <div className="text-xs text-gray-600">定義生成待ち</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">205</div>
              <div className="text-xs text-gray-600">語注候補</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
