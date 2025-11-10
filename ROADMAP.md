# PR Review App - Roadmap

**Last Updated**: November 8, 2025

## Project Status: Phase 3 Complete ✅

A fully functional offline-first GitHub PR review app with core features complete.

---

## ✅ Phase 1: MVP (Complete)

**Goal**: Basic read-only PR viewer with auth

- [x] GitHub OAuth flow
- [x] Personal Access Token support (via better-auth)
- [x] Repository selection/switching
- [x] PR list view with basic metadata
- [x] Basic diff viewer with syntax highlighting
- [x] File navigation
- [x] Local caching of viewed PRs via Electric SQL
- [x] Simple search/filter

**Status**: ✅ **COMPLETE** - See [PHASE1_SUMMARY.md](./PHASE1_SUMMARY.md)

---

## ✅ Phase 2: Core Review (Complete)

**Goal**: Enable basic reviewing

- [x] Add line comments on specific lines
- [x] Submit simple reviews (approve/reject/comment)
- [x] View existing comments from GitHub
- [x] Basic offline support with Electric SQL
- [x] Sync repos and PRs from GitHub
- [x] tRPC mutations for all review operations

**Status**: ✅ **COMPLETE** - See [PHASE2_SUMMARY.md](./PHASE2_SUMMARY.md)

---

## ✅ Phase 3: GitHub Parity (Complete)

**Goal**: Match GitHub's review experience

- [x] Line comment UI (click line numbers to comment)
- [x] Display inline comments on diffs
- [x] Sync existing GitHub comments and reviews
- [x] Mark files as viewed
- [x] Comment display with author info and timestamps
- [x] Review state badges (approved, changes requested, etc.)
- [x] Fixed bigint issue for GitHub IDs

**Status**: ✅ **COMPLETE** - See [PHASE3_SUMMARY.md](./PHASE3_SUMMARY.md)

---

## 🚧 Phase 4: Productivity Features (In Progress)

**Goal**: Exceed GitHub's experience

### High Priority
- [ ] **Auto-sync GitHub PR events**
  - [x] Register GitHub webhook bridge for PR comments, reviews, approvals, merges, closes
  - [x] Persist incoming events with idempotency keys and replay support
  - [x] Map events into Electric collections for real-time client updates
  - [x] Display sync health metrics in dashboard
  - [ ] Implement proactive alerting for sync failures
  - [ ] Automate webhook registration during repository sync
  - [ ] Implement retry/backfill pipeline for missed events
  - [ ] Write integration tests covering event permutations

- [ ] **Threaded replies**
  - [ ] Extend data model to link replies with parent comments (Electric + TanStack DB)
  - [ ] Render inline reply UI with optimistic inserts
  - [ ] Sync reply mutations through tRPC with tx tracking
  - [ ] Support resolve/reopen actions on threads
  - [ ] Add quick reply shortcuts and keyboard focus management

- [ ] **Rich rendering pipeline**
  - Render markdown with GitHub-flavored extensions
  - Highlight TypeScript and common languages in code blocks
  - Support inline diff snippets and file previews (e.g., images, JSON)
  - Graceful fallback rendering for unknown types
  - Add renderer unit tests and visual regression coverage

### Medium Priority
- [ ] **Keyboard shortcuts**
  - `j/k` - Navigate between files
  - `c` - Add comment
  - `n/p` - Next/previous diff hunk
  - `a` - Approve
  - `r` - Request changes
  - `?` - Show keyboard shortcuts help

- [ ] **Review statistics dashboard**
  - PRs reviewed count
  - Comments added
  - Time spent reviewing
  - Review history timeline

- [ ] **Quick actions**
  - "Approve without comment" shortcut
  - Comment templates
  - Bulk approve/reject files
  - Quick filter presets

### Low Priority
- [ ] **Advanced filters and saved searches**
  - Filter by author, labels, milestone
  - Save custom filter combinations
  - Recent searches history
  - Smart filters (e.g., "awaiting my review")

- [ ] **Bulk file operations**
  - Mark all files as viewed
  - Collapse/expand all files
  - Jump to next unviewed file

**Estimated Time**: 2-3 weeks

---

## 📋 Phase 5: Polish & Scale (Future)

**Goal**: Production ready

### Performance
- [ ] Optimize for large PRs (1000+ files)
- [ ] Lazy load file diffs
- [ ] Virtual scrolling for file lists
- [ ] Pagination for comments
- [ ] Request deduplication

### Reliability
- [ ] Conflict resolution for simultaneous edits
- [ ] Retry logic with exponential backoff
- [ ] Error boundaries and recovery
- [ ] Offline queue management
- [ ] Data integrity checks

### Features
- [ ] Notification system
  - PR updates
  - New comments
  - Review requests
  - Browser notifications

- [ ] Settings and customization
  - Theme (light/dark)
  - Diff view preferences
  - Notification preferences
  - Keyboard shortcut customization

- [ ] Data export/backup
  - Export review history
  - Backup local data
  - Import/restore

- [ ] Multi-account support
  - Switch between GitHub accounts
  - Per-account repositories
  - Separate offline storage

- [ ] GitHub Enterprise support
  - Custom GitHub instance URL
  - Enterprise-specific features
  - SSO integration

**Estimated Time**: 3-4 weeks

---

## 🎯 Current Focus

**Active Phase**: Phase 4 execution

**Next Up**:
1. Finish GitHub auto-sync by automating webhook registration, retries, and alerting
2. Ship threaded replies UI and data flow (schema + optimistic flows)
3. Introduce keyboard shortcuts for core review navigation and actions

---

## 🐛 Known Issues

- [x] ~~GitHub ID overflow (>2.1B) - Fixed with bigint~~
- [x] ~~Review comments don't auto-sync to GitHub - Fixed with background worker~~
- [x] ~~Not truly offline-first - Fixed with collection operations~~
- [ ] No reply to comments yet (threads)
- [ ] Can't resolve/unresolve conversations
- [ ] No code suggestions feature
- [ ] GitHub webhook registration is still manual

---

## 📊 Feature Completeness

| Category | Progress | Status |
|----------|----------|--------|
| Must Have Features | 9/9 | ✅ Complete |
| GitHub Parity | 8/12 | 🟡 67% |
| Enhanced Features | 0/10 | ⚪ Not Started |
| Polish & Scale | 0/9 | ⚪ Not Started |

**Overall Completion**: ~45% of original plan

---

## 💡 Ideas for Future Phases

- AI-powered review suggestions
- Code smell detection
- Automated test coverage analysis
- Integration with CI/CD pipelines
- Slack/Discord notifications
- Review assignment and rotation
- PR health score
- Diff context expansion
- Inline file editing
- Mobile app version

---

## 🚀 Getting Started

```bash
# Install
pnpm install

# Setup environment
cp .env.example .env
# Add your GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET

# Start services
docker compose up -d

# Migrate database
pnpm drizzle-kit push

# Run dev server
pnpm dev

# Build for production
pnpm build
```

---

## 📝 Notes

- Electric SQL provides offline-first architecture
- All mutations go through tRPC for type safety
- Comments and reviews save locally before syncing
- Real-time updates across clients via Electric
- PostgreSQL with Drizzle ORM for database

---

**Ready for Phase 4!** 🎉
