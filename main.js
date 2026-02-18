const STORAGE_KEY = 'pyaoiastro-code';
const SETTINGS_KEY = 'pyaoiastro-settings';
const HISTORY_KEY = 'pyaoiastro-history';
const SNAPSHOT_KEY = 'pyaoiastro-snapshot';
const MAX_HISTORY_ITEMS = 10;

const DEFAULT_CODE = `print("Hello from pyaoiastro")\nfor i in range(3):\n    print(f"star {i}")`;

const SAMPLE_CODE = {
    hello: `print("Python is running in your browser")\nfor i in range(5):\n    print("orbit", i)`,
    math: `numbers = [1, 2, 3, 4, 5]\nprint("sum:", sum(numbers))\nprint("squares:", [n*n for n in numbers])`,
    plot: `import matplotlib.pyplot as plt\n\nx = [1, 2, 3, 4, 5]\ny = [1, 4, 9, 16, 25]\n\nplt.plot(x, y, marker="o")\nplt.title("Simple Plot")\nplt.xlabel("x")\nplt.ylabel("y")\nplt.show()`
};

let pyodide;
let editor;
let simpleEditor;
let saveTimer = null;
let storageAvailable = true;
let isRunning = false;
let runHistory = [];
let lastSearchIndex = 0;

const appSettings = {
    theme: 'dark',
    wrap: true,
    lineNumbers: true,
    fontSize: 14
};

const statusDot = document.querySelector('.status-dot');
const statusText = document.querySelector('#pyodide-status .status-text');
const output = document.getElementById('output');
const runBtn = document.getElementById('run-btn');
const runSelectionBtn = document.getElementById('run-selection-btn');
const installBtn = document.getElementById('install-btn');
const resetBtn = document.getElementById('reset-btn');
const downloadBtn = document.getElementById('download-btn');
const uploadFileInput = document.getElementById('upload-file');
const sampleSelect = document.getElementById('sample-select');
const packageInput = document.getElementById('package-name');
const packageStatus = document.getElementById('package-status');
const clearBtn = document.getElementById('clear-btn');
const copyOutputBtn = document.getElementById('copy-output-btn');
const downloadOutputBtn = document.getElementById('download-output-btn');
const copyCodeBtn = document.getElementById('copy-code-btn');
const shareBtn = document.getElementById('share-btn');
const themeBtn = document.getElementById('theme-btn');
const wrapBtn = document.getElementById('wrap-btn');
const lineBtn = document.getElementById('line-btn');
const fontSizeInput = document.getElementById('font-size');
const fontSizeValue = document.getElementById('font-size-value');
const formatBtn = document.getElementById('format-btn');
const searchInput = document.getElementById('search-input');
const searchNextBtn = document.getElementById('search-next-btn');
const historySelect = document.getElementById('history-select');
const snapshotSaveBtn = document.getElementById('snapshot-save-btn');
const snapshotLoadBtn = document.getElementById('snapshot-load-btn');
const snapshotClearBtn = document.getElementById('snapshot-clear-btn');
const resetRuntimeBtn = document.getElementById('reset-runtime-btn');
const runMeta = document.getElementById('run-meta');
const saveMeta = document.getElementById('save-meta');

function nowTime() {
    return new Date().toLocaleTimeString('ja-JP', { hour12: false });
}

function addToConsole(content, type = 'log') {
    const line = document.createElement('span');
    line.className = `console-${type}`;
    line.textContent = `[${nowTime()}] ${String(content)}\n`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

function loadJsonFromStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) {
            return fallback;
        }
        return JSON.parse(raw);
    } catch (_err) {
        return fallback;
    }
}

function saveJsonToStorage(key, value) {
    if (!storageAvailable) {
        return;
    }
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (_err) {
        storageAvailable = false;
    }
}

function loadCodeFromHash() {
    const hash = window.location.hash;
    if (!hash.startsWith('#code=')) {
        return '';
    }
    try {
        const encoded = hash.slice(6);
        const decoded = decodeURIComponent(escape(atob(encoded)));
        return decoded;
    } catch (_err) {
        addToConsole('Share link decode failed.', 'error');
        return '';
    }
}

