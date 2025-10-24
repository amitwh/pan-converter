# PanConverter - Claude Development Guide

## Project Overview

**PanConverter** is a cross-platform Markdown editor and converter powered by Pandoc, built with Electron. It provides professional-grade editing capabilities with comprehensive export options.

**Current Version**: v1.7.7
**Author**: Amit Haridas (amit.wh@gmail.com)
**License**: MIT
**Repository**: https://github.com/amitwh/pan-converter

## Architecture & Technology Stack

### Core Technologies
- **Electron** - Cross-platform desktop application framework
- **Pandoc** - Universal document converter (required system dependency)
- **ConvertAPI** - Cloud-based file conversion (200+ formats)
- **marked** - Markdown parsing and rendering
- **highlight.js** - Syntax highlighting
- **KaTeX** - Mathematical expression rendering
- **DOMPurify** - HTML sanitization
- **PDFKit** - Native PDF generation without external dependencies (v1.7.7)
- **html2pdf** - HTML to PDF conversion library (v1.7.7)

### Application Structure
```
src/
├── main.js            # Electron main process, menu system, IPC handlers
├── renderer.js        # TabManager class, multi-file editing, event handling
├── index.html         # Application layout with tabbed interface
├── styles.css         # Base styling with multi-theme support
└── styles-modern.css  # Modern glassmorphism UI design system (v1.7.1)

assets/
└── icon.png       # Application icon

package.json       # Dependencies and build configuration
CLAUDE.md          # Development documentation for AI assistants
```

## Development Commands

### Prerequisites
```bash
# Install Node.js dependencies
npm install

# Install Pandoc (required for export functionality)
# Ubuntu/Debian:
sudo apt-get install pandoc

# macOS:
brew install pandoc

# Windows: Download from https://pandoc.org/installing.html
```

### Running the Application
```bash
# Start development server
npm start

# Start with debugging
npm start --enable-logging
```

### Building & Packaging

```bash
# Generate application icons
npm run generate-icons

# Build for current platform
npm run build

# Platform-specific builds
npm run build:win      # Windows
npm run build:mac      # macOS
npm run build:linux    # Linux (AppImage, .deb, .snap)

# Build for all platforms
npm run dist:all
```

### Git Branch Management
```bash
# Switch to platform-specific branches
git checkout linux    # Linux development
git checkout macos     # macOS development  
git checkout windows   # Windows development
git checkout master    # Main development branch

# Update all branches with latest changes
git checkout master
git push origin master
git checkout linux && git merge master && git push origin linux
git checkout macos && git merge master && git push origin macos
git checkout windows && git merge master && git push origin windows
```

### Release Management
```bash
# Create and push release tag
git tag v1.2.1 -m "Release message"
git push origin v1.2.1

# Create GitHub release with packages
gh release create v1.2.1 --title "Title" --notes "Release notes" \
  "dist/PanConverter-1.2.1.AppImage" \
  "dist/pan-converter_1.2.1_amd64.deb" \
  "dist/pan-converter_1.2.1_amd64.snap"
```

## Feature Implementation Guide

### v1.7.7 Print & Enhanced PDF Support (Latest)

#### 🖨️ Native Print Functionality
**Added Print Submenu to File Menu** (`src/main.js:202-215`, `src/renderer.js:1152-1188`, `src/styles.css:2828-2994`)
- **Print Menu**: Submenu in File menu with two print options
  - **Print Preview** (`Ctrl+P`) - Prints preview in black text, no background colors (ink-saving)
  - **Print Preview (With Styles)** - Prints with full theme colors and styling
- **Preview-Only Printing**: Only renders the markdown preview, hides all editor UI
- **Native Print Dialog**: Uses Electron's webContents.print() for native OS print dialogs
- **Professional Output**: Automatically hides editor, toolbar, tabs, and status bar during print
- **Print Optimization**: Smart page breaks, proper formatting for headings, code blocks, tables
- **Cross-Platform**: Works on Windows, macOS, and Linux with native printer support

