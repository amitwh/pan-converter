# Pan Converter

A cross-platform Markdown editor and converter powered by Pandoc.

![Pan Converter](assets/icon.png)

## Features

- 📝 **Rich Markdown Editor** - Full-featured editor with syntax highlighting
- 👁️ **Live Preview** - See your markdown rendered in real-time
- 🎨 **Multiple Themes** - Choose from Light, Dark, Solarized, Monokai, or GitHub themes
- 📤 **Export to Multiple Formats** - Convert to HTML, PDF, DOCX, LaTeX, RTF, ODT, and EPUB
- 💾 **Auto-Save** - Never lose your work with automatic saving
- 🖥️ **Cross-Platform** - Works on Windows, macOS, and Linux

## Installation

### Prerequisites
- [Pandoc](https://pandoc.org/installing.html) must be installed for export functionality

### Download
Download the latest release for your platform from the [Releases](https://github.com/yourusername/pan-converter/releases) page.

### Install from Source
```bash
git clone https://github.com/yourusername/pan-converter.git
cd pan-converter
npm install
npm start
```

## Usage

1. **Write** - Use the editor to write your Markdown content
2. **Preview** - Toggle the preview pane to see rendered output
3. **Theme** - Choose your preferred theme from the View menu
4. **Export** - Export your document to various formats via File > Export

## Keyboard Shortcuts

- `Ctrl/Cmd + N` - New file
- `Ctrl/Cmd + O` - Open file
- `Ctrl/Cmd + S` - Save file
- `Ctrl/Cmd + Shift + S` - Save as
- `Ctrl/Cmd + P` - Toggle preview
- `Ctrl/Cmd + Enter` - Toggle preview (alternative)

## Building

```bash
# Build for current platform
npm run build

# Build for specific platform
npm run build:win
npm run build:mac
npm run build:linux

# Build for all platforms
npm run dist:all
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- Markdown parsing by [marked](https://marked.js.org/)
- Export functionality powered by [Pandoc](https://pandoc.org/)