function getInitialCode() {
    const sharedCode = loadCodeFromHash();
    if (sharedCode) {
        addToConsole('Loaded code from share link.', 'info');
        return sharedCode;
    }

    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        storageAvailable = true;
        if (saveMeta) {
            saveMeta.textContent = 'Autosave: enabled';
        }
        return saved || DEFAULT_CODE;
    } catch (_err) {
        storageAvailable = false;
        if (saveMeta) {
            saveMeta.textContent = 'Autosave: unavailable';
        }
        return DEFAULT_CODE;
    }
}

function saveCodeImmediate(value) {
    if (!storageAvailable) {
        return;
    }
    try {
        localStorage.setItem(STORAGE_KEY, value);
        if (saveMeta) {
            saveMeta.textContent = `Autosave: ${nowTime()}`;
        }
    } catch (_err) {
        storageAvailable = false;
        if (saveMeta) {
            saveMeta.textContent = 'Autosave: unavailable';
        }
    }
}

function scheduleSave(value) {
    if (saveTimer) {
        clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
        saveCodeImmediate(value);
    }, 300);
}

function updateReadyState(ready) {
    statusDot.classList.toggle('ready', ready);
    runBtn.disabled = !ready;
    runSelectionBtn.disabled = !ready;
    installBtn.disabled = !ready;
}

function hasEditor() {
    return Boolean(editor || simpleEditor);
}

function getEditorCode() {
    if (editor) {
        return editor.getValue();
    }
    if (simpleEditor) {
        return simpleEditor.value;
    }
    return '';
}

function setEditorCode(value) {
    if (editor) {
        editor.setValue(value);
        return;
    }
    if (simpleEditor) {
        simpleEditor.value = value;
    }
}

function getSelectedCode() {
    if (editor) {
        const selection = editor.getSelection();
        if (!selection || selection.isEmpty()) {
            return '';
        }
        return editor.getModel().getValueInRange(selection);
    }

    if (simpleEditor) {
        const start = simpleEditor.selectionStart || 0;
        const end = simpleEditor.selectionEnd || 0;
        if (start === end) {
            return '';
        }
        return simpleEditor.value.slice(start, end);
    }

    return '';
}

function applyEditorOptions() {
    if (editor) {
        editor.updateOptions({
            wordWrap: appSettings.wrap ? 'on' : 'off',
            lineNumbers: appSettings.lineNumbers ? 'on' : 'off',
            fontSize: Number(appSettings.fontSize) || 14
        });
        editor.layout();
    }

    if (simpleEditor) {
        simpleEditor.style.fontSize = `${appSettings.fontSize}px`;
        simpleEditor.style.whiteSpace = appSettings.wrap ? 'pre-wrap' : 'pre';
        simpleEditor.style.overflowX = appSettings.wrap ? 'hidden' : 'auto';
    }

    if (fontSizeInput) {
        fontSizeInput.value = String(appSettings.fontSize);
    }
    if (fontSizeValue) {
        fontSizeValue.textContent = `${appSettings.fontSize}px`;
    }
}

function applyTheme() {
    document.body.classList.toggle('light', appSettings.theme === 'light');
    if (themeBtn) {
        themeBtn.textContent = appSettings.theme === 'light' ? 'Theme: Light' : 'Theme: Dark';
    }
    if (editor) {
        monaco.editor.setTheme(appSettings.theme === 'light' ? 'vs' : 'vs-dark');
    }
}

function updateToggleLabels() {
    if (wrapBtn) {
        wrapBtn.textContent = `Wrap: ${appSettings.wrap ? 'On' : 'Off'}`;
    }
    if (lineBtn) {
        lineBtn.textContent = `Line#: ${appSettings.lineNumbers ? 'On' : 'Off'}`;
    }
}

function loadSettings() {
    const loaded = loadJsonFromStorage(SETTINGS_KEY, {});
    if (typeof loaded.theme === 'string') {
        appSettings.theme = loaded.theme;
    }
    if (typeof loaded.wrap === 'boolean') {
        appSettings.wrap = loaded.wrap;
    }
    if (typeof loaded.lineNumbers === 'boolean') {
        appSettings.lineNumbers = loaded.lineNumbers;
    }
    if (Number.isFinite(loaded.fontSize)) {
        appSettings.fontSize = Math.max(12, Math.min(24, Number(loaded.fontSize)));
    }
}

function persistSettings() {
    saveJsonToStorage(SETTINGS_KEY, appSettings);
}

function loadHistory() {
    const items = loadJsonFromStorage(HISTORY_KEY, []);
    if (Array.isArray(items)) {
        runHistory = items.filter((item) => typeof item === 'string');
    }
}