**Print Options:**
1. **Print Preview** (Ctrl+P)
   - Black text on white background for professional printing
   - No background colors to save ink
   - Perfect for documents and reports
   - Minimal ink consumption

2. **Print Preview (With Styles)**
   - Full theme colors and styling
   - Preserves markdown formatting with visual hierarchy
   - Better for design-focused documents
   - Shows code blocks with colored syntax highlighting

**Technical Implementation:**
```javascript
// Main process - two print handlers
ipcMain.on('print-preview', (event) => {
  mainWindow.webContents.send('prepare-print-preview', false);
  setTimeout(() => {
    mainWindow.webContents.print({
      silent: false,
      printBackground: false,
      color: true,
      margin: { marginType: 'default' }
    });
  }, 100);
});

ipcMain.on('print-preview-styled', (event) => {
  mainWindow.webContents.send('prepare-print-preview', true);
  setTimeout(() => {
    mainWindow.webContents.print({
      silent: false,
      printBackground: true,
      color: true,
      margin: { marginType: 'default' }
    });
  }, 100);
});

// Renderer process - prepares preview for printing
ipcRenderer.on('prepare-print-preview', (event, withStyles) => {
  // Hide editor and UI elements
  document.getElementById('editor-container').style.display = 'none';
  document.getElementById('toolbar').style.display = 'none';
  document.getElementById('tab-bar').style.display = 'none';
  document.getElementById('status-bar').style.display = 'none';

  // Add print mode classes
  const preview = document.getElementById('preview');
  preview.classList.add('print-mode');
  if (!withStyles) {
    preview.classList.add('print-no-styles');
  }

  // Restore UI after print
  setTimeout(() => {
    document.getElementById('editor-container').style.display = '';
    document.getElementById('toolbar').style.display = '';
    document.getElementById('tab-bar').style.display = '';
    document.getElementById('status-bar').style.display = '';
    preview.classList.remove('print-mode', 'print-no-styles');
  }, 500);
});
```

**CSS Print Styles** (`src/styles.css:2828-2994`)
- Comprehensive @media print stylesheet
- Hides all UI elements in print view
- Optimizes preview for paper output
- Smart page breaks for headings and tables
- Proper formatting for code blocks, lists, tables
- Image optimization and link handling
- Professional typography with 12pt font size

#### 📦 Enhanced PDF Export Dependencies
**Added Native PDF Generation Libraries** (package.json)
- **PDFKit** (v0.14.0) - Native PDF generation without Pandoc dependency
- **html2pdf.js** (v0.10.1) - HTML to PDF conversion for rich formatted output
- **Benefits**: PDF exports now work even without system Pandoc installation
- **Future Enhancement**: Enables PDF generation with embedded fonts and graphics
- **Offline Support**: Complete PDF generation offline without external services

**Updated Dependencies:**
```json
{
  "pdfkit": "^0.14.0",
  "html2pdf.js": "^0.10.1"
}
```

**Features Enabled:**
- PDF export works independently of Pandoc installation
- Higher quality PDF output with better formatting control
- Support for custom fonts, images, and complex layouts
- Faster PDF generation times
- Reduced system dependencies for better portability

#### 🔧 Keyboard Shortcut Updates
**Remapped Shortcuts** (`src/main.js`)
- **Print**: `Ctrl+P` (new in v1.7.7) - Opens native print dialog
- **Toggle Preview**: Changed from `Ctrl+P` to `Ctrl+Shift+P` to avoid conflicts
- **Backward Compatibility**: No breaking changes to existing workflows

### v1.7.6 UI Improvement

