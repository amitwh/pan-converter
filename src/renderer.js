const { ipcRenderer } = require('electron');
const marked = require('marked');
const DOMPurify = require('dompurify');
const hljs = require('highlight.js');

// Configure marked
marked.setOptions({
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(code, { language: lang }).value;
            } catch (err) {}
        }
        return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true
});

// Elements
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const previewPane = document.getElementById('preview-pane');
const editorPane = document.getElementById('editor-pane');
const statusText = document.getElementById('status-text');
const wordCount = document.getElementById('word-count');
const lineNumbers = document.getElementById('line-numbers');
const findDialog = document.getElementById('find-dialog');
const findInput = document.getElementById('find-input');
const replaceInput = document.getElementById('replace-input');
const findCount = document.getElementById('find-count');

// State
let isPreviewVisible = true;
let currentContent = '';
let isDirty = false;
let showLineNumbers = false;
let findMatches = [];
let currentMatchIndex = -1;
let undoStack = [];
let redoStack = [];
let maxUndoSize = 50;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Request current theme
    ipcRenderer.send('get-theme');
    
    // Set up auto-save interval
    setInterval(autoSave, 30000); // Auto-save every 30 seconds
    
    // Initialize with empty content
    updatePreview();
    updateWordCount();
});

// Editor input handler
editor.addEventListener('input', () => {
    currentContent = editor.value;
    isDirty = true;
    updatePreview();
    updateWordCount();
    updateStatus('Modified');
});

// Toolbar button handlers
document.getElementById('btn-bold').addEventListener('click', () => insertMarkdown('**', '**'));
document.getElementById('btn-italic').addEventListener('click', () => insertMarkdown('*', '*'));
document.getElementById('btn-heading').addEventListener('click', () => insertMarkdown('## ', ''));
document.getElementById('btn-link').addEventListener('click', () => insertMarkdown('[', '](url)'));
document.getElementById('btn-code').addEventListener('click', () => insertMarkdown('`', '`'));
document.getElementById('btn-list').addEventListener('click', () => insertMarkdown('- ', ''));
document.getElementById('btn-quote').addEventListener('click', () => insertMarkdown('> ', ''));
document.getElementById('btn-table').addEventListener('click', insertTable);
document.getElementById('btn-find').addEventListener('click', toggleFindDialog);
document.getElementById('btn-line-numbers').addEventListener('click', toggleLineNumbers);
document.getElementById('btn-preview-toggle').addEventListener('click', togglePreview);

// Find dialog handlers
document.getElementById('btn-find-close').addEventListener('click', closeFindDialog);
document.getElementById('btn-find-next').addEventListener('click', findNext);
document.getElementById('btn-find-prev').addEventListener('click', findPrev);
document.getElementById('btn-replace').addEventListener('click', replaceOne);
document.getElementById('btn-replace-all').addEventListener('click', replaceAll);
findInput.addEventListener('input', performFind);
replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') replaceOne();
});

// Table insertion function
function insertTable() {
    const rows = prompt('Number of rows:', '3');
    const cols = prompt('Number of columns:', '3');
    
    if (!rows || !cols) return;
    
    const numRows = parseInt(rows);
    const numCols = parseInt(cols);
    
    if (isNaN(numRows) || isNaN(numCols) || numRows < 1 || numCols < 1) {
        alert('Please enter valid numbers for rows and columns');
        return;
    }
    
    let table = '\n';
    
    // Header row
    table += '|';
    for (let j = 0; j < numCols; j++) {
        table += ` Header ${j + 1} |`;
    }
    table += '\n';
    
    // Separator row
    table += '|';
    for (let j = 0; j < numCols; j++) {
        table += ' --- |';
    }
    table += '\n';
    
    // Data rows
    for (let i = 0; i < numRows; i++) {
        table += '|';
        for (let j = 0; j < numCols; j++) {
            table += ` Cell ${i + 1}-${j + 1} |`;
        }
        table += '\n';
    }
    table += '\n';
    
    // Insert table at cursor position
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    
    editor.value = editor.value.substring(0, start) + table + editor.value.substring(end);
    
    // Set cursor after the table
    editor.selectionStart = editor.selectionEnd = start + table.length;
    editor.focus();
    
    // Trigger input event
    editor.dispatchEvent(new Event('input'));
}

