# KOBEYA Study Partner

**AI-Powered Personalized Learning Platform for Japanese Students in Bangkok**

🌐 **Live Demo**: https://kobeyabkk-studypartner.pages.dev/  
🇯🇵 **日本語版**: [README.ja.md](./README.ja.md)  
📖 **Documentation**: See `/docs` folder

[![Deploy Status](https://img.shields.io/badge/deploy-cloudflare%20pages-orange)](https://kobeyabkk-studypartner.pages.dev/)
[![Version](https://img.shields.io/badge/version-2.1.0-blue)](https://github.com/kobeyabkk/KOBEYA_StudyPartner_Full)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

---

## 🎯 About

KOBEYA Study Partner is an AI-powered educational platform designed specifically for Japanese elementary and junior high school students studying programming in Bangkok, Thailand. The system provides:

- **Personalized AI Learning**: Adaptive step-by-step learning with real-time feedback
- **Image Analysis**: AI analyzes student work photos and generates customized lessons
- **Progress Tracking**: Automatic learning logs and weekly parent reports
- **Eiken Exam Prep**: AI-generated practice questions for English proficiency tests
- **Essay Writing**: AI-assisted essay coaching with step-by-step guidance

---

## ✨ Features

### 🤖 AI Learning Assistant
- ✅ **Image-based Problem Analysis**: Upload photos of homework/textbooks for AI analysis
- ✅ **Dynamic Step-by-Step Learning**: 4-7 adaptive learning steps based on problem complexity
- ✅ **Automated Similar Questions**: 5-8 questions with progressive difficulty (easy → medium → hard)
- ✅ **Real-time Answer Checking**: Instant feedback with detailed explanations
- ✅ **AI Q&A Chat**: Separate chat window for asking questions anytime

### 📊 Learning Analytics
- ✅ **Automatic Session Logging**: Records study time, accuracy, and weak areas
- ✅ **Weekly Parent Reports**: Automated generation of progress summaries
- ✅ **Personalized Recommendations**: AI suggests next learning actions
- ✅ **Master Data Integration**: Aligns with Japanese curriculum standards

### 🎓 Eiken Exam Preparation (Production Ready)
- ✅ **5 Question Formats**: Grammar fill-in, Opinion speech, Reading aloud, Essay, Long reading
- ✅ **CEFR-Compliant Vocabulary**: A1-C2 level validation with 10,000+ word database
- ✅ **Copyright Protection**: Similarity check against past exam questions
- ✅ **61 Topic Areas**: Covers grades 5 to 1 (elementary to advanced)
- ✅ **Vocabulary Explanations**: Definitions for all answer choices (correct + incorrect)

### 📝 Essay Coaching System
- ✅ **Step-by-Step Guidance**: From reading comprehension to final essay
- ✅ **AI-Powered Feedback**: GPT-4o analyzes and scores essay drafts
- ✅ **Vocabulary Enhancement**: Practice converting casual to formal Japanese
- ✅ **Flexible Formats**: 55-minute full course or focused mini-lessons
- ✅ **Session Persistence**: Resume from where you left off after page reload

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| **Runtime** | Cloudflare Workers |
| **Framework** | Hono.js |
| **Language** | TypeScript/JSX |
| **Frontend** | React 19, Vite |
| **Database** | Cloudflare D1 (SQLite) |
| **AI Models** | OpenAI GPT-4o, GPT-4o Vision |
| **Styling** | Tailwind CSS + Custom CSS |
| **Deployment** | Cloudflare Pages |
| **Process Manager** | PM2 (development) |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20.x or higher
- npm 10.x or higher
- Cloudflare account (for deployment)

### Installation

```bash
# Clone repository
git clone https://github.com/kobeyabkk/KOBEYA_StudyPartner_Full.git
cd KOBEYA_StudyPartner_Full

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your API keys:
# - OPENAI_API_KEY: Your OpenAI API key
# - WEBHOOK_SECRET: For logging API authentication
```

### Development

```bash
# Build the project
npm run build

# Run local development server with D1 database
npm run dev:sandbox

# Access at http://localhost:3000
```

### Database Setup

```bash
# Apply migrations locally
npm run db:migrate:local

# Access D1 console locally
npm run db:console:local

# Reset database (caution: deletes all data)
npm run db:reset
```

### Deployment

**⚠️ Important: Set Environment Variables First**

Before deploying, configure the following secrets in Cloudflare Pages dashboard or via Wrangler CLI:

```bash
# Set required secrets (run these commands in your terminal)
wrangler secret put OPENAI_API_KEY
wrangler secret put WEBHOOK_SECRET
wrangler secret put ADMIN_EMAIL
```

Alternatively, set them in **Cloudflare Pages Dashboard**:
1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add the following variables:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `WEBHOOK_SECRET`: Secret for webhook authentication
   - `ADMIN_EMAIL`: Administrator email address

**Deploy Commands:**

```bash
# Deploy to production
npm run deploy:prod

# Deploy to staging
npm run deploy
```

---

## 📖 API Endpoints

### Learning System APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/health` | GET | None | System health check |
| `/api/login` | POST | APP_KEY | Student authentication |
| `/api/analyze-and-learn` | POST | None | Start image analysis & learning |
| `/api/step/check` | POST | None | Check step-by-step learning answer |
| `/api/ai/chat` | POST | None | AI Q&A chat |

### Logging & Reports APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/logs` | POST | Webhook Secret | Record learning session |
| `/api/reports/weekly` | POST | Webhook Secret | Generate weekly report |

### Eiken Exam APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/eiken/questions/generate` | POST | Generate practice question |
| `/api/eiken/questions/list` | GET | List all generated questions |
| `/api/eiken/questions/:id` | GET | Get question details |

**Example Request:**
```json
{
  "student_id": "12345",
  "grade": "3",
  "format": "grammar_fill",
  "mode": "practice"
}
```

**Supported Formats:**
- `grammar_fill` - Grammar fill-in-the-blank (4 choices)
- `opinion_speech` - Opinion speech with model answer
- `reading_aloud` - Reading aloud passage (50-80 words)
- `essay` - Essay writing with prompt
- `long_reading` - Long reading comprehension

**Supported Grades:**
`5`, `4`, `3`, `pre2`, `2`, `pre1`, `1`

---

## 🗄️ Database Schema

### Main Tables

| Table | Description |
|-------|-------------|
| `logs` | Learning session records |
| `students` | Student master data |
| `master_materials` | Curriculum materials |
| `learning_sessions` | Session state management |
| `eiken_generated_questions` | Generated Eiken questions |
| `eiken_vocabulary_lexicon` | 10,000+ vocabulary database |
| `eiken_topic_areas` | 61 topic areas for questions |
| `eiken_generation_metrics` | Question generation analytics |
| `eiken_alert_config` | Monitoring alert configuration |

See [DATABASE_FIX_INSTRUCTIONS.md](./DATABASE_FIX_INSTRUCTIONS.md) for migration details.

---

## 📊 Project Structure

```
KOBEYA_StudyPartner_Full/
├── src/
│   ├── api/              # API route handlers
│   ├── eiken/            # Eiken exam system
│   │   ├── services/     # Business logic
│   │   ├── routes/       # API endpoints
│   │   └── types/        # Type definitions
│   ├── routes/           # Frontend routes
│   ├── handlers/         # Request handlers
│   └── components/       # React components
├── migrations/           # D1 database migrations
├── public/               # Static assets
├── docs/                 # Documentation
└── scripts/              # Build scripts
```

---

## 🎓 Educational Framework

Based on **Japanese Ministry of Education Curriculum Guidelines**:

- **Active Learning**: Encourages student-led, dialogue-rich, deep learning
- **Three Assessment Perspectives**: Knowledge/Skills, Thinking/Judgment/Expression, Attitude
- **Cross-curricular Competencies**: Language, Information literacy, Problem-solving
- **Personalized Support**: Adaptive explanations based on learning history
- **Safety & Ethics**: Digital citizenship and educational ethics

---

## 📈 Recent Updates

### v2.1.0 - Essay Coaching Improvements (2026-01-23)
- ✅ Reduced minimum answer length from 15 to 10 characters
- ✅ Added session restoration on page reload
- ✅ Distinguish completed sessions from in-progress sessions
- ✅ Orange notification for completed sessions
- ✅ Blue notification for mid-session restoration

### v2.0.0 - Learning Analytics System (2025-10-12)
- ✅ Implemented logging and weekly parent report generation
- ✅ Introduced Cloudflare D1 database
- ✅ Automated weak area detection and recommendations
- ✅ Webhook Secret authentication for secure API access

### v1.1.0 - Dynamic Learning Generation (2025-01-11)
- ✅ Dynamic 4-7 step generation based on problem complexity
- ✅ 5-8 similar questions with progressive difficulty
- ✅ Enhanced AI prompts for quality assurance

See [CHANGELOG.md](./CHANGELOG.md) for full history.

---

## 🔒 Security

### Environment Variables

This project requires the following environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key for GPT-4o | ✅ Yes |
| `WEBHOOK_SECRET` | Authentication secret for webhooks | ✅ Yes |
| `ADMIN_EMAIL` | Administrator email address | ✅ Yes |

**Never commit these values to Git.** Always use:
- `.env` file for local development (gitignored)
- Cloudflare Pages environment variables for production
- `wrangler secret` commands for sensitive data

### Reporting Security Issues

If you discover a security vulnerability, please email: info@kobeya-programming.com

We will respond within 48 hours and work with you to resolve the issue promptly.

---

## 🧪 Testing

```bash
# Check API health
curl http://localhost:3000/api/health

# Test Eiken question generation
curl -X POST http://localhost:3000/api/eiken/questions/generate \
  -H "Content-Type: application/json" \
  -d '{"student_id":"test","grade":"3","format":"grammar_fill","count":1}'
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---

## 👤 Author

**Masamichi Suzuki**  
Founder of KOBEYA Programming School, Bangkok  
20+ years of education experience | AI Engineer

- 🌐 Website: [kobeya.com](https://kobeya.com)
- 📧 Contact: info@kobeya-programming.com
- 📱 LINE: @kobeya
- 📍 Location: Fuji Supermarket 2nd Branch, 2nd Floor, Bangkok, Thailand

---

## 🙏 Acknowledgments

- OpenAI for GPT-4o and Vision API
- Cloudflare for Workers and Pages platform
- The Hono.js team for the lightweight framework
- All students and parents at KOBEYA Programming School

---

Made with ❤️ in Bangkok, Thailand

**Last Updated**: 2026-02-03  
**Version**: 2.1.0  
**Status**: ✅ Production Ready
