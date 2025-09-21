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
            } catch (err) {
                // Fallback to auto highlighting if language-specific highlighting fails
                console.warn('Syntax highlighting failed for language:', lang, err.message);
            }
        }
        return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true
});

// Tab Management
class TabManager {
    constructor() {
        this.tabs = new Map();
        this.activeTabId = 1;
        this.nextTabId = 2;
        this.isPreviewVisible = true;
        this.showLineNumbers = false;
        this.autoSaveInterval = null;
        this.autoSaveDelay = 30000; // 30 seconds
        this.recentFiles = JSON.parse(localStorage.getItem('recentFiles') || '[]');
        
        // Initialize first tab
        this.tabs.set(1, {
            id: 1,
            title: 'Untitled',
            content: '',
            filePath: null,
            isDirty: false,
            undoStack: [],
            redoStack: [],
            findMatches: [],
            currentMatchIndex: -1
        });
        
        this.setupEventListeners();
        this.updateUI();
    }
    
    setupEventListeners() {
        // Tab bar events
        document.getElementById('new-tab-btn').addEventListener('click', () => this.createNewTab());
        document.getElementById('tab-bar').addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-close')) {
                e.stopPropagation();
                const tabId = parseInt(e.target.closest('.tab').dataset.tabId);
                this.closeTab(tabId);
            } else if (e.target.closest('.tab')) {
                const tabId = parseInt(e.target.closest('.tab').dataset.tabId);
                this.switchToTab(tabId);
            }
        });
        
        // Editor events for active tab
        this.setupEditorEvents();
        
        // Toolbar events
        this.setupToolbarEvents();
        
        // Find dialog events
        this.setupFindEvents();
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'n':
                    case 't':
                        e.preventDefault();
                        this.createNewTab();
                        break;
                    case 'w':
                        if (this.tabs.size > 1) {
                            e.preventDefault();
                            this.closeTab(this.activeTabId);
                        }
                        break;
                    case 'Tab':
                        if (this.tabs.size > 1) {
                            e.preventDefault();
                            this.switchToNextTab();
                        }
                        break;
                }
            }
        });
    }
    
    createNewTab() {
        const newTabId = this.nextTabId++;
        const tab = {
            id: newTabId,
            title: 'Untitled',
            content: '',
            filePath: null,
            isDirty: false,
            undoStack: [],
            redoStack: [],
            findMatches: [],
            currentMatchIndex: -1
        };
        
        this.tabs.set(newTabId, tab);
        this.createTabElements(tab);
        this.switchToTab(newTabId);
        this.startAutoSave();
        this.updateTabBar();
    }
    
    createTabElements(tab) {
        // Create tab content container
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content';
        tabContent.id = `tab-content-${tab.id}`;
        tabContent.dataset.tabId = tab.id;
        
        tabContent.innerHTML = `
            <div id="editor-pane-${tab.id}" class="pane">
                <div class="editor-wrapper">
                    <div id="line-numbers-${tab.id}" class="line-numbers hidden"></div>
                    <textarea id="editor-${tab.id}" class="editor-textarea"></textarea>
                </div>
            </div>
            <div id="preview-pane-${tab.id}" class="pane">
                <div id="preview-${tab.id}" class="preview-content"></div>
            </div>
        `;
        
        document.querySelector('.editor-container').appendChild(tabContent);
    }
    
    switchToTab(tabId) {
        if (!this.tabs.has(tabId)) return;
        
        // Save current tab state before switching
        if (this.activeTabId && this.tabs.has(this.activeTabId)) {
            this.saveCurrentTabState();
        }
        
        this.activeTabId = tabId;
        this.updateUI();
        this.restoreTabState(tabId);
        this.focusActiveEditor();
        
        // Notify main process about current file for exports
        const tab = this.tabs.get(tabId);
        if (tab?.filePath) {
            ipcRenderer.send('set-current-file', tab.filePath);
        }
    }
    
    switchToNextTab() {
        const tabIds = Array.from(this.tabs.keys());
        const currentIndex = tabIds.indexOf(this.activeTabId);
        const nextIndex = (currentIndex + 1) % tabIds.length;
        this.switchToTab(tabIds[nextIndex]);
    }
    
    closeTab(tabId) {
        if (this.tabs.size === 1) return; // Don't close the last tab
        
        const tab = this.tabs.get(tabId);
        if (tab.isDirty) {
            // Show confirmation dialog for unsaved changes
            const result = confirm('You have unsaved changes. Do you want to close this tab without saving?');
            if (!result) return;
        }
        
        // Remove tab elements
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        const tabContent = document.getElementById(`tab-content-${tabId}`);
        
        if (tabElement?.classList.contains('tab')) {
            tabElement.remove();
        }
        if (tabContent) {
            tabContent.remove();
        }
        
        this.tabs.delete(tabId);
        
        // Switch to another tab if this was active
        if (this.activeTabId === tabId) {
            const remainingTabs = Array.from(this.tabs.keys());
            this.switchToTab(remainingTabs[0]);
        }
        
        this.updateTabBar();
    }
    
    updateTabBar() {
        const tabBar = document.getElementById('tab-bar');
        const existingTabs = tabBar.querySelectorAll('.tab');
        
        // Remove all existing tab elements except the new tab button
        existingTabs.forEach(tab => tab.remove());
        
        // Add tabs in order
        const sortedTabs = Array.from(this.tabs.values()).sort((a, b) => a.id - b.id);
        const newTabBtn = document.getElementById('new-tab-btn');
        
        sortedTabs.forEach(tab => {
            const tabElement = document.createElement('div');
            tabElement.className = `tab ${tab.id === this.activeTabId ? 'active' : ''}`;
            tabElement.dataset.tabId = tab.id;
            
            const title = tab.filePath ? 
                tab.filePath.split('/').pop() : 
                tab.title;
                
            const dirtyIndicator = tab.isDirty ? ' •' : '';
            
            tabElement.innerHTML = `
                <span class="tab-title">${title}${dirtyIndicator}</span>
                <button class="tab-close" title="Close tab">×</button>
            `;
            
            tabBar.insertBefore(tabElement, newTabBtn);
        });
    }
    
    updateUI() {
        // Show/hide tab contents
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const activeContent = document.getElementById(`tab-content-${this.activeTabId}`);
        if (activeContent) {
            activeContent.classList.add('active');
        }
        
        // Update preview visibility
        this.updatePreviewVisibility();
        this.updateLineNumbers();
        this.updateTabBar();
    }
    
    saveCurrentTabState() {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab) return;
        
        const editor = document.getElementById(`editor-${this.activeTabId}`);
        if (editor) {
            tab.content = editor.value;
            tab.isDirty = tab.content !== (tab.originalContent || '');
        }
    }
    
    restoreTabState(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;
        
        const editor = document.getElementById(`editor-${tabId}`);
        
        if (editor) {
            editor.value = tab.content;
            this.updatePreview(tabId);
            this.updateWordCount();
        }
    }
    
    focusActiveEditor() {
        const editor = document.getElementById(`editor-${this.activeTabId}`);
        if (editor) {
            editor.focus();
        }
    }
    
    updatePreview(tabId = this.activeTabId) {
        const tab = this.tabs.get(tabId);
        const preview = document.getElementById(`preview-${tabId}`);
        
        if (!tab || !preview) return;
        
        try {
            const html = marked.parse(tab.content);
            const sanitizedHtml = DOMPurify.sanitize(html);
            preview.innerHTML = sanitizedHtml;

            // Render math expressions if KaTeX is available
            if (window.katex && window.renderMathInElement) {
                try {
                    window.renderMathInElement(preview, {
                        delimiters: [
                            {left: '$$', right: '$$', display: true},
                            {left: '$', right: '$', display: false},
                            {left: '\\[', right: '\\]', display: true},
                            {left: '\\(', right: '\\)', display: false}
                        ]
                    });
                } catch (mathError) {
                    console.warn('Math rendering error:', mathError);
                }
            }
        } catch (error) {
            console.error('Error rendering preview:', error);
            preview.innerHTML = '<p class="error">Error rendering preview. Please check your markdown syntax.</p>';
        }
    }
    
    updatePreviewVisibility() {
        document.querySelectorAll('.tab-content').forEach(content => {
            const previewPane = content.querySelector('.pane:last-child');
            const editorPane = content.querySelector('.pane:first-child');
            
            if (this.isPreviewVisible) {
                previewPane.classList.remove('hidden');
                editorPane.classList.remove('full-width');
            } else {
                previewPane.classList.add('hidden');
                editorPane.classList.add('full-width');
            }
        });
    }
    
    updateLineNumbers() {
        const editor = document.getElementById(`editor-${this.activeTabId}`);
        const lineNumbers = document.getElementById(`line-numbers-${this.activeTabId}`);
        
        if (!editor || !lineNumbers) return;
        
        if (this.showLineNumbers) {
            const lines = editor.value.split('\\n');
            lineNumbers.innerHTML = lines.map((_, i) => 
                `<div class="line-number">${i + 1}</div>`
            ).join('');
            lineNumbers.classList.remove('hidden');
        } else {
            lineNumbers.classList.add('hidden');
        }
    }
    
    updateWordCount() {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab) return;

        const content = tab.content;
        const words = content.trim() ? content.trim().split(/\s+/).filter(word => word.length > 0).length : 0;
        const chars = content.length;
        const charsNoSpaces = content.replace(/\s/g, '').length;

        // Enhanced statistics
        const lines = content.split('\n').length;
        const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim()).length;
        const readingTime = Math.ceil(words / 200); // Average reading speed: 200 words/minute
        const sentences = content.split(/[.!?]+/).filter(s => s.trim()).length;

        // Update the word count display with enhanced stats
        const basicStats = `Words: ${words} | Characters: ${chars} (${charsNoSpaces} no spaces)`;
        const enhancedStats = `Lines: ${lines} | Paragraphs: ${paragraphs} | Sentences: ${sentences} | Reading time: ${readingTime} min`;

        document.getElementById('word-count').textContent = basicStats;

        // Add enhanced stats to a separate element
        let enhancedEl = document.getElementById('enhanced-stats');
        if (!enhancedEl) {
            enhancedEl = document.createElement('div');
            enhancedEl.id = 'enhanced-stats';
            enhancedEl.className = 'enhanced-stats';
            document.querySelector('.status-bar').appendChild(enhancedEl);
        }
        enhancedEl.textContent = enhancedStats;
    }
    
    setupEditorEvents() {
        // Set up editor events using event delegation
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('editor-textarea')) {
                const tabId = parseInt(e.target.id.split('-')[1]);
                if (tabId === this.activeTabId) {
                    this.handleEditorInput(tabId);
                }
            }
        });
        
        document.addEventListener('scroll', (e) => {
            if (e.target.classList.contains('editor-textarea')) {
                const tabId = parseInt(e.target.id.split('-')[1]);
                if (tabId === this.activeTabId) {
                    this.updateLineNumbers();
                }
            }
        });
    }
    
    handleEditorInput(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;
        
        const editor = document.getElementById(`editor-${tabId}`);
        tab.content = editor.value;
        tab.isDirty = true;
        
        this.updatePreview(tabId);
        this.updateWordCount();
        this.updateLineNumbers();
        this.updateTabBar();
        
        // Add to undo stack
        this.pushUndoState(tabId);
    }
    
    pushUndoState(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;
        
        tab.undoStack.push(tab.content);
        if (tab.undoStack.length > 50) {
            tab.undoStack.shift();
        }
        tab.redoStack = [];
    }
    
    undo() {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab || tab.undoStack.length === 0) return;
        
        tab.redoStack.push(tab.content);
        tab.content = tab.undoStack.pop();
        
        const editor = document.getElementById(`editor-${this.activeTabId}`);
        if (editor) {
            editor.value = tab.content;
            this.updatePreview();
            this.updateWordCount();
        }
    }
    
    redo() {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab || tab.redoStack.length === 0) return;
        
        tab.undoStack.push(tab.content);
        tab.content = tab.redoStack.pop();
        
        const editor = document.getElementById(`editor-${this.activeTabId}`);
        if (editor) {
            editor.value = tab.content;
            this.updatePreview();
            this.updateWordCount();
        }
    }

    // Auto-save functionality
    startAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }

        this.autoSaveInterval = setInterval(() => {
            this.performAutoSave();
        }, this.autoSaveDelay);
    }

    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }

    performAutoSave() {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab || !tab.filePath || !tab.content) return;

        // Only auto-save if content has changed since last save
        if (tab.lastSavedContent !== tab.content) {
            ipcRenderer.send('save-file', { path: tab.filePath, content: tab.content });
            tab.lastSavedContent = tab.content;

            // Show brief auto-save indicator
            this.showAutoSaveIndicator();
        }
    }

    showAutoSaveIndicator() {
        const indicator = document.createElement('div');
        indicator.textContent = 'Auto-saved';
        indicator.className = 'auto-save-indicator';
        document.body.appendChild(indicator);

        setTimeout(() => {
            indicator.classList.add('fade-out');
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
            }, 300);
        }, 1500);
    }

    // Recent files functionality
    addToRecentFiles(filePath) {
        if (!filePath) return;

        // Remove if already exists
        this.recentFiles = this.recentFiles.filter(f => f !== filePath);

        // Add to beginning
        this.recentFiles.unshift(filePath);

        // Keep only last 10 files
        this.recentFiles = this.recentFiles.slice(0, 10);

        // Save to localStorage and sync with main process
        localStorage.setItem('recentFiles', JSON.stringify(this.recentFiles));
        window.electronAPI.send('save-recent-files', this.recentFiles);
    }

    getRecentFiles() {
        return this.recentFiles.filter(file => {
            // Check if file still exists (basic check by trying to access it)
            try {
                return file && file.length > 0;
            } catch (e) {
                return false;
            }
        });
    }

    setupToolbarEvents() {
        // Existing toolbar setup...
        document.getElementById('btn-preview-toggle').addEventListener('click', () => {
            this.isPreviewVisible = !this.isPreviewVisible;
            this.updatePreviewVisibility();
        });
        
        document.getElementById('btn-line-numbers').addEventListener('click', () => {
            this.showLineNumbers = !this.showLineNumbers;
            this.updateLineNumbers();
        });
        
        // Add other toolbar events...
    }
    
    setupFindEvents() {
        // Find dialog implementation...
        document.getElementById('btn-find').addEventListener('click', () => {
            document.getElementById('find-dialog').classList.remove('hidden');
            document.getElementById('find-input').focus();
        });
        
        document.getElementById('btn-find-close').addEventListener('click', () => {
            document.getElementById('find-dialog').classList.add('hidden');
        });
    }
    
    // File operations
    openFile(filePath, content) {
        let tab = this.tabs.get(this.activeTabId);
        
        // If current tab is empty and untitled, reuse it
        if (!tab.filePath && !tab.isDirty && tab.content === '') {
            tab.filePath = filePath;
            tab.title = filePath.split('/').pop();
            tab.content = content;
            tab.originalContent = content;
            tab.isDirty = false;
        } else {
            // Create new tab for the file
            this.createNewTab();
            tab = this.tabs.get(this.activeTabId);
            tab.filePath = filePath;
            tab.title = filePath.split('/').pop();
            tab.content = content;
            tab.originalContent = content;
            tab.isDirty = false;
        }
        
        this.restoreTabState(this.activeTabId);
        this.startAutoSave();
        this.addToRecentFiles(filePath);
        this.updateTabBar();
    }
    
    getCurrentContent() {
        const tab = this.tabs.get(this.activeTabId);
        return tab ? tab.content : '';
    }
    
    getCurrentFilePath() {
        const tab = this.tabs.get(this.activeTabId);
        return tab ? tab.filePath : null;
    }
}