// Markdown insertion helper
function insertMarkdown(before, after) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.substring(start, end);
    const replacement = before + (selectedText || 'text') + after;
    
    editor.value = editor.value.substring(0, start) + replacement + editor.value.substring(end);
    
    // Set cursor position
    if (selectedText) {
        editor.selectionStart = start;
        editor.selectionEnd = start + replacement.length;
    } else {
        editor.selectionStart = start + before.length;
        editor.selectionEnd = start + before.length + 4; // Select "text"
    }
    
    editor.focus();
    
    // Trigger input event
    editor.dispatchEvent(new Event('input'));
}

// Update preview
function updatePreview() {
    const html = marked.parse(editor.value);
    const clean = DOMPurify.sanitize(html);
    preview.innerHTML = clean;
    
    // Re-highlight code blocks
    preview.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
    });
}

// Toggle preview visibility
function togglePreview() {
    isPreviewVisible = !isPreviewVisible;
    
    if (isPreviewVisible) {
        previewPane.classList.remove('hidden');
        editorPane.classList.remove('full-width');
    } else {
        previewPane.classList.add('hidden');
        editorPane.classList.add('full-width');
    }
}

// Update word count
function updateWordCount() {
    const text = editor.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    wordCount.textContent = `Words: ${words} | Characters: ${chars}`;
}

// Update status
function updateStatus(text) {
    statusText.textContent = text;
}

// Auto-save function
function autoSave() {
    if (isDirty && currentContent) {
        ipcRenderer.send('save-current-file', currentContent);
        isDirty = false;
        updateStatus('Auto-saved');
        setTimeout(() => updateStatus('Ready'), 2000);
    }
}

// IPC event handlers
ipcRenderer.on('file-new', () => {
    if (isDirty) {
        if (confirm('You have unsaved changes. Do you want to continue?')) {
            editor.value = '';
            currentContent = '';
            isDirty = false;
            updatePreview();
            updateWordCount();
            updateStatus('New file');
        }
    } else {
        editor.value = '';
        currentContent = '';
        updatePreview();
        updateWordCount();
        updateStatus('New file');
    }
});

ipcRenderer.on('file-opened', (event, { path, content }) => {
    editor.value = content;
    currentContent = content;
    isDirty = false;
    updatePreview();
    updateWordCount();
    updateStatus(`Opened: ${path}`);
});

ipcRenderer.on('file-save', () => {
    ipcRenderer.send('save-current-file', editor.value);
    isDirty = false;
    updateStatus('Saved');
});

ipcRenderer.on('get-content-for-save', (event, path) => {
    ipcRenderer.send('save-file', { path, content: editor.value });
    isDirty = false;
    updateStatus(`Saved: ${path}`);
});

ipcRenderer.on('toggle-preview', () => {
    togglePreview();
});

ipcRenderer.on('theme-changed', (event, theme) => {
    // Remove all theme classes
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-solarized', 'theme-monokai', 'theme-github');
    
    // Add new theme class
    if (theme !== 'light') {
        document.body.classList.add(`theme-${theme}`);
    }
    
    updateStatus(`Theme: ${theme}`);
});

ipcRenderer.on('get-content-for-spreadsheet', (event, format) => {
    ipcRenderer.send('export-spreadsheet', { content: editor.value, format });
});

ipcRenderer.on('toggle-find', () => {
    toggleFindDialog();
});

// Enhanced editor input handler with undo/redo and auto-indentation
editor.addEventListener('input', (e) => {
    // Save state for undo
    if (e.inputType !== 'historyUndo' && e.inputType !== 'historyRedo') {
        pushUndo();
    }
    
    updateLineNumbers();
});