function persistHistory() {
    saveJsonToStorage(HISTORY_KEY, runHistory);
}

function renderHistory() {
    if (!historySelect) {
        return;
    }

    historySelect.innerHTML = '';
    const initial = document.createElement('option');
    initial.value = '';
    initial.textContent = 'Select previous run';
    historySelect.appendChild(initial);

    runHistory.forEach((code, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        const preview = code.replace(/\s+/g, ' ').slice(0, 70);
        option.textContent = `${index + 1}. ${preview || '(empty)'}`;
        historySelect.appendChild(option);
    });
}

function pushHistory(code) {
    if (!code.trim()) {
        return;
    }
    runHistory = runHistory.filter((item) => item !== code);
    runHistory.unshift(code);
    if (runHistory.length > MAX_HISTORY_ITEMS) {
        runHistory = runHistory.slice(0, MAX_HISTORY_ITEMS);
    }
    persistHistory();
    renderHistory();
}

function createFallbackEditor(initialCode, reason) {
    const editorHost = document.getElementById('code-editor');
    if (!editorHost) {
        return;
    }
    if (editor) {
        editor.dispose();
        editor = null;
    }
    editorHost.innerHTML = '';
    const textarea = document.createElement('textarea');
    textarea.id = 'fallback-editor';
    textarea.value = initialCode;
    editorHost.appendChild(textarea);
    textarea.addEventListener('input', () => {
        scheduleSave(textarea.value);
    });
    textarea.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            runCode();
        }
        if (event.shiftKey && event.key === 'Enter') {
            event.preventDefault();
            runSelection();
        }
    });
    simpleEditor = textarea;
    applyEditorOptions();
    addToConsole(`Editor fallback active: ${reason}`, 'info');
}

async function initPyodide() {
    try {
        updateReadyState(false);
        statusText.textContent = 'Loading Pyodide runtime...';
        pyodide = await loadPyodide({
            stdout: (msg) => addToConsole(msg),
            stderr: (msg) => addToConsole(msg, 'error')
        });

        statusText.textContent = 'Loading micropip...';
        await pyodide.loadPackage('micropip');

        updateReadyState(true);
        statusText.textContent = 'Pyodide Ready';
        addToConsole('Python environment initialized successfully.', 'info');
    } catch (err) {
        updateReadyState(false);
        statusText.textContent = 'Init Failed';
        addToConsole(`Initialization Error: ${err.message}`, 'error');
    }
}

async function initMonaco() {
    return new Promise((resolve) => {
        if (typeof require !== 'function') {
            createFallbackEditor(getInitialCode(), 'loader unavailable');
            resolve();
            return;
        }

        require.config({
            paths: {
                vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs'
            }
        });

        require(['vs/editor/editor.main'], () => {
            const editorHost = document.getElementById('code-editor');
            try {
                editor = monaco.editor.create(document.getElementById('code-editor'), {
                    value: getInitialCode(),
                    language: 'python',
                    theme: appSettings.theme === 'light' ? 'vs' : 'vs-dark',
                    fontSize: appSettings.fontSize,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    wordWrap: appSettings.wrap ? 'on' : 'off',
                    lineNumbers: appSettings.lineNumbers ? 'on' : 'off'
                });
            } catch (_err) {
                createFallbackEditor(getInitialCode(), 'monaco init failed');
                resolve();
                return;
            }

            editor.onDidChangeModelContent(() => {
                scheduleSave(editor.getValue());
            });

            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runCode());
            editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => runSelection());
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
            });

            const relayout = () => {
                if (!editorHost) {
                    return;
                }
                editor.layout({
                    width: editorHost.clientWidth,
                    height: editorHost.clientHeight
                });
            };

            requestAnimationFrame(relayout);
            setTimeout(relayout, 120);
            window.addEventListener('resize', relayout);
            applyEditorOptions();
            resolve();
        }, () => {
            createFallbackEditor(getInitialCode(), 'monaco load failed');
            resolve();
        });
    });
}

