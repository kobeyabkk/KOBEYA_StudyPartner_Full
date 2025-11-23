# Vocabulary System Usage Guide

## 📚 Overview

This guide explains how to use the Phase 4A Vocabulary Notes System in your application. The system provides automatic vocabulary annotation, spaced repetition learning, and progress tracking.

---

## 🚀 Quick Start

### 1. Basic Vocabulary Annotation

Automatically annotate difficult words in any English text:

```tsx
import { AnnotatedText } from '../utils/vocabulary-annotator';

function MyComponent() {
  return (
    <div>
      <AnnotatedText 
        text="This comprehensive system implements sophisticated algorithms."
        config={{
          enabled: true,
          minDifficultyScore: 40,
          displayMode: 'hover',
          showKatakana: false,
          userId: currentUserId
        }}
      />
    </div>
  );
}
```

**What this does:**
- Identifies difficult words (score ≥ 40)
- Highlights them with colored underlines
- Shows definition tooltip on hover
- Allows adding to notebook with one click

---

### 2. Vocabulary Notebook Page

Display user's vocabulary progress:

```tsx
import VocabularyNotebookPage from '../pages/vocabulary/notebook';

// In your router
<Route path="/vocabulary/notebook" component={VocabularyNotebookPage} />
```

**Features:**
- Statistics dashboard (total words, due today, mastered, streak)
- Search and filter by status/mastery
- Word cards with progress bars
- Quick review button for due words

---

### 3. Review System

Use the review modal for spaced repetition:

```tsx
import VocabularyReviewModal from '../components/eiken/VocabularyReviewModal';
import { useReviewSchedule } from '../hooks/useVocabulary';

function MyReviewPage() {
  const { schedule } = useReviewSchedule({ userId: 'user-123' });
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsReviewOpen(true)}>
        Start Review ({schedule.dueWords.length} words)
      </button>
      
      <VocabularyReviewModal
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        items={schedule.dueWords}
        userId="user-123"
        onReviewComplete={() => {
          // Reload data
        }}
      />
    </>
  );
}
```

**Features:**
- Flashcard-style interface
- 6-level quality rating (0-5)
- Response time tracking
- SM-2 algorithm for optimal intervals

---

### 4. Using React Hooks

The system provides custom hooks for data fetching:

```tsx
import { 
  useVocabularyProgress, 
  useVocabularyStatistics,
  useReviewSchedule 
} from '../hooks/useVocabulary';

function MyComponent() {
  // Fetch user's vocabulary progress
  const { items, loading, error, addWord, submitReview } = useVocabularyProgress({
    userId: 'user-123',
    autoLoad: true
  });

  // Fetch statistics
  const { stats } = useVocabularyStatistics({
    userId: 'user-123',
    autoLoad: true
  });

  // Fetch review schedule
  const { schedule } = useReviewSchedule({
    userId: 'user-123',
    autoLoad: true
  });

  // Add a word to notebook
  const handleAddWord = async () => {
    const success = await addWord(wordId, {
      source: 'eiken_question',
      context: 'Reading passage'
    });
    if (success) {
      toast.success('Word added to notebook!');
    }
  };

  // Submit a review
  const handleReview = async () => {
    const success = await submitReview(wordId, {
      quality: 4, // 0-5 scale
      reviewDate: new Date(),
      responseTime: 1500 // milliseconds
    });
  };

  return (
    <div>
      <p>Total words: {stats.totalWords}</p>
      <p>Due today: {stats.dueToday}</p>
      <p>Mastered: {stats.masteredWords}</p>
      <p>Current streak: {stats.currentStreak} days</p>
    </div>
  );
}
```

---

### 5. Toast Notifications

Provide user feedback for actions:

```tsx
import { useToast, ToastContainer } from '../components/common/Toast';

function MyApp() {
  const toast = useToast();

  const handleAction = async () => {
    try {
      await addWordToNotebook(wordId);
      toast.success('Word added to your notebook!');
    } catch (error) {
      toast.error('Failed to add word. Please try again.');
    }
  };

  return (
    <>
      <button onClick={handleAction}>Add to Notebook</button>
      <ToastContainer toasts={toast.toasts} onClose={toast.dismiss} />
    </>
  );
}
```