#### 🎨 Table Header Styling Cleanup
**Removed Custom Background Colors** (`src/styles.css:327-329`, `src/styles.css:451-453`)
- Removed gray background color (#f6f8fa) from table headers in default theme
- Removed dark theme table header background styling block entirely
- Table headers now blend naturally with preview background for cleaner appearance
- Headers maintain font-weight: 600 for visual distinction
- All other table styling preserved (borders, alternating row colors)

**User Feedback Implementation:**
- Based on user feedback: "remove the theming of table headers, it looks bad"
- Result: Professional, clean table presentation matching overall preview styling
- Consistent with normal preview theming across all themes

### v1.7.5 Critical File Association Fix

#### 🐛 Single-Instance Lock for Windows File Association
**Fixed Installed App Double-Click Behavior** (`src/main.js:52-85`)
- **Root Cause**: Windows launches second instance when double-clicking files with app already running
- **Solution**: Implemented `app.requestSingleInstanceLock()` pattern
- **Second Instance Handler**: Captures file path from new instance attempts and opens in existing instance
- **Focus Management**: Automatically focuses and restores existing window
- **Renderer Readiness**: Proper handling of file queue with `rendererReady` state

**Technical Implementation:**
```javascript
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Focus existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Extract and open file from second instance
    const fileArgs = commandLine.slice(2);
    for (const arg of fileArgs) {
      if ((arg.endsWith('.md') || arg.endsWith('.markdown')) && fs.existsSync(arg)) {
        if (rendererReady) {
          openFileFromPath(arg);
        } else {
          app.pendingFile = arg;
        }
        break;
      }
    }
  });
}
```

**Fixed Issues:**
- ✅ Double-click `.md` files in Windows Explorer now opens correctly
- ✅ Right-click "Open with PanConverter" now works in installed app
- ✅ File association behavior now consistent between development and production
- ✅ Single instance maintained across all file opening methods

**Why Previous Attempts Failed:**
- v1.7.3-1.7.4: Only added `rendererReady` checks but missed second-instance handling
- Development testing passed but production failed (different execution paths)
- Second instance would start, receive file, then exit without passing to first instance

### v1.7.2 Enhanced Themes & Bug Fixes

#### 🎨 14 New Beautiful Themes
**Expanded Theme Collection** (`src/main.js:242-266`, `src/styles.css:1590-2555`)
- **Added 14 new professionally-designed themes** bringing the total to 19 themes
- **New Themes Include**:
  - **Dracula** - Popular purple and pink dark theme
  - **Nord** - Arctic-inspired blue theme
  - **One Dark** - Atom's iconic dark theme
  - **Atom One Light** - Clean, bright light theme
  - **Material** - Google Material Design inspired
  - **Gruvbox Dark** - Warm retro groove colors (dark)
  - **Gruvbox Light** - Warm retro groove colors (light)
  - **Tokyo Night** - Modern Japanese-inspired dark theme
  - **Palenight** - Soft purple Material Design variant
  - **Ayu Dark** - Simple, elegant dark theme
  - **Ayu Light** - Minimalist light theme
  - **Ayu Mirage** - Balanced dark-light hybrid
  - **Oceanic Next** - Ocean-inspired teal and blue
  - **Cobalt2** - Deep blue with yellow accents

**Technical Implementation:**
- Complete CSS styling for all UI elements per theme
- Consistent theming across tabs, toolbar, editor, preview, and status bar
- Theme-aware color schemes for syntax highlighting
- All themes support glassmorphism effects from v1.7.1

#### 🐛 Undo/Redo Fix
**Fixed Menu Integration** (`src/renderer.js:1107-1118`)
- Fixed undo/redo menu items not connecting to custom undo/redo functionality
- Added IPC event listeners in renderer to receive 'undo' and 'redo' messages
- Connected Edit menu commands to TabManager's undo() and redo() methods
- Keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z) now work correctly with custom undo stack

### v1.7.1 Modern UI Design

