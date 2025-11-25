# Vocabulary Definition Generation System

## 📚 Overview

Automatic vocabulary definition generation system using OpenAI's GPT-4o-mini to provide high-quality, learner-appropriate definitions for English words encountered in Eiken practice questions.

## 🎯 Features

### 1. **LLM-Powered Definition Generation**
- Uses OpenAI GPT-4o-mini for cost-effective, high-quality definitions
- Generates both Japanese and English definitions
- Includes example sentences with translations
- Tailored to CEFR level of the learner

### 2. **Cache-First Strategy**
- Checks database for existing definitions before generating
- Saves generated definitions to database for reuse
- Minimizes API calls and costs
- Improves response time for frequently encountered words

### 3. **Smart UI Integration**
- Automatic definition fetching when vocabulary popup opens
- Loading spinner during generation
- Graceful error handling with fallback messages
- Displays both Japanese and English definitions
- Shows example sentences when available

### 4. **Batch Processing Support**
- Single word generation: `/api/vocabulary/define`
- Batch generation: `/api/vocabulary/define/batch`
- Rate limiting to respect API quotas
- Progress tracking for bulk operations

## 🏗️ Architecture

### Service Layer: `VocabularyDefinitionGenerator`

```typescript
// Location: /src/eiken/services/vocabulary-definition-generator.ts

class VocabularyDefinitionGenerator {
  // Generate definition for single word
  async generateDefinition(word, pos, cefrLevel)
  
  // Generate definitions for multiple words
  async generateBatch(words)
  
  // Cache-first: check DB, then generate if needed
  async getOrGenerateDefinition(word, pos, cefrLevel)
  
  // Save generated definition to database
  async saveDefinition(definition)
}
```

### API Endpoints

#### POST `/api/vocabulary/define`
Generate or retrieve definition for a single word.

**Request:**
```json
{
  "word": "persistent",
  "pos": "adjective",
  "cefr_level": "B2"
}
```

**Response:**
```json
{
  "success": true,
  "definition": {
    "word": "persistent",
    "pos": "adjective",
    "definition_en": "Continuing to do something despite difficulties...",
    "definition_ja": "困難や反対があっても、何かを続けること...",
    "cefr_level": "B2",
    "example_sentence_en": "Her persistent efforts paid off...",
    "example_sentence_ja": "彼女の粘り強い努力が実を結び..."
  }
}
```

#### POST `/api/vocabulary/define/batch`
Generate definitions for multiple words at once.

**Request:**
```json
{
  "words": [
    { "word": "persistent", "pos": "adjective", "cefr_level": "B2" },
    { "word": "navigate", "pos": "verb", "cefr_level": "B1" }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    { "success": true, "word": "persistent", "definition": {...} },
    { "success": true, "word": "navigate", "definition": {...} }
  ],
  "total": 2,
  "succeeded": 2,
  "failed": 0
}
```

### UI Component: `VocabularyPopup`

```typescript
// Location: /src/components/eiken/VocabularyPopup.tsx

// Automatic definition fetching on mount
useEffect(() => {
  // 1. Check if definitions already exist
  // 2. Call /api/vocabulary/define if needed
  // 3. Display loading state
  // 4. Handle errors gracefully
  // 5. Update UI with generated definitions
}, [note.word]);
```

**UI States:**
- **Loading**: Spinner with "定義を生成中..." message
- **Success**: Display Japanese + English definitions + examples
- **Error**: Show error message with fallback text
- **Cached**: Instant display if definition exists in database

## 💾 Database Schema

### Updated Columns in `eiken_vocabulary_lexicon`

```sql
-- Definition storage
definition_ja TEXT         -- Japanese definition
definition_en TEXT         -- English definition

-- Metadata
definition_source TEXT DEFAULT 'pending'  -- 'llm_generated', 'manual', 'pending'
last_definition_update TEXT               -- ISO timestamp of last update
```

## 🔄 Definition Generation Flow

```
User clicks vocabulary marker (📚)
    ↓
VocabularyPopup opens
    ↓
Check if definitions exist
    ↓
    ├─→ [EXISTS] Display immediately
    └─→ [MISSING] Call /api/vocabulary/define
            ↓
        Check database cache
            ↓
            ├─→ [CACHED] Return from DB
            └─→ [NOT CACHED] Generate with OpenAI
                    ↓
                Parse JSON response
                    ↓
                Save to database
                    ↓
                Return to UI
                    ↓
                Display definitions + examples
```

## 🎨 Prompt Engineering

The system uses carefully crafted prompts to generate learner-appropriate definitions:

```
Generate a dictionary definition for "${word}" (${pos}, CEFR: ${cefrLevel}).

JSON format:
{
  "definition_en": "Clear English definition (1-2 sentences)",
  "definition_ja": "日本語の定義（1-2文、学習者に分かりやすく）",
  "example_en": "Natural example sentence",
  "example_ja": "例文の日本語訳"
}

Guidelines:
- Simple and appropriate for ${cefrLevel} learners
- Japanese with appropriate kanji
- Practical examples relevant to Eiken contexts
- Focus on most common usage
```

**Key Features:**
- **CEFR-aware**: Adjusts complexity based on learner level
- **Structured output**: JSON format for easy parsing
- **Bilingual**: Both English and Japanese definitions
- **Contextual examples**: Relevant to Eiken exam scenarios
- **Low temperature (0.3)**: Ensures consistent, factual definitions

## 🚀 Usage Examples

### Frontend: Display Vocabulary Popup