async function runCode(codeOverride) {
    if (!pyodide || !hasEditor() || runBtn.disabled || isRunning) {
        return;
    }

    isRunning = true;
    runBtn.disabled = true;
    runSelectionBtn.disabled = true;
    runBtn.textContent = 'Running...';

    const startedAt = performance.now();
    const code = typeof codeOverride === 'string' ? codeOverride : getEditorCode();

    try {
        saveCodeImmediate(code);
        pushHistory(code);
        addToConsole('--- execution started ---', 'info');
        await pyodide.runPythonAsync(code);
        const elapsed = Math.round(performance.now() - startedAt);
        runMeta.textContent = `Last run: ${nowTime()} (${elapsed} ms)`;
        addToConsole(`--- execution finished in ${elapsed} ms ---`, 'info');
    } catch (err) {
        addToConsole(err.message, 'error');
    } finally {
        isRunning = false;
        runBtn.disabled = false;
        runSelectionBtn.disabled = false;
        runBtn.textContent = 'Run Code';
    }
}

async function runSelection() {
    const selection = getSelectedCode().trim();
    if (!selection) {
        addToConsole('No selection found.', 'info');
        return;
    }
    await runCode(selection);
}

async function installPackage() {
    const pkg = packageInput.value.trim();
    if (!pkg || !pyodide) {
        return;
    }

    installBtn.disabled = true;
    packageStatus.textContent = `Installing ${pkg}...`;

    try {
        await pyodide.runPythonAsync(`import micropip\nawait micropip.install('${pkg}')`);
        packageStatus.textContent = `Installed ${pkg} successfully.`;
        addToConsole(`Package installed: ${pkg}`, 'info');
    } catch (err) {
        packageStatus.textContent = `Failed to install ${pkg}: ${err.message}`;
        addToConsole(`Install Error: ${err.message}`, 'error');
    } finally {
        installBtn.disabled = false;
    }
}

async function copyText(text, successLabel) {
    if (!text) {
        addToConsole('Nothing to copy.', 'info');
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        addToConsole(successLabel, 'info');
    } catch (_err) {
        addToConsole('Clipboard copy failed.', 'error');
    }
}

function downloadText(filename, text, mime = 'text/plain') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function downloadCode() {
    if (!hasEditor()) {
        return;
    }
    downloadText('pyaoiastro_script.py', getEditorCode(), 'text/x-python');
}

function uploadCode(file) {
    const reader = new FileReader();
    reader.onload = () => {
        const text = String(reader.result || '');
        if (hasEditor()) {
            setEditorCode(text);
            saveCodeImmediate(text);
            addToConsole(`Loaded file: ${file.name}`, 'info');
        }
    };
    reader.readAsText(file);
}

function applySample(name) {
    const sample = SAMPLE_CODE[name];
    if (!sample || !hasEditor()) {
        return;
    }
    setEditorCode(sample);
    saveCodeImmediate(sample);
    addToConsole(`Sample loaded: ${name}`, 'info');
}

function resetCode() {
    if (!hasEditor()) {
        return;
    }
    setEditorCode(DEFAULT_CODE);
    saveCodeImmediate(DEFAULT_CODE);
    addToConsole('Editor reset to default code.', 'info');
}

function formatCode() {
    if (!hasEditor()) {
        return;
    }
    const formatted = getEditorCode()
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/g, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n');

    const normalized = formatted.endsWith('\n') ? formatted : `${formatted}\n`;
    setEditorCode(normalized);
    saveCodeImmediate(normalized);
    addToConsole('Formatted code (basic cleanup).', 'info');
}

function createShareLink() {
    if (!hasEditor()) {
        return;
    }
    try {
        const code = getEditorCode();
        const encoded = btoa(unescape(encodeURIComponent(code)));
        const url = `${window.location.origin}${window.location.pathname}#code=${encoded}`;
        copyText(url, 'Share link copied.');
    } catch (_err) {
        addToConsole('Share link generation failed.', 'error');
    }
}

function findNext() {
    const query = searchInput.value;
    if (!query) {
        return;
    }

    if (editor) {
        const model = editor.getModel();
        const matches = model.findMatches(query, true, false, false, null, true);
        if (!matches.length) {
            addToConsole(`No match: ${query}`, 'info');
            return;
        }

        const currentOffset = model.getOffsetAt(editor.getPosition());
        let target = matches.find((m) => model.getOffsetAt(m.range.getStartPosition()) > currentOffset);
        if (!target) {
            target = matches[0];
        }
        editor.setSelection(target.range);
        editor.revealRangeInCenter(target.range);
        return;
    }

    if (simpleEditor) {
        const source = simpleEditor.value;
        const start = source.indexOf(query, lastSearchIndex);
        if (start === -1) {
            lastSearchIndex = 0;
            addToConsole(`No match: ${query}`, 'info');
            return;
        }
        const end = start + query.length;
        simpleEditor.focus();
        simpleEditor.setSelectionRange(start, end);
        lastSearchIndex = end;
    }
}