#### 🎨 Glassmorphism & Gradient UI
**Modern Design System** (`src/styles-modern.css`, `src/index.html:7-11`)
- **Glassmorphism Effects** - Translucent backgrounds with backdrop-filter blur
- **Animated Gradient Background** - Purple-blue gradient that shifts colors dynamically
- **CSS Custom Properties** - Centralized theming with CSS variables
- **Modern Typography** - Inter font family for UI, JetBrains Mono for code
- **Smooth Animations** - CSS transitions with cubic-bezier easing
- **Enhanced Hover Effects** - Interactive elements with scale and transform effects
- **Custom Scrollbars** - Styled scrollbars matching the modern aesthetic
- **Progress Bars** - Shimmer animations and gradient fills

**Design Features:**
- Animated gradient background (15-second color shift loop)
- Glass-effect tabs with blur and semi-transparency
- Gradient-based buttons with hover/active states
- Modern card-based dialogs with rounded corners
- Enhanced typography with gradient text for headings
- Ripple-like hover effects on interactive elements
- Theme variables for consistent colors and spacing
- Shadow effects with proper depth perception

**Technical Implementation:**
- Created comprehensive `styles-modern.css` file (780+ lines)
- Google Fonts integration (Inter, JetBrains Mono)
- CSS Grid and Flexbox for modern layouts
- backdrop-filter for glassmorphism (with fallbacks)
- CSS animations with @keyframes
- RGB/RGBA color system with opacity control
- CSS custom properties for easy theming

### v1.7.0 PDF Editor & Universal Converter

#### 📄 Comprehensive PDF Editor
**Complete PDF Manipulation Suite** (`src/main.js:1566-2068`, `src/index.html:552-921`, `src/renderer.js:1951-2429`)
- **Merge PDFs** - Combine multiple PDF files into a single document
- **Split PDF** - Split PDFs by page ranges, intervals, or file size
- **Compress PDF** - Reduce PDF file size with optimization
- **Rotate Pages** - Rotate specific pages or entire documents (90°, 180°, 270°)
- **Delete Pages** - Remove unwanted pages from PDFs
- **Reorder Pages** - Rearrange pages in any order
- **Add Watermark** - Text watermarks with customizable position, size, color, opacity
- **Password Protection** - Encrypt PDFs with user and owner passwords
- **Remove Password** - Decrypt password-protected PDFs
- **Set Permissions** - Control printing, copying, modifying, and other document permissions

**Technical Implementation:**
- Uses `pdf-lib` (v1.17.1) for all PDF operations
- Full async/await implementation for optimal performance
- Comprehensive error handling and user feedback
- Progress indicators for long-running operations
- Page range parsing (e.g., "1-5, 7, 9-12")
- RGB color conversion for watermarks
- Support for encrypted PDFs

**Watermark Features:**
- Multiple positioning options (center, diagonal, corners, top/bottom)
- Customizable font size (8-144px)
- Adjustable opacity (0-100%)
- Color picker for text color
- Apply to all pages or custom page ranges

**Security Features:**
- 128-bit and 256-bit encryption support
- User password (required to open PDF)
- Owner password (required to modify permissions)
- Granular permission controls:
  - Allow/deny printing (high/low resolution)
  - Allow/deny content modification
  - Allow/deny content copying
  - Allow/deny annotations
  - Allow/deny form filling
  - Allow/deny accessibility features
  - Allow/deny document assembly
  - Allow/deny high-quality printing

#### 🔄 Universal File Converter
**Open-Source Multi-Tool Converter** (`src/main.js:446-600`, `src/index.html:257-483`, `src/renderer.js:1372-1940`)
- **LibreOffice** - Document conversions (DOCX, PDF, ODT, RTF, TXT, HTML, XLSX, PPTX)
- **ImageMagick** - Image format conversions (JPG, PNG, GIF, TIFF, WebP, SVG, etc.)
- **FFmpeg** - Video and audio conversions (MP4, AVI, MOV, MP3, WAV, etc.)
- **Pandoc** - Document markup conversions (Markdown, HTML, LaTeX, EPUB, etc.)