// Push current state to undo stack
function pushUndo() {
    if (undoStack.length >= maxUndoSize) {
        undoStack.shift();
    }
    undoStack.push({
        content: currentContent,
        selectionStart: editor.selectionStart,
        selectionEnd: editor.selectionEnd
    });
    redoStack = []; // Clear redo stack when new changes are made
}

// Undo function
function undo() {
    if (undoStack.length > 1) {
        redoStack.push(undoStack.pop());
        const state = undoStack[undoStack.length - 1];
        editor.value = state.content;
        editor.selectionStart = state.selectionStart;
        editor.selectionEnd = state.selectionEnd;
        currentContent = state.content;
        updatePreview();
        updateWordCount();
        updateLineNumbers();
    }
}

// Redo function
function redo() {
    if (redoStack.length > 0) {
        const state = redoStack.pop();
        undoStack.push(state);
        editor.value = state.content;
        editor.selectionStart = state.selectionStart;
        editor.selectionEnd = state.selectionEnd;
        currentContent = state.content;
        updatePreview();
        updateWordCount();
        updateLineNumbers();
    }
}

// Find & Replace functionality
function toggleFindDialog() {
    if (findDialog.classList.contains('hidden')) {
        findDialog.classList.remove('hidden');
        findInput.focus();
        if (editor.selectionStart !== editor.selectionEnd) {
            findInput.value = editor.value.substring(editor.selectionStart, editor.selectionEnd);
            performFind();
        }
    } else {
        closeFindDialog();
    }
}

function closeFindDialog() {
    findDialog.classList.add('hidden');
    clearHighlights();
    editor.focus();
}

function performFind() {
    const searchText = findInput.value;
    clearHighlights();
    findMatches = [];
    currentMatchIndex = -1;
    
    if (!searchText) {
        findCount.textContent = '0 matches';
        return;
    }
    
    const content = editor.value;
    let index = 0;
    while ((index = content.indexOf(searchText, index)) !== -1) {
        findMatches.push(index);
        index += searchText.length;
    }
    
    findCount.textContent = `${findMatches.length} matches`;
    
    if (findMatches.length > 0) {
        currentMatchIndex = 0;
        highlightMatch();
    }
}

function findNext() {
    if (findMatches.length === 0) return;
    currentMatchIndex = (currentMatchIndex + 1) % findMatches.length;
    highlightMatch();
}

function findPrev() {
    if (findMatches.length === 0) return;
    currentMatchIndex = currentMatchIndex === 0 ? findMatches.length - 1 : currentMatchIndex - 1;
    highlightMatch();
}

function highlightMatch() {
    if (currentMatchIndex === -1 || !findMatches[currentMatchIndex]) return;
    
    const matchStart = findMatches[currentMatchIndex];
    const matchEnd = matchStart + findInput.value.length;
    
    editor.selectionStart = matchStart;
    editor.selectionEnd = matchEnd;
    editor.focus();
    
    // Scroll to match
    const lineHeight = 20; // Approximate line height
    const lineNumber = editor.value.substring(0, matchStart).split('\n').length;
    editor.scrollTop = Math.max(0, (lineNumber - 10) * lineHeight);
}

function replaceOne() {
    if (currentMatchIndex === -1 || !findMatches[currentMatchIndex]) return;
    
    const searchText = findInput.value;
    const replaceText = replaceInput.value;
    const matchStart = findMatches[currentMatchIndex];
    const matchEnd = matchStart + searchText.length;
    
    editor.value = editor.value.substring(0, matchStart) + 
                   replaceText + 
                   editor.value.substring(matchEnd);
    
    editor.selectionStart = matchStart;
    editor.selectionEnd = matchStart + replaceText.length;
    
    // Trigger input event
    editor.dispatchEvent(new Event('input'));
    
    // Refresh find
    setTimeout(() => performFind(), 10);
}

function replaceAll() {
    const searchText = findInput.value;
    const replaceText = replaceInput.value;
    
    if (!searchText) return;
    
    let content = editor.value;
    let replacements = 0;
    
    while (content.includes(searchText)) {
        content = content.replace(searchText, replaceText);
        replacements++;
    }
    
    if (replacements > 0) {
        editor.value = content;
        editor.dispatchEvent(new Event('input'));
        updateStatus(`Replaced ${replacements} occurrences`);
        performFind();
    }
}

