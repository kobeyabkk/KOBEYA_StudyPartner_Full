import { useState } from 'react'

interface AnnotatedWord {
  word: string
  cefr_level: string
  final_difficulty_score: number
  definition_ja: string | null
}

interface VocabularyAnnotationProps {
  text: string
  difficultyThreshold?: number
  onAnnotate?: (annotations: AnnotatedWord[]) => void
}

export function VocabularyAnnotation({
  text,
  difficultyThreshold = 60,
  onAnnotate
}: VocabularyAnnotationProps) {
  const [annotations, setAnnotations] = useState<AnnotatedWord[]>([])
  const [loading, setLoading] = useState(false)
  const [hoveredWord, setHoveredWord] = useState<string | null>(null)

  const annotateText = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/vocabulary/annotate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, difficulty_threshold: difficultyThreshold })
      })

      const data = await response.json()
      if (data.success) {
        setAnnotations(data.annotations)
        onAnnotate?.(data.annotations)
      }
    } catch (error) {
      console.error('Annotation error:', error)
    } finally {
      setLoading(false)
    }
  }

  const getAnnotation = (word: string): AnnotatedWord | undefined => {
    return annotations.find(a => a.word.toLowerCase() === word.toLowerCase())
  }

  const renderAnnotatedText = () => {
    if (annotations.length === 0) return text

    const words = text.split(/(\s+)/)
    return words.map((segment, index) => {
      const cleanWord = segment.replace(/[.,!?;:]$/g, '').toLowerCase()
      const annotation = getAnnotation(cleanWord)

      if (annotation) {
        const punctuation = segment.match(/[.,!?;:]$/)?.[0] || ''
        return (
          <span
            key={index}
            className="relative inline-block"
            onMouseEnter={() => setHoveredWord(annotation.word)}
            onMouseLeave={() => setHoveredWord(null)}
          >
            <span className="bg-yellow-200 hover:bg-yellow-300 cursor-help border-b-2 border-yellow-500 px-1 rounded">
              {segment.replace(/[.,!?;:]$/g, '')}
            </span>
            {punctuation}
            {hoveredWord === annotation.word && (
              <span className="absolute bottom-full left-0 mb-2 w-48 bg-gray-900 text-white text-sm p-3 rounded shadow-lg z-50">
                <div className="font-bold text-yellow-300">{annotation.word}</div>
                <div className="text-xs text-gray-300 mb-1">
                  {annotation.cefr_level} | 難易度: {annotation.final_difficulty_score}
                </div>
                <div className="mt-1">
                  {annotation.definition_ja || '定義未生成'}
                </div>
                <div className="absolute bottom-0 left-4 transform translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900"></div>
              </span>
            )}
          </span>
        )
      }

      return <span key={index}>{segment}</span>
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <button
          onClick={annotateText}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
        >
          {loading ? '解析中...' : '語注を表示'}
        </button>
        {annotations.length > 0 && (
          <div className="text-sm text-gray-600">
            難しい単語: <span className="font-bold text-blue-600">{annotations.length}個</span>
          </div>
        )}
      </div>

      <div className="p-4 bg-white border rounded-lg shadow-sm leading-relaxed text-lg">
        {renderAnnotatedText()}
      </div>

      {annotations.length > 0 && (
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-bold text-blue-900 mb-2">📚 語注一覧</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {annotations.map((annotation, index) => (
              <div key={index} className="p-2 bg-white rounded border border-blue-200">
                <span className="font-bold text-blue-700">{annotation.word}</span>
                <span className="text-xs text-gray-500 ml-2">
                  ({annotation.cefr_level})
                </span>
                <span className="text-sm text-gray-700 ml-2">
                  {annotation.definition_ja || '定義未生成'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
