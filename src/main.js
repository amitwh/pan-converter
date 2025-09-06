const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const XLSX = require('xlsx');

// Simple storage implementation to replace electron-store
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const store = {
  get: (key, defaultValue) => {
    try {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(data);
      return settings[key] || defaultValue;
    } catch {
      return defaultValue;
    }
  },
  set: (key, value) => {
    let settings = {};
    try {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(data);
    } catch {}
    settings[key] = value;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }
};

let mainWindow;
let currentFile = null; // This will now represent the active tab's file

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, '../assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  createMenu();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle pending file from file association
  if (app.pendingFile) {
    mainWindow.webContents.once('dom-ready', () => {
      openFileFromPath(app.pendingFile);
      app.pendingFile = null;
    });
  }
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('file-new')
        },
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: openFile
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('file-save')
        },
        {
          label: 'Save As',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: saveAsFile
        },
        { type: 'separator' },
        {
          label: 'Import Document...',
          accelerator: 'CmdOrCtrl+I',
          click: importDocument
        },
        {
          label: 'Export',
          submenu: [
            { label: 'HTML', click: () => exportFile('html') },
            { label: 'PDF', click: () => exportFile('pdf') },
            { label: 'DOCX', click: () => exportFile('docx') },
            { label: 'LaTeX', click: () => exportFile('latex') },
            { label: 'RTF', click: () => exportFile('rtf') },
            { label: 'ODT', click: () => exportFile('odt') },
            { label: 'EPUB', click: () => exportFile('epub') },
            { type: 'separator' },
            { label: 'PowerPoint (PPTX)', click: () => exportFile('pptx') },
            { label: 'OpenDocument Presentation (ODP)', click: () => exportFile('odp') },
            { type: 'separator' },
            { label: 'Excel (XLSX)', click: () => exportSpreadsheet('xlsx') },
            { label: 'Excel Legacy (XLS)', click: () => exportSpreadsheet('xls') },
            { label: 'OpenDocument Spreadsheet (ODS)', click: () => exportSpreadsheet('ods') }
          ]
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
        { type: 'separator' },
        { 
          label: 'Find & Replace', 
          accelerator: 'CmdOrCtrl+F', 
          click: () => mainWindow.webContents.send('toggle-find') 
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Preview',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow.webContents.send('toggle-preview')
        },
        {
          label: 'Theme',
          submenu: [
            { label: 'Light', click: () => setTheme('light') },
            { label: 'Dark', click: () => setTheme('dark') },
            { label: 'Solarized', click: () => setTheme('solarized') },
            { label: 'Monokai', click: () => setTheme('monokai') },
            { label: 'GitHub', click: () => setTheme('github') }
          ]
        },
        { type: 'separator' },
        {
          label: 'Font Size',
          submenu: [
            { 
              label: 'Increase Font Size', 
              accelerator: 'CmdOrCtrl+Shift+Plus',
              click: () => mainWindow.webContents.send('adjust-font-size', 'increase')
            },
            { 
              label: 'Decrease Font Size', 
              accelerator: 'CmdOrCtrl+Shift+-',
              click: () => mainWindow.webContents.send('adjust-font-size', 'decrease')
            },
            { 
              label: 'Reset Font Size',
              accelerator: 'CmdOrCtrl+Shift+0',
              click: () => mainWindow.webContents.send('adjust-font-size', 'reset')
            }
          ]
        },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Toggle DevTools', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About PanConverter',
              message: 'PanConverter',
              detail: 'A cross-platform Markdown editor and converter using Pandoc.\n\nVersion: 1.3.6\nAuthor: Amit Haridas\nEmail: amit.wh@gmail.com\nLicense: MIT\n\nFeatures:\n• Tabbed interface for multiple files\n• Advanced markdown editing with live preview\n• Enhanced PDF export with built-in Electron fallback\n• File association support for .md files\n• Improved preview typography and spacing\n• Adjustable font sizes via menu (Ctrl+Shift+Plus/Minus)\n• Complete theme support including Monokai fixes\n• Find & replace with match highlighting\n• Line numbers and auto-indentation\n• Export to multiple formats via Pandoc\n• PowerPoint & presentation export\n• Export tables to Excel/ODS spreadsheets\n• Document import & conversion\n• Table creation helper\n• Multiple themes support\n• Undo/redo functionality',
              buttons: ['OK']
            });
          }
        },
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/amitwh/pan-converter')
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function openFile() {
  const files = dialog.showOpenDialogSync(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (files && files[0]) {
    currentFile = files[0];
    const content = fs.readFileSync(currentFile, 'utf-8');
    mainWindow.webContents.send('file-opened', { path: currentFile, content });
  }
}

function saveAsFile() {
  const file = dialog.showSaveDialogSync(mainWindow, {
    defaultExt: '.md',
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (file) {
    currentFile = file;
    mainWindow.webContents.send('get-content-for-save', file);
  }
}

function exportFile(format) {
  if (!currentFile) {
    dialog.showErrorBox('Error', 'Please save the file first');
    return;
  }

  const outputFile = dialog.showSaveDialogSync(mainWindow, {
    defaultPath: currentFile.replace(/\.[^/.]+$/, `.${format}`),
    filters: [
      { name: format.toUpperCase(), extensions: [format] }
    ]
  });

  if (outputFile) {
    let pandocCmd = `pandoc "${currentFile}" -o "${outputFile}"`;
    
    // Add specific options for PDF export to ensure proper generation
    if (format === 'pdf') {
      pandocCmd = `pandoc "${currentFile}" --pdf-engine=xelatex -V geometry:margin=1in -o "${outputFile}"`;
      // Try with different PDF engines if xelatex fails
      exec(pandocCmd, (error, stdout, stderr) => {
        if (error) {
          // Fallback to pdflatex
          const fallbackCmd = `pandoc "${currentFile}" --pdf-engine=pdflatex -V geometry:margin=1in -o "${outputFile}"`;
          exec(fallbackCmd, (fallbackError, fallbackStdout, fallbackStderr) => {
            if (fallbackError) {
              // Final fallback to wkhtmltopdf
              const htmlToPdfCmd = `pandoc "${currentFile}" -t html5 | wkhtmltopdf - "${outputFile}"`;
              exec(htmlToPdfCmd, async (finalError) => {
                if (finalError) {
                  // Ultimate fallback: Use Electron's built-in PDF export
                  try {
                    const marked = require('marked');
                    const fs = require('fs');
                    
                    // Read markdown file
                    const markdownContent = fs.readFileSync(currentFile, 'utf8');
                    
                    // Convert markdown to HTML
                    const htmlContent = marked.parse(markdownContent);
                    
                    // Create full HTML document with styling
                    const fullHtml = `
                      <!DOCTYPE html>
                      <html>
                      <head>
                        <meta charset="UTF-8">
                        <style>
                          body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            max-width: 800px;
                            margin: 0 auto;
                            padding: 40px;
                          }
                          h1, h2, h3, h4, h5, h6 {
                            margin-top: 1.5em;
                            margin-bottom: 0.5em;
                          }
                          code {
                            background: #f4f4f4;
                            padding: 2px 4px;
                            border-radius: 3px;
                            font-family: Consolas, Monaco, 'Courier New', monospace;
                          }
                          pre {
                            background: #f4f4f4;
                            padding: 1em;
                            border-radius: 5px;
                            overflow-x: auto;
                          }
                          pre code {
                            background: transparent;
                            padding: 0;
                          }
                          blockquote {
                            border-left: 4px solid #ddd;
                            margin-left: 0;
                            padding-left: 1em;
                            color: #666;
                          }
                          table {
                            border-collapse: collapse;
                            width: 100%;
                            margin: 1em 0;
                          }
                          th, td {
                            border: 1px solid #ddd;
                            padding: 8px;
                            text-align: left;
                          }
                          th {
                            background-color: #f4f4f4;
                          }
                          a {
                            color: #0066cc;
                            text-decoration: none;
                          }
                          a:hover {
                            text-decoration: underline;
                          }
                          img {
                            max-width: 100%;
                            height: auto;
                          }
                        </style>
                      </head>
                      <body>
                        ${htmlContent}
                      </body>
                      </html>
                    `;
                    
                    // Create a hidden window to render and export PDF
                    const { BrowserWindow } = require('electron');
                    const pdfWindow = new BrowserWindow({
                      show: false,
                      webPreferences: {
                        nodeIntegration: true,
                        contextIsolation: false
                      }
                    });
                    
                    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);
                    
                    const pdfData = await pdfWindow.webContents.printToPDF({
                      marginsType: 1, // Use default margins
                      pageSize: 'A4',
                      printBackground: true,
                      printSelectionOnly: false,
                      landscape: false
                    });
                    
                    fs.writeFileSync(outputFile, pdfData);
                    pdfWindow.close();
                    
                    showExportSuccess(outputFile);
                  } catch (electronPdfError) {
                    dialog.showErrorBox('PDF Export Error', 
                      `Failed to export PDF. The built-in PDF export encountered an error.\n\n` +
                      `For better PDF export, please install one of the following:\n` +
                      `• XeLaTeX (recommended)\n` +
                      `• PDFLaTeX\n` +
                      `• wkhtmltopdf\n\n` +
                      `Error: ${electronPdfError.message}`
                    );
                  }
                } else {
                  showExportSuccess(outputFile);
                }
              });
            } else {
              showExportSuccess(outputFile);
            }
          });
        } else {
          showExportSuccess(outputFile);
        }
      });
    } else {
      exec(pandocCmd, (error, stdout, stderr) => {
        if (error) {
          dialog.showErrorBox('Export Error', `Failed to export: ${error.message}\n\nMake sure Pandoc is installed.`);
        } else {
          showExportSuccess(outputFile);
        }
      });
    }
  }
}

function showExportSuccess(outputFile) {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Export Complete',
    message: `File exported successfully to ${outputFile}`,
    buttons: ['OK']
  });
}