**Features:**
- Single file and batch folder conversion
- Tool-specific advanced options:
  - ImageMagick: Quality, DPI, resize, compression type
  - FFmpeg: Video/audio codecs, bitrate, preset, framerate
  - LibreOffice: Export quality, page range, bookmarks
- Automatic tool detection and availability checking
- Recursive folder processing
- 100% offline and open-source
- No API keys required

### v1.6.1 Bug Fixes

#### 🐛 File Association Rendering Fix
**Fixed Double-Click File Loading** (`src/main.js:1364-1379`)
- Fixed critical issue where files opened via double-click weren't rendering
- Added proper wait for renderer load state before sending file data
- Implemented `did-finish-load` event listener to prevent race conditions
- Files now render correctly when opened from Windows Explorer

### v1.6.0 Enhanced Markdown Editor & ConvertAPI Integration

#### ✨ Complete Markdown Toolbar
**Additional Formatting Buttons** (`src/index.html:78-98`, `src/renderer.js:596-723`)
- **Strikethrough** button - Wraps text with `~~strikethrough~~`
- **Code Block** button - Inserts fenced code blocks with triple backticks
- **Horizontal Rule** button - Adds section divider with `---`
- Complete suite of markdown formatting tools now available

#### 🔍 Fixed Find & Replace
**Focus and Highlighting Improvements** (`src/renderer.js:725-870`)
- Fixed focus issue - dialog no longer loses focus while typing
- Visual highlighting with text selection showing current match
- Smart auto-scroll to display matches prominently
- Real-time match counting: "Match X of Y"
- Replace single match or replace all functionality
- Enter/Shift+Enter keyboard navigation

#### 📏 Fixed Line Numbers
**Line Counting and Synchronization** (`src/renderer.js:337-355`)
- Fixed bug using `'\\n'` instead of `'\n'` for line splitting
- Added scroll synchronization between line numbers and editor
- Line numbers update correctly as you type
- Smooth scrolling keeps line numbers aligned

#### ☁️ ConvertAPI Cloud Integration
**200+ Format Cloud Conversion** (`src/main.js:370-416`, `src/index.html:257-307`, `src/renderer.js:1540-1603`)
- New **ConvertAPI menu** with cloud-based file conversion
- Support for 200+ file formats: MD, DOCX, PDF, HTML, JPG, PNG, EPUB, ODT
- Secure API key storage in localStorage for reuse
- Real-time conversion status and progress tracking
- Free tier: 250 conversions per month
- Professional conversion dialog with format selection
- Get API key at: https://www.convertapi.com

**Technical Implementation:**
- Installed `convertapi` npm package (v1.15.0)
- IPC handlers for cloud conversion workflow
- Error handling and user feedback dialogs
- Async/await pattern for conversion operations

### v1.5.0 Enhanced Features & Open Source Compatibility

#### 🔧 Export Function Fixes & Optional Advanced Options
**Export Dialog Enhancement** (`src/index.html:125-133`, `src/renderer.js:960-985`)
- Fixed export function issues after advanced export options integration
- Added optional advanced export options via checkbox toggle (unchecked by default)
- Basic export options always visible, advanced options hidden until enabled
- Clean UI separation between simple and advanced export workflows

#### 🏗️ Open Source Compatibility & Dependency Removal
**Removed Proprietary Dependencies** (`src/main.js:430-450`, `package.json:32-37`)
- Removed bundled Pandoc binaries - now requires system-installed Pandoc
- Replaced proprietary XLSX dependency with open-source CSV export
- Removed non-essential bundled binaries to ensure open-source compatibility
- Updated export functions to use system Pandoc installation

#### ✨ Advanced User Experience Features
**Auto-Save System** (`src/renderer.js:445-484`)
- Automatic saving every 30 seconds with visual indicators
- Smooth slide-in animation for auto-save notifications
- Prevents data loss during extended editing sessions
- Integrated with file opening and tab creation workflows

**Enhanced Document Statistics** (`src/renderer.js:385-444`)
- Comprehensive statistics: words, characters, lines, paragraphs, sentences
- Estimated reading time calculation (200 words per minute)
- Real-time updates as user types
- Professional presentation in status bar