// Initialize tab manager
let tabManager;

document.addEventListener('DOMContentLoaded', () => {
    tabManager = new TabManager();

    // Request current theme
    ipcRenderer.send('get-theme');

    // Signal that renderer is ready for file operations
    ipcRenderer.send('renderer-ready');
    
    // Set up auto-save interval
    setInterval(() => {
        // Auto-save logic for all tabs
        tabManager.tabs.forEach(tab => {
            if (tab.isDirty && tab.filePath) {
                ipcRenderer.send('save-current-file', tab.content);
            }
        });
    }, 30000);
});

// IPC event listeners
ipcRenderer.on('file-new', () => {
    tabManager.createNewTab();
});

ipcRenderer.on('file-opened', (event, data) => {
    tabManager.openFile(data.path, data.content);
});

ipcRenderer.on('file-save', () => {
    const currentContent = tabManager.getCurrentContent();
    const currentFilePath = tabManager.getCurrentFilePath();
    if (currentFilePath) {
        ipcRenderer.send('save-current-file', currentContent);
    }
});

ipcRenderer.on('get-content-for-save', (event, filePath) => {
    const currentContent = tabManager.getCurrentContent();
    ipcRenderer.send('save-file', { path: filePath, content: currentContent });
});

ipcRenderer.on('get-content-for-spreadsheet', (event, format) => {
    const currentContent = tabManager.getCurrentContent();
    ipcRenderer.send('export-spreadsheet', { content: currentContent, format });
});

