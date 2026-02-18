const STORAGE_KEY = 'pyaoiastro-code';
const DEFAULT_CODE = `print("Hello from pyaoiastro")\nfor i in range(3):\n    print(f"star {i}")`;

const SAMPLE_CODE = {
    hello: `print("Python is running in your browser")\nfor i in range(5):\n    print("orbit", i)`,
    math: `numbers = [1, 2, 3, 4, 5]\nprint("sum:", sum(numbers))\nprint("squares:", [n*n for n in numbers])`,
    plot: `import matplotlib.pyplot as plt\n\nx = [1, 2, 3, 4, 5]\ny = [1, 4, 9, 16, 25]\n\nplt.plot(x, y, marker="o")\nplt.title("Simple Plot")\nplt.xlabel("x")\nplt.ylabel("y")\nplt.show()`
};

let pyodide;
let editor;

const statusDot = document.querySelector('.status-dot');
const statusText = document.querySelector('#pyodide-status .status-text');
const output = document.getElementById('output');
const runBtn = document.getElementById('run-btn');
const installBtn = document.getElementById('install-btn');
const resetBtn = document.getElementById('reset-btn');
const downloadBtn = document.getElementById('download-btn');
const uploadFileInput = document.getElementById('upload-file');
const sampleSelect = document.getElementById('sample-select');
const packageInput = document.getElementById('package-name');
const packageStatus = document.getElementById('package-status');
const clearBtn = document.getElementById('clear-btn');
const runMeta = document.getElementById('run-meta');

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

function getInitialCode() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_CODE;
}

function saveCode(value) {
    localStorage.setItem(STORAGE_KEY, value);
}

function updateReadyState(ready) {
    statusDot.classList.toggle('ready', ready);
    runBtn.disabled = !ready;
    installBtn.disabled = !ready;
}

async function initPyodide() {
    try {
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
        require.config({
            paths: {
                vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs'
            }
        });

        require(['vs/editor/editor.main'], () => {
            editor = monaco.editor.create(document.getElementById('code-editor'), {
                value: getInitialCode(),
                language: 'python',
                theme: 'vs-dark',
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: 'on'
            });

            editor.onDidChangeModelContent(() => {
                saveCode(editor.getValue());
            });

            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                runCode();
            });

            resolve();
        });
    });
}

async function runCode() {
    if (!pyodide || !editor || runBtn.disabled) {
        return;
    }

    runBtn.disabled = true;
    runBtn.textContent = 'Running...';

    const startedAt = performance.now();
    const code = editor.getValue();

    try {
        saveCode(code);
        addToConsole('--- execution started ---', 'info');
        await pyodide.runPythonAsync(code);
        const elapsed = Math.round(performance.now() - startedAt);
        runMeta.textContent = `Last run: ${nowTime()} (${elapsed} ms)`;
        addToConsole(`--- execution finished in ${elapsed} ms ---`, 'info');
    } catch (err) {
        addToConsole(err.message, 'error');
    } finally {
        runBtn.disabled = false;
        runBtn.textContent = 'Run Code';
    }
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

function downloadCode() {
    if (!editor) {
        return;
    }
    const blob = new Blob([editor.getValue()], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pyaoiastro_script.py';
    a.click();
    URL.revokeObjectURL(url);
}

function uploadCode(file) {
    const reader = new FileReader();
    reader.onload = () => {
        const text = String(reader.result || '');
        if (editor) {
            editor.setValue(text);
            saveCode(text);
            addToConsole(`Loaded file: ${file.name}`, 'info');
        }
    };
    reader.readAsText(file);
}

function applySample(name) {
    const sample = SAMPLE_CODE[name];
    if (!sample || !editor) {
        return;
    }
    editor.setValue(sample);
    saveCode(sample);
    addToConsole(`Sample loaded: ${name}`, 'info');
}

function resetCode() {
    if (!editor) {
        return;
    }
    editor.setValue(DEFAULT_CODE);
    saveCode(DEFAULT_CODE);
    addToConsole('Editor reset to default code.', 'info');
}

function bindEvents() {
    runBtn.addEventListener('click', runCode);
    installBtn.addEventListener('click', installPackage);
    clearBtn.addEventListener('click', () => {
        output.textContent = '';
    });

    packageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            installPackage();
        }
    });

    downloadBtn.addEventListener('click', downloadCode);
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
}

async function bootstrap() {
    bindEvents();
    await initMonaco();
    await initPyodide();
    addToConsole('Tip: use Ctrl/Cmd + Enter to run code.', 'info');
}

bootstrap();
