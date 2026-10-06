/**
 * File Content Viewer — Static Frontend
 * Runs entirely in the browser. No server required.
 */

/* ---------- Theme manager ---------- */
const ThemeManager = {
    STORAGE_KEY: 'theme',
    init() {
        this.toggleBtn = document.getElementById('themeToggle');
        if (!this.toggleBtn) return;
        this.toggleBtn.addEventListener('click', () => this.toggle());
        if (window.matchMedia) {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            const handler = (e) => {
                if (localStorage.getItem(this.STORAGE_KEY)) return;
                this.apply(e.matches ? 'dark' : 'light');
            };
            if (mq.addEventListener) mq.addEventListener('change', handler);
            else if (mq.addListener) mq.addListener(handler);
        }
    },
    current() {
        return document.documentElement.getAttribute('data-theme') || 'light';
    },
    apply(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        if (this.toggleBtn) {
            const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
            this.toggleBtn.setAttribute('aria-label', label);
            this.toggleBtn.setAttribute('title', label);
        }
    },
    toggle() {
        const next = this.current() === 'dark' ? 'light' : 'dark';
        this.apply(next);
        try { localStorage.setItem(this.STORAGE_KEY, next); } catch (e) {}
    },
};

/* ---------- Config ---------- */
const SKIP_DIRS = new Set([
    '.git', '.svn', '.hg',
    'node_modules', '__pycache__', '.pytest_cache', '.mypy_cache',
    'venv', '.venv', 'env', '.env',
    'dist', 'build', '.next', '.nuxt', '.cache', '.idea', '.vscode',
    'target', 'bin', 'obj',
]);

const BINARY_EXTENSIONS = new Set([
    'png','jpg','jpeg','gif','bmp','ico','webp','tiff','tif','svgz',
    'mp3','mp4','avi','mov','mkv','webm','wav','flac','ogg','m4a',
    'zip','rar','7z','tar','gz','bz2','xz','zst',
    'exe','dll','so','dylib','bin','iso','dmg','msi','app',
    'ttf','otf','woff','woff2','eot',
    'pyc','pyo','pyd','class','o','a','lib','obj',
    'db','sqlite','sqlite3','mdb',
    'psd','ai','eps','sketch','fig',
]);

const MAX_FILE_SIZE  = 20  * 1024 * 1024;
const MAX_TOTAL_SIZE = 200 * 1024 * 1024;
const MAX_FILES      = 5000;

if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/* ---------- Main app ---------- */
class FileContentViewer {
    constructor() {
        this.modeTabs      = Array.from(document.querySelectorAll('.mode-tab'));
        this.modePanels    = Array.from(document.querySelectorAll('.mode-panel'));
        this.folderPicker  = document.getElementById('folderPicker');
        this.filePicker    = document.getElementById('filePicker');
        this.pickFolderBtn = document.getElementById('pickFolderBtn');
        this.pickFilesBtn  = document.getElementById('pickFilesBtn');
        this.folderInfo    = document.getElementById('folderInfo');
        this.filesCount    = document.getElementById('filesCount');
        this.convertBtn    = document.getElementById('convertBtn');
        this.clearBtn      = document.getElementById('clearBtn');
        this.progressWrap  = document.getElementById('progressWrapper');
        this.progressText  = document.getElementById('progressText');
        this.outputSection = document.getElementById('outputSection');
        this.outputContent = document.getElementById('outputContent');
        this.outputMeta    = document.getElementById('outputMeta');
        this.exportBtn     = document.getElementById('exportBtn');
        this.copyBtn       = document.getElementById('copyBtn');
        this.toastContainer= document.getElementById('toastContainer');

        this.mode = 'folder';
        this.selectedFiles = [];
        this.selectedLabel = '';
        this.currentOutput = '';
        this.lastSourceType = 'folder';

        this.init();
    }

