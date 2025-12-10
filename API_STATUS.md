# API Status Dashboard

## 🎯 Quick Reference

| Endpoint | Status | Action Required |
|----------|--------|-----------------|
| `/api/eiken/questions/generate` | ✅ ACTIVE | Use this for all new code |
| `/api/eiken/generate` | ⚠️ DEPRECATED | Do not use - will be removed |

---

## 🔍 How to Check Which API is Active

### Method 1: Check Frontend Code
```bash
# Find which API the frontend calls
grep -r "fetch.*api/eiken" src/hooks/
```

**Result**: Frontend uses `/api/eiken/questions/generate`

### Method 2: Check Route Documentation
```bash
# Read the detailed API documentation
cat src/eiken/routes/README.md
```

### Method 3: Look for Code Markers
- ✅ `ACTIVE` - Currently in use
- ⚠️ `DEPRECATED` - Do not use for new code
- 🗑️ `REMOVED` - No longer exists

---

## 🚨 Critical: Before Making Changes

**Always ask yourself:**

1. **Which API am I modifying?**
   - Check file comments for ✅ ACTIVE or ⚠️ DEPRECATED

2. **Does the frontend use this API?**
   - Check `src/hooks/useEikenAPI.ts`

3. **Will my changes affect users?**
   - Only ACTIVE APIs affect users
   - DEPRECATED APIs are not used by frontend

---

## 📋 Detailed Status

### Eiken Question Generation APIs

#### ✅ `/api/eiken/questions/generate` (ACTIVE)
- **File**: `src/eiken/routes/questions.ts`
- **Service**: `IntegratedQuestionGenerator`
- **Used By**: Frontend (`src/hooks/useEikenAPI.ts`)
- **Features**:
  - Blueprint generation
  - Multi-stage validation
  - 4-block explanation format
  - Answer diversity management
  - Grammar category distribution

#### ⚠️ `/api/eiken/generate` (DEPRECATED)
- **File**: `src/eiken/routes/generate.ts`
- **Service**: Direct LLM calls
- **Used By**: None (legacy only)
- **Reason for Keeping**: Backward compatibility, health check endpoint
- **Planned Removal**: Phase 7

---

## 🔧 Development Workflow

### Adding New Features
```
1. Check API_STATUS.md (this file)
2. Modify ACTIVE API only
3. Test thoroughly
4. Update documentation
```

### Fixing Bugs
```
1. Identify which API has the bug
2. Check if it's ACTIVE or DEPRECATED
3. If ACTIVE: Fix immediately
4. If DEPRECATED: Consider if fix is necessary
```

### Deprecating an API
```
1. Mark with ⚠️ DEPRECATED in code comments
2. Update API_STATUS.md
3. Update src/eiken/routes/README.md
4. Announce to team
5. Set removal timeline
6. Create migration guide
```

### Removing a Deprecated API
```
1. Confirm no external usage (check logs)
2. Remove from worker.ts routing
3. Delete source file
4. Mark as 🗑️ REMOVED in API_STATUS.md
5. Archive for reference
```

---

## 📚 Related Documentation

- **Detailed API Docs**: `src/eiken/routes/README.md`
- **Frontend Hook**: `src/hooks/useEikenAPI.ts`
- **Service Implementation**: `src/eiken/services/integrated-question-generator.ts`
- **Prompt Templates**: `src/eiken/prompts/format-prompts.ts`

---

## 🎓 Lessons Learned (Phase 6.8 Incident)

### What Went Wrong
1. Two APIs existed without clear status markers
2. Developer modified DEPRECATED API by mistake
3. Changes didn't appear in frontend (because wrong API)
4. Wasted time debugging the wrong code

### Prevention Measures Implemented
1. ✅ Added clear status markers in all API files
2. ✅ Created this API_STATUS.md dashboard
3. ✅ Created detailed README in routes directory
4. ✅ Added comments in frontend code
5. ✅ Established workflow guidelines

### Best Practices Going Forward
1. **Always check API status before modifying**
2. **Document deprecations immediately**
3. **Remove deprecated code within 1-2 release cycles**
4. **Keep only ONE active version of each API**
5. **Use clear markers: ✅ ACTIVE, ⚠️ DEPRECATED, 🗑️ REMOVED**

---

## ❓ FAQ

### Q: I need to add a feature. Which file do I modify?
**A**: Check this file (API_STATUS.md) for the ✅ ACTIVE API, then modify that file.

### Q: There are two similar files. Which one is used?
**A**: Look for status markers in comments:
- ✅ ACTIVE = Used by frontend
- ⚠️ DEPRECATED = Not used, will be removed

### Q: Can I delete the deprecated API?
**A**: Follow the "Removing a Deprecated API" workflow above. Never delete without checking:
1. External usage
2. Backward compatibility requirements
3. Team approval

### Q: How do I know if my changes will affect users?
**A**: Your changes affect users only if you modify an ✅ ACTIVE API.

---

**Last Updated**: 2025-12-09 (Phase 6.8C - After incident)  
**Purpose**: Prevent confusion about which API is active  
**Update Frequency**: Every time API status changes

---

## 🚀 Quick Commands

```bash
# Find which API is active
grep -r "✅ ACTIVE" src/eiken/routes/

# Find which API is deprecated
grep -r "⚠️ DEPRECATED" src/eiken/routes/

# Check frontend API usage
grep "fetch.*api/eiken" src/hooks/useEikenAPI.ts

# View detailed API docs
cat src/eiken/routes/README.md
```
