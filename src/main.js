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
let pandocAvailable = null; // Cache pandoc availability check

// Check if pandoc is available
function checkPandocAvailability() {
  return new Promise((resolve) => {
    if (pandocAvailable !== null) {
      resolve(pandocAvailable);
      return;
    }
    
    exec('pandoc --version', (error, stdout, stderr) => {
      pandocAvailable = !error;
      resolve(pandocAvailable);
    });
  });
}

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
              detail: 'A cross-platform Markdown editor and converter using Pandoc.\n\nVersion: 1.4.0\nAuthor: Amit Haridas\nEmail: amit.wh@gmail.com\nLicense: MIT\n\nFeatures:\n• Windows Explorer context menu integration\n• Tabbed interface for multiple files\n• Advanced markdown editing with live preview\n• Enhanced PDF export with built-in Electron fallback\n• File association support for .md files\n• Command-line interface for batch conversion\n• Improved preview typography and spacing\n• Adjustable font sizes via menu (Ctrl+Shift+Plus/Minus)\n• Complete theme support including Monokai fixes\n• Find & replace with match highlighting\n• Line numbers and auto-indentation\n• Export to multiple formats via Pandoc\n• PowerPoint & presentation export\n• Export tables to Excel/ODS spreadsheets\n• Document import & conversion\n• Table creation helper\n• Multiple themes support\n• Undo/redo functionality',
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

  if (!outputFile) return; // User cancelled

  console.log(`Attempting to export ${format} to:`, outputFile);

  // Check pandoc availability first
  checkPandocAvailability().then((hasPandoc) => {
    console.log('Pandoc available:', hasPandoc);
    
    if (!hasPandoc) {
      // Handle formats that don't require pandoc
      if (format === 'html') {
        console.log('Using built-in HTML export');
        exportToHTML(outputFile);
        return;
      } else if (format === 'pdf') {
        console.log('Using built-in PDF export');
        exportToPDFElectron(outputFile);
        return;
      } else {
        dialog.showErrorBox('Export Error', 
          `Pandoc is required for ${format.toUpperCase()} export but is not installed or not found in PATH.\n\n` +
          `Please install Pandoc from: https://pandoc.org/installing.html\n\n` +
          `Alternatively, you can export to HTML or PDF using the built-in converters.`
        );
        return;
      }
    }

    // Use pandoc for export
    console.log('Using Pandoc for export');
    let pandocCmd = `pandoc "${currentFile}" -o "${outputFile}"`;
    
    // Add specific options for different formats
    if (format === 'pdf') {
      pandocCmd = `pandoc "${currentFile}" --pdf-engine=xelatex -V geometry:margin=1in -o "${outputFile}"`;
      exportWithPandocPDF(pandocCmd, outputFile);
    } else if (format === 'docx') {
      pandocCmd = `pandoc "${currentFile}" -t docx -o "${outputFile}"`;
      exportWithPandoc(pandocCmd, outputFile, format);
    } else if (format === 'html') {
      pandocCmd = `pandoc "${currentFile}" -t html5 --standalone -o "${outputFile}"`;
      exportWithPandoc(pandocCmd, outputFile, format);
    } else if (format === 'latex') {
      pandocCmd = `pandoc "${currentFile}" -t latex -o "${outputFile}"`;
      exportWithPandoc(pandocCmd, outputFile, format);
    } else {
      // Generic export for other formats
      exportWithPandoc(pandocCmd, outputFile, format);
    }
  }).catch((error) => {
    console.error('Error checking pandoc availability:', error);
    dialog.showErrorBox('Export Error', `Error checking system requirements: ${error.message}`);
  });
}

function showExportSuccess(outputFile) {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Export Complete',
    message: `File exported successfully to ${outputFile}`,
    buttons: ['OK']
  });
}

// Helper function to export with pandoc (general)
function exportWithPandoc(pandocCmd, outputFile, format) {
  exec(pandocCmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`Pandoc error for ${format}:`, error);
      dialog.showErrorBox('Export Error', 
        `Failed to export to ${format.toUpperCase()}:\n${error.message}\n\n` +
        `Command used: ${pandocCmd}\n\n` +
        `Please ensure Pandoc is properly installed and accessible.`
      );
    } else {
      console.log(`Successfully exported to ${format}:`, outputFile);
      showExportSuccess(outputFile);
    }
  });
}

// Helper function to export PDF with pandoc (with fallbacks)
function exportWithPandocPDF(pandocCmd, outputFile) {
  exec(pandocCmd, (error, stdout, stderr) => {
    if (error) {
      console.log('XeLaTeX failed, trying PDFLaTeX...');
      // Fallback to pdflatex
      const fallbackCmd = pandocCmd.replace('--pdf-engine=xelatex', '--pdf-engine=pdflatex');
      exec(fallbackCmd, (fallbackError, fallbackStdout, fallbackStderr) => {
        if (fallbackError) {
          console.log('PDFLaTeX failed, trying Electron PDF...');
          // Final fallback to Electron PDF
          exportToPDFElectron(outputFile);
        } else {
          console.log('Successfully exported PDF with PDFLaTeX');
          showExportSuccess(outputFile);
        }
      });
    } else {
      console.log('Successfully exported PDF with XeLaTeX');
      showExportSuccess(outputFile);
    }
  });
}