function toggleWrap() {
    appSettings.wrap = !appSettings.wrap;
    updateToggleLabels();
    applyEditorOptions();
    persistSettings();
}

function toggleLineNumbers() {
    appSettings.lineNumbers = !appSettings.lineNumbers;
    updateToggleLabels();
    applyEditorOptions();
    persistSettings();
}

function toggleTheme() {
    appSettings.theme = appSettings.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    persistSettings();
}

function saveSnapshot() {
    if (!hasEditor()) {
        return;
    }
    saveJsonToStorage(SNAPSHOT_KEY, {
        code: getEditorCode(),
        savedAt: new Date().toISOString()
    });
    addToConsole('Snapshot saved.', 'info');
}

function loadSnapshot() {
    const snapshot = loadJsonFromStorage(SNAPSHOT_KEY, null);
    if (!snapshot || typeof snapshot.code !== 'string') {
        addToConsole('No snapshot found.', 'info');
        return;
    }
    setEditorCode(snapshot.code);
    saveCodeImmediate(snapshot.code);
    addToConsole('Snapshot loaded.', 'info');
}

function clearSnapshot() {
    try {
        localStorage.removeItem(SNAPSHOT_KEY);
    } catch (_err) {
        // no-op
    }
    addToConsole('Snapshot cleared.', 'info');
}

async function resetRuntime() {
    if (isRunning) {
        addToConsole('Wait until execution finishes before runtime reset.', 'info');
        return;
    }
    addToConsole('Resetting Python runtime...', 'info');
    await initPyodide();
}

function bindEvents() {
    runBtn.addEventListener('click', () => runCode());
    runSelectionBtn.addEventListener('click', runSelection);
    installBtn.addEventListener('click', installPackage);
    clearBtn.addEventListener('click', () => {
        output.textContent = '';
    });

    copyOutputBtn.addEventListener('click', () => copyText(output.textContent, 'Console output copied.'));
    downloadOutputBtn.addEventListener('click', () => {
        downloadText('pyaoiastro_output.txt', output.textContent, 'text/plain');
        addToConsole('Console log downloaded.', 'info');
    });

    packageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            installPackage();
        }
    });

    downloadBtn.addEventListener('click', downloadCode);
    copyCodeBtn.addEventListener('click', () => copyText(getEditorCode(), 'Editor code copied.'));
    uploadFileInput.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (file) {
            uploadCode(file);
        }
        event.target.value = '';
    });

    sampleSelect.addEventListener('change', (event) => {
        applySample(event.target.value);
        event.target.value = '';
    });

    resetBtn.addEventListener('click', resetCode);
    formatBtn.addEventListener('click', formatCode);
    shareBtn.addEventListener('click', createShareLink);
    themeBtn.addEventListener('click', toggleTheme);
    wrapBtn.addEventListener('click', toggleWrap);
    lineBtn.addEventListener('click', toggleLineNumbers);
    searchNextBtn.addEventListener('click', findNext);
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            findNext();
        }
    });

    fontSizeInput.addEventListener('input', (event) => {
        appSettings.fontSize = Number(event.target.value);
        applyEditorOptions();
        persistSettings();
    });

    historySelect.addEventListener('change', (event) => {
        const index = Number(event.target.value);
        if (!Number.isInteger(index) || index < 0 || index >= runHistory.length) {
            return;
        }
        const selected = runHistory[index];
        setEditorCode(selected);
        saveCodeImmediate(selected);
        addToConsole('Loaded code from history.', 'info');
    });

    snapshotSaveBtn.addEventListener('click', saveSnapshot);
    snapshotLoadBtn.addEventListener('click', loadSnapshot);
    snapshotClearBtn.addEventListener('click', clearSnapshot);
    resetRuntimeBtn.addEventListener('click', resetRuntime);
}

async function bootstrap() {
    loadSettings();
    loadHistory();
    updateToggleLabels();
    applyTheme();
    bindEvents();
    renderHistory();
    await initMonaco();
    applyEditorOptions();
    await initPyodide();
    addToConsole('Tips: Ctrl/Cmd+Enter run all, Shift+Enter run selection.', 'info');
}

bootstrap();
