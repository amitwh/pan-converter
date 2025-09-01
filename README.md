# PanConverter

A cross-platform Markdown editor and converter powered by Pandoc.

![PanConverter](assets/icon.png)

## Features

- 📝 **Rich Markdown Editor** - Full-featured editor with syntax highlighting and toolbar
- 👁️ **Live Preview** - See your markdown rendered in real-time
- 🎨 **Multiple Themes** - Choose from Light, Dark, Solarized, Monokai, or GitHub themes
- 📤 **Document Export** - Convert to HTML, PDF, DOCX, LaTeX, RTF, ODT, EPUB, PowerPoint (PPTX), and OpenDocument Presentation (ODP)
- 📊 **Spreadsheet Export** - Export markdown tables to Excel (XLSX/XLS) and OpenDocument Spreadsheet (ODS) formats
- 📥 **Document Import & Conversion** - Import various document formats and convert between formats via Pandoc
- 📋 **Table Creation Helper** - Built-in table generator for easy markdown table creation
- 💾 **Auto-Save** - Never lose your work with automatic saving every 30 seconds
- 🖥️ **Cross-Platform** - Works on Windows, macOS, and Linux

## Installation

### Prerequisites
- [Pandoc](https://pandoc.org/installing.html) must be installed for export functionality
  - **Ubuntu/Debian**: `sudo apt-get install pandoc`
  - **macOS**: `brew install pandoc`
  - **Windows**: Download installer from Pandoc website

### Download
Download the latest release for your platform from the [Releases](https://github.com/amitwh/pan-converter/releases) page.

#### Linux
- **AppImage**: `PanConverter-1.2.0.AppImage` (universal, may require `--no-sandbox` flag)
- **Debian Package**: `pan-converter_1.2.0_amd64.deb`
- **Snap Package**: `pan-converter_1.2.0_amd64.snap`

### Install from Source
```bash
git clone https://github.com/amitwh/pan-converter.git
cd pan-converter
npm install
npm start
```

## Usage

### Basic Workflow
1. **Write** - Use the editor to write your Markdown content
2. **Preview** - Toggle the preview pane to see rendered output
3. **Theme** - Choose your preferred theme from the View menu
4. **Export** - Export your document to various formats

### Export Options
- **Documents**: HTML, PDF, DOCX, LaTeX, RTF, ODT, EPUB
- **Presentations**: PowerPoint (PPTX), OpenDocument Presentation (ODP)
- **Spreadsheets**: Excel (XLSX/XLS), OpenDocument Spreadsheet (ODS)

### Import & Conversion
- **Import Documents**: Convert DOCX, ODT, RTF, HTML, PDF, and presentation files to Markdown
- **Cross-Format Conversion**: Convert current file between multiple formats
- **Smart Presentation Handling**: Automatic slide-level formatting for PPTX/ODP exports

### Table Creation
- Click the table button in the toolbar
- Specify number of rows and columns
- Automatically generates properly formatted Markdown tables

## Keyboard Shortcuts

- `Ctrl/Cmd + N` - New file
- `Ctrl/Cmd + O` - Open file
- `Ctrl/Cmd + S` - Save file
- `Ctrl/Cmd + Shift + S` - Save as
- `Ctrl/Cmd + I` - Import document
- `Ctrl/Cmd + P` - Toggle preview
- `Ctrl/Cmd + Enter` - Toggle preview (alternative)
- `Tab` - Insert 4 spaces (in editor)

## Building

```bash
# Install dependencies
npm install

# Generate icons
npm run generate-icons

# Build for current platform
npm run build

# Build for specific platform
npm run build:win    # Windows
npm run build:mac    # macOS  
npm run build:linux  # Linux (generates .deb, .AppImage, and .snap)

# Build for all platforms
npm run dist:all
```

## Version History

- **v1.2.0** - Added PowerPoint export, document conversion menu, table creation helper, spreadsheet export
- **v1.1.0** - Added Excel/ODS spreadsheet export, updated author information, renamed to PanConverter
- **v1.0.0** - Initial release with basic markdown editing, themes, and Pandoc export

## Known Issues

- AppImage may require `--no-sandbox` flag on some Linux systems
- Windows/Mac builds require platform-specific build environments
- Large files may cause performance issues

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request to the [GitHub repository](https://github.com/amitwh/pan-converter).

## License

MIT License - see LICENSE file for details.

## Author

**Amit Haridas** - [amit.wh@gmail.com](mailto:amit.wh@gmail.com)

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- Markdown parsing by [marked](https://marked.js.org/)
- Export functionality powered by [Pandoc](https://pandoc.org/)
- Syntax highlighting by [highlight.js](https://highlightjs.org/)
- Spreadsheet export by [XLSX](https://www.npmjs.com/package/xlsx)
- HTML sanitization by [DOMPurify](https://www.npmjs.com/package/dompurify)