ipcRenderer.on('toggle-preview', () => {
    tabManager.isPreviewVisible = !tabManager.isPreviewVisible;
    tabManager.updatePreviewVisibility();
});

ipcRenderer.on('toggle-find', () => {
    const findDialog = document.getElementById('find-dialog');
    if (findDialog.classList.contains('hidden')) {
        findDialog.classList.remove('hidden');
        document.getElementById('find-input').focus();
    } else {
        findDialog.classList.add('hidden');
    }
});

ipcRenderer.on('theme-changed', (event, theme) => {
    document.body.className = `theme-${theme}`;
});

// Font size adjustment
let currentFontSize = parseInt(localStorage.getItem('fontSize')) || 15;

function updateFontSizes(size) {
    const editors = document.querySelectorAll('#editor, .editor-textarea');
    const previews = document.querySelectorAll('#preview, .preview-content');
    
    editors.forEach(editor => {
        editor.style.fontSize = `${size}px`;
    });
    
    previews.forEach(preview => {
        preview.style.fontSize = `${size}px`;
    });
    
    localStorage.setItem('fontSize', size);
}

// Apply saved font size on load
updateFontSizes(currentFontSize);

ipcRenderer.on('adjust-font-size', (event, action) => {
    if (action === 'increase' && currentFontSize < 24) {
        currentFontSize++;
    } else if (action === 'decrease' && currentFontSize > 10) {
        currentFontSize--;
    } else if (action === 'reset') {
        currentFontSize = 15;
    }
    updateFontSizes(currentFontSize);
});