**Recent Files Management** (`src/main.js:69-114`, `src/renderer.js:487-512`)
- Recent files menu with last 10 opened files
- Persistent storage via localStorage and user data directory
- Menu integration with File > Recent Files submenu
- Clear recent files functionality with menu rebuild

**Mathematical Expression Support** (`src/renderer.js:1099-1130`, `src/renderer.js:292-306`)
- KaTeX integration for rendering mathematical expressions
- Support for multiple delimiters: $$, $, \\[\\], \\(\\)
- Real-time math rendering in preview pane
- Fallback handling for missing KaTeX library

### v1.4.0 Advanced Export & Batch Processing

#### 🔧 Fixed File Association Support
**File Loading Fix** (`src/main.js:385-390`, `src/renderer.js:485-486`)
- Fixed timing issue with file association loading
- Added proper `renderer-ready` event to ensure TabManager is initialized
- Files now open correctly when double-clicked or opened via right-click menu
- Command-line file arguments are properly handled on startup

#### 🎛️ Advanced Export Options Dialog
**Template & Metadata Support** (`src/main.js:247-357`, `src/index.html:117-212`)
- Comprehensive export options dialog with professional UI
- Template selection (default or custom template files)
- Metadata fields (title, author, date, subject) with dynamic field addition
- Document options: Table of Contents, section numbering, citations
- PDF-specific options: Engine selection (XeLaTeX, PDFLaTeX, LuaLaTeX), custom margins
- Bibliography support: .bib, .yaml, .json files with CSL styling
- All export formats now use enhanced options dialog

#### 📁 Batch File Conversion System
**Multi-File Processing** (`src/main.js:179-186`, `src/main.js:559-690`)
- New "Batch" menu for converting entire folders
- Recursive folder processing with progress tracking
- Support for all export formats with advanced options
- Real-time progress bar and file-by-file status updates
- Maintains folder structure in output directory
- Error handling with completion statistics

#### 🎨 Enhanced UI Components
**Dialog System** (`src/styles.css:838-1361`)
- Professional modal dialogs with backdrop and animations
- Theme-aware styling for all new components
- Responsive layouts with proper accessibility
- Form validation and user feedback systems
- Progress indicators for long-running operations

### v1.3.x Tabbed Interface & Enhanced Features

#### 🗂️ Tabbed Multi-File Support (v1.3.0)
**TabManager Class** (`src/renderer.js`)
- Complete tab management system for multiple files
- Tab switching, creation, and closure
- State preservation per tab (content, cursor position, scroll)
- File path tracking for each tab
- Keyboard shortcuts: `Ctrl/Cmd+T` (new tab), `Ctrl/Cmd+W` (close tab)

#### 🎯 Enhanced PDF Export (v1.3.0)
**Multi-Engine Fallback System** (`src/main.js:239-280`)
- Primary: XeLaTeX with proper margins
- Fallback 1: PDFLaTeX
- Fallback 2: wkhtmltopdf
- Automatic engine detection and switching

#### 📁 File Association Support (v1.3.1)
**OS Integration** (`src/main.js:452-498`, `package.json:50-65`)
- Double-click .md files to open in PanConverter
- Command-line argument handling
- Pending file queue for startup loading

#### 🎨 Typography & Spacing (v1.3.2-1.3.3)
**Preview Enhancement** (`src/styles.css`)
- Restored ideal text spacing from v1.0
- Font sizes increased to 15px for better readability
- Comprehensive selector coverage for legacy and new containers
- Theme-aware typography for all content types

### v1.2.1 Comprehensive Editor Enhancements

#### ✨ Advanced Editor Features

**Find & Replace System** (`src/renderer.js:200-350`)
- Dialog-based interface with match highlighting
- Forward/backward navigation through matches
- Replace single or replace all functionality
- Real-time match counting and status display
- Escape key closes dialog

