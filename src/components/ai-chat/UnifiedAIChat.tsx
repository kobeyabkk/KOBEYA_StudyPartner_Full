/**
 * 統合AIチャットコンポーネント
 * 
 * 全ページで共通使用できるAIチャット機能
 * - 会話履歴の保存・読み込み
 * - カメラ撮影・ファイル選択
 * - 画像クロップ
 * - フローティングウィンドウ（ドラッグ・リサイズ）
 */

import { useState, useEffect, useRef } from 'react'

interface Message {
  id: number
  text: string
  isUser: boolean
  timestamp: Date
  hasImage: boolean
  imageData?: string
}

interface UnifiedAIChatProps {
  sessionId: string
  contextType: 'eiken' | 'international' | 'essay' | 'flashcard' | 'general'
  onClose: () => void
  position: { x: number; y: number }
  size: { width: number; height: number }
  onDragStart: (e: React.MouseEvent) => void
  onResizeStart: (e: React.MouseEvent) => void
}

export default function UnifiedAIChat({
  sessionId,
  contextType,
  onClose,
  position,
  size,
  onDragStart,
  onResizeStart,
}: UnifiedAIChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  
  // 画像関連
  const [currentImage, setCurrentImage] = useState<string | null>(null)
  const [showCropper, setShowCropper] = useState(false)
  const [cropper, setCropper] = useState<any>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const cropImageRef = useRef<HTMLImageElement>(null)
  
  // メッセージが追加されたら自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
  
  // 会話履歴を読み込み
  useEffect(() => {
    loadConversationHistory()
  }, [sessionId])
  
  const loadConversationHistory = async () => {
    try {
      setIsLoadingHistory(true)
      console.log('📚 Loading conversation history for session:', sessionId)
      
      const response = await fetch(`/api/unified-ai-chat/history/${sessionId}`)
      const result = await response.json()
      
      if (result.ok && result.conversations) {
        const loadedMessages: Message[] = result.conversations.map((conv: any, index: number) => ({
          id: conv.id || index,
          text: conv.content,
          isUser: conv.role === 'user',
          timestamp: new Date(conv.timestamp),
          hasImage: conv.has_image === 1,
          imageData: conv.image_data || undefined
        }))
        
        setMessages(loadedMessages)
        console.log(`✅ Loaded ${loadedMessages.length} messages from history`)
      } else {
        // 履歴がない場合は初期メッセージを表示
        setMessages([{
          id: 0,
          text: getWelcomeMessage(contextType),
          isUser: false,
          timestamp: new Date(),
          hasImage: false
        }])
      }
    } catch (error) {
      console.error('❌ Failed to load conversation history:', error)
      // エラー時も初期メッセージを表示
      setMessages([{
        id: 0,
        text: getWelcomeMessage(contextType),
        isUser: false,
        timestamp: new Date(),
        hasImage: false
      }])
    } finally {
      setIsLoadingHistory(false)
    }
  }
  
  const getWelcomeMessage = (context: string): string => {
    switch (context) {
      case 'international':
        return 'こんにちは！バイリンガル学習サポートです。質問や問題の画像を送ってください。\n\nHello! Welcome to Bilingual Learning Support. Please send your questions or images.'
      case 'eiken':
        return '英検学習についてサポートします！分からない問題や単語について質問してください。'
      case 'essay':
        return '小論文の添削やアドバイスをします。文章を送ってください。'
      case 'flashcard':
        return 'フラッシュカードの学習をサポートします。分からないことがあれば質問してください。'
      default:
        return '学習サポートAIです。どんな質問でもお気軽にどうぞ！'
    }
  }
  
  const handleSend = async () => {
    if (!inputText.trim() && !currentImage || isLoading) return
    
    const userMessage: Message = {
      id: Date.now(),
      text: inputText || '[画像]',
      isUser: true,
      timestamp: new Date(),
      hasImage: !!currentImage,
      imageData: currentImage || undefined
    }
    
    setMessages(prev => [...prev, userMessage])
    setInputText('')
    setIsLoading(true)
    
    try {
      const formData = new FormData()
      
      if (currentImage) {
        const blob = await (await fetch(currentImage)).blob()
        formData.append('image', blob, 'image.jpg')
      }
      
      formData.append('sessionId', sessionId)
      formData.append('message', inputText)
      formData.append('contextType', contextType)
      
      const response = await fetch('/api/unified-ai-chat', {
        method: 'POST',
        body: formData
      })
      
      const result = await response.json()
      
      if (result.ok) {
        const aiMessage: Message = {
          id: Date.now() + 1,
          text: result.answer,
          isUser: false,
          timestamp: new Date(),
          hasImage: false
        }
        setMessages(prev => [...prev, aiMessage])
      } else {
        const errorMessage: Message = {
          id: Date.now() + 1,
          text: `申し訳ございません。エラーが発生しました: ${result.message}`,
          isUser: false,
          timestamp: new Date(),
          hasImage: false
        }
        setMessages(prev => [...prev, errorMessage])
      }
    } catch (error) {
      console.error('AI Chat error:', error)
      const errorMessage: Message = {
        id: Date.now() + 1,
        text: '申し訳ございません。通信エラーが発生しました。',
        isUser: false,
        timestamp: new Date(),
        hasImage: false
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
      setCurrentImage(null)
      textareaRef.current?.focus()
    }
  }
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }
  
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const imageData = event.target?.result as string
        setCurrentImage(imageData)
        setShowCropper(true)
      }
      reader.readAsDataURL(file)
    }
  }
  
  const initCropper = () => {
    if (!cropImageRef.current || !currentImage) return
    
    // Cropper.jsが読み込まれているか確認
    if (typeof window !== 'undefined' && (window as any).Cropper) {
      const CropperClass = (window as any).Cropper
      const cropperInstance = new CropperClass(cropImageRef.current, {
        aspectRatio: NaN,
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.95,
        responsive: true,
        restore: false,
        guides: true,
        center: true,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true
      })
      setCropper(cropperInstance)
    }
  }
  
  const confirmCrop = () => {
    if (!cropper) {
      alert('クロップ機能が正しく初期化されていません')
      return
    }
    
    try {
      const canvas = cropper.getCroppedCanvas({
        maxWidth: 768,
        maxHeight: 768,
        imageSmoothingQuality: 'high'
      })
      
      if (canvas) {
        const croppedImage = canvas.toDataURL('image/jpeg', 0.95)
        setCurrentImage(croppedImage)
        setShowCropper(false)
        if (cropper) {
          cropper.destroy()
          setCropper(null)
        }
      }
    } catch (error) {
      console.error('Crop error:', error)
      alert('画像の処理中にエラーが発生しました')
    }
  }
  
  const cancelCrop = () => {
    setShowCropper(false)
    if (cropper) {
      cropper.destroy()
      setCropper(null)
    }
  }
  
  const removeImage = () => {
    setCurrentImage(null)
    setShowCropper(false)
    if (cropper) {
      cropper.destroy()
      setCropper(null)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }
  
  return (
    <div
      className="fixed z-50 bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ヘッダー */}
      <div
        className="chat-header bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-3 flex items-center justify-between cursor-move select-none"
        onMouseDown={onDragStart}
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
          <span className="font-medium">AI学習サポート</span>
        </div>
        <button
          onClick={onClose}
          className="hover:bg-white/20 rounded p-1 transition-colors"
          type="button"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* メッセージエリア */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-3">
        {isLoadingHistory ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.isUser
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-800'
                  }`}
                >
                  {message.hasImage && message.imageData && (
                    <img 
                      src={message.imageData} 
                      alt="Uploaded" 
                      className="max-w-full rounded mb-2"
                      style={{ maxHeight: '200px' }}
                    />
                  )}
                  <div className="whitespace-pre-wrap break-words">{message.text}</div>
                  <div
                    className={`text-xs mt-1 ${
                      message.isUser ? 'text-blue-100' : 'text-gray-400'
                    }`}
                  >
                    {message.timestamp.toLocaleTimeString('ja-JP', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 text-gray-800 rounded-lg px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                    <span>考え中...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 画像プレビュー・クロップエリア */}
      {currentImage && !showCropper && (
        <div className="border-t border-gray-200 p-3 bg-gray-50">
          <div className="relative inline-block">
            <img 
              src={currentImage} 
              alt="Preview" 
              className="max-h-32 rounded"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setShowCropper(true)}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                クロップ
              </button>
              <button
                onClick={removeImage}
                className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
              >
                削除
              </button>
            </div>
          </div>
        </div>
      )}

      {showCropper && currentImage && (
        <div className="border-t border-gray-200 p-3 bg-gray-50">
          <div className="relative" style={{ maxHeight: '300px' }}>
            <img
              ref={cropImageRef}
              src={currentImage}
              alt="Crop"
              onLoad={initCropper}
              style={{ maxWidth: '100%' }}
            />
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={confirmCrop}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              確定
            </button>
            <button
              onClick={cancelCrop}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* 入力エリア */}
      <div className="border-t border-gray-200 p-3 bg-white">
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            title="カメラ撮影"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            title="ファイル選択"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleImageSelect}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
        </div>
        
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="質問を入力してください... (Shift+Enterで改行)"
            className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            rows={2}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={(!inputText.trim() && !currentImage) || isLoading}
            className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-2 rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            type="button"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
            <span className="hidden sm:inline">送信</span>
          </button>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Enterで送信 / Shift+Enterで改行
        </div>
      </div>

      {/* リサイズハンドル */}
      <div
        className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize"
        style={{
          background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.1) 50%)',
        }}
        onMouseDown={onResizeStart}
      />
    </div>
  )
}