// Export Dialog functionality
let currentExportFormat = null;

ipcRenderer.on('show-export-dialog', (event, format) => {
    currentExportFormat = format;
    showExportDialog(format);
});

function showExportDialog(format) {
    const dialog = document.getElementById('export-dialog');
    const title = document.getElementById('export-dialog-title');

    title.textContent = `Export as ${format.toUpperCase()}`;
    dialog.setAttribute('data-format', format);
    dialog.classList.remove('hidden');

    // Initialize form values
    initializeExportForm(format);
}

function hideExportDialog() {
    const dialog = document.getElementById('export-dialog');
    dialog.classList.add('hidden');
    currentExportFormat = null;
}

function initializeExportForm(format) {
    // Reset advanced export toggle to unchecked
    const advancedToggle = document.getElementById('advanced-export-toggle');
    const advancedOptions = document.getElementById('advanced-export-options');

    advancedToggle.checked = false;
    advancedOptions.classList.add('hidden');

    // Reset form to defaults
    document.getElementById('export-template').value = 'default';
    document.getElementById('custom-template-path').style.display = 'none';

    // Clear metadata fields
    const metadataFields = document.querySelectorAll('.metadata-field');
    metadataFields.forEach((field, index) => {
        if (index < 4) { // Keep first 4 default fields
            field.querySelector('.metadata-key').value = ['title', 'author', 'date', 'subject'][index] || '';
            field.querySelector('.metadata-value').value = '';
        } else {
            field.remove(); // Remove additional fields
        }
    });

    // Reset checkboxes and other fields
    document.getElementById('export-toc').checked = false;
    document.getElementById('export-number-sections').checked = false;
    document.getElementById('export-citeproc').checked = false;
    document.getElementById('export-toc-depth').value = 3;

    // PDF-specific fields
    if (format === 'pdf') {
        document.getElementById('pdf-engine').value = 'xelatex';
        document.getElementById('pdf-geometry').value = 'margin=1in';
        document.getElementById('custom-geometry').style.display = 'none';
    }

    // Clear bibliography fields
    document.getElementById('bibliography-file').value = '';
    document.getElementById('csl-file').value = '';
}

