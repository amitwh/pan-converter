# PanConverter - Claude Development Guide

## Project Overview

**PanConverter** is a cross-platform Markdown editor and converter powered by Pandoc, built with Electron. It provides professional-grade editing capabilities with comprehensive export options.

**Current Version**: v1.4.0
**Author**: Amit Haridas (amit.wh@gmail.com)
**License**: MIT
**Repository**: https://github.com/amitwh/pan-converter

## Architecture & Technology Stack

### Core Technologies
- **Electron** - Cross-platform desktop application framework
- **Pandoc** - Universal document converter (required dependency)
- **marked** - Markdown parsing and rendering
- **highlight.js** - Syntax highlighting
- **XLSX** - Spreadsheet export functionality
- **DOMPurify** - HTML sanitization

### Application Structure
```
src/
├── main.js        # Electron main process, menu system, IPC handlers
├── renderer.js    # TabManager class, multi-file editing, event handling
├── index.html     # Application layout with tabbed interface
└── styles.css     # Comprehensive styling with multi-theme support

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

### v1.4.0 Advanced Export & Batch Processing (Latest)

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

**Last Updated**: September 14, 2025
**Claude Assistant**: Development completed for v1.4.0 with fixed file associations, advanced export options with templates and metadata, batch file conversion system, and enhanced UI components.