    init() {
        this.modeTabs.forEach(tab => {
            tab.addEventListener('click', () => this.setMode(tab.dataset.mode));
        });

        this.pickFolderBtn.addEventListener('click', () => this.folderPicker.click());
        this.pickFilesBtn.addEventListener('click',  () => this.filePicker.click());

        this.folderPicker.addEventListener('change', (e) => this.onFilesChosen(e.target.files, 'folder'));
        this.filePicker.addEventListener('change',   (e) => this.onFilesChosen(e.target.files, 'files'));

        this.convertBtn.addEventListener('click', () => this.convert());
        this.clearBtn.addEventListener('click',   () => this.clearAll());
        this.exportBtn.addEventListener('click',  () => this.exportTxt());
        this.copyBtn.addEventListener('click',    () => this.copyToClipboard());

        document.body.addEventListener('dragover', (e) => e.preventDefault());
        document.body.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) {
                this.onFilesChosen(e.dataTransfer.files, 'files');
            }
        });
    }

    setMode(mode) {
        if (mode !== 'folder' && mode !== 'files') return;
        this.mode = mode;
        this.modeTabs.forEach(tab => {
            const active = tab.dataset.mode === mode;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        this.modePanels.forEach(panel => {
            panel.hidden = panel.dataset.panel !== mode;
        });
    }

    onFilesChosen(fileList, sourceKind) {
        const files = Array.from(fileList);
        if (!files.length) return;

        this.selectedFiles = files;
        this.lastSourceType = sourceKind;

        if (sourceKind === 'folder') {
            const root = files[0].webkitRelativePath.split('/')[0] || '(folder)';
            this.selectedLabel = root;
            this.folderInfo.textContent = `${root} — ${files.length} file(s)`;
        } else {
            this.selectedLabel = `${files.length} file(s)`;
            this.filesCount.textContent = this.selectedLabel;
        }

        this.convertBtn.disabled = false;
        this.showToast(`Selected ${files.length} file(s)`, 'success');
    }

    async convert() {
        if (!this.selectedFiles.length) {
            this.showToast('Select a folder or files first.', 'error');
            return;
        }

        this.progressWrap.style.display = 'block';
        this.progressText.textContent = `Reading ${this.selectedFiles.length} file(s)…`;
        this.outputSection.style.display = 'none';
        this.convertBtn.disabled = true;

        await new Promise(r => setTimeout(r, 50));

        let out;
        try {
            out = await this.processFiles(this.selectedFiles);
        } catch (err) {
            this.progressWrap.style.display = 'none';
            this.convertBtn.disabled = false;
            this.showToast('Processing error: ' + err.message, 'error');
            return;
        }

        this.progressWrap.style.display = 'none';
        this.convertBtn.disabled = false;

        if (out.abortReason) this.showToast(out.abortReason, 'warning');
        if (!out.results.length) {
            this.showToast('No readable files found.', 'error');
            return;
        }
        this.renderOutput(out);
    }

    async processFiles(files) {
        const results = [];
        let totalSize = 0;
        let abortReason = null;

        const sorted = [...files].sort((a, b) => {
            const ap = (a.webkitRelativePath || a.name).toLowerCase();
            const bp = (b.webkitRelativePath || b.name).toLowerCase();
            return ap.localeCompare(bp);
        });

        for (const file of sorted) {
            const rel = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
            const parts = rel.split('/');
            const dirs = parts.slice(0, -1);

            if (dirs.some(d => SKIP_DIRS.has(d.toLowerCase()) || d.startsWith('.'))) {
                continue;
            }

            if (results.length >= MAX_FILES) {
                abortReason = `Stopped: more than ${MAX_FILES} files.`;
                break;
            }

            const base = { filename: parts[parts.length - 1], path: rel, size: file.size };

            if (file.size > MAX_FILE_SIZE) {
                results.push({ ...base, success: false,
                    error: `File too large (${file.size} bytes) — skipped.`, content: null });
                continue;
            }
            if (file.size > MAX_TOTAL_SIZE - totalSize) {
                results.push({ ...base, success: false,
                    error: 'Skipped: total size budget exceeded.', content: null });
                continue;
            }

            const ext = rel.includes('.') ? rel.split('.').pop().toLowerCase() : '';

            if (BINARY_EXTENSIONS.has(ext)) {
                results.push({ ...base, success: false,
                    error: `Binary file (.${ext}) — skipped.`, content: null });
                continue;
            }

            if (await this.looksBinary(file)) {
                results.push({ ...base, success: false,
                    error: 'Binary file — skipped.', content: null });
                continue;
            }

            let content = null, error = null;
            try {
                if (ext === 'pdf')        ({ content, error } = await this.extractPdf(file));
                else if (ext === 'docx')  ({ content, error } = await this.extractDocx(file));
                else                       content = await this.extractText(file);
            } catch (e) {
                error = 'Extract error: ' + e.message;
            }

            if (error) {
                results.push({ ...base, success: false, error, content: null });
            } else if (!content || !content.trim()) {
                results.push({ ...base, success: true, error: null, content: '' });
            } else {
                results.push({ ...base, success: true, error: null, content });
            }

            totalSize += file.size;
            if (totalSize >= MAX_TOTAL_SIZE) {
                abortReason = `Stopped: total content exceeded ${Math.floor(MAX_TOTAL_SIZE / 1048576)} MB.`;
                break;
            }

            if (results.length % 20 === 0) {
                this.progressText.textContent = `Read ${results.length} file(s)…`;
                await new Promise(r => setTimeout(r, 0));
            }
        }

        return { results, totalSize, abortReason };
    }

    async looksBinary(file) {
        if (!file.size) return false;
        const slice = await file.slice(0, 4096).arrayBuffer();
        const bytes = new Uint8Array(slice);
        for (const b of bytes) if (b === 0) return true;
        let nonPrint = 0;
        for (const b of bytes) {
            if (b < 32 && b !== 9 && b !== 10 && b !== 13) nonPrint++;
        }
        return (nonPrint / bytes.length) > 0.30;
    }

    async extractText(file) {
        const buf = await file.arrayBuffer();
        try {
            return new TextDecoder('utf-8', { fatal: true }).decode(buf);
        } catch {
            return new TextDecoder('windows-1252').decode(buf);
        }
    }

    async extractPdf(file) {
        if (typeof pdfjsLib === 'undefined') {
            return { error: 'PDF library failed to load (check your connection).' };
        }
        try {
            const buf = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
            const pages = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const tc = await page.getTextContent();
                pages.push(tc.items.map(it => it.str).join(' '));
            }
            const full = pages.join('\n\n');
            return full.trim()
                ? { content: full }
                : { content: '[PDF contains no extractable text]' };
        } catch (e) {
            return { error: 'PDF error: ' + e.message };
        }
    }

    async extractDocx(file) {
        if (typeof mammoth === 'undefined') {
            return { error: 'DOCX library failed to load (check your connection).' };
        }
        try {
            const buf = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer: buf });
            return result.value.trim()
                ? { content: result.value }
                : { content: '[Document is empty]' };
        } catch (e) {
            return { error: 'Word document error: ' + e.message };
        }
    }

    renderOutput(out) {
        const filesData = out.results;
        let output = '';
        let ok = 0, failed = 0;

        if (this.lastSourceType === 'folder') {
            output += `FOLDER: ${this.selectedLabel}\n`;
        } else {
            output += `SOURCE: individual files\n`;
        }
        output += `FILES: ${filesData.length}\n`;
        output += `GENERATED: ${new Date().toISOString()}\n`;
        output += '='.repeat(60) + '\n\n';

        filesData.forEach((file, i) => {
            output += '=========================\n';
            output += `FILE ${i + 1}: ${file.path}\n`;
            output += '=========================\n';
            if (file.success) {
                output += file.content || '';
                if (file.content && !file.content.endsWith('\n')) output += '\n';
                ok++;
            } else {
                output += `[SKIPPED: ${file.error}]\n`;
                failed++;
            }
            output += '\n';
        });

        this.currentOutput = output;
        this.outputContent.textContent = output;
        this.outputSection.style.display = 'block';

        const parts = [`${ok} extracted`];
        if (failed) parts.push(`${failed} skipped`);
        this.outputMeta.textContent = parts.join(' • ');

        setTimeout(() => {
            this.outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }

    exportTxt() {
        if (!this.currentOutput) {
            this.showToast('Nothing to export', 'warning');
            return;
        }
        const prefix = this.lastSourceType === 'files' ? 'files' : 'folder';
        const blob = new Blob([this.currentOutput], { type: 'text/plain;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${prefix}_contents_${this.timestamp()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast('Exported .txt file', 'success');
    }

    async copyToClipboard() {
        if (!this.currentOutput) {
            this.showToast('Nothing to copy', 'warning');
            return;
        }
        try {
            await navigator.clipboard.writeText(this.currentOutput);
            this.showToast('Copied to clipboard!', 'success');
        } catch {
            const ta = document.createElement('textarea');
            ta.value = this.currentOutput;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); this.showToast('Copied!', 'success'); }
            catch { this.showToast('Copy failed.', 'error'); }
            document.body.removeChild(ta);
        }
    }

    clearAll() {
        this.selectedFiles = [];
        this.selectedLabel = '';
        this.folderPicker.value = '';
        this.filePicker.value = '';
        this.folderInfo.textContent = 'No folder selected';
        this.filesCount.textContent = '0 file(s)';
        this.outputContent.textContent = '';
        this.outputSection.style.display = 'none';
        this.currentOutput = '';
        this.convertBtn.disabled = true;
    }

    timestamp() {
        return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
    new FileContentViewer();
});