function collectExportOptions() {
    const advancedMode = document.getElementById('advanced-export-toggle').checked;
    const options = {};

    if (advancedMode) {
        // Collect advanced options
        options.template = document.getElementById('export-template').value;
        options.metadata = {};
        options.variables = {};
        options.toc = document.getElementById('export-toc').checked;
        options.tocDepth = document.getElementById('export-toc-depth').value;
        options.numberSections = document.getElementById('export-number-sections').checked;
        options.citeproc = document.getElementById('export-citeproc').checked;
    } else {
        // Collect basic options only
        options.template = 'default';
        options.metadata = {};
        options.variables = {};
        options.toc = document.getElementById('basic-toc').checked;
        options.tocDepth = 3;
        options.numberSections = document.getElementById('basic-number-sections').checked;
        options.citeproc = false;
    }

    if (advancedMode) {
        // Collect custom template path
        if (options.template === 'custom') {
            options.template = document.getElementById('custom-template-path').value.trim();
        }

        // Collect metadata
        const metadataFields = document.querySelectorAll('.metadata-field');
        metadataFields.forEach(field => {
            const key = field.querySelector('.metadata-key').value.trim();
            const value = field.querySelector('.metadata-value').value.trim();
            if (key && value) {
                options.metadata[key] = value;
            }
        });

        // PDF-specific options
        if (currentExportFormat === 'pdf') {
            options.pdfEngine = document.getElementById('pdf-engine').value;
            const geometrySelect = document.getElementById('pdf-geometry');
            if (geometrySelect.value === 'custom') {
                options.geometry = document.getElementById('custom-geometry').value.trim() || 'margin=1in';
            } else {
                options.geometry = geometrySelect.value;
            }
        }

        // Bibliography
        const bibFile = document.getElementById('bibliography-file').value.trim();
        const cslFile = document.getElementById('csl-file').value.trim();
        if (bibFile) options.bibliography = bibFile;
        if (cslFile) options.csl = cslFile;
    } else {
        // Basic mode - set default PDF options if needed
        if (currentExportFormat === 'pdf') {
            options.pdfEngine = 'xelatex';
            options.geometry = 'margin=1in';
        }
    }

    return options;
}