**Line Numbers** (`src/renderer.js:450-500`, `src/styles.css:517-598`)
- Toggle-able line numbers with toolbar button
- Synchronized scrolling with editor content
- Theme-aware styling for all supported themes
- Dynamic line number generation based on content

**Undo/Redo System** (`src/renderer.js:100-150`)
- Stack-based state management for editor history
- Keyboard shortcuts: `Ctrl/Cmd+Z` (undo), `Ctrl/Cmd+Shift+Z` (redo)
- Intelligent state saving on text changes
- Memory-efficient history management

**Smart Auto-Indentation** (`src/renderer.js:350-400`)
- Automatic list continuation on Enter key
- Proper indentation handling for nested lists
- Support for ordered and unordered lists
- Intelligent whitespace management

**Enhanced Keyboard Shortcuts** (`src/renderer.js:400-450`)
- `Tab`/`Shift+Tab` for line indentation/outdentation
- `Enter` for auto-continuing lists
- `Ctrl/Cmd+F` for find & replace dialog
- `Escape` for closing dialogs

**Word/Character Count** (`src/renderer.js:500-530`)
- Live counting displayed in status bar
- Updates automatically as content changes
- Word and character statistics

#### 📤 Export & Conversion Features

**PowerPoint Export** (`src/main.js:330-350`)
- Convert markdown to PPTX presentations
- Automatic slide-level formatting (`--slide-level=2`)
- Smart presentation structure handling

**Spreadsheet Export** (`src/main.js:370-457`)
- Export markdown tables to Excel (XLSX/XLS) and ODS formats
- Multi-table support with separate worksheets
- Automatic table detection and parsing
- Error handling for files without tables

**Document Import** (`src/main.js:280-315`)
- Import DOCX, ODT, RTF, HTML, PDF, PPTX, ODP files
- Automatic conversion to markdown format
- File dialog with appropriate filters
- Success notifications and error handling

**Table Creation Helper** (`src/renderer.js:600-650`)
- Built-in table generator with row/column specification
- Automatic markdown table formatting
- Proper header separation and alignment

#### 🎨 Interface & Theming

**Multi-Theme Support** (`src/styles.css:214-598`)
- Light, Dark, Solarized, Monokai, GitHub themes
- Complete theming for all UI components
- Theme-aware styling for new features (find dialog, line numbers)
- Persistent theme selection with local storage

**Enhanced UI Components** (`src/index.html:94-108`)
- Find & replace dialog with modern styling
- Toolbar buttons for all new features
- Status bar with live statistics
- Responsive layout with proper spacing

## File Structure & Key Components

### Main Process (`src/main.js`)
- **Menu System**: Comprehensive menu with file operations, editing, conversion, view options, batch processing
- **IPC Handlers**: Communication between main and renderer processes
- **File Operations**: Open, save, import/export functionality with file association support
- **Export System**: Advanced export with templates, metadata, and Pandoc integration
- **Batch Processing**: Multi-file conversion with progress tracking and error handling
- **Theme Management**: Persistent theme storage and application
- **Spreadsheet Export**: Table extraction and XLSX generation
- **About Dialog**: Application information and feature list

### Renderer Process (`src/renderer.js`)
- **Editor Initialization**: CodeMirror-like functionality with custom implementation
- **TabManager System**: Multi-file editing with state management
- **Find & Replace Engine**: Search algorithms with regex support
- **Undo/Redo Manager**: History stack management
- **Auto-indentation Logic**: Smart list continuation
- **Live Preview**: Real-time markdown rendering with DOMPurify
- **Export Dialog Management**: Advanced options collection and validation
- **Batch Conversion Interface**: Folder selection, progress tracking, and user feedback
- **Event Handling**: Keyboard shortcuts and UI interactions
- **Statistics Tracking**: Word/character counting

