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

        // Directly attach input listener to the new editor
        const editor = document.getElementById(`editor-${tab.id}`);
        if (editor) {
            editor.addEventListener('input', () => {
                this.handleEditorInput(tab.id);
            });

            // Add scroll listener for line number sync
            editor.addEventListener('scroll', () => {
                if (this.showLineNumbers && this.activeTabId === tab.id) {
                    const lineNumbers = document.getElementById(`line-numbers-${tab.id}`);
                    if (lineNumbers) {
                        lineNumbers.scrollTop = editor.scrollTop;
                    }
                }
            });
        }
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
            const lines = editor.value.split('\n');
            lineNumbers.innerHTML = lines.map((_, i) =>
                `<div class="line-number">${i + 1}</div>`
            ).join('');
            lineNumbers.classList.remove('hidden');

            // Sync scroll position
            lineNumbers.scrollTop = editor.scrollTop;
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
        // Set up editor events using event delegation on the container
        const editorContainer = document.querySelector('.editor-container');
        if (editorContainer) {
            editorContainer.addEventListener('input', (e) => {
                if (e.target.classList.contains('editor-textarea')) {
                    const tabId = parseInt(e.target.id.split('-')[1]);
                    this.handleEditorInput(tabId);
                }
            });

            editorContainer.addEventListener('scroll', (e) => {
                if (e.target.classList.contains('editor-textarea')) {
                    this.updateLineNumbers();
                }
            }, true);
        }
    }
    
    handleEditorInput(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        const editor = document.getElementById(`editor-${tabId}`);
        if (!editor) return;

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
        ipcRenderer.send('save-recent-files', this.recentFiles);
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
        // Bold
        document.getElementById('btn-bold').addEventListener('click', () => {
            this.wrapSelection('**', '**');
        });

        // Italic
        document.getElementById('btn-italic').addEventListener('click', () => {
            this.wrapSelection('*', '*');
        });

        // Heading
        document.getElementById('btn-heading').addEventListener('click', () => {
            this.insertAtLineStart('## ');
        });

        // Link
        document.getElementById('btn-link').addEventListener('click', () => {
            this.wrapSelection('[', '](url)');
        });

        // Code
        document.getElementById('btn-code').addEventListener('click', () => {
            this.wrapSelection('`', '`');
        });

        // List
        document.getElementById('btn-list').addEventListener('click', () => {
            this.insertAtLineStart('- ');
        });

        // Quote
        document.getElementById('btn-quote').addEventListener('click', () => {
            this.insertAtLineStart('> ');
        });

        // Table
        document.getElementById('btn-table').addEventListener('click', () => {
            this.insertTable();
        });

        // Strikethrough
        document.getElementById('btn-strikethrough').addEventListener('click', () => {
            this.wrapSelection('~~', '~~');
        });

        // Code Block
        document.getElementById('btn-code-block').addEventListener('click', () => {
            this.insertCodeBlock();
        });

        // Horizontal Rule
        document.getElementById('btn-horizontal-rule').addEventListener('click', () => {
            this.insertHorizontalRule();
        });

        // Preview toggle
        document.getElementById('btn-preview-toggle').addEventListener('click', () => {
            this.isPreviewVisible = !this.isPreviewVisible;
            this.updatePreviewVisibility();
        });

        // Line numbers
        document.getElementById('btn-line-numbers').addEventListener('click', () => {
            this.showLineNumbers = !this.showLineNumbers;
            this.updateLineNumbers();
        });
    }

    // Helper function to wrap selected text
    wrapSelection(before, after) {
        const editor = document.getElementById(`editor-${this.activeTabId}`);
        if (!editor) return;

        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const selectedText = editor.value.substring(start, end);
        const replacement = before + (selectedText || 'text') + after;

        editor.value = editor.value.substring(0, start) + replacement + editor.value.substring(end);

        // Update cursor position
        const newCursorPos = selectedText ? start + replacement.length : start + before.length;
        editor.selectionStart = editor.selectionEnd = newCursorPos;
        editor.focus();

        // Trigger update
        this.handleEditorInput(this.activeTabId);
    }

    // Helper function to insert text at the start of current line
    insertAtLineStart(prefix) {
        const editor = document.getElementById(`editor-${this.activeTabId}`);
        if (!editor) return;

        const start = editor.selectionStart;
        const text = editor.value;

        // Find the start of the current line
        let lineStart = text.lastIndexOf('\n', start - 1) + 1;

        // Insert the prefix
        editor.value = text.substring(0, lineStart) + prefix + text.substring(lineStart);

        // Update cursor position
        editor.selectionStart = editor.selectionEnd = start + prefix.length;
        editor.focus();

        // Trigger update
        this.handleEditorInput(this.activeTabId);
    }

    // Insert a markdown table
    insertTable() {
        const editor = document.getElementById(`editor-${this.activeTabId}`);
        if (!editor) return;

        const table = '\n| Column 1 | Column 2 | Column 3 |\n' +
                     '|----------|----------|----------|\n' +
                     '| Cell 1   | Cell 2   | Cell 3   |\n' +
                     '| Cell 4   | Cell 5   | Cell 6   |\n';

        const start = editor.selectionStart;
        editor.value = editor.value.substring(0, start) + table + editor.value.substring(start);

        // Update cursor position
        editor.selectionStart = editor.selectionEnd = start + table.length;
        editor.focus();

        // Trigger update
        this.handleEditorInput(this.activeTabId);
    }

    // Insert a code block
    insertCodeBlock() {
        const editor = document.getElementById(`editor-${this.activeTabId}`);
        if (!editor) return;

        const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
        const codeBlock = '\n```\n' + (selectedText || 'code here') + '\n```\n';

        const start = editor.selectionStart;
        editor.value = editor.value.substring(0, start) + codeBlock + editor.value.substring(editor.selectionEnd);

        // Update cursor position
        editor.selectionStart = editor.selectionEnd = start + codeBlock.length;
        editor.focus();

        // Trigger update
        this.handleEditorInput(this.activeTabId);
    }

    // Insert a horizontal rule
    insertHorizontalRule() {
        const editor = document.getElementById(`editor-${this.activeTabId}`);
        if (!editor) return;

        const hr = '\n\n---\n\n';
        const start = editor.selectionStart;

        editor.value = editor.value.substring(0, start) + hr + editor.value.substring(start);

        // Update cursor position
        editor.selectionStart = editor.selectionEnd = start + hr.length;
        editor.focus();

        // Trigger update
        this.handleEditorInput(this.activeTabId);
    }
    
    setupFindEvents() {
        const btnFind = document.getElementById('btn-find');
        const btnFindClose = document.getElementById('btn-find-close');
        const findInput = document.getElementById('find-input');
        const btnFindNext = document.getElementById('btn-find-next');
        const btnFindPrev = document.getElementById('btn-find-prev');
        const btnReplace = document.getElementById('btn-replace');
        const btnReplaceAll = document.getElementById('btn-replace-all');

        if (!btnFind || !btnFindClose || !findInput || !btnFindNext || !btnFindPrev || !btnReplace || !btnReplaceAll) {
            console.error('Find dialog elements not found');
            return;
        }

        // Show find dialog
        btnFind.addEventListener('click', () => {
            document.getElementById('find-dialog').classList.remove('hidden');
            findInput.focus();
        });

        // Close find dialog
        btnFindClose.addEventListener('click', () => {
            document.getElementById('find-dialog').classList.add('hidden');
            this.clearFindHighlights();
        });

        // Find input change - update matches
        findInput.addEventListener('input', () => {
            this.performFind();
        });

        // Find next
        btnFindNext.addEventListener('click', () => {
            this.findNext();
        });

        // Find previous
        btnFindPrev.addEventListener('click', () => {
            this.findPrevious();
        });

        // Replace
        btnReplace.addEventListener('click', () => {
            this.replaceOne();
        });

        // Replace all
        btnReplaceAll.addEventListener('click', () => {
            this.replaceAll();
        });

        // Enter key in find input - find next
        findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.findPrevious();
                } else {
                    this.findNext();
                }
            }
        });

    }

    performFind() {
        const findText = document.getElementById('find-input').value;
        const tab = this.tabs.get(this.activeTabId);
        const editor = document.getElementById(`editor-${this.activeTabId}`);

        if (!findText || !tab || !editor) {
            this.clearFindHighlights();
            const findCount = document.getElementById('find-count');
            if (findCount) {
                findCount.textContent = '0 matches';
            }
            return;
        }

        const content = editor.value;
        const matches = [];
        let index = 0;

        // Find all matches
        while ((index = content.indexOf(findText, index)) !== -1) {
            matches.push(index);
            index += findText.length;
        }

        tab.findMatches = matches;
        tab.currentMatchIndex = matches.length > 0 ? 0 : -1;

        // Update match count
        const findCount = document.getElementById('find-count');
        if (findCount) {
            findCount.textContent = `${matches.length} match${matches.length !== 1 ? 'es' : ''}`;
        }

        // Highlight first match
        if (matches.length > 0) {
            this.highlightMatch(0);
        }
    }

    findNext() {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab || tab.findMatches.length === 0) return;

        tab.currentMatchIndex = (tab.currentMatchIndex + 1) % tab.findMatches.length;
        this.highlightMatch(tab.currentMatchIndex);
    }

    findPrevious() {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab || tab.findMatches.length === 0) return;

        tab.currentMatchIndex = tab.currentMatchIndex - 1;
        if (tab.currentMatchIndex < 0) {
            tab.currentMatchIndex = tab.findMatches.length - 1;
        }
        this.highlightMatch(tab.currentMatchIndex);
    }

    highlightMatch(matchIndex) {
        const tab = this.tabs.get(this.activeTabId);
        const editor = document.getElementById(`editor-${this.activeTabId}`);
        const findText = document.getElementById('find-input').value;

        if (!tab || !editor || matchIndex < 0 || matchIndex >= tab.findMatches.length) return;

        const position = tab.findMatches[matchIndex];

        // Select the match WITHOUT focusing (to keep focus on find input)
        editor.setSelectionRange(position, position + findText.length);

        // Make the selection visible by briefly focusing and then restoring focus
        const findInput = document.getElementById('find-input');
        const hadFocus = document.activeElement === findInput;

        // Temporarily focus editor to make selection visible
        editor.focus();

        // Restore focus to find input if it had focus
        if (hadFocus) {
            setTimeout(() => {
                findInput.focus();
                // Restore cursor position in find input
                findInput.setSelectionRange(findInput.value.length, findInput.value.length);
            }, 10);
        }

        // Scroll into view
        const lineHeight = 20; // Approximate line height
        const charPosition = position;
        const numLines = editor.value.substring(0, charPosition).split('\n').length;
        const scrollPosition = (numLines - 5) * lineHeight; // Show match 5 lines from top

        editor.scrollTop = Math.max(0, scrollPosition);

        // Update match counter
        const findCount = document.getElementById('find-count');
        if (findCount) {
            findCount.textContent = `Match ${matchIndex + 1} of ${tab.findMatches.length}`;
        }
    }

    replaceOne() {
        const tab = this.tabs.get(this.activeTabId);
        const editor = document.getElementById(`editor-${this.activeTabId}`);
        const findText = document.getElementById('find-input').value;
        const replaceText = document.getElementById('replace-input').value;

        if (!tab || !editor || tab.findMatches.length === 0 || tab.currentMatchIndex < 0) return;

        const position = tab.findMatches[tab.currentMatchIndex];
        const before = editor.value.substring(0, position);
        const after = editor.value.substring(position + findText.length);

        editor.value = before + replaceText + after;
        tab.content = editor.value;
        tab.isDirty = true;

        this.updatePreview(this.activeTabId);
        this.updateWordCount();
        this.updateTabBar();

        // Re-perform find to update matches
        this.performFind();
    }

    replaceAll() {
        const tab = this.tabs.get(this.activeTabId);
        const editor = document.getElementById(`editor-${this.activeTabId}`);
        const findText = document.getElementById('find-input').value;
        const replaceText = document.getElementById('replace-input').value;

        if (!tab || !editor || !findText) return;

        // Simple replace all
        const newContent = editor.value.split(findText).join(replaceText);
        const replacedCount = tab.findMatches.length;

        editor.value = newContent;
        tab.content = newContent;
        tab.isDirty = true;

        this.updatePreview(this.activeTabId);
        this.updateWordCount();
        this.updateTabBar();

        // Update match count
        document.getElementById('find-count').textContent = `Replaced ${replacedCount} match${replacedCount !== 1 ? 'es' : ''}`;

        // Re-perform find
        this.performFind();
    }

    clearFindHighlights() {
        const tab = this.tabs.get(this.activeTabId);
        if (tab) {
            tab.findMatches = [];
            tab.currentMatchIndex = -1;
        }
    }
    
    // File operations
    openFile(filePath, content) {
        console.log('openFile called with:', filePath, 'content length:', content.length);
        let tab = this.tabs.get(this.activeTabId);

        // Handle both forward and back slashes for cross-platform compatibility
        const fileName = filePath.split(/[\\/]/).pop();

        // If current tab is empty and untitled, reuse it
        if (!tab.filePath && !tab.isDirty && tab.content === '') {
            console.log('Reusing current tab');
            tab.filePath = filePath;
            tab.title = fileName;
            tab.content = content;
            tab.originalContent = content;
            tab.isDirty = false;

            // Update the editor immediately
            const editor = document.getElementById(`editor-${this.activeTabId}`);
            if (editor) {
                editor.value = content;
            }
        } else {
            // Create new tab for the file
            console.log('Creating new tab for file');
            this.createNewTab();
            tab = this.tabs.get(this.activeTabId);
            tab.filePath = filePath;
            tab.title = fileName;
            tab.content = content;
            tab.originalContent = content;
            tab.isDirty = false;

            // Wait a moment for the DOM to update, then set content
            setTimeout(() => {
                const editor = document.getElementById(`editor-${this.activeTabId}`);
                if (editor) {
                    editor.value = content;
                    this.updatePreview(this.activeTabId);
                    this.updateWordCount();
                }
            }, 50);
        }

        this.updatePreview(this.activeTabId);
        this.updateWordCount();
        this.startAutoSave();
        this.addToRecentFiles(filePath);
        this.updateTabBar();

        // Notify main process about current file for exports
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('set-current-file', filePath);

        console.log('File opened successfully');
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

    // Attach input listener to the initial editor (tab 1)
    const initialEditor = document.getElementById('editor-1');
    if (initialEditor) {
        initialEditor.addEventListener('input', () => {
            tabManager.handleEditorInput(1);
        });

        // Add scroll listener for line number sync
        initialEditor.addEventListener('scroll', () => {
            if (tabManager.showLineNumbers && tabManager.activeTabId === 1) {
                const lineNumbers = document.getElementById('line-numbers-1');
                if (lineNumbers) {
                    lineNumbers.scrollTop = initialEditor.scrollTop;
                }
            }
        });
    }

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
    if (tabManager) {
        tabManager.openFile(data.path, data.content);
    }
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

// Undo/Redo handlers
ipcRenderer.on('undo', () => {
    if (tabManager) {
        tabManager.undo();
    }
});

ipcRenderer.on('redo', () => {
    if (tabManager) {
        tabManager.redo();
    }
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

// Print document handler
ipcRenderer.on('print-document', () => {
    // Use the preview pane for printing
    const previewContent = document.getElementById('preview');
    if (previewContent && previewContent.innerHTML.trim()) {
        // Create a print window with the preview content
        window.print();
    } else {
        alert('Nothing to print. Please create or open a document and ensure the preview is visible.');
    }
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

// Universal Converter dialog handlers
ipcRenderer.on('show-universal-converter-dialog', () => {
    showUniversalConverterDialog();
});

ipcRenderer.on('conversion-status', (event, status) => {
    document.getElementById('converter-status').textContent = status;
});

ipcRenderer.on('conversion-complete', (event, result) => {
    document.getElementById('converter-progress').classList.add('hidden');
    if (result.success) {
        document.getElementById('universal-converter-dialog').classList.add('hidden');
    }
});

ipcRenderer.on('batch-progress', (event, progress) => {
    updateBatchProgress(progress);
});

ipcRenderer.on('folder-selected', (event, { type, path }) => {
    if (type === 'input') {
        document.getElementById('batch-input-folder').value = path;
        validateBatchForm();
    } else if (type === 'output') {
        document.getElementById('batch-output-folder').value = path;
        validateBatchForm();
    } else if (type === 'converter-batch-input') {
        document.getElementById('converter-batch-input-folder').value = path;
    } else if (type === 'converter-batch-output') {
        document.getElementById('converter-batch-output-folder').value = path;
    }
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

// Universal File Converter Dialog Functions
let converterFilePath = '';

// Format definitions for each converter
const converterFormats = {
    libreoffice: {
        input: [
            { value: 'docx', label: 'Word Document (DOCX)' },
            { value: 'doc', label: 'Word 97-2003 (DOC)' },
            { value: 'odt', label: 'OpenDocument Text (ODT)' },
            { value: 'rtf', label: 'Rich Text Format (RTF)' },
            { value: 'txt', label: 'Plain Text (TXT)' },
            { value: 'html', label: 'HTML Document' },
            { value: 'htm', label: 'HTM Document' },
            { value: 'xlsx', label: 'Excel Spreadsheet (XLSX)' },
            { value: 'xls', label: 'Excel 97-2003 (XLS)' },
            { value: 'ods', label: 'OpenDocument Spreadsheet (ODS)' },
            { value: 'csv', label: 'Comma Separated Values (CSV)' },
            { value: 'pptx', label: 'PowerPoint (PPTX)' },
            { value: 'ppt', label: 'PowerPoint 97-2003 (PPT)' },
            { value: 'odp', label: 'OpenDocument Presentation (ODP)' }
        ],
        output: [
            { value: 'pdf', label: 'PDF Document' },
            { value: 'docx', label: 'Word Document (DOCX)' },
            { value: 'doc', label: 'Word 97-2003 (DOC)' },
            { value: 'odt', label: 'OpenDocument Text (ODT)' },
            { value: 'rtf', label: 'Rich Text Format (RTF)' },
            { value: 'txt', label: 'Plain Text (TXT)' },
            { value: 'html', label: 'HTML Document' },
            { value: 'xlsx', label: 'Excel Spreadsheet (XLSX)' },
            { value: 'xls', label: 'Excel 97-2003 (XLS)' },
            { value: 'ods', label: 'OpenDocument Spreadsheet (ODS)' },
            { value: 'csv', label: 'CSV' },
            { value: 'pptx', label: 'PowerPoint (PPTX)' },
            { value: 'ppt', label: 'PowerPoint 97-2003 (PPT)' },
            { value: 'odp', label: 'OpenDocument Presentation (ODP)' }
        ]
    },
    imagemagick: {
        input: [
            { value: 'jpg', label: 'JPEG Image (JPG)' },
            { value: 'jpeg', label: 'JPEG Image (JPEG)' },
            { value: 'png', label: 'PNG Image' },
            { value: 'gif', label: 'GIF Image' },
            { value: 'bmp', label: 'Bitmap Image (BMP)' },
            { value: 'tiff', label: 'TIFF Image' },
            { value: 'tif', label: 'TIF Image' },
            { value: 'webp', label: 'WebP Image' },
            { value: 'svg', label: 'SVG Vector Image' },
            { value: 'ico', label: 'Icon File (ICO)' },
            { value: 'psd', label: 'Photoshop (PSD)' },
            { value: 'raw', label: 'RAW Image' },
            { value: 'cr2', label: 'Canon RAW (CR2)' },
            { value: 'nef', label: 'Nikon RAW (NEF)' },
            { value: 'heic', label: 'HEIC Image' },
            { value: 'avif', label: 'AVIF Image' }
        ],
        output: [
            { value: 'jpg', label: 'JPEG Image (JPG)' },
            { value: 'png', label: 'PNG Image' },
            { value: 'gif', label: 'GIF Image' },
            { value: 'bmp', label: 'Bitmap Image (BMP)' },
            { value: 'tiff', label: 'TIFF Image' },
            { value: 'webp', label: 'WebP Image' },
            { value: 'svg', label: 'SVG Vector Image' },
            { value: 'ico', label: 'Icon File (ICO)' },
            { value: 'pdf', label: 'PDF Document' },
            { value: 'eps', label: 'EPS Vector' },
            { value: 'ps', label: 'PostScript' },
            { value: 'avif', label: 'AVIF Image' }
        ]
    },
    ffmpeg: {
        input: [
            { value: 'mp4', label: 'MP4 Video' },
            { value: 'avi', label: 'AVI Video' },
            { value: 'mov', label: 'MOV Video (QuickTime)' },
            { value: 'mkv', label: 'MKV Video (Matroska)' },
            { value: 'wmv', label: 'WMV Video (Windows Media)' },
            { value: 'flv', label: 'FLV Video (Flash)' },
            { value: 'webm', label: 'WebM Video' },
            { value: 'mpeg', label: 'MPEG Video' },
            { value: 'mpg', label: 'MPG Video' },
            { value: 'm4v', label: 'M4V Video' },
            { value: 'mp3', label: 'MP3 Audio' },
            { value: 'wav', label: 'WAV Audio' },
            { value: 'ogg', label: 'OGG Audio' },
            { value: 'flac', label: 'FLAC Audio' },
            { value: 'aac', label: 'AAC Audio' },
            { value: 'm4a', label: 'M4A Audio' },
            { value: 'wma', label: 'WMA Audio' }
        ],
        output: [
            { value: 'mp4', label: 'MP4 Video' },
            { value: 'avi', label: 'AVI Video' },
            { value: 'mov', label: 'MOV Video (QuickTime)' },
            { value: 'mkv', label: 'MKV Video (Matroska)' },
            { value: 'webm', label: 'WebM Video' },
            { value: 'mpeg', label: 'MPEG Video' },
            { value: 'gif', label: 'Animated GIF' },
            { value: 'mp3', label: 'MP3 Audio' },
            { value: 'wav', label: 'WAV Audio' },
            { value: 'ogg', label: 'OGG Audio' },
            { value: 'flac', label: 'FLAC Audio' },
            { value: 'aac', label: 'AAC Audio' },
            { value: 'm4a', label: 'M4A Audio' }
        ]
    },
    pandoc: {
        input: [
            { value: 'md', label: 'Markdown (MD)' },
            { value: 'markdown', label: 'Markdown' },
            { value: 'html', label: 'HTML Document' },
            { value: 'docx', label: 'Word Document (DOCX)' },
            { value: 'odt', label: 'OpenDocument Text (ODT)' },
            { value: 'rtf', label: 'Rich Text Format (RTF)' },
            { value: 'tex', label: 'LaTeX Document' },
            { value: 'latex', label: 'LaTeX' },
            { value: 'epub', label: 'EPUB eBook' },
            { value: 'rst', label: 'reStructuredText (RST)' },
            { value: 'textile', label: 'Textile' },
            { value: 'org', label: 'Org Mode' },
            { value: 'mediawiki', label: 'MediaWiki' },
            { value: 'docbook', label: 'DocBook XML' }
        ],
        output: [
            { value: 'html', label: 'HTML Document' },
            { value: 'pdf', label: 'PDF Document' },
            { value: 'docx', label: 'Word Document (DOCX)' },
            { value: 'odt', label: 'OpenDocument Text (ODT)' },
            { value: 'rtf', label: 'Rich Text Format (RTF)' },
            { value: 'epub', label: 'EPUB eBook' },
            { value: 'latex', label: 'LaTeX Document' },
            { value: 'md', label: 'Markdown (MD)' },
            { value: 'rst', label: 'reStructuredText (RST)' },
            { value: 'textile', label: 'Textile' },
            { value: 'org', label: 'Org Mode' },
            { value: 'mediawiki', label: 'MediaWiki' },
            { value: 'docbook', label: 'DocBook XML' },
            { value: 'pptx', label: 'PowerPoint (PPTX)' }
        ]
    }
};

function showUniversalConverterDialog() {
    const dialog = document.getElementById('universal-converter-dialog');
    dialog.classList.remove('hidden');
    converterFilePath = '';
    document.getElementById('converter-file-path').value = '';
    document.getElementById('converter-tool').value = 'libreoffice';
    document.getElementById('converter-progress').classList.add('hidden');
    updateConverterFormats('libreoffice');
}

function updateConverterFormats(tool) {
    const fromSelect = document.getElementById('converter-from');
    const toSelect = document.getElementById('converter-to');
    const helpText = document.getElementById('converter-tool-help');

    // Clear existing options
    fromSelect.innerHTML = '';
    toSelect.innerHTML = '';

    // Get formats for selected tool
    const formats = converterFormats[tool];

    if (formats) {
        // Populate input formats
        formats.input.forEach(format => {
            const option = document.createElement('option');
            option.value = format.value;
            option.textContent = format.label;
            fromSelect.appendChild(option);
        });

        // Populate output formats
        formats.output.forEach(format => {
            const option = document.createElement('option');
            option.value = format.value;
            option.textContent = format.label;
            toSelect.appendChild(option);
        });

        // Update help text
        if (tool === 'libreoffice') {
            helpText.textContent = 'Documents, Spreadsheets, Presentations - Office file conversions';
        } else if (tool === 'imagemagick') {
            helpText.textContent = 'Image format conversions - JPG, PNG, GIF, TIFF, WebP, SVG, and more';
        } else if (tool === 'ffmpeg') {
            helpText.textContent = 'Video and audio conversions - MP4, AVI, MOV, MP3, WAV, and more';
        } else if (tool === 'pandoc') {
            helpText.textContent = 'Document markup conversions - Markdown, HTML, LaTeX, EPUB, and more';
        }
    }
}

function updateConverterAdvancedOptions(tool) {
    // Hide all tool-specific options
    const allOptions = document.querySelectorAll('.converter-options');
    allOptions.forEach(opt => opt.classList.add('hidden'));

    // Show options for selected tool
    const toolOptions = document.querySelector(`.${tool}-options`);
    if (toolOptions) {
        toolOptions.classList.remove('hidden');
    }
}

function collectConverterAdvancedOptions(tool) {
    const options = {};
    const advancedMode = document.getElementById('converter-advanced-toggle').checked;

    if (!advancedMode) {
        return options;
    }

    // Tool-specific options
    if (tool === 'imagemagick') {
        options.quality = document.getElementById('imagemagick-quality').value;
        options.dpi = document.getElementById('imagemagick-dpi').value || null;
        options.resize = document.getElementById('imagemagick-resize').value || null;
        options.compression = document.getElementById('imagemagick-compression').value || null;
    } else if (tool === 'ffmpeg') {
        options.videoCodec = document.getElementById('ffmpeg-video-codec').value || null;
        options.audioCodec = document.getElementById('ffmpeg-audio-codec').value || null;
        options.bitrate = document.getElementById('ffmpeg-bitrate').value || null;
        options.preset = document.getElementById('ffmpeg-preset').value || null;
        options.framerate = document.getElementById('ffmpeg-framerate').value || null;
    } else if (tool === 'libreoffice') {
        options.quality = document.getElementById('libreoffice-quality').value || null;
        options.pageRange = document.getElementById('libreoffice-page-range').value || null;
        options.exportBookmarks = document.getElementById('libreoffice-export-bookmarks').checked;
    }

    return options;
}

document.addEventListener('DOMContentLoaded', () => {
    // Universal Converter tool change
    const converterTool = document.getElementById('converter-tool');
    if (converterTool) {
        converterTool.addEventListener('change', (e) => {
            updateConverterFormats(e.target.value);
            updateConverterAdvancedOptions(e.target.value);
        });
    }

    // Batch mode toggle
    const converterBatchMode = document.getElementById('converter-batch-mode');
    if (converterBatchMode) {
        converterBatchMode.addEventListener('change', (e) => {
            const batchOptions = document.getElementById('converter-batch-options');
            const singleFileSection = document.getElementById('converter-file-path').closest('.export-section');

            if (e.target.checked) {
                batchOptions.classList.remove('hidden');
                singleFileSection.style.display = 'none';
            } else {
                batchOptions.classList.add('hidden');
                singleFileSection.style.display = 'block';
            }
        });
    }

    // Advanced options toggle
    const converterAdvancedToggle = document.getElementById('converter-advanced-toggle');
    if (converterAdvancedToggle) {
        converterAdvancedToggle.addEventListener('change', (e) => {
            const advancedOptions = document.getElementById('converter-advanced-options');
            if (e.target.checked) {
                advancedOptions.classList.remove('hidden');
                // Update which tool-specific options to show
                updateConverterAdvancedOptions(document.getElementById('converter-tool').value);
            } else {
                advancedOptions.classList.add('hidden');
            }
        });
    }

    // ImageMagick quality slider
    const imagemagickQuality = document.getElementById('imagemagick-quality');
    if (imagemagickQuality) {
        imagemagickQuality.addEventListener('input', (e) => {
            document.getElementById('imagemagick-quality-value').textContent = e.target.value;
        });
    }

    // Browse batch input folder
    const browseBatchInput = document.getElementById('browse-converter-batch-input');
    if (browseBatchInput) {
        browseBatchInput.addEventListener('click', () => {
            ipcRenderer.send('select-folder', 'converter-batch-input');
        });
    }

    // Browse batch output folder
    const browseBatchOutput = document.getElementById('browse-converter-batch-output');
    if (browseBatchOutput) {
        browseBatchOutput.addEventListener('click', () => {
            ipcRenderer.send('select-folder', 'converter-batch-output');
        });
    }

    // Browse for file to convert
    const browseConverterFile = document.getElementById('browse-converter-file');
    if (browseConverterFile) {
        browseConverterFile.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    converterFilePath = file.path;
                    document.getElementById('converter-file-path').value = file.path;
                }
            };
            input.click();
        });
    }

    // Universal Converter dialog close
    const converterDialogClose = document.getElementById('converter-dialog-close');
    if (converterDialogClose) {
        converterDialogClose.addEventListener('click', () => {
            document.getElementById('universal-converter-dialog').classList.add('hidden');
        });
    }

    // Universal Converter cancel
    const converterCancel = document.getElementById('converter-cancel');
    if (converterCancel) {
        converterCancel.addEventListener('click', () => {
            document.getElementById('universal-converter-dialog').classList.add('hidden');
        });
    }

    // Universal Converter convert
    const converterConvert = document.getElementById('converter-convert');
    if (converterConvert) {
        converterConvert.addEventListener('click', () => {
            const tool = document.getElementById('converter-tool').value;
            const fromFormat = document.getElementById('converter-from').value;
            const toFormat = document.getElementById('converter-to').value;
            const batchMode = document.getElementById('converter-batch-mode').checked;
            const advancedOptions = collectConverterAdvancedOptions(tool);

            if (batchMode) {
                // Batch conversion
                const inputFolder = document.getElementById('converter-batch-input-folder').value.trim();
                const outputFolder = document.getElementById('converter-batch-output-folder').value.trim();
                const includeSubfolders = document.getElementById('converter-batch-subfolders').checked;

                if (!inputFolder || !outputFolder) {
                    alert('Please select both input and output folders for batch conversion');
                    return;
                }

                // Show progress
                document.getElementById('converter-progress').classList.remove('hidden');

                // Send batch conversion request
                ipcRenderer.send('universal-convert-batch', {
                    tool,
                    fromFormat,
                    toFormat,
                    inputFolder,
                    outputFolder,
                    includeSubfolders,
                    advancedOptions
                });
            } else {
                // Single file conversion
                const filePath = converterFilePath;

                if (!filePath) {
                    alert('Please select a file to convert');
                    return;
                }

                // Show progress
                document.getElementById('converter-progress').classList.remove('hidden');

                // Send single file conversion request
                ipcRenderer.send('universal-convert', {
                    tool,
                    fromFormat,
                    toFormat,
                    filePath,
                    advancedOptions
                });
            }
        });
    }
});

// IPC event listeners for recent files functionality
ipcRenderer.on('recent-files-cleared', () => {
    if (tabManager) {
        tabManager.recentFiles = [];
        localStorage.setItem('recentFiles', JSON.stringify([]));
        console.log('Recent files cleared');
    }
});

// ========================================
// PDF Editor Dialog Functionality
// ========================================

let currentPDFOperation = null;
let mergeFilePaths = [];

// Show PDF Editor Dialog
ipcRenderer.on('show-pdf-editor-dialog', (event, operation) => {
    currentPDFOperation = operation;
    showPDFEditorDialog(operation);
});

function showPDFEditorDialog(operation) {
    const dialog = document.getElementById('pdf-editor-dialog');
    const title = document.getElementById('pdf-editor-title');

    // Hide all operation sections
    document.querySelectorAll('.pdf-operation-section').forEach(section => {
        section.classList.add('hidden');
    });

    // Show the appropriate section and set title
    let sectionId, titleText;
    switch (operation) {
        case 'merge':
            sectionId = 'pdf-merge-section';
            titleText = 'Merge PDFs';
            mergeFilePaths = [];
            updateMergeFilesList();
            break;
        case 'split':
            sectionId = 'pdf-split-section';
            titleText = 'Split PDF';
            break;
        case 'compress':
            sectionId = 'pdf-compress-section';
            titleText = 'Compress PDF';
            break;
        case 'rotate':
            sectionId = 'pdf-rotate-section';
            titleText = 'Rotate Pages';
            break;
        case 'delete':
            sectionId = 'pdf-delete-section';
            titleText = 'Delete Pages';
            break;
        case 'reorder':
            sectionId = 'pdf-reorder-section';
            titleText = 'Reorder Pages';
            break;
        case 'watermark':
            sectionId = 'pdf-watermark-section';
            titleText = 'Add Watermark';
            break;
        case 'encrypt':
            sectionId = 'pdf-encrypt-section';
            titleText = 'Password Protection';
            break;
        case 'decrypt':
            sectionId = 'pdf-decrypt-section';
            titleText = 'Remove Password';
            break;
        case 'permissions':
            sectionId = 'pdf-permissions-section';
            titleText = 'Set Permissions';
            break;
    }

    title.textContent = titleText;
    document.getElementById(sectionId).classList.remove('hidden');
    dialog.classList.remove('hidden');
}

function hidePDFEditorDialog() {
    document.getElementById('pdf-editor-dialog').classList.add('hidden');
    document.getElementById('pdf-progress').classList.add('hidden');
    currentPDFOperation = null;
}

function updateMergeFilesList() {
    const listContainer = document.getElementById('merge-files-list');
    listContainer.innerHTML = '';

    mergeFilePaths.forEach((filePath, index) => {
        const fileEntry = document.createElement('div');
        fileEntry.className = 'file-entry';
        fileEntry.innerHTML = `
            <span class="file-name">${filePath.split(/[\\/]/).pop()}</span>
            <button class="remove-file" data-index="${index}">Remove</button>
        `;
        listContainer.appendChild(fileEntry);
    });
}

// PDF Editor Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Close PDF Editor Dialog
    const pdfEditorClose = document.getElementById('pdf-editor-dialog-close');
    if (pdfEditorClose) {
        pdfEditorClose.addEventListener('click', hidePDFEditorDialog);
    }

    const pdfEditorCancel = document.getElementById('pdf-editor-cancel');
    if (pdfEditorCancel) {
        pdfEditorCancel.addEventListener('click', hidePDFEditorDialog);
    }

    // Process button
    const pdfEditorProcess = document.getElementById('pdf-editor-process');
    if (pdfEditorProcess) {
        pdfEditorProcess.addEventListener('click', processPDFOperation);
    }

    // Merge PDFs - Add file button
    const addMergeFile = document.getElementById('add-merge-file');
    if (addMergeFile) {
        addMergeFile.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pdf';
            input.multiple = true;
            input.onchange = (e) => {
                const files = Array.from(e.target.files);
                files.forEach(file => {
                    if (!mergeFilePaths.includes(file.path)) {
                        mergeFilePaths.push(file.path);
                    }
                });
                updateMergeFilesList();
            };
            input.click();
        });
    }

    // Remove file from merge list (using event delegation)
    const mergeFilesList = document.getElementById('merge-files-list');
    if (mergeFilesList) {
        mergeFilesList.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-file')) {
                const index = parseInt(e.target.dataset.index);
                mergeFilePaths.splice(index, 1);
                updateMergeFilesList();
            }
        });
    }

    // Browse buttons for all operations
    const browseButtons = [
        { id: 'browse-merge-output', inputId: 'merge-output-path', saveDialog: true },
        { id: 'browse-split-input', inputId: 'split-input-path', saveDialog: false },
        { id: 'browse-split-output', inputId: 'split-output-folder', folder: true },
        { id: 'browse-compress-input', inputId: 'compress-input-path', saveDialog: false },
        { id: 'browse-compress-output', inputId: 'compress-output-path', saveDialog: true },
        { id: 'browse-rotate-input', inputId: 'rotate-input-path', saveDialog: false },
        { id: 'browse-rotate-output', inputId: 'rotate-output-path', saveDialog: true },
        { id: 'browse-delete-input', inputId: 'delete-input-path', saveDialog: false },
        { id: 'browse-delete-output', inputId: 'delete-output-path', saveDialog: true },
        { id: 'browse-reorder-input', inputId: 'reorder-input-path', saveDialog: false },
        { id: 'browse-reorder-output', inputId: 'reorder-output-path', saveDialog: true },
        { id: 'browse-watermark-input', inputId: 'watermark-input-path', saveDialog: false },
        { id: 'browse-watermark-output', inputId: 'watermark-output-path', saveDialog: true },
        { id: 'browse-encrypt-input', inputId: 'encrypt-input-path', saveDialog: false },
        { id: 'browse-encrypt-output', inputId: 'encrypt-output-path', saveDialog: true },
        { id: 'browse-decrypt-input', inputId: 'decrypt-input-path', saveDialog: false },
        { id: 'browse-decrypt-output', inputId: 'decrypt-output-path', saveDialog: true },
        { id: 'browse-permissions-input', inputId: 'permissions-input-path', saveDialog: false },
        { id: 'browse-permissions-output', inputId: 'permissions-output-path', saveDialog: true }
    ];

    browseButtons.forEach(button => {
        const btn = document.getElementById(button.id);
        if (btn) {
            btn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';

                if (button.folder) {
                    // Request folder selection via IPC
                    ipcRenderer.send('select-pdf-folder', button.inputId);
                } else if (button.saveDialog) {
                    input.nwsaveas = true;
                    input.accept = '.pdf';
                    input.onchange = (e) => {
                        const file = e.target.files[0];
                        if (file) {
                            document.getElementById(button.inputId).value = file.path;
                        }
                    };
                    input.click();
                } else {
                    input.accept = '.pdf';
                    input.onchange = (e) => {
                        const file = e.target.files[0];
                        if (file) {
                            document.getElementById(button.inputId).value = file.path;
                        }
                    };
                    input.click();
                }
            });
        }
    });

    // Split mode change handler
    const splitMode = document.getElementById('split-mode');
    if (splitMode) {
        splitMode.addEventListener('change', (e) => {
            // Hide all split options
            document.getElementById('split-pages-options').classList.add('hidden');
            document.getElementById('split-interval-options').classList.add('hidden');
            document.getElementById('split-size-options').classList.add('hidden');

            // Show selected split option
            if (e.target.value === 'pages') {
                document.getElementById('split-pages-options').classList.remove('hidden');
            } else if (e.target.value === 'interval') {
                document.getElementById('split-interval-options').classList.remove('hidden');
            } else if (e.target.value === 'size') {
                document.getElementById('split-size-options').classList.remove('hidden');
            }
        });
    }

    // Watermark opacity slider
    const watermarkOpacity = document.getElementById('watermark-opacity');
    if (watermarkOpacity) {
        watermarkOpacity.addEventListener('input', (e) => {
            document.getElementById('watermark-opacity-value').textContent = e.target.value;
        });
    }

    // Watermark pages selection
    const watermarkPages = document.getElementById('watermark-pages');
    if (watermarkPages) {
        watermarkPages.addEventListener('change', (e) => {
            const customPages = document.getElementById('watermark-custom-pages');
            if (e.target.value === 'custom') {
                customPages.classList.remove('hidden');
            } else {
                customPages.classList.add('hidden');
            }
        });
    }

    // Load current page order button
    const loadCurrentOrder = document.getElementById('load-current-order');
    if (loadCurrentOrder) {
        loadCurrentOrder.addEventListener('click', () => {
            const inputPath = document.getElementById('reorder-input-path').value;
            if (!inputPath) {
                alert('Please select a PDF file first');
                return;
            }
            // Request page count from main process
            ipcRenderer.send('get-pdf-page-count', inputPath);
        });
    }
});