// Event listeners for export dialog
document.addEventListener('DOMContentLoaded', () => {
    // Template selection
    document.getElementById('export-template').addEventListener('change', (e) => {
        const customPath = document.getElementById('custom-template-path');
        const fileInput = document.getElementById('template-file-input');

        if (e.target.value === 'custom') {
            customPath.style.display = 'block';
            fileInput.style.display = 'block';
        } else {
            customPath.style.display = 'none';
            fileInput.style.display = 'none';
            customPath.value = '';
        }
    });

    // Advanced export toggle
    document.getElementById('advanced-export-toggle').addEventListener('change', (e) => {
        const advancedOptions = document.getElementById('advanced-export-options');
        if (e.target.checked) {
            advancedOptions.classList.remove('hidden');
            // Scroll the advanced options into view after they become visible
            setTimeout(() => {
                advancedOptions.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        } else {
            advancedOptions.classList.add('hidden');
        }
    });

    // Template file input
    document.getElementById('template-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('custom-template-path').value = file.path;
        }
    });

    // PDF geometry selection
    document.getElementById('pdf-geometry').addEventListener('change', (e) => {
        const customGeometry = document.getElementById('custom-geometry');
        if (e.target.value === 'custom') {
            customGeometry.style.display = 'block';
        } else {
            customGeometry.style.display = 'none';
        }
    });

    // Add metadata field
    document.getElementById('add-metadata-field').addEventListener('click', () => {
        const container = document.querySelector('.metadata-container');
        const newField = document.createElement('div');
        newField.className = 'metadata-field';
        newField.innerHTML = `
            <input type="text" placeholder="key" class="metadata-key">
            <input type="text" placeholder="value" class="metadata-value">
        `;
        container.appendChild(newField);
    });

    // Browse bibliography
    document.getElementById('browse-bibliography').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.bib,.yaml,.yml,.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById('bibliography-file').value = file.path;
            }
        };
        input.click();
    });

    // Browse CSL
    document.getElementById('browse-csl').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csl';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById('csl-file').value = file.path;
            }
        };
        input.click();
    });

    // Dialog close buttons
    document.getElementById('export-dialog-close').addEventListener('click', hideExportDialog);
    document.getElementById('export-cancel').addEventListener('click', hideExportDialog);

    // Export confirm
    document.getElementById('export-confirm').addEventListener('click', () => {
        const options = collectExportOptions();
        ipcRenderer.send('export-with-options', {
            format: currentExportFormat,
            options: options
        });
        hideExportDialog();
    });

    // Close on backdrop click
    document.getElementById('export-dialog').addEventListener('click', (e) => {
        if (e.target === document.getElementById('export-dialog')) {
            hideExportDialog();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.getElementById('export-dialog').classList.contains('hidden')) {
            hideExportDialog();
        }
    });
});

