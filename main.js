let pyodide;

const statusDot = document.querySelector('.status-dot');
const statusText = document.getElementById('pyodide-status').querySelector('.status-text');
const output = document.getElementById('output');
const runBtn = document.getElementById('run-btn');
const installBtn = document.getElementById('install-btn');
const packageInput = document.getElementById('package-name');
const packageStatus = document.getElementById('package-status');
const codeInput = document.getElementById('code-input');
const clearBtn = document.getElementById('clear-btn');

function addToConsole(content, type = 'log') {
    const span = document.createElement('span');
    span.className = `console-${type}`;
    span.textContent = content + '\n';
    output.appendChild(span);
    output.scrollTop = output.scrollHeight;
}

async function initPyodide() {
    try {
        pyodide = await loadPyodide({
            stdout: (msg) => addToConsole(msg),
            stderr: (msg) => addToConsole(msg, 'error')
        });
        
        // Load micropip
        await pyodide.loadPackage("micropip");
        const micropip = pyodide.pyimport("micropip");
        
        statusDot.classList.add('ready');
        statusText.textContent = 'Pyodide Ready';
        runBtn.disabled = false;
        installBtn.disabled = false;
        addToConsole('Python environment initialized successfully.');
    } catch (err) {
        addToConsole(`Initialization Error: ${err.message}`, 'error');
        statusText.textContent = 'Init Failed';
    }
}

runBtn.addEventListener('click', async () => {
    const code = codeInput.value;
    runBtn.disabled = true;
    runBtn.textContent = 'Running...';
    
    try {
        // Clear previous output if needed or keep it
        // addToConsole('--- Executing ---', 'info');
        await pyodide.runPythonAsync(code);
    } catch (err) {
        addToConsole(err.message, 'error');
    } finally {
        runBtn.disabled = false;
        runBtn.textContent = 'Run Code';
    }
});

installBtn.addEventListener('click', async () => {
    const pkg = packageInput.value.trim();
    if (!pkg) return;

    installBtn.disabled = true;
    packageStatus.textContent = `Installing ${pkg}...`;
    
    try {
        await pyodide.runPythonAsync(`
            import micropip
            await micropip.install('${pkg}')
        `);
        packageStatus.textContent = `Installed ${pkg} successfully!`;
        addToConsole(`Package ${pkg} installed.`);
    } catch (err) {
        packageStatus.textContent = `Failed to install ${pkg}: ${err.message}`;
        addToConsole(`Install Error: ${err.message}`, 'error');
    } finally {
        installBtn.disabled = false;
    }
});

clearBtn.addEventListener('click', () => {
    output.textContent = '';
});

// Start initialization
initPyodide();