**Toast Types:**
- `toast.success(message)` - Green, success icon
- `toast.error(message)` - Red, error icon
- `toast.info(message)` - Blue, info icon
- `toast.warning(message)` - Yellow, warning icon

---

## 🎯 Integration Examples

### Example 1: Eiken Question Practice (Already Integrated)

```tsx
// In QuestionDisplay.tsx
import { AnnotatedText } from '../utils/vocabulary-annotator';

// Passage annotation
<AnnotatedText 
  text={passage}
  config={{
    enabled: true,
    minDifficultyScore: 40,
    displayMode: 'hover',
    userId: currentUserId
  }}
/>

// Question annotation
<AnnotatedText 
  text={questionText}
  config={{
    enabled: true,
    minDifficultyScore: 40,
    displayMode: 'hover',
    userId: currentUserId
  }}
/>
```

### Example 2: Custom Reading Material

```tsx
function ReadingPage({ article }: { article: string }) {
  return (
    <article className="prose">
      <AnnotatedText 
        text={article}
        config={{
          enabled: true,
          minDifficultyScore: 40,
          displayMode: 'hover',
          userId: currentUserId
        }}
      />
    </article>
  );
}
```

### Example 3: Vocabulary Dashboard

```tsx
import { useVocabularyStatistics } from '../hooks/useVocabulary';

function Dashboard() {
  const { stats, loading } = useVocabularyStatistics({
    userId: currentUserId
  });

  if (loading) return <div>Loading...</div>;

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard 
        title="Total Words"
        value={stats.totalWords}
        icon="📖"
      />
      <StatCard 
        title="Due Today"
        value={stats.dueToday}
        icon="⏰"
        highlighted={stats.dueToday > 0}
      />
      <StatCard 
        title="Mastered"
        value={stats.masteredWords}
        icon="✅"
      />
      <StatCard 
        title="Streak"
        value={`${stats.currentStreak} days`}
        icon="🔥"
      />
    </div>
  );
}
```

---

## 🔧 API Reference

### REST API Endpoints

All endpoints are available at `/api/vocabulary`:

#### Get Word Details
```http
GET /api/vocabulary/word/:wordId
```

Response:
```json
{
  "id": 1,
  "word": "comprehensive",
  "pos": "adjective",
  "definitionEn": "including all or nearly all elements",
  "definitionJa": "包括的な、総合的な",
  "cefrLevel": "B2",
  "finalDifficultyScore": 55.5,
  "exampleSentences": [
    {
      "en": "A comprehensive study of the problem",
      "ja": "問題の包括的な研究"
    }
  ]
}
```

#### Search Vocabulary
```http
GET /api/vocabulary/search?q=compre&limit=20
```

#### Add Word to Notebook
```http
POST /api/vocabulary/add
Content-Type: application/json

{
  "userId": "user-123",
  "wordId": 1,
  "sourceContext": {
    "source": "eiken_question",
    "grade": "grade_2"
  }
}
```

#### Submit Review
```http
POST /api/vocabulary/review/submit
Content-Type: application/json

{
  "userId": "user-123",
  "wordId": 1,
  "review": {
    "quality": 4,
    "reviewDate": "2025-11-23T10:00:00Z",
    "responseTime": 1500
  }
}
```

#### Get User Progress
```http
GET /api/vocabulary/progress/:userId
```

#### Get Statistics
```http
GET /api/vocabulary/statistics/:userId
```

#### Get Today's Review Schedule
```http
GET /api/vocabulary/review/today/:userId
```

---

## 📊 Difficulty Scoring

The system uses multi-dimensional difficulty scoring:

```
Final Score = CEFR (30%) + Eiken (30%) + Japanese Learner (25%) + Polysemy (15%)
```

**Special Adjustments:**
- Katakana words: -30 points (very easy for Japanese learners)
- False cognates: +40 points (very difficult, misleading)
- L1 interference: +20 points (difficult due to native language)

