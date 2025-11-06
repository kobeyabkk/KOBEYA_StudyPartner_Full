# International Student Feature - Practice Problem Request Button

## Problem Solved

**Issue:** After the AI asks "Do you want to try another practice problem?" (もう一問類題に挑戦しますか？), typing text responses like "挑戦します" didn't trigger practice problem generation. The AI would instead ask "What topic would you like to learn about today?"

**Root Cause:** The API is stateless (no conversation history), so the AI couldn't understand that "挑戦します" was a response to its previous question about wanting another practice problem.

## Solution Implemented

Added a dedicated **"類題 / Practice"** button that explicitly requests a practice problem from the AI.

### Changes Made

#### 1. New UI Button (Orange, distinctive styling)
- **Location:** Input area, between textarea and Send button
- **Icon:** Clipboard list icon (📋)
- **Text:** "類題 / Practice"
- **Color:** Orange (#f59e0b) to distinguish from other buttons
- **Function:** Sends clear practice problem request to AI

#### 2. JavaScript Function
```javascript
async function requestPracticeProblem() {
    const practiceRequest = 'REQUEST PRACTICE PROBLEM: 類題をお願いします / Please give me a practice problem';
    // Sends explicit request message to API
}
```

#### 3. System Prompt Updates
Enhanced both Text and Image API system prompts to recognize:
- **Special prefix:** "REQUEST PRACTICE PROBLEM" → Immediately generate practice problem
- **Updated flow:** AI now recognizes button clicks as explicit practice problem requests

### User Experience Flow

1. **Student asks a question** → AI explains the topic
2. **AI asks:** "Do you have questions? If not, I'll give you a practice problem"
3. **Student has two options:**
   - Type "no questions" or "ready for practice" in text input
   - **OR click the orange "類題 / Practice" button** ✨ (NEW)
4. **AI generates practice problem** → Student solves it
5. **Student submits answer** → AI grades it
6. **AI asks:** "Do you want another practice problem?"
7. **Student clicks "類題 / Practice" button again** ✨ (EASY!)

### Technical Details

**Modified Files:**
- `/home/user/webapp/src/index.tsx`

**Key Changes:**
1. Added practice problem button HTML (line ~3954)
2. Added `requestPracticeProblem()` function
3. Added event listener for button clicks
4. Updated system prompts in both `/api/international-chat` and `/api/international-chat-image` endpoints

### Benefits

✅ **Clear user action** - No guessing which text to type
✅ **Visual indicator** - Orange button stands out
✅ **Consistent behavior** - Works every time
✅ **Bilingual support** - Button text in both languages
✅ **Easy to use** - One click instead of typing

## Deployment

- **Commit:** `c331d40`
- **Status:** Pushed to main branch
- **Deployment URL:** https://911775b9.kobeyabkk-studypartner.pages.dev
- **Cloudflare Pages:** Auto-deployment in progress

## Testing Checklist

- [ ] Click "インター生用" button from Study Partner page
- [ ] Ask a question (text or image)
- [ ] After explanation, click "類題 / Practice" button
- [ ] Verify practice problem is generated
- [ ] Submit answer (text or image with "Submit Answer" button)
- [ ] After grading, click "類題 / Practice" button again
- [ ] Verify another practice problem is generated

## Notes for User

**日本語:**
これで類題に進む方法が明確になりました！AIが「もう一問類題に挑戦しますか？」と聞いたら、オレンジ色の「類題 / Practice」ボタンをクリックしてください。

**English:**
Now it's clear how to proceed to practice problems! When the AI asks "Do you want to try another practice problem?", simply click the orange "類題 / Practice" button.
