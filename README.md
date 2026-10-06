# File Content Viewer

Convert a folder (or a hand-picked set of files) into **one combined
plain-text `.txt`**. Runs entirely in your browser — no install, no
server, nothing uploaded.

## 🚀 Try it now
**→ [https://YOUR_USERNAME.github.io/file-content-viewer/](https://sinethweerasingha.github.io/File-converter---To-txt/)**

## ✨ Features
- 📁 Folder mode (recursive)
- 📄 Individual file mode + drag-and-drop
- 📑 PDF & DOCX text extraction
- 🚫 Auto-skips binaries, `.git`, `node_modules`, `venv`, etc.
- 🌗 Light & dark themes
- 💾 Export as `.txt` or copy to clipboard
- 🔒 100% client-side — files never leave your machine

## 🛠️ How it works
Pure static site. File reading uses the browser's File API.
PDF parsing uses [pdf.js](https://mozilla.github.io/pdf.js/),
DOCX parsing uses [mammoth.js](https://github.com/mwilliamson/mammoth.js).

## 🧑‍💻 Run locally
```bash
git clone https://github.com/YOUR_USERNAME/file-content-viewer.git
cd file-content-viewer
python -m http.server 8000
