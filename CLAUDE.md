# PanConverter

## Overview
PanConverter is a cross-platform desktop application for editing and converting Markdown files using Pandoc. It features a rich markdown editor with live preview, multiple themes, and comprehensive support for exporting to various document formats.

## Features
- **Markdown Editor**: Full-featured editor with syntax highlighting and toolbar
- **Live Preview**: Real-time preview of your markdown content
- **Multiple Themes**: Light, Dark, Solarized, Monokai, and GitHub themes
- **Document Export**: Export to HTML, PDF, DOCX, LaTeX, RTF, ODT, EPUB, PowerPoint (PPTX), and OpenDocument Presentation (ODP)
- **Spreadsheet Export**: Export markdown tables to Excel (XLSX/XLS) and OpenDocument Spreadsheet (ODS) formats
- **Document Import & Conversion**: Import various document formats and convert between formats via Pandoc
- **Table Creation Helper**: Built-in table generator for easy markdown table creation
- **Cross-Platform**: Runs on Windows, macOS, and Linux
- **Auto-Save**: Automatic saving every 30 seconds

## Requirements
- **Pandoc**: Must be installed on the system for export functionality
  - Ubuntu/Debian: `sudo apt-get install pandoc`
  - macOS: `brew install pandoc`
  - Windows: Download from https://pandoc.org/installing.html

## Development Setup

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Pandoc (for export features)

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd pan-converter

# Install dependencies
npm install

# Generate icons
npm run generate-icons

# Start the application
npm start
```

## Building

### Build for Current Platform
```bash
npm run build
```

### Build for Specific Platforms
```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux (generates .deb, .AppImage, and .snap)
npm run build:linux
```

### Build for All Platforms
```bash
npm run dist:all
```

## Project Structure
```
pan-converter/
├── src/
│   ├── main.js         # Main process
│   ├── renderer.js     # Renderer process
│   ├── index.html      # Main window HTML
│   └── styles.css      # Application styles
├── assets/
│   ├── icon.svg        # Source icon
│   └── icon.png        # Generated icons
├── scripts/
│   └── generate-icons.js # Icon generation script
├── package.json        # Project configuration
└── CLAUDE.md          # This file
```

## Architecture

### Main Process (`src/main.js`)
- Manages application lifecycle
- Creates and manages windows
- Handles file operations
- Manages menu bar
- Communicates with renderer via IPC

### Renderer Process (`src/renderer.js`)
- Handles UI interactions
- Manages editor state
- Renders markdown preview
- Handles theme switching
- Communicates with main process via IPC

### Key Libraries
- **Electron**: Desktop application framework
- **marked**: Markdown parsing
- **highlight.js**: Syntax highlighting
- **DOMPurify**: HTML sanitization
- **XLSX**: Spreadsheet generation for Excel/ODS export
- **electron-builder**: Application packaging
- **Custom Storage**: File-based storage system for settings persistence

## Features Implementation

### Markdown Editor
- Uses native textarea with custom styling
- Supports common markdown shortcuts via toolbar
- Tab key inserts 4 spaces for code indentation
- Auto-save every 30 seconds when content changes

### Live Preview
- Updates in real-time as you type
- Sanitized HTML output for security
- Syntax highlighting for code blocks
- GitHub-flavored markdown support

### Theme System
- Themes stored in user preferences
- Applied via CSS classes on body element
- Persists across application restarts
- Five built-in themes

### Export System
- Uses Pandoc command-line tool for document exports
- Supports multiple output formats (HTML, PDF, DOCX, LaTeX, RTF, ODT, EPUB, PPTX, ODP)
- Spreadsheet export using XLSX library for table data
- Import functionality for converting documents to markdown
- Maintains original file structure
- Shows error messages if Pandoc not installed

### Table Creation Helper
- Interactive table generator in toolbar
- Prompts for row and column count
- Generates properly formatted markdown tables
- Includes headers and separator rows
- Automatically inserts at cursor position

### Document Conversion Menu
- Separate Convert menu for cross-format operations
- Import documents from various formats to markdown
- Convert current file to different formats
- Supports presentations with proper slide-level formatting
- Error handling for missing Pandoc installation

## Platform-Specific Branches

The repository maintains separate branches for platform-specific customizations:
- `master`: Main development branch
- `linux`: Linux-specific configurations
- `macos`: macOS-specific configurations  
- `windows`: Windows-specific configurations

## Debian Package

The application can be built as a `.deb` package for Debian-based systems:
```bash
npm run build:linux
```

The generated `.deb` file will:
- Install to `/opt/pan-converter`
- Create desktop entry for application menu
- Set up proper file associations
- Declare Pandoc as dependency

## Testing

### Manual Testing
1. File Operations: New, Open, Save, Save As
2. Editor Features: Bold, Italic, Headings, Links, Code, Lists, Quotes, Table Creation
3. Preview Toggle: Show/hide preview pane
4. Theme Switching: Test all five themes
5. Export Functions: Test each export format including PowerPoint and spreadsheets
6. Import/Conversion: Test document import and format conversion
7. Table Helper: Test table generation with different row/column counts
8. Auto-save: Verify 30-second auto-save works

### Platform Testing
Test on:
- Windows 10/11
- macOS 11+ (Big Sur and later)
- Ubuntu 20.04+, Debian 11+

## Known Issues
- ICO and ICNS icons need manual conversion from PNG
- Pandoc must be installed separately for all export functionality
- Large files may cause performance issues
- AppImage requires --no-sandbox flag on some systems
- Windows/Mac builds require platform-specific build environments

## Version History
- **v1.2.0**: Added PowerPoint export, document conversion menu, table creation helper, spreadsheet export
- **v1.1.0**: Added Excel/ODS spreadsheet export, updated author information, renamed to PanConverter
- **v1.0.0**: Initial release with basic markdown editing, themes, and Pandoc export

## Future Enhancements
- [ ] Add spell checking
- [ ] Implement find and replace
- [ ] Add custom CSS for preview
- [ ] Support for markdown extensions
- [ ] Plugin system for custom exporters
- [ ] Cloud sync capabilities
- [ ] Collaborative editing
- [ ] Improved table editing interface

## License
MIT License

## Support
For issues or feature requests, please open an issue on the GitHub repository.