// Export to HTML using marked (no pandoc required)
function exportToHTML(outputFile) {
  try {
    const marked = require('marked');
    const markdownContent = fs.readFileSync(currentFile, 'utf8');
    const htmlContent = marked.parse(markdownContent);
    
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Exported Document</title>
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
</html>`;

    fs.writeFileSync(outputFile, fullHtml, 'utf8');
    console.log('Successfully exported HTML');
    showExportSuccess(outputFile);
  } catch (error) {
    console.error('HTML export error:', error);
    dialog.showErrorBox('HTML Export Error', `Failed to export HTML: ${error.message}`);
  }
}

// Export to PDF using Electron (no pandoc required)
function exportToPDFElectron(outputFile) {
  try {
    const marked = require('marked');
    const markdownContent = fs.readFileSync(currentFile, 'utf8');
    const htmlContent = marked.parse(markdownContent);
    
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PDF Export</title>
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
        img {
            max-width: 100%;
            height: auto;
        }
        @media print {
            body { padding: 20px; }
        }
    </style>
</head>
<body>
    ${htmlContent}
</body>
</html>`;

    // Create a hidden window to render and export PDF
    const pdfWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    
    pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`).then(() => {
      return pdfWindow.webContents.printToPDF({
        marginsType: 1, // Use default margins
        pageSize: 'A4',
        printBackground: true,
        printSelectionOnly: false,
        landscape: false
      });
    }).then((pdfData) => {
      fs.writeFileSync(outputFile, pdfData);
      pdfWindow.close();
      console.log('Successfully exported PDF with Electron');
      showExportSuccess(outputFile);
    }).catch((error) => {
      pdfWindow.close();
      console.error('Electron PDF export error:', error);
      dialog.showErrorBox('PDF Export Error', 
        `Failed to export PDF using built-in engine: ${error.message}\n\n` +
        `For better PDF export, please install Pandoc with LaTeX support.`
      );
    });
  } catch (error) {
    console.error('PDF export setup error:', error);
    dialog.showErrorBox('PDF Export Error', `Failed to setup PDF export: ${error.message}`);
  }
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

// Handle command line interface for file conversion
function handleCLIConversion(args) {
  const command = args[0];
  const filePath = args[args.length - 1]; // File path is always last argument
  
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    app.quit();
    return;
  }

  // Show conversion dialog for --convert command
  if (command === '--convert') {
    showConversionDialog(filePath);
    return;
  }

  // Direct conversion for --convert-to command
  if (command === '--convert-to' && args.length >= 3) {
    const format = args[1];
    performCLIConversion(filePath, format);
    return;
  }

  console.error('Usage: --convert <file> OR --convert-to <format> <file>');
  app.quit();
}

// Show conversion dialog for CLI
function showConversionDialog(filePath) {
  const { dialog } = require('electron');
  
  // Create a hidden window for dialog operations
  const hiddenWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const formats = [
    { name: 'PDF', value: 'pdf' },
    { name: 'HTML', value: 'html' },
    { name: 'DOCX', value: 'docx' },
    { name: 'LaTeX', value: 'latex' },
    { name: 'RTF', value: 'rtf' },
    { name: 'ODT', value: 'odt' },
    { name: 'PowerPoint', value: 'pptx' }
  ];

  // Create format selection dialog using message box
  const formatButtons = formats.map(f => f.name);
  formatButtons.push('Cancel');

  dialog.showMessageBox(hiddenWindow, {
    type: 'question',
    title: 'PanConverter - Choose Format',
    message: `Convert "${path.basename(filePath)}" to:`,
    detail: 'Select the output format for conversion',
    buttons: formatButtons,
    defaultId: 0,
    cancelId: formatButtons.length - 1
  }).then(result => {
    if (result.response < formats.length) {
      const selectedFormat = formats[result.response].value;
      performCLIConversion(filePath, selectedFormat);
    } else {
      console.log('Conversion cancelled');
      app.quit();
    }
    hiddenWindow.destroy();
  });
}

// Perform CLI conversion
function performCLIConversion(inputPath, format) {
  try {
    const content = fs.readFileSync(inputPath, 'utf-8');
    const outputPath = inputPath.replace(/\.[^/.]+$/, `.${format}`);
    
    console.log(`Converting "${path.basename(inputPath)}" to ${format.toUpperCase()}...`);
    
    // Use existing export functions but with CLI output
    const pandocCommand = buildPandocCommand(content, format, outputPath);
    
    exec(pandocCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Conversion failed: ${error.message}`);
        if (stderr) console.error(`Details: ${stderr}`);
        app.quit();
        return;
      }
      
      console.log(`Successfully converted to: ${outputPath}`);
      
      // Show Windows notification
      if (process.platform === 'win32') {
        exec(`powershell -Command "New-BurntToastNotification -Text 'PanConverter', 'File converted to ${format.toUpperCase()}' -AppLogo '${path.join(__dirname, '../assets/icon.png')}'"`, () => {});
      }
      
      app.quit();
    });
  } catch (error) {
    console.error(`Error reading file: ${error.message}`);
    app.quit();
  }
}

// Build Pandoc command for CLI conversion
function buildPandocCommand(content, format, outputPath) {
  const inputFile = path.join(require('os').tmpdir(), `panconverter_temp_${Date.now()}.md`);
  fs.writeFileSync(inputFile, content, 'utf-8');
  
  let command = `pandoc "${inputFile}" -o "${outputPath}"`;
  
  switch (format) {
    case 'pdf':
      command += ' --pdf-engine=xelatex --variable geometry:margin=1in';
      break;
    case 'html':
      command += ' --self-contained --css';
      break;
    case 'docx':
      command += ' --reference-doc';
      break;
    case 'latex':
      command += ' --standalone';
      break;
    case 'pptx':
      command += ' --slide-level=2';
      break;
  }
  
  return command;
}

app.whenReady().then(() => {
  // Check for command line conversion requests
  const args = process.argv.slice(2);
  if (args.length >= 2 && (args[0] === '--convert' || args[0] === '--convert-to')) {
    handleCLIConversion(args);
    return; // Don't create window for CLI operations
  }
  
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