// Batch Conversion Dialog functionality
let currentBatchOptions = {};

ipcRenderer.on('show-batch-dialog', () => {
    showBatchDialog();
});

ipcRenderer.on('batch-progress', (event, progress) => {
    updateBatchProgress(progress);
});

ipcRenderer.on('folder-selected', (event, { type, path }) => {
    if (type === 'input') {
        document.getElementById('batch-input-folder').value = path;
    } else if (type === 'output') {
        document.getElementById('batch-output-folder').value = path;
    }
    validateBatchForm();
});

function showBatchDialog() {
    const dialog = document.getElementById('batch-dialog');
    dialog.classList.remove('hidden');

    // Reset form
    document.getElementById('batch-input-folder').value = '';
    document.getElementById('batch-output-folder').value = '';
    document.getElementById('batch-format').value = 'html';
    document.getElementById('batch-include-subfolders').checked = true;
    document.getElementById('batch-progress').classList.add('hidden');
    document.getElementById('batch-start').disabled = true;

    currentBatchOptions = {
        template: 'default',
        metadata: {},
        variables: {},
        toc: false,
        tocDepth: 3,
        numberSections: false,
        citeproc: false
    };
}

function hideBatchDialog() {
    const dialog = document.getElementById('batch-dialog');
    dialog.classList.add('hidden');
}

function updateBatchProgress(progress) {
    const progressSection = document.getElementById('batch-progress');
    const progressFill = document.getElementById('batch-progress-fill');
    const progressText = document.getElementById('batch-progress-text');
    const progressCount = document.getElementById('batch-progress-count');

    progressSection.classList.remove('hidden');

    const percentage = Math.round((progress.completed / progress.total) * 100);
    progressFill.style.width = `${percentage}%`;

    if (progress.completed === progress.total) {
        progressText.textContent = 'Conversion complete!';
    } else {
        progressText.textContent = `Processing: ${progress.currentFile}`;
    }

    progressCount.textContent = `${progress.completed} / ${progress.total}`;
}