```typescript
// VocabularyPopup automatically fetches definitions
<VocabularyPopup
  note={{
    word: "persistent",
    pos: "adjective",
    definition_ja: "粘り強い",  // Fallback
    cefr_level: "B2",
    difficulty_score: 65,
    word_id: 12345
  }}
  onAddToNotebook={handleAdd}
  onClose={handleClose}
/>
```

### Backend: Generate Definition Programmatically

```typescript
import { VocabularyDefinitionGenerator } from './services/vocabulary-definition-generator';

const generator = new VocabularyDefinitionGenerator(db, openaiApiKey);

// Single word
const def = await generator.getOrGenerateDefinition('persistent', 'adjective', 'B2');

// Batch processing
const defs = await generator.generateBatch([
  { word: 'persistent', pos: 'adjective', cefrLevel: 'B2' },
  { word: 'navigate', pos: 'verb', cefrLevel: 'B1' }
]);
```

## 📊 Cost Optimization

### Cache-First Strategy
- **First request**: Generates and caches definition (~$0.0001)
- **Subsequent requests**: Returns cached definition (free)
- **Estimated cost**: ~$0.01 per 100 unique words

### Model Selection
- **GPT-4o-mini**: Most cost-effective for this use case
- **Input tokens**: ~200 (prompt)
- **Output tokens**: ~150 (definition + example)
- **Cost per word**: ~$0.0001

### Rate Limiting
- Batch size: 5 words per batch
- Delay between batches: 1 second
- Prevents API rate limit errors
- Spreads load over time

## 🧪 Testing

### Manual Testing

```bash
# Test single word generation
curl -X POST http://localhost:5175/api/vocabulary/define \
  -H "Content-Type: application/json" \
  -d '{"word": "persistent", "pos": "adjective", "cefr_level": "B2"}'

# Test batch generation
curl -X POST http://localhost:5175/api/vocabulary/define/batch \
  -H "Content-Type: application/json" \
  -d '{
    "words": [
      {"word": "persistent", "pos": "adjective", "cefr_level": "B2"},
      {"word": "navigate", "pos": "verb", "cefr_level": "B1"}
    ]
  }'
```

### Integration Testing
1. Start practice session
2. Generate questions with B2+ vocabulary
3. Click vocabulary marker (📚)
4. Verify definition loads automatically
5. Check example sentences display correctly
6. Confirm Add to Notebook works

## 🔒 Security Considerations

### API Key Protection
- `OPENAI_API_KEY` stored in environment variables
- Never exposed to client-side code
- Accessed only in server-side API routes

### Input Validation
- Validates required fields (word, pos)
- Sanitizes user inputs
- Limits batch size to prevent abuse

### Error Handling
- Graceful degradation on API failures
- Fallback to basic definitions
- User-friendly error messages

## 🎯 Future Enhancements

### Phase 1: Enhanced Definitions
- [ ] Add pronunciation (IPA)
- [ ] Include word frequency data
- [ ] Multiple example sentences
- [ ] Collocations and phrases

### Phase 2: Personalization
- [ ] User-specific definition complexity
- [ ] Learning history integration
- [ ] Adaptive difficulty adjustment

### Phase 3: Advanced Features
- [ ] Audio pronunciations (TTS)
- [ ] Visual aids and images
- [ ] Word family connections
- [ ] Etymology information

### Phase 4: Background Processing
- [ ] Pre-generate definitions for common B2+ words
- [ ] Scheduled batch processing
- [ ] Priority queue based on word frequency

## 📈 Performance Metrics

### Target Metrics
- **Cache Hit Rate**: >80% after initial warmup
- **Generation Time**: <3 seconds per word
- **API Success Rate**: >99%
- **User Satisfaction**: Immediate feedback with loading states

### Monitoring
- Track API call frequency
- Monitor cache hit rates
- Log generation errors
- Measure response times

## 🎓 Educational Impact

### Student Benefits
- **Better Comprehension**: Clear, level-appropriate definitions
- **Bilingual Support**: Japanese and English for deeper understanding
- **Contextual Learning**: Example sentences show real usage
- **Immediate Feedback**: No waiting for manual definitions

### Teacher Benefits
- **Automated Content**: No manual definition creation needed
- **Consistency**: Standardized quality across all words
- **Scalability**: Works for unlimited vocabulary
- **Cost-Effective**: Minimal operational costs

## 📝 Success Example

**Input:**
```json
{
  "word": "persistent",
  "pos": "adjective",
  "cefr_level": "B2"
}
```

**Generated Output:**
```json
{
  "definition_en": "Continuing to do something despite difficulties or opposition; determined and unwavering.",
  "definition_ja": "困難や反対があっても、何かを続けること。決意が強く、あきらめない様子。",
  "example_sentence_en": "Her persistent efforts to improve her English paid off when she passed the exam.",
  "example_sentence_ja": "彼女の英語を改善しようとする粘り強い努力が実を結び、試験に合格した。"
}
```

**Quality Indicators:**
- ✅ Clear and concise English definition
- ✅ Natural Japanese translation with appropriate kanji
- ✅ Relevant example for Eiken context
- ✅ Appropriate for B2 level learners

---

## 🎉 Conclusion

The vocabulary definition generation system provides automated, high-quality, learner-appropriate definitions that enhance the Eiken practice experience. By combining LLM technology with smart caching and thoughtful UI design, we've created a system that scales effortlessly while maintaining educational quality.

**Made for students. Powered by AI. 📚✨**
