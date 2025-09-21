# GEMINI.md

## Project Overview

This project is a cross-platform Markdown editor and converter named **PanConverter**. It is built using the Electron framework, allowing it to run on Windows, macOS, and Linux. The application provides a rich text editor for writing Markdown, a live preview pane, and robust export capabilities powered by Pandoc.

The core technologies used are:
- **Electron:** For creating the desktop application.
- **JavaScript:** The primary programming language.
- **Pandoc:** For converting Markdown to various formats like PDF, DOCX, HTML, etc.
- **Marked:** For parsing and rendering the Markdown preview in real-time.
- **CodeMirror:** As the underlying text editor component.
- **highlight.js:** For syntax highlighting in the editor.
- **DOMPurify:** To sanitize the HTML output in the preview pane for security.

The application features a tabbed interface for working with multiple files, various themes, find and replace functionality, and detailed document statistics.

## Building and Running

To build and run this project locally, you will need to have Node.js and npm installed.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/amitwh/pan-converter.git
    cd pan-converter
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

### Running the Application

To run the application in development mode, use the following command:

```bash
npm start
```

### Building the Application

You can build the application for different platforms using the scripts defined in `package.json`.

-   **Build for the current platform:**
    ```bash
    npm run build
    ```

-   **Build for a specific platform:**
    ```bash
    npm run build:win    # For Windows
    npm run build:mac    # For macOS
    npm run build:linux  # For Linux
    ```

-   **Build for all platforms at once:**
    ```bash
    npm run dist:all
    ```

The distributable files will be located in the `dist/` directory.

### Testing

The project does not have a dedicated test suite configured. The `test` script in `package.json` currently returns an error.

```bash
npm test
```

## Development Conventions

-   **Code Style:** The codebase is written in JavaScript (ES6+). There is no linter or formatter configured, but the code generally follows standard JavaScript conventions.
-   **Main vs. Renderer Process:** The application logic is split between the Electron main process (`src/main.js`) and the renderer process (`src/renderer.js`).
    -   `src/main.js` handles window management, application menus, file system operations, and communication with the operating system.
    -   `src/renderer.js` manages the user interface, editor functionality, and the Markdown preview.
-   **Dependencies:** Project dependencies are managed through `package.json`. `devDependencies` are used for the build process, while `dependencies` are required for the application to run.
-   **User Data:** The application stores settings and recent files in the user's application data directory.
-   **Pandoc Integration:** The application relies on a system-installed version of Pandoc for its export functionality. It does not bundle Pandoc.
