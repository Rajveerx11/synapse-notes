# Contributing to Synapse Notes 🧠✍️

Thank you for your interest in contributing to **Synapse Notes**! We are thrilled to welcome developers, designers, and students to help shape the future of AI-native digital notebooks.

---

## 🗺️ Project Overview & Architecture

Synapse Notes connects low-latency tablet handwriting (Samsung Galaxy Tab S-Pen) and slide markup with autonomous AI coding agents (Claude Code, OpenAI Codex, Antigravity) via the **Model Context Protocol (MCP)**.

```
synapse-notes/
├── src/
│   ├── app/                # Next.js 16 App Router & Serverless API Routes
│   │   ├── api/            # REST API (Auth, Notebooks, Pages, PDF, Storage)
│   │   ├── notebook/[id]/  # Interactive Notebook & Canvas UI
│   │   └── page.tsx        # Dashboard
│   ├── components/         # React 19 UI Components (Canvas, Toolbar, StudyCard)
│   └── lib/                # Database (Neon), Storage (Blob/R2), and Auth utils
├── mcp-server/             # Model Context Protocol (MCP) server package
├── docs/                   # Architecture, MCP Specs, and API Reference
└── public/                 # Static assets and PWA icons
```

---

## 🛠️ Local Development Setup

### 1. Prerequisites
- **Node.js**: v18.17+ or v20+
- **npm** or **pnpm**
- **Git**

### 2. Fork & Clone
```bash
git clone https://github.com/<your-username>/synapse-notes.git
cd synapse-notes
npm install
```

### 3. Setup Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Fill in your local environment variables:
```env
SYNAPSE_API_KEY="synapse_sec_your_local_key"
JWT_SECRET="synapse_jwt_secret_local"
DATABASE_URL="postgresql://user:password@localhost:5432/synapse"
```
*(You can get a free serverless PostgreSQL database from [Neon](https://neon.tech) in 10 seconds).*

### 4. Start the Dev Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser or tablet.

### 5. Running the MCP Server Locally
```bash
cd mcp-server
npm install
npm run build
node dist/index.js
```

---

## 🌿 Git Branching & Pull Request Workflow

1. **Create a Branch:**
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/your-bugfix-name
   ```
2. **Commit Changes:**
   Follow conventional commits:
   - `feat(canvas): add lasso selection tool`
   - `fix(pdf): resolve multi-page coordinate alignment`
   - `docs(mcp): update tool schema specifications`
3. **Verify Code Quality:**
   ```bash
   npx tsc --noEmit
   npm run build
   ```
4. **Push and Open a Pull Request:**
   ```bash
   git push origin feat/your-feature-name
   ```
   Open a PR against the `main` branch with a clear description and screenshots/recordings if modifying UI.

---

## 💡 Areas We'd Love Help With

- [ ] **Handwriting OCR & Search**: Automatic on-device handwriting recognition using Tesseract.js / ML models.
- [ ] **Lasso Selection Tool**: Select, rotate, duplicate, and move drawn ink strokes.
- [ ] **Audio Sync**: Record lecture audio synchronized to stroke timestamps.
- [ ] **Custom Paper Templates**: Import custom PDF/SVG paper templates.
- [ ] **Apple Pencil / iPadOS Optimization**: Additional tuning for Apple Pencil hover and tilt.

---

## 📜 Code of Conduct

Please review and adhere to our [Code of Conduct](CODE_OF_CONDUCT.md) in all community interactions.
