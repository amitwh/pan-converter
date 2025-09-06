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

// Tab Management
class TabManager {
    constructor() {
        this.tabs = new Map();
        this.activeTabId = 1;
        this.nextTabId = 2;
        this.isPreviewVisible = true;
        this.showLineNumbers = false;
        
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
        
        // Drag and drop events
        this.setupDragDropEvents();
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'n':
                        e.preventDefault();
                        this.createNewTab();
                        break;
                    case 'w':
                        if (this.tabs.size > 1) {
                            e.preventDefault();
                            this.closeTab(this.activeTabId);
                        }
                        break;
                    case 't':
                        e.preventDefault();
                        this.createNewTab();
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
        if (tab && tab.filePath) {
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
            // TODO: Show confirmation dialog
        }
        
        // Remove tab elements
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        const tabContent = document.getElementById(`tab-content-${tabId}`);
        
        if (tabElement && tabElement.classList.contains('tab')) {
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
        const preview = document.getElementById(`preview-${tabId}`);
        
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
        } catch (error) {
            preview.innerHTML = '<p>Error rendering preview</p>';
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
        
        const words = tab.content.trim().split(/\\s+/).filter(word => word.length > 0).length;
        const chars = tab.content.length;
        document.getElementById('word-count').textContent = `Words: ${words} | Characters: ${chars}`;
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
    
    setupDragDropEvents() {
        const container = document.querySelector('.container');
        
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            container.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });
        
        // Add visual feedback for drag
        container.addEventListener('dragenter', (e) => {
            container.classList.add('drag-over');
        });
        
        container.addEventListener('dragleave', (e) => {
            // Only remove class if leaving the container entirely
            if (!container.contains(e.relatedTarget)) {
                container.classList.remove('drag-over');
            }
        });
        
        container.addEventListener('drop', (e) => {
            container.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                
                // Check if it's a markdown file
                if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const content = event.target.result;
                        // Use file name since file.path is not available in browser context
                        console.log('Opening dropped file:', file.name);
                        this.openFile(file.name, content);
                    };
                    reader.onerror = (error) => {
                        console.error('Error reading file:', error);
                        this.showStatus('Error reading file', 3000);
                    };
                    reader.readAsText(file);
                } else {
                    this.showStatus('Only Markdown files (.md, .markdown) are supported', 3000);
                }
            }
        });
    }
    
    showStatus(message, duration = 3000) {
        const statusText = document.getElementById('status-text');
        if (statusText) {
            const originalText = statusText.textContent;
            statusText.textContent = message;
            setTimeout(() => {
                statusText.textContent = originalText;
            }, duration);
        }
    }
    
    // File operations
    openFile(filePath, content) {
        let tab = this.tabs.get(this.activeTabId);
        
        // Extract filename from path for title
        const fileName = filePath.includes('/') || filePath.includes('\\') ? 
            filePath.split(/[/\\]/).pop() : filePath;
        
        // If current tab is empty and untitled, reuse it
        if (!tab.filePath && !tab.isDirty && tab.content === '') {
            tab.filePath = filePath;
            tab.title = fileName;
            tab.content = content;
            tab.originalContent = content;
            tab.isDirty = false;
        } else {
            // Create new tab for the file
            this.createNewTab();
            tab = this.tabs.get(this.activeTabId);
            tab.filePath = filePath;
            tab.title = fileName;
            tab.content = content;
            tab.originalContent = content;
            tab.isDirty = false;
        }
        
        // Ensure the tab state is properly restored and UI is updated
        this.restoreTabState(this.activeTabId);
        this.updateTabBar();
        this.showStatus(`Opened: ${fileName}`, 2000);
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
let pendingFileData = null;

// Set up IPC listeners immediately to handle early events
ipcRenderer.on('file-opened', (event, data) => {
    console.log('Received file-opened event:', data);
    if (tabManager) {
        tabManager.openFile(data.path, data.content);
    } else {
        console.log('TabManager not ready, storing pending file data');
        pendingFileData = data;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    tabManager = new TabManager();
    
    // Handle any pending file data
    if (pendingFileData) {
        console.log('Processing pending file data:', pendingFileData);
        tabManager.openFile(pendingFileData.path, pendingFileData.content);
        pendingFileData = null;
    }
    
    // Request current theme
    ipcRenderer.send('get-theme');
    
    // Set up auto-save interval
    setInterval(() => {
        // Auto-save logic for all tabs
        tabManager.tabs.forEach(tab => {
            if (tab.isDirty && tab.filePath) {
                ipcRenderer.send('save-current-file', tab.content);
            }
        });
    }, 30000);
    
    // IPC event listeners that depend on tabManager
    ipcRenderer.on('file-new', () => {
        tabManager.createNewTab();
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
});

// IPC event listeners that don't depend on tabManager
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