function exportSpreadsheet(format) {
  if (!currentFile) {
    dialog.showErrorBox('Error', 'Please save the file first');
    return;
  }

  // Request content from renderer
  mainWindow.webContents.send('get-content-for-spreadsheet', format);
}

function importDocument() {
  const files = dialog.showOpenDialogSync(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Documents', extensions: ['docx', 'odt', 'rtf', 'html', 'tex', 'epub', 'pdf'] },
      { name: 'Presentations', extensions: ['pptx', 'odp'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (files && files[0]) {
    const inputFile = files[0];
    const outputFile = inputFile.replace(/\.[^/.]+$/, '.md');
    
    // Convert to markdown using pandoc
    const pandocCmd = `pandoc "${inputFile}" -t markdown -o "${outputFile}"`;
    
    exec(pandocCmd, (error, stdout, stderr) => {
      if (error) {
        dialog.showErrorBox('Import Error', `Failed to import: ${error.message}\n\nMake sure Pandoc is installed.`);
      } else {
        // Open the converted markdown file
        currentFile = outputFile;
        const content = fs.readFileSync(outputFile, 'utf-8');
        mainWindow.webContents.send('file-opened', { path: outputFile, content });
        
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Import Complete',
          message: `Document imported successfully as ${outputFile}`,
          buttons: ['OK']
        });
      }
    });
  }
}


function setTheme(theme) {
  store.set('theme', theme);
  mainWindow.webContents.send('theme-changed', theme);
}

// IPC handlers
ipcMain.on('save-file', (event, { path, content }) => {
  fs.writeFileSync(path, content, 'utf-8');
  currentFile = path;
});

ipcMain.on('save-current-file', (event, content) => {
  if (currentFile) {
    fs.writeFileSync(currentFile, content, 'utf-8');
  } else {
    saveAsFile();
  }
});

ipcMain.on('get-theme', (event) => {
  const theme = store.get('theme', 'light');
  event.reply('theme-changed', theme);
});

// Handle tab file tracking for exports
ipcMain.on('set-current-file', (event, filePath) => {
  currentFile = filePath;
});

ipcMain.on('export-spreadsheet', (event, { content, format }) => {
  const outputFile = dialog.showSaveDialogSync(mainWindow, {
    defaultPath: currentFile.replace(/\.[^/.]+$/, `.${format}`),
    filters: [
      { name: format.toUpperCase(), extensions: [format] }
    ]
  });

  if (outputFile) {
    try {
      // Parse markdown content to extract tables
      const tables = extractTablesFromMarkdown(content);
      
      if (tables.length === 0) {
        dialog.showErrorBox('Export Error', 'No tables found in the markdown content');
        return;
      }

      // Create workbook
      const wb = XLSX.utils.book_new();
      
      tables.forEach((table, index) => {
        const ws = XLSX.utils.aoa_to_sheet(table);
        XLSX.utils.book_append_sheet(wb, ws, `Table ${index + 1}`);
      });

      // Write file
      XLSX.writeFile(wb, outputFile);
      
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Export Complete',
        message: `Spreadsheet exported successfully to ${outputFile}`,
        buttons: ['OK']
      });
    } catch (error) {
      dialog.showErrorBox('Export Error', `Failed to export: ${error.message}`);
    }
  }
});