function validateBatchForm() {
    const inputFolder = document.getElementById('batch-input-folder').value.trim();
    const outputFolder = document.getElementById('batch-output-folder').value.trim();
    const startButton = document.getElementById('batch-start');

    startButton.disabled = !inputFolder || !outputFolder;
}

// Event listeners for batch dialog
document.addEventListener('DOMContentLoaded', () => {
    // Browse input folder
    document.getElementById('browse-input-folder').addEventListener('click', () => {
        ipcRenderer.send('select-folder', 'input');
    });

    // Browse output folder
    document.getElementById('browse-output-folder').addEventListener('click', () => {
        ipcRenderer.send('select-folder', 'output');
    });

    // Show advanced options
    document.getElementById('batch-show-options').addEventListener('click', () => {
        const format = document.getElementById('batch-format').value;
        currentExportFormat = format;
        showExportDialog(format);
    });

    // Dialog close buttons
    document.getElementById('batch-dialog-close').addEventListener('click', hideBatchDialog);
    document.getElementById('batch-cancel').addEventListener('click', hideBatchDialog);

    // Start batch conversion
    document.getElementById('batch-start').addEventListener('click', () => {
        const inputFolder = document.getElementById('batch-input-folder').value.trim();
        const outputFolder = document.getElementById('batch-output-folder').value.trim();
        const format = document.getElementById('batch-format').value;

        if (!inputFolder || !outputFolder) {
            return;
        }

        // Use current export options from advanced dialog if they were set
        const options = currentBatchOptions;

        // Start batch conversion
        ipcRenderer.send('batch-convert', {
            inputFolder,
            outputFolder,
            format,
            options
        });

        // Show progress
        document.getElementById('batch-progress').classList.remove('hidden');
        document.getElementById('batch-start').disabled = true;
    });

    // Close on backdrop click
    document.getElementById('batch-dialog').addEventListener('click', (e) => {
        if (e.target === document.getElementById('batch-dialog')) {
            hideBatchDialog();
        }
    });

    // Close on Escape key (modified to handle both dialogs)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!document.getElementById('export-dialog').classList.contains('hidden')) {
                hideExportDialog();
            } else if (!document.getElementById('batch-dialog').classList.contains('hidden')) {
                hideBatchDialog();
            }
        }
    });

    // Input validation
    document.getElementById('batch-input-folder').addEventListener('input', validateBatchForm);
    document.getElementById('batch-output-folder').addEventListener('input', validateBatchForm);
});

// Override the export dialog confirm to also save batch options
const originalExportConfirm = document.getElementById('export-confirm');
if (originalExportConfirm) {
    originalExportConfirm.addEventListener('click', () => {
        // If batch dialog is open, save options for batch conversion
        if (!document.getElementById('batch-dialog').classList.contains('hidden')) {
            currentBatchOptions = collectExportOptions();
        }
    });
}

// IPC event listeners for recent files functionality
if (window.electronAPI) {
    window.electronAPI.on('recent-files-cleared', () => {
        tabManager.recentFiles = [];
        localStorage.setItem('recentFiles', JSON.stringify([]));
        console.log('Recent files cleared');
    });
}

// Add math rendering support using KaTeX for enhanced preview
function initMathSupport() {
    // Add KaTeX CSS
    const katexCSS = document.createElement('link');
    katexCSS.rel = 'stylesheet';
    katexCSS.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css';
    katexCSS.crossOrigin = 'anonymous';
    document.head.appendChild(katexCSS);

    // Add KaTeX JS
    const katexJS = document.createElement('script');
    katexJS.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js';
    katexJS.crossOrigin = 'anonymous';
    katexJS.onload = () => {
        // Add auto-render extension
        const autoRenderJS = document.createElement('script');
        autoRenderJS.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js';
        autoRenderJS.crossOrigin = 'anonymous';
        autoRenderJS.onload = () => {
            console.log('Math support (KaTeX) initialized');
            // Re-render current preview to include math
            if (tabManager) {
                tabManager.updatePreview();
            }
        };
        document.head.appendChild(autoRenderJS);
    };
    document.head.appendChild(katexJS);
}

// Initialize math support on load
initMathSupport();