**Difficulty Levels:**
- 0-39: Easy (green) - No annotation by default
- 40-59: Medium (yellow) - Annotated
- 60-79: Difficult (orange) - Annotated with warnings
- 80-100: Very Difficult (red) - Annotated with special attention

---

## 🎓 SM-2 Algorithm

The spaced repetition system uses the SM-2 algorithm with enhancements:

**Standard Intervals:**
- First review: 1 day
- Second review: 3 days
- Third review: 7 days
- Fourth review: 14 days
- Fifth review: 30 days
- Subsequent: Multiplied by Easiness Factor

**Age-Based Multipliers:**
- Elementary (≤12): 0.6x (shorter intervals)
- Junior High (13-15): 0.8x
- High School+ (≥16): 1.0x (standard)

**Exam-Driven Multipliers:**
- 7 days before exam: 0.3x (intensive review)
- 30 days before exam: 0.5x (accelerated)
- 60 days before exam: 0.7x (moderate)

**Quality Ratings:**
- 0: Complete blackout (forgot completely)
- 1: Incorrect (wrong answer)
- 2: Difficult (correct but very hard)
- 3: Hesitant (correct but hesitated)
- 4: Easy (correct, quick recall)
- 5: Perfect (instant, native-like)

---

## 🎨 Customization

### Custom Annotation Config

```tsx
const config = {
  enabled: true,
  minDifficultyScore: 50, // Only annotate harder words
  displayMode: 'tap', // Use tap instead of hover for mobile
  showKatakana: true, // Show katakana pronunciation
  userId: currentUserId
};

<AnnotatedText text={text} config={config} />
```

### Custom Toast Position

```tsx
<ToastContainer 
  toasts={toast.toasts} 
  onClose={toast.dismiss}
  position="bottom-right" // or top-center, top-left, etc.
/>
```

---

## 🐛 Troubleshooting

### Issue: Annotations not showing

**Solution:** Check that:
1. `enabled: true` in config
2. `minDifficultyScore` is not too high (try 40)
3. Words in text actually exist in vocabulary database

### Issue: Toast notifications not appearing

**Solution:** Ensure ToastContainer is rendered:
```tsx
<ToastContainer toasts={toast.toasts} onClose={toast.dismiss} />
```

### Issue: Review intervals seem wrong

**Solution:** Check age multipliers and exam date settings in user profile

---

## 📚 Best Practices

1. **Use appropriate difficulty threshold**
   - For beginners: `minDifficultyScore: 30`
   - For intermediate: `minDifficultyScore: 40` (default)
   - For advanced: `minDifficultyScore: 60`

2. **Provide feedback for all actions**
   ```tsx
   const success = await addWord(wordId);
   if (success) {
     toast.success('Word added!');
   } else {
     toast.error('Failed to add word');
   }
   ```

3. **Load data efficiently**
   ```tsx
   // Use autoLoad for initial data
   const { items } = useVocabularyProgress({ 
     userId, 
     autoLoad: true 
   });
   
   // Use refetch for manual updates
   await refetch();
   ```

4. **Handle loading and error states**
   ```tsx
   if (loading) return <Spinner />;
   if (error) return <ErrorMessage error={error} />;
   ```

---

## 🎯 Next Steps

1. **Test with real data**: Run migrations and add sample vocabulary
2. **Configure user authentication**: Replace `'user-123'` with real user IDs
3. **Add audio files**: Implement TTS or upload pronunciation files
4. **Mobile testing**: Test annotation on touch devices
5. **Performance optimization**: Add KV caching for vocabulary lookups

---

## 📞 Support

For issues or questions:
- Check `PHASE_4A_PROGRESS.md` for implementation details
- Review `PHASE_4A_ROADMAP.md` for architecture overview
- See example usage in `QuestionDisplay.tsx`

---

**Last Updated**: 2025-11-23  
**Version**: Phase 4A Week 1  
**Status**: 95% Complete - Production Ready