// Helper function to extract tables from markdown
function extractTablesFromMarkdown(markdown) {
  const tables = [];
  const lines = markdown.split('\n');
  let currentTable = [];
  let inTable = false;
  
  for (const line of lines) {
    if (line.includes('|')) {
      if (!inTable) {
        inTable = true;
        currentTable = [];
      }
      
      // Skip separator lines (|---|---|)
      if (!line.match(/^\s*\|?\s*:?-+:?\s*\|/)) {
        const cells = line.split('|')
          .map(cell => cell.trim())
          .filter(cell => cell !== '');
        
        if (cells.length > 0) {
          currentTable.push(cells);
        }
      }
    } else if (inTable && line.trim() === '') {
      // End of table
      if (currentTable.length > 0) {
        tables.push(currentTable);
      }
      currentTable = [];
      inTable = false;
    }
  }
  
  // Add last table if exists
  if (currentTable.length > 0) {
    tables.push(currentTable);
  }
  
  return tables;
}

app.whenReady().then(() => {
  createWindow();
  
  // Handle file association on app startup
  // Process all command line arguments except the first two (node and script path)
  const fileArgs = process.argv.slice(2);
  for (const arg of fileArgs) {
    // Skip flags and options
    if (arg.startsWith('-')) {
      continue;
    }
    if ((arg.endsWith('.md') || arg.endsWith('.markdown')) && fs.existsSync(arg)) {
      // Store the file to open after window is ready
      app.pendingFile = arg;
      break;
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle file opening on macOS
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    openFileFromPath(filePath);
  } else {
    // Store the file path to open after window is created
    app.pendingFile = filePath;
  }
});

// Handle file opening from command line or file association
function openFileFromPath(filePath) {
  if (fs.existsSync(filePath)) {
    currentFile = filePath;
    const content = fs.readFileSync(filePath, 'utf-8');
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('file-opened', { path: filePath, content });
    }
  }
}