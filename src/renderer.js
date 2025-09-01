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

// State
let isPreviewVisible = true;
let currentContent = '';
let isDirty = false;

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
document.getElementById('btn-preview-toggle').addEventListener('click', togglePreview);

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

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to toggle preview
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        togglePreview();
    }
    
    // Tab key in editor
    if (e.key === 'Tab' && e.target === editor) {
        e.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        
        editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
        editor.selectionStart = editor.selectionEnd = start + 4;
    }
});

// Prevent accidental navigation
window.addEventListener('beforeunload', (e) => {
    if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
    }
});