### Styling (`src/styles.css`)
- **Base Styles**: Application layout and typography
- **Component Styles**: Toolbar, editor, preview, dialogs
- **Theme Implementations**: Complete styling for all themes
- **Responsive Design**: Flexible layouts and proper spacing
- **Animation Support**: Smooth transitions and hover effects

### HTML Structure (`src/index.html`)
- **Toolbar**: Feature buttons with SVG icons
- **Tab Bar**: Multi-file navigation with close buttons
- **Find Dialog**: Search and replace interface
- **Export Options Dialog**: Advanced export configuration with templates and metadata
- **Batch Conversion Dialog**: Folder selection and conversion progress
- **Editor Container**: Line numbers and text editor with tab content management
- **Preview Pane**: Rendered markdown display
- **Status Bar**: Statistics and application status

## Testing & Quality Assurance

### Manual Testing Checklist
- [ ] All keyboard shortcuts work correctly
- [ ] Find & replace functions properly with edge cases
- [ ] Line numbers sync correctly with content
- [ ] Undo/redo preserves cursor position
- [ ] Auto-indentation works with various list types
- [ ] File association loading (double-click .md files)
- [ ] Export options dialog with templates and metadata
- [ ] Batch conversion with progress tracking
- [ ] All themes render correctly for new components
- [ ] Export functions work with various document formats
- [ ] Table creation and export functionality
- [ ] Cross-platform compatibility

### Known Issues & Limitations
- AppImage may require `--no-sandbox` flag on some Linux systems
- Large files (>1MB) may cause performance issues
- Windows/Mac builds require platform-specific environments
- Pandoc must be installed separately for export functionality

## Deployment & Distribution

### Release Packages
- **Linux AppImage**: Universal Linux package (self-contained)
- **Debian Package**: `.deb` for Ubuntu/Debian systems
- **Snap Package**: Universal Linux package via Snap Store
- **Future**: Windows `.exe` and macOS `.dmg` packages

### Release Process
1. Update version in `package.json`, `src/main.js`, and `README.md`
2. Commit changes and push to all platform branches
3. Build platform-specific packages
4. Create Git tag and GitHub release
5. Upload packages to GitHub release
6. Update documentation and announce release

## Contributing Guidelines

### Code Style
- Use consistent indentation (2 spaces)
- Follow JavaScript ES6+ standards
- Comment complex functionality
- Maintain separation between main and renderer processes
- Use descriptive variable and function names

### Adding New Features
1. Plan feature implementation and UI integration
2. Update relevant files (main.js, renderer.js, styles.css)
3. Test across all supported themes
4. Update documentation and README
5. Test on multiple platforms if possible
6. Submit pull request with detailed description

### Bug Reporting
- Include steps to reproduce
- Specify platform and version information
- Attach relevant screenshots or error logs
- Check existing issues before creating new ones

## Future Roadmap

### Planned Features
- [ ] Collaborative editing capabilities
- [ ] Plugin system for extensions
- [ ] Advanced markdown extensions (math, diagrams)
- [ ] Cloud synchronization options
- [ ] Mobile companion app
- [ ] Advanced export templates
- [ ] Spell check and grammar checking
- [ ] Version control integration

### Technical Improvements
- [ ] Performance optimization for large files
- [ ] Memory usage optimization
- [ ] Startup time improvements
- [ ] Better error handling and user feedback
- [ ] Automated testing suite
- [ ] Continuous integration/deployment

---

**Last Updated**: October 24, 2025
**Claude Assistant**: Development completed for v1.7.7 with enhanced print menu featuring two print options: "Print Preview" (Ctrl+P, black text, ink-saving) and "Print Preview (With Styles)" (full colors). Implemented comprehensive print handler that hides editor UI and shows only the rendered preview. Added extensive CSS print stylesheet with smart page breaks, optimized formatting for all markdown elements, and professional typography. Added PDFKit and html2pdf libraries for native PDF support without Pandoc dependency. Previous releases include v1.7.6 table header styling cleanup and v1.7.5 critical file association fix.