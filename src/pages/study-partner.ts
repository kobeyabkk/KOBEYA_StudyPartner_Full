/**
 * KOBEYA Study Partner - Main SPA Page
 * Study Partner シングルページアプリケーション
 */

import type { Context } from 'hono'

/**
 * Study Partner SPA ハンドラー
 * GET /study-partner
 */
export function renderStudyPartnerPage(c: Context) {
  console.log('📱 Study Partner SPA requested')
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>KOBEYA Study Partner</title>
        
        <!-- Google Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        
        <!-- Font Awesome -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        
        <!-- Cropper.js CSS -->
        <link rel="stylesheet" href="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.css">
        
        <!-- MathJax for LaTeX rendering -->
        <script>
          window.MathJax = {
            tex: {
              inlineMath: [['\\(', '\\)'], ['$', '$']],
              displayMath: [['\\[', '\\]'], ['$$', '$$']],
              processEscapes: true,
              processEnvironments: true
            },
            options: {
              skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre']
            },
            startup: {
              pageReady: () => {
                return MathJax.startup.defaultPageReady().then(() => {
                  console.log('✅ MathJax loaded and ready');
                });
              }
            }
          };
        </script>
        <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
        
        <style>
        /* Notion-Inspired Modern Design */
        
        /* Clean White Base with Subtle Gradient */
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', sans-serif; 
          margin: 0;
          padding: 0;
          background: linear-gradient(180deg, #fafafa 0%, #f5f5f5 100%);
          min-height: 100vh;
          color: #37352f;
        }
        
        /* Centered Modern Container - A Plan */
        .container { 
          max-width: 900px; 
          margin: 0 auto; 
          padding: 3rem 2rem;
        }
        
        @media (max-width: 960px) {
          .container { 
            max-width: 95%; 
            padding: 2rem 1.5rem;
          }
        }
        
        @media (max-width: 768px) {
          .container { 
            padding: 1.5rem 1rem; 
          }
        }
        
        /* Modern Input Styling - Clean Box Model */
        input { 
          padding: 0.875rem 1rem; 
          margin: 0; 
          width: 100%; 
          border-radius: 0.375rem;
          border: 1px solid #e0e0e0;
          font-size: 15px;
          background: white;
          color: #37352f;
          transition: all 0.15s ease;
          font-family: inherit;
          box-sizing: border-box;
        }
        
        input:focus {
          outline: none;
          border-color: #2383e2;
          box-shadow: 0 0 0 3px rgba(35, 131, 226, 0.1);
        }
        
        input::placeholder {
          color: rgba(55, 53, 47, 0.4);
        }
        
        label {
          display: block;
          color: #37352f;
          font-weight: 600;
          margin-bottom: 0.375rem;
          font-size: 0.875rem;
        }
        
        /* Card-Style Button Base */
        button { 
          padding: 0;
          margin: 0;
          width: 100%; 
          border-radius: 0.5rem;
          border: 1px solid rgba(0, 0, 0, 0.08);
          font-size: 15px;
          background: white;
          color: #37352f;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s ease;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
          min-height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: inherit;
        }
        
        button:hover {
          background: #fafafa;
          border-color: rgba(0, 0, 0, 0.12);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
          transform: translateY(-1px);
        }
        
        button:active {
          transform: translateY(0);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }
        
        button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important;
        }
        
        /* Notion-style Color Accents */
        button.secondary {
          background: #f7f6f3;
          color: #64645f;
        }
        
        button.secondary:hover {
          background: #efeeeb;
        }
        
        button.contrast {
          background: #2383e2;
          color: white;
          border-color: #2383e2;
        }
        
        button.contrast:hover {
          background: #1a6ec7;
          border-color: #1a6ec7;
        }
        
        button.success {
          background: #0f7b6c;
          color: white;
          border-color: #0f7b6c;
        }
        
        button.success:hover {
          background: #0c6b5f;
          border-color: #0c6b5f;
        }
        
        button.ai-question {
          background: #2383e2;
          position: fixed;
          bottom: 30px;
          right: 30px;
          border-radius: 50px;
          padding: 0.875rem 1.75rem;
          box-shadow: 0 8px 24px rgba(35, 131, 226, 0.35);
          z-index: 1000;
          font-weight: 600;
          border: none;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          min-height: auto;
          width: auto;
        }
        
        button.ai-question:hover {
          background: #1a6ec7;
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(35, 131, 226, 0.45);
        }
        
        @media (max-width: 768px) {
          button.ai-question {
            bottom: 20px;
            right: 20px;
            padding: 0.75rem 1.25rem;
            font-size: 0.875rem;
          }
        }
        
        /* Clean Code Blocks */
        pre { 
          background: #f7f6f3; 
          padding: 1.25rem; 
          border-radius: 0.5rem; 
          overflow: auto;
          font-size: 0.875rem;
          border: 1px solid rgba(0, 0, 0, 0.06);
          color: #37352f;
        }
        
        /* Unified Grid Layout for All Elements */
        .grid {
          display: grid;
          gap: 1rem;
          grid-template-columns: 1fr;
        }
        
        @media (min-width: 640px) {
          .grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        
        @media (min-width: 768px) {
          .grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        
        /* Clean Image Preview */
        #imagePreviewArea {
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 0.5rem;
          background: white;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          padding: 1rem;
        }
        
        #previewImage {
          max-width: 100%;
          max-height: 400px;
          border-radius: 0.375rem;
          object-fit: contain;
        }
        
        /* Minimal Loading Spinner */
        .loading-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(0, 0, 0, 0.1);
          border-top: 2px solid #2383e2;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        /* Font Awesome spinner animation (fallback) */
        .fa-spin, .fa-spinner {
          animation: fa-spin 1s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes fa-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        /* Clean Crop Area */
        #cropArea {
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 0.5rem;
          background: white;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          padding: 1rem;
        }
        
        #cropperContainer {
          max-height: 450px;
          overflow: hidden;
          border-radius: 0.375rem;
        }
        
        /* Notion-style Cropper.js */
        .cropper-point {
          width: 14px !important;
          height: 14px !important;
          background-color: #2383e2 !important;
          border: 2px solid white !important;
          border-radius: 50% !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2) !important;
        }
        
        .cropper-line {
          background-color: #2383e2 !important;
          height: 2px !important;
        }
        
        .cropper-line.cropper-line-v {
          width: 2px !important;
          height: auto !important;
        }
        
        .cropper-view-box {
          outline: 2px solid #2383e2 !important;
          outline-color: rgba(35, 131, 226, 0.75) !important;
        }
        
        .cropper-crop-box {
          border: 2px solid #2383e2 !important;
        }
        
        /* Mobile optimization */
        @media (max-width: 768px) {
          .cropper-point {
            width: 18px !important;
            height: 18px !important;
            background-color: #2383e2 !important;
            border: 3px solid white !important;
            border-radius: 50% !important;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25) !important;
          }
          
          .cropper-line {
            background-color: #2383e2 !important;
            height: 3px !important;
          }
          
          .cropper-line.cropper-line-v {
            width: 3px !important;
            height: auto !important;
          }
          
          .cropper-crop-box {
            border: 3px solid #2383e2 !important;
          }
        }
        
        /* Clean Section Cards */
        section {
          background: white !important;
          border: 1px solid rgba(0, 0, 0, 0.08) !important;
          border-radius: 0.75rem !important;
          padding: 2rem !important;
          margin-bottom: 1.5rem !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;
          transition: box-shadow 0.2s ease !important;
        }
        
        section:hover {
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08) !important;
        }
        
        /* Typography */
        h1 {
          color: #37352f;
          font-weight: 700;
          margin: 0;
          font-size: 2rem;
        }
        
        h2 {
          color: #37352f;
          font-weight: 600;
          font-size: 1.5rem;
        }
        
        h3 {
          color: #37352f;
          font-weight: 600;
          font-size: 1.25rem;
        }
        
        p {
          color: rgba(55, 53, 47, 0.8);
          line-height: 1.6;
        }
        
        /* Notion-style Icon Styling */
        .fas, .fa {
          opacity: 0.6;
        }
        
        /* Override Inline Styles for Notion Look - Centered Header */
        section[style*="gradient"] {
          background: white !important;
          color: #37352f !important;
          text-align: center !important;
          padding: 3rem 2rem 2.5rem 2rem !important;
          border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
          margin-bottom: 2rem !important;
        }
        
        section[style*="gradient"] h1 {
          color: #37352f !important;
          font-size: 2.25rem !important;
          margin-bottom: 0.5rem !important;
          font-weight: 700 !important;
        }
        
        section[style*="gradient"] p {
          color: rgba(55, 53, 47, 0.65) !important;
          opacity: 1 !important;
          font-size: 1rem !important;
          margin-bottom: 1.25rem !important;
        }
        
        section[style*="gradient"] div {
          background: #f7f6f3 !important;
          border-radius: 0.5rem !important;
          padding: 0.875rem 1.25rem !important;
          border: 1px solid rgba(0, 0, 0, 0.06) !important;
          max-width: 600px !important;
          margin: 0 auto !important;
        }
        
        section[style*="gradient"] div p {
          color: rgba(55, 53, 47, 0.7) !important;
          font-size: 0.875rem !important;
          margin: 0 !important;
        }
        
        /* Main Section Grid - Unified 3-Column Layout */
        section:nth-of-type(2) {
          display: grid;
          gap: 1rem;
          grid-template-columns: 1fr;
        }
        
        @media (min-width: 640px) {
          section:nth-of-type(2) {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        
        @media (min-width: 768px) {
          section:nth-of-type(2) {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        
        /* Remove individual div spacing in main section */
        section:nth-of-type(2) > div {
          margin-bottom: 0 !important;
        }
        
        /* Feature Card Buttons - Taller & More Spacious */
        button[id*="Button"],
        button[id*="Taisaku"],
        button[id*="flashcard"],
        button[id*="Sei"],
        button#cameraButton,
        button#fileButton {
          min-height: 140px !important;
          padding: 1.75rem 1.5rem !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-start !important;
          justify-content: center !important;
          text-align: left !important;
          gap: 0.75rem !important;
          border-radius: 0.75rem !important;
        }
        
        /* Button icons larger */
        button[id*="Button"] i,
        button[id*="Taisaku"] i,
        button[id*="flashcard"] i,
        button[id*="Sei"] i,
        button#cameraButton i,
        button#fileButton i {
          font-size: 1.25rem;
          opacity: 0.8;
        }
        
        button[id*="Button"]:not(:disabled),
        button[id*="Taisaku"]:not(:disabled),
        button[id*="flashcard"]:not(:disabled),
        button[id*="Sei"]:not(:disabled) {
          background: white !important;
          color: #37352f !important;
        }
        
        /* AI Question Button - Blue Accent */
        button#aiQuestionMainButton {
          background: #2383e2 !important;
          color: white !important;
          border-color: #2383e2 !important;
        }
        
        button#aiQuestionMainButton:hover {
          background: #1a6ec7 !important;
        }
        
        /* Login Button - Span Full Width on Desktop */
        button#btnLogin {
          min-height: 56px !important;
          padding: 1rem 1.5rem !important;
        }
        
        @media (min-width: 768px) {
          section:nth-of-type(2) > div:first-child {
            grid-column: 1 / -1;
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 1rem;
          }
          
          section:nth-of-type(2) > div:first-child > div {
            margin-bottom: 0 !important;
          }
        }
        
        /* Fix input field container styling */
        .grid > div {
          display: flex;
          flex-direction: column;
        }
        
        /* Remove extra margins from grid items */
        section:nth-of-type(2) .grid {
          margin-bottom: 0 !important;
        }
        
        /* Camera and File Buttons - Card Style */
        button#cameraButton,
        button#fileButton {
          background: white !important;
          color: #37352f !important;
          border: 1px solid rgba(0, 0, 0, 0.12) !important;
        }
        
        button#cameraButton:not(:disabled):hover,
        button#fileButton:not(:disabled):hover {
          background: #fafafa !important;
          border-color: rgba(0, 0, 0, 0.16) !important;
        }
        
        /* Photo upload section wrapper - Horizontal 2 columns */
        section:nth-of-type(2) > div:has(#cameraButton) {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 1rem !important;
          grid-column: 1 / -1 !important;
        }
        
        section:nth-of-type(2) > div:has(#cameraButton) > div {
          margin-bottom: 0 !important;
        }
        
        /* Disabled Button State */
        button:disabled {
          background: #f7f6f3 !important;
          color: rgba(55, 53, 47, 0.3) !important;
          border-color: rgba(0, 0, 0, 0.06) !important;
        }

        /* Image sections responsive layout */
        /* For tablets and PC: wider horizontal cards */
        @media (min-width: 768px) {
          /* Allow sections to expand wider on PC/iPad */
          #imagePreviewArea,
          #cropArea,
          #analysisResult,
          #uploadingIndicator {
            max-width: 100% !important;
            width: 100% !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
          }
          
          /* Image preview - make content more compact horizontally */
          #imagePreviewArea .image-content-wrapper {
            display: flex !important;
            flex-direction: row !important;
            gap: 1rem !important;
          }
          
          /* Reduce image preview height on larger screens for wider appearance */
          #imagePreviewArea img#previewImage {
            max-height: 250px !important;
          }
          
          #cropArea img#cropImage {
            max-height: 250px !important;
          }
        }
        
        /* For mobile: keep full-width vertical layout */
        @media (max-width: 767px) {
          #imagePreviewArea,
          #cropArea,
          #analysisResult,
          #uploadingIndicator {
            width: 100% !important;
          }
          
          /* Taller images on mobile for better viewing */
          #imagePreviewArea img#previewImage {
            max-height: 350px !important;
          }
          
          #cropArea img#cropImage {
            max-height: 350px !important;
          }
        }


        </style>
    </head>
    <body>
        <main class="container">
            <section style="text-align: center; margin-bottom: 1rem; padding: 2rem 1.5rem; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 1rem; color: white;">
                <h1 style="margin-bottom: 1rem; color: white;">
                    <i class="fas fa-robot" style="margin-right: 0.5rem;"></i>
                    KOBEYA Study Partner
                </h1>
                <p style="font-size: 1rem; margin-bottom: 1.5rem; opacity: 0.9;">
                    AI学習パートナーで効果的な個別学習を体験してください
                </p>
                <div style="background-color: rgba(255,255,255,0.1); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
                    <p style="margin: 0; font-size: 0.875rem;">
                        <i class="fas fa-info-circle" style="margin-right: 0.5rem;"></i>
                        APP_KEY と 生徒IDを入力してログインしてください
                    </p>
                </div>
            </section>

            <section style="margin-bottom: 2.5rem;">
                <!-- 入力欄 -->
                <div class="grid" style="margin-bottom: 1rem;">
                    <div>
                        <label for="appkey">APP_KEY</label>
                        <input id="appkey" value="180418">
                    </div>
                    <div>
                        <label for="sid">学生ID</label>
                        <input id="sid" value="JS2-04">
                    </div>
                </div>

                <!-- ログインボタン -->
                <div style="margin-bottom: 1rem;">
                    <button id="btnLogin" class="contrast" style="width: 100%; margin: 0;">
                        <i class="fas fa-key" style="margin-right: 0.5rem;"></i>
                        ログイン/認証して開始
                    </button>
                </div>

                <!-- AIに質問ボタン -->
                <div style="margin-bottom: 1rem;">
                    <button id="aiQuestionMainButton" style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #7c3aed; color: white; font-weight: 500; border: none; cursor: pointer; min-height: 56px; font-size: 16px;">
                        <i class="fas fa-robot" style="margin-right: 0.5rem;"></i>
                        🤖 AIに質問
                    </button>
                </div>

                <!-- 新機能プレースホルダーボタン -->
                <div style="margin-bottom: 1rem;">
                    <button id="eikenTaisaku" disabled style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #9ca3af; color: white; font-weight: 500; border: none; cursor: not-allowed; min-height: 56px; font-size: 16px; opacity: 0.7;">
                        <i class="fas fa-graduation-cap" style="margin-right: 0.5rem;"></i>
                        📚 英検対策（実装予定）
                    </button>
                </div>

                <div style="margin-bottom: 1rem;">
                    <button id="shoronbunTaisaku" style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #7c3aed; color: white; font-weight: 500; border: none; cursor: pointer; min-height: 56px; font-size: 16px; transition: all 0.2s;">
                        <i class="fas fa-pen-fancy" style="margin-right: 0.5rem;"></i>
                        📝 小論文対策
                    </button>
                </div>

                <div style="margin-bottom: 1rem;">
                    <button id="flashcard" disabled style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #9ca3af; color: white; font-weight: 500; border: none; cursor: not-allowed; min-height: 56px; font-size: 16px; opacity: 0.7;">
                        <i class="fas fa-clone" style="margin-right: 0.5rem;"></i>
                        🃏 フラッシュカード（実装予定）
                    </button>
                </div>

                <div style="margin-bottom: 1rem;">
                    <button id="interSeiYou" style="width: 100%; border-radius: 0.5rem; padding: 1rem; background: linear-gradient(135deg, #10b981, #059669); color: white; font-weight: 500; border: none; cursor: pointer; min-height: 56px; font-size: 16px; transition: all 0.3s;">
                        <i class="fas fa-globe" style="margin-right: 0.5rem;"></i>
                        🌍 インター生用（Bilingual Learning）
                    </button>
                </div>

                <!-- 写真アップロード -->
                <div style="margin-bottom: 2.5rem;">
                    <!-- カメラ撮影ボタン -->
                    <div style="margin-bottom: 1rem;">
                        <button type="button" id="cameraButton" style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #374151; color: white; font-weight: 500; border: none; cursor: pointer; min-height: 56px; font-size: 16px;">
                            <i class="fas fa-camera" style="margin-right: 0.5rem;"></i>
                            📷 カメラで撮影
                        </button>
                        <input id="cameraInput" type="file" accept="image/*" capture="environment" style="display: none;">
                    </div>
                    
                    <!-- ファイル選択ボタン -->
                    <div>
                        <button type="button" id="fileButton" style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #6b7280; color: white; font-weight: 500; border: none; cursor: pointer; min-height: 56px; font-size: 16px;">
                            <i class="fas fa-folder-open" style="margin-right: 0.5rem;"></i>
                            📁 ファイルから選択
                        </button>
                        <input id="fileInput" type="file" accept="image/*" style="display: none;">
                    </div>
                </div>

                <!-- Vertical container for image preview/crop/analysis sections -->
                <div style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 2.5rem;">
                    <!-- 画像プレビューエリア (1段目) -->
                    <div id="imagePreviewArea" style="display: none; width: 100%; box-sizing: border-box; border: 1px solid #d1d5db; border-radius: 0.5rem; background: white; overflow: hidden;">
                        <div style="padding: 1rem; background: #f9fafb;">
                            <p style="margin: 0; font-size: 0.875rem; font-weight: 500;">
                                📸 選択された画像
                            </p>
                        </div>
                        
                        <div style="padding: 1rem; text-align: center; max-height: 400px; overflow: hidden; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;">
                            <img id="previewImage" style="max-width: 100%; max-height: 350px; border-radius: 0.25rem; object-fit: contain;">
                        </div>
                        
                        <!-- 画像付きメッセージ入力エリア -->
                        <div style="padding: 1rem;">
                            <div style="margin-bottom: 1rem;">
                                <label for="imageMessageInput" style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 500; color: #374151;">
                                    💬 この画像について質問や説明を入力してください（任意）
                                </label>
                                <textarea id="imageMessageInput" placeholder="例: この問題の解き方を教えてください。特に○○の部分が分からないので詳しく説明してください。" 
                                    style="width: 100%; padding: 0.75rem; border: 2px solid #d1d5db; border-radius: 0.5rem; font-size: 1rem; line-height: 1.5; min-height: 80px; resize: vertical; box-sizing: border-box; font-family: inherit;"></textarea>
                            </div>
                            
                            <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                                <button id="btnStartCrop" class="secondary" style="flex: 1; min-width: 150px; margin: 0;">
                                    <i class="fas fa-crop" style="margin-right: 0.5rem;"></i>
                                    🔲 範囲を調整して送信
                                </button>
                                <button id="btnSendDirect" class="contrast" style="flex: 1; min-width: 150px; margin: 0;">
                                    <i class="fas fa-paper-plane" style="margin-right: 0.5rem;"></i>
                                    📤 この画像で送信
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- クロップエリア (2段目) -->
                    <div id="cropArea" style="display: none; width: 100%; box-sizing: border-box; border: 1px solid #7c3aed; border-radius: 0.5rem; background: white; overflow: hidden;">
                        <div style="padding: 1rem; background: #f3f4f6;">
                            <p style="margin: 0; font-size: 0.875rem; font-weight: 500;">
                                ✂️ 解析範囲を選択してください
                            </p>
                        </div>
                        
                        <div style="padding: 1rem; text-align: center; border-top: 1px solid #e9d5ff; border-bottom: 1px solid #e9d5ff;">
                            <div id="cropperContainer">
                                <img id="cropImage" style="max-width: 100%; max-height: 350px;">
                            </div>
                        </div>
                        
                        <div style="padding: 1rem;">
                            <div style="margin-bottom: 1rem;">
                                <label for="cropMessageInput" style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 500; color: #374151;">
                                    💬 この画像について質問や説明を入力してください（任意）
                                </label>
                                <textarea id="cropMessageInput" placeholder="例: この問題の解き方を教えてください。特に○○の部分が分からないので詳しく説明してください。" 
                                    style="width: 100%; padding: 0.75rem; border: 2px solid #e9d5ff; border-radius: 0.5rem; font-size: 1rem; line-height: 1.5; min-height: 80px; resize: vertical; box-sizing: border-box; font-family: inherit;"></textarea>
                            </div>
                            
                            <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                                <button id="btnCancelCrop" class="secondary" style="flex: 1; min-width: 120px; margin: 0;">
                                    <i class="fas fa-times" style="margin-right: 0.5rem;"></i>
                                    キャンセル
                                </button>
                                <button id="btnConfirmCrop" class="contrast" style="flex: 2; min-width: 150px; margin: 0;">
                                    <i class="fas fa-check" style="margin-right: 0.5rem;"></i>
                                    ✅ この範囲で送信
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- アップロード中インジケーター -->
                    <div id="uploadingIndicator" style="display: none; width: 100%; box-sizing: border-box; text-align: center; padding: 1.5rem; background: #f3f4f6; border-radius: 0.5rem; border: 1px solid #7c3aed;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 1rem; margin-bottom: 0.5rem;">
                            <div class="loading-spinner"></div>
                            <span style="font-weight: 500;">写真を解析中...</span>
                        </div>
                        <div style="font-size: 0.875rem; opacity: 0.8;">
                            大きな画像の場合、しばらく時間がかかることがあります
                        </div>
                    </div>

                    <!-- 解析結果表示エリア (3段目) -->
                    <div id="analysisResult" style="display: none; width: 100%; box-sizing: border-box; padding: 1rem; border: 1px solid #059669; border-radius: 0.5rem; background: #ecfdf5;">
                        <div style="display: flex; align-items: center; margin-bottom: 0.75rem;">
                            <i class="fas fa-check-circle" style="color: #059669; margin-right: 0.5rem;"></i>
                            <span style="font-weight: 500;">解析完了</span>
                        </div>
                        <div id="analysisContent" style="font-size: 0.875rem; line-height: 1.6;">
                            <!-- 解析結果がここに表示されます -->
                        </div>
                    </div>
                </div>

                <!-- API応答の表示先 -->
                <div id="out" style="background: #f5f5f5; padding: 1rem; margin-top: 1rem; border-radius: 0.5rem; min-height: 160px; width: 100%; max-width: 100%; box-sizing: border-box; overflow-x: hidden; word-wrap: break-word; font-family: inherit;"></div>
            </section>
            
            <!-- フローティングAI質問ボタン -->
            <button id="aiQuestionButton" class="ai-question" onclick="openAIChat()" style="display: none;">
                <i class="fas fa-robot" style="margin-right: 0.5rem;"></i>
                🤔 AIに質問する
            </button>
        </main>

        <!-- Scripts -->
        <script src="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.js"></script>
        
        <script>
        console.log('📱 Study Partner JavaScript loading...');
        
        // MathJax helper function to typeset math formulas
        function typesetMath(element) {
          if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([element]).then(() => {
              console.log('✅ MathJax typeset completed');
            }).catch((err) => {
              console.error('❌ MathJax typeset error:', err);
            });
          } else {
            console.log('⏳ MathJax not ready yet, will typeset when loaded');
            // Retry after MathJax loads
            setTimeout(() => {
              if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise([element]).catch(err => console.error('❌ MathJax delayed typeset error:', err));
              }
            }, 1000);
          }
        }
        
        // DOM要素の取得
        let cameraInput, fileInput, previewImage, imagePreviewArea, cropArea, cropImage;
        let cropper = null;
        let authenticated = false;
        
        // 初期化
        document.addEventListener('DOMContentLoaded', function() {
          console.log('📱 Study Partner initialized');
          
          // DOM要素を取得
          cameraInput = document.getElementById('cameraInput');
          fileInput = document.getElementById('fileInput');
          previewImage = document.getElementById('previewImage');
          imagePreviewArea = document.getElementById('imagePreviewArea');
          cropArea = document.getElementById('cropArea');
          cropImage = document.getElementById('cropImage');
          
          // イベントリスナーを設定
          setupEventListeners();
        });
        
        function setupEventListeners() {
          // カメラ入力
          if (cameraInput) {
            cameraInput.addEventListener('change', handlePhotoSelect);
          }
          
          // ファイル入力
          if (fileInput) {
            fileInput.addEventListener('change', handlePhotoSelect);
          }
          
          // ログインボタン
          const btnLogin = document.getElementById('btnLogin');
          if (btnLogin) {
            btnLogin.addEventListener('click', handleLogin);
          }
          
          // メインのAIに質問ボタン
          const aiQuestionMainButton = document.getElementById('aiQuestionMainButton');
          if (aiQuestionMainButton) {
            aiQuestionMainButton.addEventListener('click', function() {
              console.log('🤖 Main AI question button clicked');
              openAIChatDirect();
            });
          }
          
          // 小論文対策ボタン
          const shoronbunButton = document.getElementById('shoronbunTaisaku');
          if (shoronbunButton) {
            shoronbunButton.addEventListener('click', function() {
              console.log('📝 Essay coaching button clicked');
              window.location.href = '/essay-coaching';
            });
          }
          
          // インター生用ボタン - International Student button
          const interSeiYouButton = document.getElementById('interSeiYou');
          if (interSeiYouButton) {
            interSeiYouButton.addEventListener('click', function() {
              console.log('🌍 International Student button clicked');
              
              // Generate new session ID for international student chat
              const internationalSessionId = 'intl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
              console.log('🆔 Generated international session ID:', internationalSessionId);
              
              // Redirect to international student page
              window.location.href = \`/international-student/\${internationalSessionId}\`;
            });
          }
          
          // カメラボタン - Trigger camera input (mobile: camera, desktop: file picker)
          const cameraButton = document.getElementById('cameraButton');
          if (cameraButton && cameraInput) {
            cameraButton.addEventListener('click', function() {
              console.log('📷 Camera button clicked - triggering camera input');
              if (!authenticated) {
                alert('❌ ログインが必要です。最初にログインボタンをクリックしてください。');
                return;
              }
              cameraInput.click(); // Mobile: opens camera, Desktop: opens file picker
            });
          }
          
          // ファイル選択ボタン
          const fileButton = document.getElementById('fileButton');
          if (fileButton) {
            fileButton.addEventListener('click', function() {
              console.log('📁 File button clicked');
              if (!authenticated) {
                alert('❌ ログインが必要です。最初にログインボタンをクリックしてください。');
                return;
              }
              if (fileInput) {
                fileInput.click();
              }
            });
          }
          
          // クロップボタン
          const btnStartCrop = document.getElementById('btnStartCrop');
          if (btnStartCrop) {
            btnStartCrop.addEventListener('click', startCrop);
          }
          
          const btnConfirmCrop = document.getElementById('btnConfirmCrop');
          if (btnConfirmCrop) {
            btnConfirmCrop.addEventListener('click', confirmCrop);
          }
          
          const btnCancelCrop = document.getElementById('btnCancelCrop');
          if (btnCancelCrop) {
            btnCancelCrop.addEventListener('click', cancelCrop);
          }
          
          // 送信ボタン
          const btnSendDirect = document.getElementById('btnSendDirect');
          if (btnSendDirect) {
            btnSendDirect.addEventListener('click', sendDirectly);
          }
        }
        
        // 写真選択処理
        function handlePhotoSelect(event) {
          const file = event.target.files[0];
          if (!file) return;
          
          console.log('📸 Photo selected:', file.name, file.type);
          
          // 画像プレビュー表示
          const reader = new FileReader();
          reader.onload = function(e) {
            if (previewImage) {
              previewImage.src = e.target.result;
              showImagePreview();
              
              // 短時間待ってから自動的にクロップ画面に移行
              setTimeout(() => {
                console.log('🔲 Auto starting crop after photo selection');
                startCrop();
              }, 800); // 0.8秒後に自動移行（画像表示確認のため）
            }
          };
          reader.readAsDataURL(file);
        }
        
        // 画像プレビュー表示
        function showImagePreview() {
          if (imagePreviewArea) {
            imagePreviewArea.style.display = 'block';
            
            // 自動移行メッセージを表示
            const btnStartCrop = document.getElementById('btnStartCrop');
            const btnSendDirect = document.getElementById('btnSendDirect');
            
            if (btnStartCrop) {
              btnStartCrop.innerHTML = '<i class="fas fa-hourglass-half" style="margin-right: 0.5rem;"></i>🔲 クロップ画面に移行中...';
              btnStartCrop.disabled = true;
              btnStartCrop.style.opacity = '0.7';
            }
            
            if (btnSendDirect) {
              btnSendDirect.style.display = 'none'; // 自動移行中は非表示
            }
          }
          hideArea(cropArea);
        }
        
        // クロップ開始
        function startCrop() {
          if (!previewImage || !previewImage.src) return;
          
          console.log('✂️ Starting crop');
          
          // プレビュー画像をクロップエリアにコピー
          if (cropImage) {
            cropImage.src = previewImage.src;
          }
          
          // メッセージもコピー
          const imageMessageInput = document.getElementById('imageMessageInput');
          const cropMessageInput = document.getElementById('cropMessageInput');
          if (imageMessageInput && cropMessageInput) {
            cropMessageInput.value = imageMessageInput.value;
          }
          
          showArea(cropArea);
          hideArea(imagePreviewArea);
          
          // Cropper.js初期化
          if (window.Cropper && cropImage) {
            if (cropper) {
              cropper.destroy();
            }
            
            cropper = new Cropper(cropImage, {
              aspectRatio: NaN, // フリーサイズ
              viewMode: 1,
              dragMode: 'move',
              autoCropArea: 0.95, // ほぼ全体を初期選択（0.8 → 0.95）
              restore: false,
              guides: true,
              center: true,
              highlight: false,
              cropBoxMovable: true,
              cropBoxResizable: true,
              toggleDragModeOnDblclick: false,
              ready: function() {
                console.log('✂️ Cropper initialized with almost full area selection');
              }
            });
          }
        }
        
        // クロップ確定
        function confirmCrop() {
          console.log('✅ Confirming crop');
          
          let croppedImageData = null;
          
          if (cropper) {
            // Cropper.js を使用してクロップ
            const canvas = cropper.getCroppedCanvas({
              maxWidth: 2000,
              maxHeight: 2000,
              fillColor: '#fff',
              imageSmoothingEnabled: true,
              imageSmoothingQuality: 'high',
            });
            
            croppedImageData = canvas.toDataURL('image/jpeg', 0.8);
          } else {
            // Cropper.js が利用できない場合は元画像を使用
            croppedImageData = previewImage.src;
          }
          
          // メッセージ入力欄から値を取得
          const messageInput = document.getElementById('cropMessageInput');
          const userMessage = messageInput ? messageInput.value.trim() : '';
          
          // 画像を送信
          sendAnalysisRequest(croppedImageData, true, userMessage);
        }
        
        // クロップキャンセル
        function cancelCrop() {
          console.log('❌ Canceling crop');
          
          if (cropper) {
            cropper.destroy();
            cropper = null;
          }
          
          hideArea(cropArea);
          
          // プレビューボタンを元の状態に戻す
          const btnStartCrop = document.getElementById('btnStartCrop');
          const btnSendDirect = document.getElementById('btnSendDirect');
          
          if (btnStartCrop) {
            btnStartCrop.innerHTML = '<i class="fas fa-crop" style="margin-right: 0.5rem;"></i>🔲 この範囲で解析';
            btnStartCrop.disabled = false;
            btnStartCrop.style.opacity = '1';
          }
          
          if (btnSendDirect) {
            btnSendDirect.innerHTML = '<i class="fas fa-paper-plane" style="margin-right: 0.5rem;"></i>📤 そのまま送信';
            btnSendDirect.style.display = 'flex'; // 再表示
          }
          
          // メッセージも戻す
          const imageMessageInput = document.getElementById('imageMessageInput');
          const cropMessageInput = document.getElementById('cropMessageInput');
          if (imageMessageInput && cropMessageInput) {
            imageMessageInput.value = cropMessageInput.value;
          }
          
          showImagePreview();
        }
        
        // エリア表示/非表示ヘルパー
        function showArea(element) {
          if (element) {
            element.style.display = 'block';
          }
        }
        
        function hideArea(element) {
          if (element) {
            element.style.display = 'none';
          }
        }
        
        // 直接送信
        function sendDirectly() {
          console.log('📤 Sending directly');
          
          if (previewImage && previewImage.src) {
            // メッセージ入力欄から値を取得
            const messageInput = document.getElementById('imageMessageInput');
            const userMessage = messageInput ? messageInput.value.trim() : '';
            
            sendAnalysisRequest(previewImage.src, false, userMessage);
          }
        }
        
        // ログイン処理
        async function handleLogin() {
          console.log('🔑 Login attempt started');
          
          try {
            const appkey = document.getElementById('appkey')?.value || '180418';
            const sid = document.getElementById('sid')?.value || 'JS2-04';
            
            console.log('🔍 Credentials:', { appkey, sid });
            
            // Validate input fields
            if (!appkey || !sid) {
              throw new Error('APP_KEY と Student ID を両方入力してください');
            }
            
            // Call the actual login API
            const response = await fetch('/api/login', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                appkey: appkey,
                sid: sid
              })
            });
            
            console.log('📡 Login response:', response.status, response.statusText);
            
            const data = await response.json();
            console.log('📋 Login data:', data);
            
            if (response.ok && data.success) {
              authenticated = true;
              alert('✅ ログイン成功!' + String.fromCharCode(10) + 
                    'APP_KEY: ' + appkey + String.fromCharCode(10) + 
                    'Student ID: ' + sid);
            } else {
              authenticated = false;
              throw new Error(data.message || 'ログインに失敗しました');
            }
          } catch (error) {
            console.error('❌ Login error:', error);
            authenticated = false;
            alert('❌ ログインエラー: ' + error.message);
          }
        }
        
        // 解析リクエスト送信（段階学習システム対応版）
        async function sendAnalysisRequest(imageData, cropped, userMessage = '') {
          console.log('📤 Sending analysis request, cropped:', cropped, 'message:', userMessage);
          
          if (!authenticated) {
            alert('❌ ログインが必要です。最初にログインボタンをクリックしてください。');
            return;
          }
          
          showUploadingIndicator(true);
          
          try {
            // DataURLから実際のファイルデータを取得
            const response = await fetch(imageData);
            const blob = await response.blob();
            
            // FormDataを作成
            const formData = new FormData();
            const appkey = document.getElementById('appkey')?.value || '180418';
            const sid = document.getElementById('sid')?.value || 'JS2-04';
            
            formData.append('image', blob, 'image.jpg');
            formData.append('appkey', appkey);
            formData.append('sid', sid);
            if (userMessage) {
              formData.append('message', userMessage);
            }
            
            console.log('📤 Sending to /api/analyze-and-learn with FormData');
            
            // 段階学習APIエンドポイントに送信
            const apiResponse = await fetch('/api/analyze-and-learn', {
              method: 'POST',
              body: formData,
              headers: {
                'Accept': 'application/json'
              }
            });
            
            console.log('📡 API Response:', apiResponse.status, apiResponse.statusText);
            
            if (!apiResponse.ok) {
              throw new Error('HTTP ' + apiResponse.status + ': ' + apiResponse.statusText);
            }
            
            const result = await apiResponse.json();
            console.log('📋 Analysis result:', result);
            
            if (result.ok) {
              // 段階学習システムを開始
              startLearningSystem(result);
            } else {
              throw new Error(result.message || 'API解析でエラーが発生しました');
            }
            
            showUploadingIndicator(false);
            
          } catch (error) {
            console.error('❌ Analysis error:', error);
            alert('❌ 解析エラー: ' + error.message);
            showUploadingIndicator(false);
          }
        }
        
        // 解析結果表示（生徒向け簡潔表示）
        function displayAnalysisResult(result) {
          const analysisResult = document.getElementById('analysisResult');
          const analysisContent = document.getElementById('analysisContent');
          
          if (analysisContent) {
            // 生徒向けの簡潔で励ましのメッセージのみ表示
            const studentMessage = 
              '<div style="font-size: 0.9rem; color: #374151;">' +
                '<strong>📋 問題を分析しました！</strong><br>' +
                (result.subject || '学習') + 'の問題ですね。<br>' +
                '段階的に一緒に解いていきましょう！' +
              '</div>' +
              // Phase1改善: 再生成タイプ選択UI
              '<div style="margin-top: 1rem; padding: 1rem; background: rgba(245,158,11,0.1); border-radius: 0.75rem; border: 1px solid #f59e0b;">' +
                '<div style="text-align: center; margin-bottom: 0.75rem;">' +
                  '<h4 style="margin: 0; color: #f59e0b; font-size: 0.9rem;">🎯 どのような問題に挑戦したいですか？</h4>' +
                  '<p style="margin: 0.25rem 0 0 0; font-size: 0.75rem; color: #666;">バンコクで頑張っているあなたを応援します ✨</p>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.75rem;">' +
                  '<button onclick="regenerateProblem(\\'similar\\')" ' +
                  'style="background: #10b981; color: white; border: none; padding: 0.5rem; border-radius: 0.5rem; cursor: pointer; font-size: 0.75rem; text-align: center;">' +
                  '🔄 同じような問題' +
                  '</button>' +
                  '<button onclick="regenerateProblem(\\'approach\\')" ' +
                  'style="background: #3b82f6; color: white; border: none; padding: 0.5rem; border-radius: 0.5rem; cursor: pointer; font-size: 0.75rem; text-align: center;">' +
                  '🎯 違うアプローチ' +
                  '</button>' +
                '</div>' +
                '<div style="text-align: center;">' +
                  '<button onclick="regenerateProblem(\\'full\\')" id="regenerateButton" ' +
                  'style="background: #f59e0b; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.5rem; cursor: pointer; font-size: 0.75rem; font-weight: 500;">' +
                  '<i class="fas fa-sync-alt" style="margin-right: 0.5rem;"></i>完全に新しいパターン' +
                  '</button>' +
                '</div>' +
              '</div>';
            analysisContent.innerHTML = studentMessage;
            
            if (analysisResult) {
              analysisResult.style.display = 'block';
            }
          }
          
          // 詳細分析は内部ログのみ（生徒には非表示）
          if (result.analysis) {
            console.log('🔍 詳細分析結果（内部用）:', result.analysis);
          }
        }
        
        // アップロード中インジケーター
        function showUploadingIndicator(show) {
          const indicator = document.getElementById('uploadingIndicator');
          if (indicator) {
            indicator.style.display = show ? 'block' : 'none';
          }
        }
        
        // === 段階学習システム ===
        
        let currentSession = null;
        
        // 段階学習システム開始
        function startLearningSystem(result) {
          console.log('📚 Starting learning system with session:', result.sessionId);
          
          currentSession = result;
          
          // 解析結果を表示
          displayAnalysisResult(result);
          
          // 最初のステップを表示
          displayLearningStep(result);
          
          // AI質問ボタンを表示
          showAIQuestionButton();
        }
        
        // 段階学習ステップ表示
        function displayLearningStep(result) {
          console.log('📚 Displaying learning step:', result.currentStep.stepNumber);
          console.log('🔍 Step details:', {
            stepNumber: result.currentStep.stepNumber,
            instruction: result.currentStep.instruction,
            type: result.currentStep.type,
            options: result.currentStep.options,
            optionsLength: result.currentStep.options ? result.currentStep.options.length : 'undefined'
          });
          
          const out = document.getElementById('out');
          if (!out) return;
          
          const step = result.currentStep;
          
          let stepHtml = '<div style="padding: 1.5rem; background: linear-gradient(135deg, #f0f9ff, #ffffff); border: 2px solid #0369a1; border-radius: 0.75rem; margin-bottom: 1.5rem;">';
          stepHtml += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
          stepHtml += '<div style="background: #0369a1; color: white; width: 2rem; height: 2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 0.75rem;">' + (step.stepNumber + 1) + '</div>';
          stepHtml += '<h3 style="margin: 0; color: #0369a1;">📚 Step ' + (step.stepNumber + 1) + ' / ' + result.totalSteps + '</h3>';
          stepHtml += '</div>';
          
          stepHtml += '<p style="margin: 0 0 1.5rem 0; line-height: 1.6; font-size: 1rem;">' + step.instruction + '</p>';
          
          if (step.type === 'choice') {
            // 選択肢が存在しない場合のフォールバック処理
            if (!step.options || !Array.isArray(step.options) || step.options.length === 0) {
              console.error('❌ No options found for choice step, creating fallback options');
              step.options = [
                "A) 選択肢が読み込めませんでした",
                "B) もう一度お試しください", 
                "C) システムエラーが発生しています",
                "D) 管理者にお知らせください"
              ];
              step.correctAnswer = "A";
            }
            
            stepHtml += '<div style="margin-bottom: 1.5rem;">';
            for (let i = 0; i < step.options.length; i++) {
              stepHtml += '<label style="display: block; margin-bottom: 0.75rem; padding: 0.75rem; background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 0.5rem; cursor: pointer; transition: all 0.2s; line-height: 1.5; word-wrap: break-word;">';
              stepHtml += '<input type="radio" name="stepChoice" value="' + step.options[i].charAt(0) + '" style="margin-right: 0.5rem; vertical-align: top;">';
              stepHtml += '<span style="display: inline; font-weight: 500;">' + step.options[i] + '</span>';
              stepHtml += '</label>';
            }
            stepHtml += '</div>';
            
            stepHtml += '<button onclick="submitStepAnswer()" ';
            stepHtml += 'style="background: #0369a1; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500; font-size: 1rem;">';
            stepHtml += '📝 回答する</button>';
          }
          
          stepHtml += '</div>';
          
          out.innerHTML = stepHtml;
          typesetMath(out);
        }
        
        // ステップ回答送信
        async function submitStepAnswer() {
          const selectedOption = document.querySelector('input[name="stepChoice"]:checked');
          if (!selectedOption) {
            alert('❌ 選択肢を選んでください');
            return;
          }
          
          const answer = selectedOption.value;
          const currentStep = currentSession.currentStep;
          
          console.log('📝 Step answer submitted:', answer, 'stepNumber:', currentStep.stepNumber);
          
          try {
            // ステップ回答チェックAPIを呼び出し
            const response = await fetch('/api/step/check', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                sessionId: currentSession.sessionId,
                stepNumber: currentStep.stepNumber,
                answer: answer
              })
            });
            
            console.log('📡 Step check response:', response.status);
            
            if (!response.ok) {
              throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            
            const result = await response.json();
            console.log('📋 Step check result:', result);
            
            if (result.ok) {
              // 回答結果に応じて次のアクションを決定
              if (result.isCorrect) {
                displayStepResult(true, result.feedback, answer);
                
                // 次のアクションに応じて処理を分岐
                if (result.nextAction === 'next_step') {
                  // 次のステップがある場合
                  setTimeout(() => {
                    currentSession.currentStep = result.nextStep;
                    displayLearningStep(currentSession);
                  }, 3000);
                } else if (result.nextAction === 'confirmation') {
                  // 確認問題に進む場合
                  setTimeout(() => {
                    currentSession.confirmationProblem = result.confirmationProblem;
                    startConfirmationProblem();
                  }, 3000);
                }
              } else {
                // 不正解の場合
                displayStepResult(false, result.feedback, answer);
              }
            } else {
              throw new Error(result.message || 'ステップチェックでエラーが発生しました');
            }
            
          } catch (error) {
            console.error('❌ Step check error:', error);
            alert('❌ ステップチェックエラー: ' + error.message);
          }
        }
        
        // ステップ結果表示
        function displayStepResult(isCorrect, explanation, userAnswer) {
          const out = document.getElementById('out');
          if (!out) return;
          
          let resultHtml = '<div style="padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1.5rem; border: 2px solid ';
          
          if (isCorrect) {
            resultHtml += '#16a34a; background: linear-gradient(135deg, #dcfce7, #ffffff);">';
            resultHtml += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            resultHtml += '<div style="background: #16a34a; color: white; width: 2rem; height: 2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem;">✓</div>';
            resultHtml += '<h4 style="margin: 0; color: #16a34a; font-size: 1.25rem;">🎉 正解です！よくできました！</h4>';
            resultHtml += '</div>';
          } else {
            resultHtml += '#dc2626; background: linear-gradient(135deg, #fee2e2, #ffffff);">';
            resultHtml += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            resultHtml += '<div style="background: #dc2626; color: white; width: 2rem; height: 2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem;">✗</div>';
            resultHtml += '<h4 style="margin: 0; color: #dc2626; font-size: 1.25rem;">📖 もう一度考えてみましょう</h4>';
            resultHtml += '</div>';
            resultHtml += '<p style="margin: 0 0 1rem 0; color: #dc2626; font-weight: 500;">あなたの答え: ' + userAnswer + '</p>';
            resultHtml += '<p style="margin: 0 0 1rem 0; color: #dc2626; font-weight: 500;">正解: ' + currentSession.currentStep.correctAnswer + '</p>';
          }
          
          resultHtml += '<div style="background: rgba(255,255,255,0.8); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">';
          resultHtml += '<p style="margin: 0; line-height: 1.6;"><strong>💡 解説:</strong><br>' + explanation + '</p>';
          resultHtml += '</div>';
          
          if (isCorrect) {
            // 正解時は既にsubmitStepAnswerでAPIからの指示に従って自動処理されている
            resultHtml += '<div style="text-align: center;">';
            resultHtml += '<div style="display: inline-flex; align-items: center; gap: 0.5rem; color: #16a34a; font-weight: 500;">';
            resultHtml += '<div class="loading-spinner" style="width: 16px; height: 16px;"></div>';
            resultHtml += '<span>次のステップを準備しています...</span>';
            resultHtml += '</div>';
            resultHtml += '</div>';
          } else {
            resultHtml += '<div style="text-align: center;">';
            resultHtml += '<button onclick="retryCurrentStep()" style="background: #dc2626; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">🔄 もう一度挑戦</button>';
            resultHtml += '</div>';
          }
          
          resultHtml += '</div>';
          out.innerHTML = resultHtml;
          typesetMath(out);
        }
        
        // 次のステップに進む（APIレスポンスから自動的に処理される）
        function goToNextStep() {
          console.log('📚 Moving to next step - handled by API response');
          // この関数はAPIレスポンスで自動的に処理されるため、
          // 特別な処理は不要（既にsubmitStepAnswerで処理済み）
        }
        
        // 現在のステップを再試行
        function retryCurrentStep() {
          console.log('🔄 Retrying current step');
          displayLearningStep(currentSession);
        }
        
        // 確認問題開始
        function startConfirmationProblem() {
          console.log('🎯 Starting confirmation problem');
          displayConfirmationProblem();
        }
        
        // 確認問題表示
        function displayConfirmationProblem() {
          const out = document.getElementById('out');
          if (!out) return;
          
          const problem = currentSession.confirmationProblem;
          
          let html = '<div style="padding: 1.5rem; background: linear-gradient(135deg, #fef3c7, #ffffff); border: 2px solid #d97706; border-radius: 0.75rem; margin-bottom: 1.5rem;">';
          html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
          html += '<div style="background: #d97706; color: white; width: 2rem; height: 2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 0.75rem;">?</div>';
          html += '<h3 style="margin: 0; color: #d97706; font-size: 1.25rem;">🎯 確認問題</h3>';
          html += '</div>';
          
          html += '<p style="margin: 0 0 1.5rem 0; line-height: 1.6; font-size: 1rem;">' + problem.question + '</p>';
          
          if (problem.type === 'choice') {
            html += '<div style="margin-bottom: 1.5rem;">';
            for (let i = 0; i < problem.options.length; i++) {
              html += '<label style="display: block; margin-bottom: 0.75rem; padding: 0.75rem; background: #fefce8; border: 2px solid #fde68a; border-radius: 0.5rem; cursor: pointer; transition: all 0.2s; line-height: 1.5; word-wrap: break-word;">';
              html += '<input type="radio" name="confirmChoice" value="' + problem.options[i].charAt(0) + '" style="margin-right: 0.5rem; vertical-align: top;">';
              html += '<span style="display: inline; font-weight: 500;">' + problem.options[i] + '</span>';
              html += '</label>';
              html += '</label>';
            }
            html += '</div>';
            
            html += '<button onclick="submitConfirmationAnswer()" ';
            html += 'style="background: #d97706; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500; font-size: 1rem;">';
            html += '🎯 確認問題を解く</button>';
          }
          
          html += '</div>';
          out.innerHTML = html;
          typesetMath(out);
        }
        
        // 確認問題回答送信
        async function submitConfirmationAnswer() {
          const selectedOption = document.querySelector('input[name="confirmChoice"]:checked');
          if (!selectedOption) {
            alert('❌ 選択肢を選んでください');
            return;
          }
          
          const answer = selectedOption.value;
          
          console.log('🎯 Confirmation answer submitted:', answer);
          
          try {
            // 確認問題回答チェックAPIを呼び出し
            const response = await fetch('/api/confirmation/check', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                sessionId: currentSession.sessionId,
                answer: answer
              })
            });
            
            console.log('📡 Confirmation check response:', response.status);
            
            if (!response.ok) {
              throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            
            const result = await response.json();
            console.log('📋 Confirmation check result:', result);
            
            if (result.ok) {
              displayConfirmationResult(result.isCorrect, result.feedback, answer, result.nextAction);
            } else {
              throw new Error(result.message || '確認問題チェックでエラーが発生しました');
            }
            
          } catch (error) {
            console.error('❌ Confirmation check error:', error);
            alert('❌ 確認問題チェックエラー: ' + error.message);
          }
        }
        
        // 確認問題結果表示
        function displayConfirmationResult(isCorrect, explanation, userAnswer, nextAction) {
          const out = document.getElementById('out');
          if (!out) return;
          
          let html = '<div style="padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1.5rem; border: 2px solid ';
          
          if (isCorrect) {
            html += '#16a34a; background: linear-gradient(135deg, #dcfce7, #ffffff);">';
            html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            html += '<div style="background: #16a34a; color: white; width: 2.5rem; height: 2.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem; font-size: 1.25rem;">🎉</div>';
            html += '<h4 style="margin: 0; color: #16a34a; font-size: 1.25rem;">🏆 確認問題正解！素晴らしいです！</h4>';
            html += '</div>';
          } else {
            html += '#dc2626; background: linear-gradient(135deg, #fee2e2, #ffffff);">';
            html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            html += '<div style="background: #dc2626; color: white; width: 2.5rem; height: 2.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem;">❌</div>';
            html += '<h4 style="margin: 0; color: #dc2626; font-size: 1.25rem;">📚 確認問題：もう少し復習しましょう</h4>';
            html += '</div>';
            html += '<p style="margin: 0 0 1rem 0; color: #dc2626; font-weight: 500;">あなたの答え: ' + userAnswer + '</p>';
            html += '<p style="margin: 0 0 1rem 0; color: #dc2626; font-weight: 500;">正解: ' + currentSession.confirmationProblem.correctAnswer + '</p>';
          }
          
          html += '<div style="background: rgba(255,255,255,0.8); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">';
          html += '<p style="margin: 0; line-height: 1.6;"><strong>💡 解説:</strong><br>' + explanation + '</p>';
          html += '</div>';
          
          if (isCorrect) {
            if (nextAction === 'similar_problems') {
              // 類似問題フェーズに移行
              html += '<div style="text-align: center;">';
              html += '<p style="margin-bottom: 1rem; color: #16a34a;">🚀 次は類似問題にチャレンジしましょう！</p>';
              html += '<button onclick="startSimilarProblems()" style="background: #7c3aed; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">📚 類似問題を始める</button>';
              html += '</div>';
            } else {
              // 従来の完了メッセージ
              html += '<div style="text-align: center;">';
              html += '<p style="margin-bottom: 1rem; color: #16a34a;">🎊 学習完了！お疲れさまでした！</p>';
              html += '<div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">';
              html += '<button onclick="location.reload()" style="background: #16a34a; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">🔄 新しい問題に挑戦</button>';
              html += '</div>';
            }
          } else {
            html += '<div style="text-align: center;">';
            html += '<button onclick="displayConfirmationProblem()" style="background: #dc2626; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">🔄 もう一度挑戦</button>';
            html += '</div>';
          }
          
          html += '</div>';
          out.innerHTML = html;
          typesetMath(out);
        }
        
        // === 類似問題システム ===
        
        let currentSimilarProblem = 0;
        
        // 類似問題開始
        async function startSimilarProblems() {
          console.log('🔥 Starting similar problems');
          console.log('📋 Current session:', currentSession);
          
          if (!currentSession) {
            console.error('❌ No current session found');
            alert('❌ セッションが見つかりません。最初からやり直してください。');
            return;
          }
          
          // デバッグ用：サーバーからセッションデータを確認
          try {
            const debugResponse = await fetch('/api/debug/session/' + currentSession.sessionId);
            const debugData = await debugResponse.json();
            console.log('🔍 Server session debug:', debugData);
          } catch (error) {
            console.error('❌ Debug fetch error:', error);
          }
          
          // セッションデータの構造をチェック
          console.log('📋 Session keys:', Object.keys(currentSession));
          console.log('📋 Has similarProblems:', !!currentSession.similarProblems);
          console.log('📋 similarProblems type:', typeof currentSession.similarProblems);
          console.log('📋 similarProblems value:', currentSession.similarProblems);
          
          if (!currentSession.analysis) {
            console.error('❌ No analysis data found');
            alert('❌ 学習データが見つかりません。最初からやり直してください。');
            return;
          }
          
          if (!currentSession.similarProblems) {
            console.error('❌ No similar problems found');
            console.log('📋 Session structure:', currentSession);
            alert('❌ 類似問題データが見つかりません。最初からやり直してください。');
            return;
          }
          
          console.log('📚 Similar problems found:', currentSession.similarProblems.length);
          currentSimilarProblem = 0;
          displaySimilarProblem(1);
        }
        
        // 類似問題表示
        function displaySimilarProblem(problemNumber) {
          const out = document.getElementById('out');
          if (!out) return;
          
          const problems = currentSession.similarProblems;
          const problem = problems[problemNumber - 1];
          
          if (!problem) {
            console.error('❌ Similar problem not found:', problemNumber);
            return;
          }
          
          currentSimilarProblem = problemNumber;
          
          let html = '<div style="padding: 1.5rem; background: linear-gradient(135deg, #f3e8ff, #ffffff); border: 2px solid #7c3aed; border-radius: 0.75rem; margin-bottom: 1.5rem;">';
          html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
          html += '<div style="background: #7c3aed; color: white; width: 2.5rem; height: 2.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 0.75rem;">' + problemNumber + '</div>';
          html += '<h3 style="margin: 0; color: #7c3aed; font-size: 1.25rem;">📚 類似問題 ' + problemNumber + '/' + problems.length + '</h3>';
          html += '</div>';
          
          html += '<p style="margin: 0 0 1.5rem 0; line-height: 1.6; font-size: 1rem; white-space: pre-wrap;">' + problem.question + '</p>';
          
          if (problem.type === 'choice') {
            // 選択肢問題
            html += '<div style="margin-bottom: 1.5rem;">';
            for (let i = 0; i < problem.options.length; i++) {
              html += '<label style="display: block; margin-bottom: 0.75rem; padding: 0.75rem; background: #faf5ff; border: 2px solid #e9d5ff; border-radius: 0.5rem; cursor: pointer; transition: all 0.2s; line-height: 1.5; word-wrap: break-word;">';
              html += '<input type="radio" name="similarChoice" value="' + problem.options[i].charAt(0) + '" style="margin-right: 0.5rem; vertical-align: top;">';
              html += '<span style="display: inline; font-weight: 500;">' + problem.options[i] + '</span>';
              html += '</label>';
            }
            html += '</div>';
            
            html += '<button onclick="submitSimilarAnswer()" ';
            html += 'style="background: #7c3aed; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500; font-size: 1rem;">';
            html += '📝 答えを送信</button>';
            
          } else if (problem.type === 'input') {
            // 記述問題
            html += '<div style="margin-bottom: 1.5rem;">';
            html += '<textarea id="similarInput" placeholder="ここに答えを入力してください..." ';
            html += 'style="width: 100%; padding: 1rem; border: 2px solid #e9d5ff; border-radius: 0.5rem; font-size: 1rem; line-height: 1.5; min-height: 80px; resize: vertical; box-sizing: border-box;"></textarea>';
            html += '</div>';
            
            html += '<button onclick="submitSimilarAnswer()" ';
            html += 'style="background: #7c3aed; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500; font-size: 1rem;">';
            html += '📝 答えを送信</button>';
          }
          
          html += '</div>';
          out.innerHTML = html;
          typesetMath(out);
        }
        
        // 類似問題回答送信
        async function submitSimilarAnswer() {
          const problems = currentSession.similarProblems;
          const problem = problems[currentSimilarProblem - 1];
          let answer = '';
          
          if (problem.type === 'choice') {
            const selectedOption = document.querySelector('input[name="similarChoice"]:checked');
            if (!selectedOption) {
              alert('❌ 選択肢を選んでください');
              return;
            }
            answer = selectedOption.value;
          } else if (problem.type === 'input') {
            const inputElement = document.getElementById('similarInput');
            if (!inputElement || !inputElement.value.trim()) {
              alert('❌ 答えを入力してください');
              return;
            }
            answer = inputElement.value.trim();
          }
          
          console.log('📚 Similar answer submitted:', { problemNumber: currentSimilarProblem, answer });
          
          try {
            // 類似問題回答チェックAPIを呼び出し
            const response = await fetch('/api/similar/check', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                sessionId: currentSession.sessionId,
                problemNumber: currentSimilarProblem,
                answer: answer
              })
            });
            
            console.log('📡 Similar check response:', response.status);
            
            if (!response.ok) {
              throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            
            const result = await response.json();
            console.log('📋 Similar check result:', result);
            
            if (result.ok) {
              displaySimilarResult(result.isCorrect, result.feedback, answer, result.nextAction, result.completedProblems, result.totalProblems);
            } else {
              throw new Error(result.message || '類似問題チェックでエラーが発生しました');
            }
            
          } catch (error) {
            console.error('❌ Similar check error:', error);
            alert('❌ 類似問題チェックエラー: ' + error.message);
          }
        }
        
        // 類似問題結果表示
        function displaySimilarResult(isCorrect, explanation, userAnswer, nextAction, completedProblems, totalProblems) {
          const out = document.getElementById('out');
          if (!out) return;
          
          let html = '<div style="padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1.5rem; border: 2px solid ';
          
          if (isCorrect) {
            html += '#16a34a; background: linear-gradient(135deg, #dcfce7, #ffffff);">';
            html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            html += '<div style="background: #16a34a; color: white; width: 2.5rem; height: 2.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem; font-size: 1.25rem;">✅</div>';
            html += '<h4 style="margin: 0; color: #16a34a; font-size: 1.25rem;">🎉 類似問題' + currentSimilarProblem + '正解！</h4>';
            html += '</div>';
          } else {
            html += '#dc2626; background: linear-gradient(135deg, #fee2e2, #ffffff);">';
            html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            html += '<div style="background: #dc2626; color: white; width: 2.5rem; height: 2.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem;">❌</div>';
            html += '<h4 style="margin: 0; color: #dc2626; font-size: 1.25rem;">📚 類似問題' + currentSimilarProblem + '：もう一度考えてみましょう</h4>';
            html += '</div>';
            html += '<p style="margin: 0 0 1rem 0; color: #dc2626; font-weight: 500;">あなたの答え: ' + userAnswer + '</p>';
          }
          
          html += '<div style="background: rgba(255,255,255,0.8); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">';
          html += '<p style="margin: 0; line-height: 1.6; white-space: pre-wrap;"><strong>💡 解説:</strong><br>' + explanation + '</p>';
          html += '</div>';
          
          // 進捗表示
          html += '<div style="background: rgba(124,58,237,0.1); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">';
          html += '<p style="margin: 0; font-weight: 500; color: #7c3aed;">📊 進捗: ' + completedProblems + '/' + totalProblems + '問正解</p>';
          html += '</div>';
          
          if (isCorrect) {
            if (nextAction === 'next_problem') {
              // 次の類似問題に進む
              html += '<div style="text-align: center;">';
              html += '<button onclick="displaySimilarProblem(' + (currentSimilarProblem + 1) + ')" style="background: #7c3aed; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">➡️ 次の類似問題へ</button>';
              html += '</div>';
            } else if (nextAction === 'all_completed') {
              // すべての類似問題完了
              html += '<div style="text-align: center;">';
              html += '<p style="margin-bottom: 1rem; color: #16a34a; font-weight: 600; font-size: 1.1rem;">🎊 すべての類似問題が完了しました！お疲れ様でした！</p>';
              html += '<div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">';
              html += '<button onclick="location.reload()" style="background: #16a34a; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">🔄 新しい問題に挑戦</button>';
              html += '</div>';
              html += '</div>';
            }
          } else {
            html += '<div style="text-align: center;">';
            html += '<button onclick="displaySimilarProblem(' + currentSimilarProblem + ')" style="background: #dc2626; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">🔄 もう一度挑戦</button>';
            html += '</div>';
          }
          
          html += '</div>';
          out.innerHTML = html;
        }

        // === AI質問システム ===
        
        // AI質問ボタンの表示制御
        function showAIQuestionButton() {
          const aiButton = document.getElementById('aiQuestionButton');
          if (aiButton && currentSession) {
            aiButton.style.display = 'block';
          }
        }
        
        function hideAIQuestionButton() {
          const aiButton = document.getElementById('aiQuestionButton');
          if (aiButton) {
            aiButton.style.display = 'none';
          }
        }
        
        // AI質問ウインドウを開く
        function openAIChat() {
          console.log('🤖 Opening AI chat window (direct mode) - V2 Simple Version');
          
          // 汎用的なセッションIDを生成
          const directSessionId = 'direct_' + Date.now() + '_' + Math.random().toString(36).substring(7);
          
          // 新しいウインドウでAIチャットを開く（V2版：シンプルで安定した実装）
          const windowFeatures = 'width=800,height=700,scrollbars=yes,resizable=yes,status=no,location=no,toolbar=no,menubar=no';
          const aiWindow = window.open('/ai-chat-v2/' + directSessionId, 'ai-chat-v2', windowFeatures);
          
          if (!aiWindow) {
            alert('❌ ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。');
          } else {
            // ウインドウにフォーカスを移す
            aiWindow.focus();
          }
        }
        
        // 学習セッション無しでAIチャットを開く（メインボタン用）
        function openAIChatDirect() {
          console.log('🤖 Opening direct AI chat window - V2 Simple Version');
          
          // 汎用的なセッションIDを生成
          const directSessionId = 'direct_' + Date.now() + '_' + Math.random().toString(36).substring(7);
          
          // 新しいウインドウでAIチャットを開く（V2版：シンプルで安定した実装）
          const windowFeatures = 'width=800,height=700,scrollbars=yes,resizable=yes,status=no,location=no,toolbar=no,menubar=no';
          const aiWindow = window.open('/ai-chat-v2/' + directSessionId, 'ai-chat-v2', windowFeatures);
          
          if (!aiWindow) {
            alert('❌ ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。');
          } else {
            // ウインドウにフォーカスを移す
            aiWindow.focus();
          }
        }

        // === 問題再生成機能（Step 2: フロントエンド実装） ===
        
        // 問題再生成関数
        async function regenerateProblem(regenerationType = 'full') {
          console.log('🔄 Regenerate problem called, type:', regenerationType);
          
          if (!authenticated) {
            alert('❌ ログインが必要です');
            return;
          }
          
          if (!currentSession) {
            alert('❌ 学習セッションが見つかりません');
            return;
          }
          
          // 全ての再生成ボタンを無効化してローディング表示
          const buttons = document.querySelectorAll('[onclick*="regenerateProblem"]');
          const originalButtonStates = [];
          
          buttons.forEach((button, index) => {
            originalButtonStates[index] = {
              innerHTML: button.innerHTML,
              disabled: button.disabled
            };
            button.disabled = true;
            
            // ボタンタイプに応じたローディング表示
            if (button.innerHTML.includes('同じような問題')) {
              button.innerHTML = '<div class="loading-spinner" style="display: inline-block; margin-right: 0.25rem; width: 16px; height: 16px;"></div>生成中...';
            } else if (button.innerHTML.includes('違うアプローチ')) {
              button.innerHTML = '<div class="loading-spinner" style="display: inline-block; margin-right: 0.25rem; width: 16px; height: 16px;"></div>生成中...';
            } else {
              button.innerHTML = '<div class="loading-spinner" style="display: inline-block; margin-right: 0.5rem; width: 16px; height: 16px;"></div>再生成中...';
            }
          });
          
          try {
            console.log('🔄 Sending regeneration request for session:', currentSession.sessionId);
            
            const response = await fetch('/api/regenerate-problem', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                sessionId: currentSession.sessionId,
                regenerationType: regenerationType
              })
            });
            
            console.log('📡 Regeneration response status:', response.status);
            
            if (!response.ok) {
              throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            
            const result = await response.json();
            console.log('📋 Regeneration result:', result);
            
            if (result.ok) {
              // セッション情報を更新
              currentSession.analysis = result.analysis;
              currentSession.steps = result.steps;
              currentSession.confirmationProblem = result.confirmationProblem;
              currentSession.similarProblems = result.similarProblems;
              currentSession.currentStep = result.currentStep;
              
              // 成功時はボタンを元の状態に戻す
              buttons.forEach((button, index) => {
                if (originalButtonStates[index]) {
                  button.innerHTML = originalButtonStates[index].innerHTML;
                  button.disabled = originalButtonStates[index].disabled;
                }
              });
              
              // 学習システムを新しいデータで再開
              alert('✅ 新しいパターンの問題を生成しました！');
              displayLearningStep(result);
              
              return; // 成功時はreturnして、finallyブロックの実行を回避
            } else {
              throw new Error(result.message || '再生成に失敗しました');
            }
            
          } catch (error) {
            console.error('❌ Regeneration error:', error);
            
            // Step 4: エラーハンドリング強化 - より詳細で分かりやすいエラーメッセージ
            let errorMessage = '❌ 問題の再生成に失敗しました';
            
            if (error.message.includes('HTTP 500')) {
              errorMessage = '❌ AI機能に問題が発生しています。少し時間をおいてから再度お試しください。';
            } else if (error.message.includes('HTTP 404')) {
              errorMessage = '❌ 学習セッションが見つかりません。ページを更新してもう一度お試しください。';
            } else if (error.message.includes('HTTP 400')) {
              errorMessage = '❌ リクエストに問題があります。ページを更新してもう一度お試しください。';
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
              errorMessage = '❌ ネットワーク接続に問題があります。インターネット接続を確認してください。';
            } else if (error.message.includes('timeout')) {
              errorMessage = '❌ 処理に時間がかかりすぎています。もう一度お試しください。';
            } else {
              errorMessage = '❌ 問題の再生成に失敗しました。もう一度お試しいただくか、ページを更新してください。';
            }
            
            alert(errorMessage + String.fromCharCode(10) + String.fromCharCode(10) + '（エラー詳細: ' + error.message + '）');
          } finally {
            // 全てのボタンを元の状態に戻す
            buttons.forEach((button, index) => {
              if (originalButtonStates[index]) {
                button.innerHTML = originalButtonStates[index].innerHTML;
                button.disabled = originalButtonStates[index].disabled;
                button.style.display = 'inline-block'; // エラー時もボタンを再表示
              }
            });
          }
        }

        // === Study Partner Camera Functions ===
        let streamSP = null;
        let capturedImageDataSP = '';
        let cropperSP = null;
        
        async function startCamera() {
          try {
            console.log('📷 Starting Study Partner camera...');
            const preview = document.getElementById('cameraPreviewSP');
            if (!preview) {
              console.error('❌ Camera preview element not found');
              return;
            }
            
            streamSP = await navigator.mediaDevices.getUserMedia({ 
              video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
            });
            preview.srcObject = streamSP;
            preview.play();
            
            document.getElementById('captureBtnSP').classList.remove('hidden');
            console.log('✅ Camera started successfully');
          } catch (error) {
            console.error('❌ Camera error:', error);
            alert('カメラの起動に失敗しました。\\nブラウザの設定でカメラへのアクセスを許可してください。');
            closeCameraSP();
          }
        }
        
        function capturePhotoSP() {
          const preview = document.getElementById('cameraPreviewSP');
          if (preview.videoWidth === 0) {
            alert('カメラの準備ができていません。');
            return;
          }
          
          const canvas = document.createElement('canvas');
          canvas.width = preview.videoWidth;
          canvas.height = preview.videoHeight;
          canvas.getContext('2d').drawImage(preview, 0, 0);
          capturedImageDataSP = canvas.toDataURL('image/jpeg', 0.9);
          
          if (streamSP) {
            streamSP.getTracks().forEach(track => track.stop());
            streamSP = null;
          }
          
          document.getElementById('cameraPreviewSP').classList.add('hidden');
          const img = document.getElementById('capturedImageSP');
          img.src = capturedImageDataSP;
          img.classList.remove('hidden');
          
          document.getElementById('captureBtnSP').classList.add('hidden');
          document.getElementById('retakeBtnSP').classList.remove('hidden');
          document.getElementById('cropBtnSP').classList.remove('hidden');
          document.getElementById('uploadBtnSP').classList.remove('hidden');
        }
        
        function retakePhotoSP() {
          document.getElementById('capturedImageSP').classList.add('hidden');
          document.getElementById('retakeBtnSP').classList.add('hidden');
          document.getElementById('cropBtnSP').classList.add('hidden');
          document.getElementById('uploadBtnSP').classList.add('hidden');
          startCamera();
        }
        
        function showCropInterfaceSP() {
          alert('クロップ機能は開発中です。現在の画像をそのまま使用します。');
        }
        
        function applyCropSP() {
          // クロップ適用（今は何もしない）
        }
        
        async function uploadAndProcessImageSP() {
          if (!capturedImageDataSP) {
            alert('画像がありません');
            return;
          }
          
          closeCameraSP();
          
          // 画像をプレビューエリアに表示
          if (previewImage) {
            previewImage.src = capturedImageDataSP;
            showImagePreview();
          }
          
          alert('画像を選択しました。「送信」ボタンを押してOCR処理を開始してください。');
        }
        
        function closeCameraSP() {
          if (streamSP) {
            streamSP.getTracks().forEach(track => track.stop());
            streamSP = null;
          }
          
          const modal = document.getElementById('cameraModal');
          if (modal) {
            modal.style.display = 'none';
          }
          
          // Reset UI
          document.getElementById('cameraPreviewSP').classList.remove('hidden');
          document.getElementById('capturedImageSP').classList.add('hidden');
          document.getElementById('captureBtnSP').classList.remove('hidden');
          document.getElementById('retakeBtnSP').classList.add('hidden');
          document.getElementById('cropBtnSP').classList.add('hidden');
          document.getElementById('uploadBtnSP').classList.add('hidden');
        }

        console.log('✅ Study Partner JavaScript loaded successfully');
        </script>
    </body>
    </html>
  `)
}