// Handle folder selection response
ipcRenderer.on('pdf-folder-selected', (event, { inputId, path }) => {
    document.getElementById(inputId).value = path;
});

// Handle PDF page count response
ipcRenderer.on('pdf-page-count', (event, { count, error }) => {
    if (error) {
        alert('Error reading PDF: ' + error);
        return;
    }

    const currentOrder = Array.from({ length: count }, (_, i) => i + 1).join(', ');
    document.getElementById('current-order-display').textContent = currentOrder;
    document.getElementById('current-page-order').classList.remove('hidden');
    document.getElementById('reorder-pages').value = currentOrder;
});

// Process PDF Operation
function processPDFOperation() {
    const operation = currentPDFOperation;
    let operationData = { operation };

    try {
        switch (operation) {
            case 'merge':
                if (mergeFilePaths.length < 2) {
                    alert('Please add at least 2 PDF files to merge');
                    return;
                }
                operationData.inputFiles = mergeFilePaths;
                operationData.outputPath = document.getElementById('merge-output-path').value.trim();
                if (!operationData.outputPath) {
                    alert('Please select an output file path');
                    return;
                }
                break;

            case 'split':
                operationData.inputPath = document.getElementById('split-input-path').value.trim();
                operationData.outputFolder = document.getElementById('split-output-folder').value.trim();
                operationData.splitMode = document.getElementById('split-mode').value;

                if (!operationData.inputPath || !operationData.outputFolder) {
                    alert('Please select input file and output folder');
                    return;
                }

                if (operationData.splitMode === 'pages') {
                    operationData.pageRanges = document.getElementById('split-page-ranges').value.trim();
                } else if (operationData.splitMode === 'interval') {
                    operationData.interval = parseInt(document.getElementById('split-interval').value);
                } else if (operationData.splitMode === 'size') {
                    operationData.maxSize = parseInt(document.getElementById('split-size').value);
                }
                break;

            case 'compress':
                operationData.inputPath = document.getElementById('compress-input-path').value.trim();
                operationData.outputPath = document.getElementById('compress-output-path').value.trim();
                operationData.compressionLevel = document.getElementById('compress-level').value;
                operationData.compressImages = document.getElementById('compress-images').checked;
                operationData.removeDuplicates = document.getElementById('compress-remove-duplicates').checked;
                operationData.optimizeFonts = document.getElementById('compress-optimize-fonts').checked;

                if (!operationData.inputPath || !operationData.outputPath) {
                    alert('Please select input and output file paths');
                    return;
                }
                break;

            case 'rotate':
                operationData.inputPath = document.getElementById('rotate-input-path').value.trim();
                operationData.outputPath = document.getElementById('rotate-output-path').value.trim();
                operationData.pages = document.getElementById('rotate-pages').value.trim();
                operationData.angle = parseInt(document.getElementById('rotate-angle').value);

                if (!operationData.inputPath || !operationData.outputPath) {
                    alert('Please select input and output file paths');
                    return;
                }
                break;

            case 'delete':
                operationData.inputPath = document.getElementById('delete-input-path').value.trim();
                operationData.outputPath = document.getElementById('delete-output-path').value.trim();
                operationData.pages = document.getElementById('delete-pages').value.trim();

                if (!operationData.inputPath || !operationData.outputPath || !operationData.pages) {
                    alert('Please fill in all required fields');
                    return;
                }
                break;

            case 'reorder':
                operationData.inputPath = document.getElementById('reorder-input-path').value.trim();
                operationData.outputPath = document.getElementById('reorder-output-path').value.trim();
                operationData.newOrder = document.getElementById('reorder-pages').value.trim();

                if (!operationData.inputPath || !operationData.outputPath || !operationData.newOrder) {
                    alert('Please fill in all required fields');
                    return;
                }
                break;

            case 'watermark':
                operationData.inputPath = document.getElementById('watermark-input-path').value.trim();
                operationData.outputPath = document.getElementById('watermark-output-path').value.trim();
                operationData.text = document.getElementById('watermark-text').value.trim();
                operationData.fontSize = parseInt(document.getElementById('watermark-font-size').value);
                operationData.opacity = parseInt(document.getElementById('watermark-opacity').value) / 100;
                operationData.position = document.getElementById('watermark-position').value;
                operationData.color = document.getElementById('watermark-color').value;
                operationData.pages = document.getElementById('watermark-pages').value;

                if (operationData.pages === 'custom') {
                    operationData.customPages = document.getElementById('watermark-custom-pages').value.trim();
                }

                if (!operationData.inputPath || !operationData.outputPath || !operationData.text) {
                    alert('Please fill in all required fields');
                    return;
                }
                break;

            case 'encrypt':
                operationData.inputPath = document.getElementById('encrypt-input-path').value.trim();
                operationData.outputPath = document.getElementById('encrypt-output-path').value.trim();
                operationData.userPassword = document.getElementById('encrypt-user-password').value;
                operationData.ownerPassword = document.getElementById('encrypt-owner-password').value;
                operationData.encryptionLevel = parseInt(document.getElementById('encrypt-level').value);

                operationData.permissions = {
                    printing: document.getElementById('encrypt-allow-printing').checked,
                    modifying: document.getElementById('encrypt-allow-modify').checked,
                    copying: document.getElementById('encrypt-allow-copy').checked,
                    annotating: document.getElementById('encrypt-allow-annotate').checked,
                    fillingForms: document.getElementById('encrypt-allow-forms').checked,
                    contentAccessibility: document.getElementById('encrypt-allow-extract').checked,
                    documentAssembly: document.getElementById('encrypt-allow-assemble').checked,
                    printingQuality: document.getElementById('encrypt-allow-print-high').checked
                };

                if (!operationData.inputPath || !operationData.outputPath || !operationData.userPassword) {
                    alert('Please select files and enter a user password');
                    return;
                }
                break;

            case 'decrypt':
                operationData.inputPath = document.getElementById('decrypt-input-path').value.trim();
                operationData.outputPath = document.getElementById('decrypt-output-path').value.trim();
                operationData.password = document.getElementById('decrypt-password').value;

                if (!operationData.inputPath || !operationData.outputPath || !operationData.password) {
                    alert('Please fill in all required fields');
                    return;
                }
                break;

            case 'permissions':
                operationData.inputPath = document.getElementById('permissions-input-path').value.trim();
                operationData.outputPath = document.getElementById('permissions-output-path').value.trim();
                operationData.currentPassword = document.getElementById('permissions-current-password').value;
                operationData.ownerPassword = document.getElementById('permissions-owner-password').value;

                operationData.permissions = {
                    printing: document.getElementById('permissions-allow-printing').checked,
                    modifying: document.getElementById('permissions-allow-modify').checked,
                    copying: document.getElementById('permissions-allow-copy').checked,
                    annotating: document.getElementById('permissions-allow-annotate').checked,
                    fillingForms: document.getElementById('permissions-allow-forms').checked,
                    contentAccessibility: document.getElementById('permissions-allow-extract').checked,
                    documentAssembly: document.getElementById('permissions-allow-assemble').checked,
                    printingQuality: document.getElementById('permissions-allow-print-high').checked
                };

                if (!operationData.inputPath || !operationData.outputPath || !operationData.ownerPassword) {
                    alert('Please fill in all required fields');
                    return;
                }
                break;
        }

        // Show progress
        document.getElementById('pdf-progress').classList.remove('hidden');
        document.getElementById('pdf-progress-text').textContent = 'Processing PDF...';

        // Send to main process
        ipcRenderer.send('process-pdf-operation', operationData);

    } catch (error) {
        alert('Error: ' + error.message);
        console.error('PDF operation error:', error);
    }
}

// Handle PDF operation completion
ipcRenderer.on('pdf-operation-complete', (event, { success, error, message }) => {
    document.getElementById('pdf-progress').classList.add('hidden');

    if (success) {
        alert(message || 'PDF operation completed successfully!');
        hidePDFEditorDialog();
    } else {
        alert('Error: ' + (error || 'PDF operation failed'));
    }
});

// Handle PDF operation progress
ipcRenderer.on('pdf-operation-progress', (event, { message, progress }) => {
    document.getElementById('pdf-progress-text').textContent = message;
    if (progress !== undefined) {
        const progressFill = document.getElementById('pdf-progress-fill');
        if (progressFill) {
            progressFill.style.width = `${progress}%`;
        }
    }
});

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