function clearHighlights() {
    // Clear any highlights (in a real implementation, you'd remove highlight spans)
}

// Line Numbers functionality
function toggleLineNumbers() {
    showLineNumbers = !showLineNumbers;
    if (showLineNumbers) {
        lineNumbers.classList.remove('hidden');
        updateLineNumbers();
    } else {
        lineNumbers.classList.add('hidden');
    }
}

function updateLineNumbers() {
    if (!showLineNumbers) return;
    
    const lines = editor.value.split('\n');
    const lineNumbersHtml = lines.map((_, index) => 
        `<span class="line-number">${index + 1}</span>`
    ).join('');
    lineNumbers.innerHTML = lineNumbersHtml;
    
    // Sync scroll
    lineNumbers.scrollTop = editor.scrollTop;
}

// Sync line numbers scroll with editor
editor.addEventListener('scroll', () => {
    if (showLineNumbers) {
        lineNumbers.scrollTop = editor.scrollTop;
    }
});

// Auto-indentation for lists
function handleEnterKey(e) {
    const cursorPos = editor.selectionStart;
    const beforeCursor = editor.value.substring(0, cursorPos);
    const lines = beforeCursor.split('\n');
    const currentLine = lines[lines.length - 1];
    
    // Check for list patterns
    const listMatch = currentLine.match(/^(\s*)([-*+]|\d+\.)\s/);
    if (listMatch) {
        e.preventDefault();
        const indent = listMatch[1];
        const marker = listMatch[2];
        
        // If current line is just the marker, remove it
        if (currentLine.trim() === marker) {
            const lineStart = beforeCursor.lastIndexOf('\n') + 1;
            editor.value = editor.value.substring(0, lineStart) + 
                          editor.value.substring(cursorPos);
            editor.selectionStart = editor.selectionEnd = lineStart;
        } else {
            // Continue the list
            let newMarker = marker;
            if (/^\d+\./.test(marker)) {
                const num = parseInt(marker) + 1;
                newMarker = num + '.';
            }
            const insertion = '\n' + indent + newMarker + ' ';
            editor.value = editor.value.substring(0, cursorPos) + 
                          insertion + 
                          editor.value.substring(cursorPos);
            editor.selectionStart = editor.selectionEnd = cursorPos + insertion.length;
        }
        
        editor.dispatchEvent(new Event('input'));
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + F for find
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        toggleFindDialog();
    }
    
    // Ctrl/Cmd + Z for undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
    }
    
    // Ctrl/Cmd + Shift + Z for redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
    }
    
    // Ctrl/Cmd + Enter to toggle preview
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        togglePreview();
    }
    
    // Enhanced Tab handling in editor
    if (e.key === 'Tab' && e.target === editor) {
        e.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        
        if (start === end) {
            // Simple tab insertion
            editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 4;
        } else {
            // Indent/outdent selected lines
            const beforeSelection = editor.value.substring(0, start);
            const selection = editor.value.substring(start, end);
            const afterSelection = editor.value.substring(end);
            
            const lines = selection.split('\n');
            const indentedLines = e.shiftKey ? 
                lines.map(line => line.replace(/^    /, '')) : // Outdent
                lines.map(line => '    ' + line); // Indent
            
            const newSelection = indentedLines.join('\n');
            editor.value = beforeSelection + newSelection + afterSelection;
            
            editor.selectionStart = start;
            editor.selectionEnd = start + newSelection.length;
        }
        
        editor.dispatchEvent(new Event('input'));
    }
    
    // Enter key handling for auto-indentation
    if (e.key === 'Enter' && e.target === editor) {
        handleEnterKey(e);
    }
    
    // Escape to close find dialog
    if (e.key === 'Escape' && !findDialog.classList.contains('hidden')) {
        closeFindDialog();
    }
});

// Prevent accidental navigation
window.addEventListener('beforeunload', (e) => {
    if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
    }
});