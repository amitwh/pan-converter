const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { PDFDocument, rgb, degrees, StandardFonts } = require('pdf-lib');
const WordTemplateExporter = require('./wordTemplateExporter');

// Add MiKTeX to PATH for LaTeX support
if (process.platform === 'win32') {
  const miktexPath = 'C:\\Program Files\\MiKTeX\\miktex\\bin\\x64';
  if (fs.existsSync(miktexPath)) {
    process.env.PATH = `${miktexPath};${process.env.PATH}`;
    console.log('[MAIN] Added MiKTeX to PATH:', miktexPath);
  }
}

// Get the system Pandoc path
function getPandocPath() {
  // Pandoc is expected to be in the system's PATH.
  // The command will be executed directly. Quoting is handled by exec.
  return 'pandoc';
}

// Check if Pandoc is available
function checkPandocAvailable() {
  return new Promise((resolve) => {
    const pandocPath = getPandocPath();
    exec(`${pandocPath} --version`, (error) => {
      resolve(!error);
    });
  });
}

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
let wordTemplatePath = null; // Path to selected Word template
let templateStartPage = 3; // Which page to start inserting content (default: page 3)
let rendererReady = false; // Track if renderer is ready to receive file data

// Header & Footer Settings
let headerFooterSettings = {
  enabled: true,
  header: {
    left: '',
    center: '',
    right: '',
    logo: null // Will store image file path
  },
  footer: {
    left: '',
    center: '$PAGE$ of $TOTAL$',
    right: '',
    logo: null
  }
};

// Handle single instance lock for Windows file association
// When a file is double-clicked and the app is already running,
// Windows tries to start a second instance. We prevent this and
// pass the file to the existing instance instead.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this one
  app.quit();
} else {
  // This is the first instance, handle second-instance events
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    // Check if a file was passed to the second instance
    // commandLine is an array like: ['PanConverter.exe', 'file.md']
    console.log('[MAIN] Second instance commandLine:', JSON.stringify(commandLine));
    const startIndex = app.isPackaged ? 1 : 2;
    const fileArgs = commandLine.slice(startIndex);
    console.log('[MAIN] Second instance file args:', fileArgs);
    for (const arg of fileArgs) {
      if ((arg.endsWith('.md') || arg.endsWith('.markdown'))) {
        const resolvedPath = path.isAbsolute(arg) ? arg : path.resolve(workingDirectory, arg);
        console.log('[MAIN] Second instance resolved path:', resolvedPath);
        if (fs.existsSync(resolvedPath)) {
          // Open the file in the existing instance
          if (rendererReady) {
            openFileFromPath(resolvedPath);
          } else {
            app.pendingFile = resolvedPath;
          }
          break;
        }
      }
    }
  });
}

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

  // Wait for the page to fully load before sending file data
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Window finished loading');
    // Don't open file here - wait for renderer-ready signal
    // The renderer will send renderer-ready when TabManager is initialized
  });
}

function buildRecentFilesMenu() {
  const recentFiles = getRecentFiles();

  if (recentFiles.length === 0) {
    return [
      {
        label: 'No recent files',
        enabled: false
      }
    ];
  }

  const recentFileItems = recentFiles.map(filePath => ({
    label: filePath.split(/[\\/]/).pop(), // Get filename only
    click: () => {
      if (fs.existsSync(filePath)) {
        currentFile = filePath;
        const content = fs.readFileSync(filePath, 'utf-8');
        mainWindow.webContents.send('file-opened', { path: filePath, content });
      } else {
        dialog.showErrorBox('File Not Found', `The file "${filePath}" could not be found.`);
      }
    },
    toolTip: filePath // Show full path in tooltip
  }));

  return [
    ...recentFileItems,
    { type: 'separator' },
    {
      label: 'Clear Recent Files',
      click: () => {
        mainWindow.webContents.send('clear-recent-files');
      }
    }
  ];
}

function getRecentFiles() {
  try {
    const recentFiles = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'recent-files.json'), 'utf-8'));
    return recentFiles.filter(file => fs.existsSync(file));
  } catch (e) {
    return [];
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
          label: 'Print',
          submenu: [
            {
              label: 'Print Preview',
              accelerator: 'CmdOrCtrl+P',
              click: () => mainWindow.webContents.send('print-preview')
            },
            {
              label: 'Print Preview (With Styles)',
              click: () => mainWindow.webContents.send('print-preview-styled')
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Recent Files',
          submenu: buildRecentFilesMenu()
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
            { label: 'PDF (Enhanced)', click: () => exportPDFViaWordTemplate(), accelerator: 'Ctrl+Shift+P' },
            { label: 'DOCX', click: () => exportFile('docx') },
            { label: 'DOCX (Enhanced)', click: () => exportWordWithTemplate(), accelerator: 'Ctrl+Shift+W' },
            { label: 'LaTeX', click: () => exportFile('latex') },
            { label: 'RTF', click: () => exportFile('rtf') },
            { label: 'ODT', click: () => exportFile('odt') },
            { label: 'EPUB', click: () => exportFile('epub') },
            { type: 'separator' },
            { label: 'PowerPoint (PPTX)', click: () => exportFile('pptx') },
            { label: 'OpenDocument Presentation (ODP)', click: () => exportFile('odp') },
            { type: 'separator' },
            { label: 'CSV (Tables)', click: () => exportSpreadsheet('csv') },
          ]
        },
        { type: 'separator' },
        {
          label: 'Select Word Template...',
          click: selectWordTemplate
        },
        {
          label: 'Template Settings...',
          click: showTemplateSettings
        },
        {
          label: 'Header & Footer Settings...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('open-header-footer-dialog');
            }
          }
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
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => mainWindow.webContents.send('undo')
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => mainWindow.webContents.send('redo')
        },
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
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => mainWindow.webContents.send('toggle-preview')
        },
        {
          label: 'Theme',
          submenu: [
            { label: 'Light', click: () => setTheme('light') },
            { label: 'Dark', click: () => setTheme('dark') },
            { label: 'Solarized', click: () => setTheme('solarized') },
            { label: 'Monokai', click: () => setTheme('monokai') },
            { label: 'GitHub', click: () => setTheme('github') },
            { type: 'separator' },
            { label: 'Dracula', click: () => setTheme('dracula') },
            { label: 'Nord', click: () => setTheme('nord') },
            { label: 'One Dark', click: () => setTheme('onedark') },
            { label: 'Atom One Light', click: () => setTheme('atomonelight') },
            { label: 'Material', click: () => setTheme('material') },
            { label: 'Gruvbox Dark', click: () => setTheme('gruvbox-dark') },
            { label: 'Gruvbox Light', click: () => setTheme('gruvbox-light') },
            { label: 'Tokyo Night', click: () => setTheme('tokyonight') },
            { label: 'Palenight', click: () => setTheme('palenight') },
            { label: 'Ayu Dark', click: () => setTheme('ayu-dark') },
            { label: 'Ayu Light', click: () => setTheme('ayu-light') },
            { label: 'Ayu Mirage', click: () => setTheme('ayu-mirage') },
            { label: 'Oceanic Next', click: () => setTheme('oceanic-next') },
            { label: 'Cobalt2', click: () => setTheme('cobalt2') },
            { type: 'separator' },
            { label: 'Concrete Dark', click: () => setTheme('concrete-dark') },
            { label: 'Concrete Light', click: () => setTheme('concrete-light') },
            { label: 'Concrete Warm', click: () => setTheme('concrete-warm') }
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
      label: 'Batch',
      submenu: [
        {
          label: 'Convert Folder...',
          click: () => showBatchConversionDialog()
        }
      ]
    },
    {
      label: 'Convert',
      submenu: [
        {
          label: 'Universal File Converter...',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => showUniversalConverterDialog()
        },
        {
          type: 'separator'
        },
        {
          label: 'About Converter',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Universal Converter',
              message: 'Open-Source File Converter',
              detail: 'PanConverter includes a powerful open-source file conversion system.\n\nSupported Converters:\n• LibreOffice - Document conversions (DOCX, PDF, ODT, etc.)\n• ImageMagick - Image format conversions\n• FFmpeg - Media file conversions\n• Pandoc - Document markup conversions\n\nFeatures:\n• 100% open-source and free\n• No API keys required\n• Runs completely offline\n• Supports 100+ file formats\n• High-quality professional conversions',
              buttons: ['OK']
            });
          }
        }
      ]
    },
    {
      label: 'PDF Editor',
      submenu: [
        {
          label: 'Merge PDFs...',
          click: () => showPDFEditorDialog('merge')
        },
        {
          label: 'Split PDF...',
          click: () => showPDFEditorDialog('split')
        },
        {
          label: 'Compress PDF...',
          click: () => showPDFEditorDialog('compress')
        },
        {
          type: 'separator'
        },
        {
          label: 'Rotate Pages...',
          click: () => showPDFEditorDialog('rotate')
        },
        {
          label: 'Delete Pages...',
          click: () => showPDFEditorDialog('delete')
        },
        {
          label: 'Reorder Pages...',
          click: () => showPDFEditorDialog('reorder')
        },
        {
          type: 'separator'
        },
        {
          label: 'Add Watermark...',
          click: () => showPDFEditorDialog('watermark')
        },
        {
          type: 'separator'
        },
        {
          label: 'Security',
          submenu: [
            {
              label: 'Add Password Protection...',
              click: () => showPDFEditorDialog('encrypt')
            },
            {
              label: 'Remove Password...',
              click: () => showPDFEditorDialog('decrypt')
            },
            {
              label: 'Set Permissions...',
              click: () => showPDFEditorDialog('permissions')
            }
          ]
        },
        {
          type: 'separator'
        },
        {
          label: 'About PDF Editor',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About PDF Editor',
              message: 'PDF Editor',
              detail: 'Comprehensive PDF editing capabilities powered by pdf-lib.\n\nFeatures:\n• Merge multiple PDF files\n• Split PDF into separate files\n• Compress PDF to reduce file size\n• Rotate pages (90°, 180°, 270°)\n• Delete unwanted pages\n• Reorder pages\n• Add text watermarks\n\nSecurity Features:\n• Password protection (encryption)\n• Remove passwords (decryption)\n• Set document permissions\n\n100% offline and open-source.',
              buttons: ['OK']
            });
          }
        }
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
              detail: 'A cross-platform Markdown editor and converter using Pandoc.\n\nVersion: 1.9.0\nAuthor: Amit Haridas\nEmail: amit.wh@gmail.com\nLicense: MIT\n\nFeatures:\n• Custom Headers & Footers for PDF, DOCX, ODT, and PowerPoint exports\n• Dynamic field support: $PAGE$, $TOTAL$, $DATE$, $TIME$, $TITLE$, $AUTHOR$, $FILENAME$\n• Logo/image embedding in headers and footers\n• Modern glassmorphism UI with gradient backgrounds\n• Enhanced PDF export via Word template with configurable start page\n• Configurable template settings (start page selection)\n• Streamlined PDF Editor UI (merge, split, compress, rotate, watermark, encrypt)\n• Universal File Converter (LibreOffice, ImageMagick, FFmpeg, Pandoc)\n• Windows Explorer context menu integration\n• Tabbed interface for multiple files\n• Advanced markdown editing with live preview\n• Real-time preview updates while typing\n• Full toolbar markdown editing functions\n• Enhanced PDF export with built-in Electron fallback\n• Enhanced Word export with template support (single file & batch)\n• File association support for .md files\n• Command-line interface for batch conversion\n• Advanced export options with templates and metadata\n• Batch file conversion with progress tracking\n• Improved preview typography and spacing\n• Adjustable font sizes via menu (Ctrl+Shift+Plus/Minus)\n• Complete theme support including Monokai fixes\n• Find & replace with match highlighting\n• Line numbers and auto-indentation\n• Export to multiple formats via Pandoc\n• PowerPoint & presentation export\n• Export tables to Excel/ODS spreadsheets\n• Document import & conversion\n• Table creation helper\n• 22 beautiful themes (including Dracula, Nord, Tokyo Night, Gruvbox, Ayu, Concrete, and more)\n• Undo/redo functionality\n• Live word count and statistics',
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

  // Show export options dialog
  showExportOptionsDialog(format);
}

function showExportOptionsDialog(format) {
  mainWindow.webContents.send('show-export-dialog', format);
}

function showBatchConversionDialog() {
  mainWindow.webContents.send('show-batch-dialog');
}

// Select Word Template
async function selectWordTemplate() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Word Template',
    filters: [{ name: 'Word Document', extensions: ['docx'] }],
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    wordTemplatePath = result.filePaths[0];
    store.set('wordTemplatePath', wordTemplatePath);

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Template Selected',
      message: 'Word template has been updated',
      detail: `Template: ${path.basename(wordTemplatePath)}`
    });
  }
}

// Template Settings Dialog
async function showTemplateSettings() {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Template Settings',
    message: 'Configure Word Template Export',
    detail: `Current template: ${wordTemplatePath ? path.basename(wordTemplatePath) : 'Default template'}\nContent starts from page: ${templateStartPage}\n\nWhich page should content start from?\n(Templates usually have cover pages, TOC, etc.)`,
    buttons: ['Page 1', 'Page 2', 'Page 3', 'Page 4', 'Page 5', 'Custom...', 'Cancel'],
    defaultId: templateStartPage - 1,
    cancelId: 6
  });

  if (result.response === 6) return; // Cancel

  let newStartPage;
  if (result.response === 5) { // Custom
    // Show input dialog for custom page number
    mainWindow.webContents.send('show-custom-start-page-dialog', templateStartPage);
  } else {
    newStartPage = result.response + 1; // Convert button index to page number
    templateStartPage = newStartPage;
    store.set('templateStartPage', templateStartPage);

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Settings Updated',
      message: 'Template settings have been updated',
      detail: `Content will now start from page ${templateStartPage}`
    });
  }
}

// Handle custom start page input from renderer
ipcMain.on('set-custom-start-page', (event, pageNumber) => {
  const page = parseInt(pageNumber);
  if (page >= 1 && page <= 100) {
    templateStartPage = page;
    store.set('templateStartPage', templateStartPage);

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Settings Updated',
      message: 'Template settings have been updated',
      detail: `Content will now start from page ${templateStartPage}`
    });
  } else {
    dialog.showErrorBox('Invalid Page Number', 'Please enter a page number between 1 and 100');
  }
});

// Header & Footer Settings IPC Handlers

// Get current header/footer settings
ipcMain.on('get-header-footer-settings', (event) => {
  event.reply('header-footer-settings-data', headerFooterSettings);
});

// Save header/footer settings
ipcMain.on('save-header-footer-settings', (event, settings) => {
  headerFooterSettings = settings;
  store.set('headerFooterSettings', headerFooterSettings);

  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Settings Saved',
    message: 'Header and footer settings have been saved successfully!',
    buttons: ['OK']
  });
});

// Save header/footer logo image
// Browse for header/footer logo
ipcMain.on('browse-header-footer-logo', async (event, position) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: `Select ${position.charAt(0).toUpperCase() + position.slice(1)} Logo/Image`,
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'] }
      ],
      properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];

      // Copy image to userData directory for persistent storage
      const userDataPath = app.getPath('userData');
      const logoDir = path.join(userDataPath, 'logos');

      // Create logos directory if it doesn't exist
      if (!fs.existsSync(logoDir)) {
        fs.mkdirSync(logoDir, { recursive: true });
      }

      // Generate unique filename
      const ext = path.extname(filePath);
      const filename = `${position}_${Date.now()}${ext}`;
      const destPath = path.join(logoDir, filename);

      // Copy file
      fs.copyFileSync(filePath, destPath);

      // Update settings
      if (position === 'header') {
        headerFooterSettings.header.logo = destPath;
      } else if (position === 'footer') {
        headerFooterSettings.footer.logo = destPath;
      }

      event.reply('header-footer-logo-saved', { position, path: destPath });
    }
  } catch (error) {
    console.error('Logo browse error:', error);
    dialog.showErrorBox('Logo Error', `Failed to select logo: ${error.message}`);
  }
});

ipcMain.on('save-header-footer-logo', async (event, { position, filePath }) => {
  try {
    if (!filePath) {
      dialog.showErrorBox('Logo Error', 'Failed to save logo: The "path" argument must be of type string. Received undefined');
      return;
    }

    // Copy image to userData directory for persistent storage
    const userDataPath = app.getPath('userData');
    const logoDir = path.join(userDataPath, 'logos');

    // Create logos directory if it doesn't exist
    if (!fs.existsSync(logoDir)) {
      fs.mkdirSync(logoDir, { recursive: true });
    }

    // Verify source file exists
    if (!fs.existsSync(filePath)) {
      dialog.showErrorBox('Logo Error', `Source file not found: ${filePath}`);
      return;
    }

    // Generate unique filename
    const ext = path.extname(filePath);
    const filename = `${position}_${Date.now()}${ext}`;
    const destPath = path.join(logoDir, filename);

    // Copy file
    fs.copyFileSync(filePath, destPath);

    // Update settings
    if (position === 'header') {
      headerFooterSettings.header.logo = destPath;
    } else if (position === 'footer') {
      headerFooterSettings.footer.logo = destPath;
    }

    event.reply('header-footer-logo-saved', { position, path: destPath });
  } catch (error) {
    console.error('Logo save error:', error);
    dialog.showErrorBox('Logo Error', `Failed to save logo: ${error.message}`);
  }
});

// Clear header/footer logo
ipcMain.on('clear-header-footer-logo', (event, position) => {
  if (position === 'header') {
    headerFooterSettings.header.logo = null;
  } else if (position === 'footer') {
    headerFooterSettings.footer.logo = null;
  }
  event.reply('header-footer-logo-cleared', position);
});

// Helper function to process dynamic fields in header/footer text
function processDynamicFields(text, metadata = {}) {
  if (!text) return '';

  const now = new Date();
  const dateStr = now.toLocaleDateString();
  const timeStr = now.toLocaleTimeString();

  let result = text;
  result = result.replace(/\$DATE\$/g, dateStr);
  result = result.replace(/\$TIME\$/g, timeStr);
  result = result.replace(/\$TITLE\$/g, metadata.title || 'Untitled');
  result = result.replace(/\$AUTHOR\$/g, metadata.author || '');
  result = result.replace(/\$FILENAME\$/g, metadata.filename || '');

  // Note: $PAGE$ and $TOTAL$ are handled by Pandoc/export tools

  return result;
}

// Add headers/footers to DOCX file using PizZip and docx4js
async function addHeaderFooterToDocx(docxPath, metadata = {}) {
  if (!headerFooterSettings.enabled) return;

  try {
    const PizZip = require('pizzip');

    // Read the DOCX file
    const docxBuffer = fs.readFileSync(docxPath);
    const zip = new PizZip(docxBuffer);

    // Process dynamic fields
    const headerLeft = processDynamicFields(headerFooterSettings.header.left, metadata);
    const headerCenter = processDynamicFields(headerFooterSettings.header.center, metadata);
    const headerRight = processDynamicFields(headerFooterSettings.header.right, metadata);
    const footerLeft = processDynamicFields(headerFooterSettings.footer.left, metadata);
    const footerCenter = processDynamicFields(headerFooterSettings.footer.center, metadata);
    const footerRight = processDynamicFields(headerFooterSettings.footer.right, metadata);

    // Create header XML
    if (headerLeft || headerCenter || headerRight) {
      const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:jc w:val="left"/></w:pPr>
    <w:r><w:t>${headerLeft || ''}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r><w:t>${headerCenter || ''}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:jc w:val="right"/></w:pPr>
    <w:r><w:t>${headerRight || ''}</w:t></w:r>
  </w:p>
</w:hdr>`;
      zip.file('word/header1.xml', headerXml);
    }

    // Create footer XML with page numbers
    if (footerLeft || footerCenter || footerRight) {
      let footerCenterXml = '';
      if (footerCenter) {
        // Handle $PAGE$ and $TOTAL$ in footer
        if (footerCenter.includes('$PAGE$') || footerCenter.includes('$TOTAL$')) {
          const parts = footerCenter.split(/(\$PAGE\$|\$TOTAL\$)/);
          footerCenterXml = parts.map(part => {
            if (part === '$PAGE$') {
              return '<w:fldSimple w:instr="PAGE"/>';
            } else if (part === '$TOTAL$') {
              return '<w:fldSimple w:instr="NUMPAGES"/>';
            } else {
              return `<w:r><w:t>${part}</w:t></w:r>`;
            }
          }).join('');
        } else {
          footerCenterXml = `<w:r><w:t>${footerCenter}</w:t></w:r>`;
        }
      }

      const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:jc w:val="left"/></w:pPr>
    <w:r><w:t>${footerLeft || ''}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    ${footerCenterXml}
  </w:p>
  <w:p>
    <w:pPr><w:jc w:val="right"/></w:pPr>
    <w:r><w:t>${footerRight || ''}</w:t></w:r>
  </w:p>
</w:ftr>`;
      zip.file('word/footer1.xml', footerXml);
    }

    // Update document.xml.rels to reference header/footer
    let relsXml = zip.file('word/_rels/document.xml.rels').asText();

    // Add header relationship if not exists
    if ((headerLeft || headerCenter || headerRight) && !relsXml.includes('header1.xml')) {
      const headerId = 'rId100';
      const headerRel = `<Relationship Id="${headerId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`;
      relsXml = relsXml.replace('</Relationships>', headerRel + '</Relationships>');
    }

    // Add footer relationship if not exists
    if ((footerLeft || footerCenter || footerRight) && !relsXml.includes('footer1.xml')) {
      const footerId = 'rId101';
      const footerRel = `<Relationship Id="${footerId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`;
      relsXml = relsXml.replace('</Relationships>', footerRel + '</Relationships>');
    }

    zip.file('word/_rels/document.xml.rels', relsXml);

    // Update document.xml to use header/footer in sections
    let documentXml = zip.file('word/document.xml').asText();
    if ((headerLeft || headerCenter || headerRight || footerLeft || footerCenter || footerRight)) {
      // Find all section properties and add header/footer references
      const sectPrRegex = /<w:sectPr[^>]*>[\s\S]*?<\/w:sectPr>/g;
      documentXml = documentXml.replace(sectPrRegex, (match) => {
        let updated = match;
        if ((headerLeft || headerCenter || headerRight) && !match.includes('headerReference')) {
          updated = updated.replace('</w:sectPr>', '<w:headerReference w:type="default" r:id="rId100"/></w:sectPr>');
        }
        if ((footerLeft || footerCenter || footerRight) && !match.includes('footerReference')) {
          updated = updated.replace('</w:sectPr>', '<w:footerReference w:type="default" r:id="rId101"/></w:sectPr>');
        }
        return updated;
      });
    }

    zip.file('word/document.xml', documentXml);

    // Write modified DOCX
    const newDocxBuffer = zip.generate({ type: 'nodebuffer' });
    fs.writeFileSync(docxPath, newDocxBuffer);

  } catch (error) {
    console.error('Failed to add headers/footers to DOCX:', error);
    // Don't fail the export, just log the error
  }
}

// Enhanced Word Export with Template Support
async function exportWordWithTemplate() {
  if (!currentFile) {
    dialog.showErrorBox('Error', 'Please save the file first');
    return;
  }

  try {
    // Get markdown content
    const content = fs.readFileSync(currentFile, 'utf-8');

    // Show dialog for output file
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export to Word (Enhanced)',
      defaultPath: currentFile.replace(/\.md$/, '.docx'),
      filters: [{ name: 'Word Document', extensions: ['docx'] }]
    });

    if (result.canceled) return;

    // Create exporter instance with selected template and start page
    const exporter = new WordTemplateExporter(wordTemplatePath, templateStartPage);

    // Convert markdown to DOCX
    await exporter.convert(content, result.filePath);

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Export Successful',
      message: 'Document exported successfully!',
      detail: `Saved to: ${result.filePath}`
    });

  } catch (error) {
    dialog.showErrorBox('Export Error', `Failed to export document: ${error.message}`);
  }
}

// Enhanced PDF Export via Word Template
async function exportPDFViaWordTemplate() {
  if (!currentFile) {
    dialog.showErrorBox('Error', 'Please save the file first');
    return;
  }

  try {
    // Get markdown content
    const content = fs.readFileSync(currentFile, 'utf-8');

    // Show dialog for output file
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export to PDF (Enhanced)',
      defaultPath: currentFile.replace(/\.md$/, '.pdf'),
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
    });

    if (result.canceled) return;

    // Step 1: Create temporary DOCX file using Word template
    const tempDocxPath = result.filePath.replace(/\.pdf$/, '_temp.docx');

    const exporter = new WordTemplateExporter(wordTemplatePath, templateStartPage);
    await exporter.convert(content, tempDocxPath);

    // Step 2: Convert DOCX to PDF using LibreOffice
    const soffice = process.platform === 'win32'
      ? '"C:\\Program Files\\LibreOffice\\program\\soffice.exe"'
      : 'soffice';

    const outputDir = path.dirname(result.filePath);
    const convertCmd = `${soffice} --headless --convert-to pdf --outdir "${outputDir}" "${tempDocxPath}"`;

    exec(convertCmd, (error, stdout, stderr) => {
      // Clean up temporary DOCX file
      try {
        fs.unlinkSync(tempDocxPath);
      } catch (e) {
        console.error('Failed to delete temp file:', e);
      }

      if (error) {
        dialog.showErrorBox('PDF Conversion Error',
          `Failed to convert to PDF. Please ensure LibreOffice is installed.\n\nError: ${error.message}`);
        return;
      }

      // LibreOffice creates file with same base name as input
      const generatedPdfPath = tempDocxPath.replace(/\.docx$/, '.pdf');

      // Rename if needed
      if (generatedPdfPath !== result.filePath) {
        try {
          fs.renameSync(generatedPdfPath, result.filePath);
        } catch (e) {
          console.error('Failed to rename PDF:', e);
        }
      }

      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Export Successful',
        message: 'PDF exported successfully using Word template!',
        detail: `Saved to: ${result.filePath}`
      });
    });

  } catch (error) {
    dialog.showErrorBox('Export Error', `Failed to export PDF: ${error.message}`);
  }
}

// Universal File Converter integration
function showUniversalConverterDialog() {
  mainWindow.webContents.send('show-universal-converter-dialog');
}

// PDF Editor dialog
function showPDFEditorDialog(operation) {
  mainWindow.webContents.send('show-pdf-editor-dialog', operation);
}

// Check if conversion tool is available
function checkConverterAvailable(tool) {
  return new Promise((resolve) => {
    let command;
    switch (tool) {
      case 'libreoffice':
        command = process.platform === 'win32' ? 'where soffice' : 'which soffice';
        break;
      case 'imagemagick':
        command = process.platform === 'win32' ? 'where magick' : 'which convert';
        break;
      case 'ffmpeg':
        command = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
        break;
      default:
        resolve(false);
        return;
    }

    exec(command, (error) => {
      resolve(!error);
    });
  });
}

// Handle universal file conversion
ipcMain.on('universal-convert', async (event, { tool, fromFormat, toFormat, filePath }) => {
  try {
    mainWindow.webContents.send('conversion-status', 'Checking converter availability...');

    // Check if the required tool is available
    const toolAvailable = await checkConverterAvailable(tool);

    if (!toolAvailable) {
      throw new Error(`${tool} is not installed or not found in PATH. Please install it first.`);
    }

    mainWindow.webContents.send('conversion-status', 'Converting file...');

    const outputPath = filePath.replace(/\.[^/.]+$/, `.${toFormat}`);
    let conversionCmd;

    switch (tool) {
      case 'libreoffice':
        conversionCmd = convertWithLibreOffice(filePath, toFormat, outputPath);
        break;
      case 'imagemagick':
        conversionCmd = convertWithImageMagick(filePath, outputPath);
        break;
      case 'ffmpeg':
        conversionCmd = convertWithFFmpeg(filePath, outputPath);
        break;
      case 'pandoc':
        conversionCmd = `pandoc "${filePath}" -o "${outputPath}"`;
        break;
      default:
        throw new Error(`Unknown conversion tool: ${tool}`);
    }

    exec(conversionCmd, (error, stdout, stderr) => {
      if (error) {
        mainWindow.webContents.send('conversion-complete', {
          success: false,
          error: error.message
        });

        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'Conversion Failed',
          message: `${tool} conversion failed`,
          detail: stderr || error.message,
          buttons: ['OK']
        });
      } else {
        mainWindow.webContents.send('conversion-complete', {
          success: true,
          outputPath: outputPath
        });

        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Conversion Complete',
          message: 'File converted successfully!',
          detail: `Saved to: ${outputPath}`,
          buttons: ['OK']
        });
      }
    });
  } catch (error) {
    mainWindow.webContents.send('conversion-complete', {
      success: false,
      error: error.message
    });

    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Conversion Failed',
      message: 'Universal conversion failed',
      detail: error.message,
      buttons: ['OK']
    });
  }
});

// LibreOffice conversion command builder
function convertWithLibreOffice(inputFile, outputFormat, outputPath) {
  const outputDir = path.dirname(outputPath);
  const soffice = process.platform === 'win32'
    ? '"C:\\Program Files\\LibreOffice\\program\\soffice.exe"'
    : 'soffice';

  // LibreOffice conversion format mapping
  const formatMap = {
    'pdf': 'pdf',
    'docx': 'docx',
    'doc': 'doc',
    'odt': 'odt',
    'rtf': 'rtf',
    'txt': 'txt',
    'html': 'html',
    'xlsx': 'xlsx',
    'xls': 'xls',
    'ods': 'ods',
    'csv': 'csv',
    'pptx': 'pptx',
    'ppt': 'ppt',
    'odp': 'odp'
  };

  const format = formatMap[outputFormat] || outputFormat;

  // Use headless mode for conversion
  return `${soffice} --headless --convert-to ${format} --outdir "${outputDir}" "${inputFile}"`;
}

// ImageMagick conversion command builder
function convertWithImageMagick(inputFile, outputPath) {
  const magick = process.platform === 'win32' ? 'magick' : 'convert';
  return `${magick} "${inputFile}" "${outputPath}"`;
}

// FFmpeg conversion command builder
function convertWithFFmpeg(inputFile, outputPath) {
  return `ffmpeg -i "${inputFile}" "${outputPath}" -y`;
}

function performExportWithOptions(format, options) {
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

    // Use pandoc for export with advanced options
    console.log('Using Pandoc for export');
    let pandocCmd = `${getPandocPath()} "${currentFile}" -o "${outputFile}"`;

    // Add template if specified
    if (options.template && options.template !== 'default') {
      pandocCmd += ` --template="${options.template}"`;
    }

    // Add metadata
    if (options.metadata) {
      for (const [key, value] of Object.entries(options.metadata)) {
        if (value.trim()) {
          pandocCmd += ` -M ${key}="${value.replace(/"/g, '\\"')}"`;
        }
      }
    }

    // Add variables
    if (options.variables) {
      for (const [key, value] of Object.entries(options.variables)) {
        if (value.trim()) {
          pandocCmd += ` -V ${key}="${value.replace(/"/g, '\\"')}"`;
        }
      }
    }

    // Add other options
    if (options.toc) pandocCmd += ' --toc';
    if (options.tocDepth) pandocCmd += ` --toc-depth=${options.tocDepth}`;
    if (options.numberSections) pandocCmd += ' --number-sections';
    if (options.citeproc) pandocCmd += ' --citeproc';
    if (options.bibliography) pandocCmd += ` --bibliography="${options.bibliography}"`;
    if (options.csl) pandocCmd += ` --csl="${options.csl}"`;

    // Add specific options for PDF export to ensure proper generation
    if (format === 'pdf') {
      const pdfEngine = options.pdfEngine || 'xelatex'; // Default to xelatex
      pandocCmd += ` --pdf-engine="${pdfEngine}"`;
      if (options.geometry) pandocCmd += ` -V geometry:"${options.geometry}"`;

      // Add header/footer if enabled
      if (headerFooterSettings.enabled) {
        const filename = currentFile ? path.basename(currentFile, path.extname(currentFile)) : 'document';
        const metadata = { filename, title: filename, author: '' };

        const headerLeft = processDynamicFields(headerFooterSettings.header.left, metadata);
        const headerCenter = processDynamicFields(headerFooterSettings.header.center, metadata);
        const headerRight = processDynamicFields(headerFooterSettings.header.right, metadata);
        const footerLeft = processDynamicFields(headerFooterSettings.footer.left, metadata);
        const footerCenter = processDynamicFields(headerFooterSettings.footer.center, metadata);
        const footerRight = processDynamicFields(headerFooterSettings.footer.right, metadata);

        // Create LaTeX header
        const latexHeader = `
\\usepackage{fancyhdr}
\\pagestyle{fancy}
\\fancyhf{}
\\lhead{${headerLeft.replace(/\\/g, '\\\\')}}
\\chead{${headerCenter.replace(/\\/g, '\\\\')}}
\\rhead{${headerRight.replace(/\\/g, '\\\\')}}
\\lfoot{${footerLeft.replace(/\\/g, '\\\\')}}
\\cfoot{${footerCenter.replace(/[$]PAGE[$]/g, '\\\\thepage').replace(/[$]TOTAL[$]/g, '\\\\pageref{LastPage}').replace(/\\/g, '\\\\')}}
\\rfoot{${footerRight.replace(/\\/g, '\\\\')}}
\\renewcommand{\\headrulewidth}{0.4pt}
\\renewcommand{\\footrulewidth}{0.4pt}
`;
        const headerFile = path.join(require('os').tmpdir(), `header_export_${Date.now()}.tex`);
        fs.writeFileSync(headerFile, latexHeader, 'utf-8');
        pandocCmd += ` --include-in-header="${headerFile}"`;
        pandocCmd += ' --variable header-includes="\\\\usepackage{lastpage}"';
      }

      // Try with specified PDF engine
      exec(pandocCmd, (error) => {
        if (error) {
          // Try fallback engines if the specified one fails
          const fallbackEngines = ['pdflatex', 'lualatex'];
          tryPdfFallback(currentFile, outputFile, fallbackEngines, 0, options, error);
        } else {
          showExportSuccess(outputFile);
        }
      });
    } else if (format === 'docx') {
      pandocCmd += ' -t docx';
      exportWithPandoc(pandocCmd, outputFile, format);
    } else if (format === 'pptx') {
      // Add PowerPoint footer if enabled
      if (headerFooterSettings.enabled && headerFooterSettings.footer.center) {
        const filename = currentFile ? path.basename(currentFile, path.extname(currentFile)) : 'document';
        const metadata = { filename, title: filename, author: '' };
        const footerText = processDynamicFields(headerFooterSettings.footer.center, metadata);
        pandocCmd += ` --variable footer="${footerText}"`;
      }
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

function tryPdfFallback(inputFile, outputFile, engines, index, options, lastError) {
  if (index >= engines.length) {
    // All Pandoc PDF engines failed, fallback to Electron's built-in PDF export
    console.log('All Pandoc PDF engines failed, falling back to Electron PDF export');
    exportToPDFElectron(outputFile);
    return;
  }

  const engine = engines[index];
  let pandocCmd = `${getPandocPath()} "${inputFile}" --pdf-engine=${engine} -o "${outputFile}"`;

  // Add geometry if specified
  if (options.geometry) pandocCmd = pandocCmd.replace(` -o `, ` -V geometry:"${options.geometry}" -o `);

  // Add header/footer if enabled
  if (headerFooterSettings.enabled) {
    const filename = path.basename(inputFile, path.extname(inputFile));
    const metadata = { filename, title: filename, author: options.metadata?.author || '' };

    const headerLeft = processDynamicFields(headerFooterSettings.header.left, metadata);
    const headerCenter = processDynamicFields(headerFooterSettings.header.center, metadata);
    const headerRight = processDynamicFields(headerFooterSettings.header.right, metadata);
    const footerLeft = processDynamicFields(headerFooterSettings.footer.left, metadata);
    const footerCenter = processDynamicFields(headerFooterSettings.footer.center, metadata);
    const footerRight = processDynamicFields(headerFooterSettings.footer.right, metadata);

    // Create LaTeX header for fancyhdr
    const latexHeader = `
\\usepackage{fancyhdr}
\\usepackage{lastpage}
\\pagestyle{fancy}
\\fancyhf{}
\\lhead{${headerLeft.replace(/\\/g, '\\\\')}}
\\chead{${headerCenter.replace(/\\/g, '\\\\')}}
\\rhead{${headerRight.replace(/\\/g, '\\\\')}}
\\lfoot{${footerLeft.replace(/\\/g, '\\\\')}}
\\cfoot{${footerCenter.replace(/\$PAGE\$/g, '\\\\thepage').replace(/\$TOTAL\$/g, '\\\\pageref{LastPage}').replace(/\\/g, '\\\\')}}
\\rfoot{${footerRight.replace(/\\/g, '\\\\')}}
\\renewcommand{\\headrulewidth}{0.4pt}
\\renewcommand{\\footrulewidth}{0.4pt}
`;
    const headerFile = path.join(require('os').tmpdir(), `header_fallback_${Date.now()}.tex`);
    fs.writeFileSync(headerFile, latexHeader, 'utf-8');
    pandocCmd += ` --include-in-header="${headerFile}"`;
  }

  // Add all other options
  if (options.template && options.template !== 'default') {
    pandocCmd += ` --template="${options.template}"`;
  }

  if (options.metadata) {
    for (const [key, value] of Object.entries(options.metadata)) {
      if (value.trim()) {
        pandocCmd += ` -M ${key}="${value.replace(/"/g, '\\"')}"`;
      }
    }
  }

  exec(pandocCmd, (error) => {
    if (error) {
      tryPdfFallback(inputFile, outputFile, engines, index + 1, options, error);
    } else {
      showExportSuccess(outputFile);
    }
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
  console.log(`Executing Pandoc command: ${pandocCmd}`);

  exec(pandocCmd, async (error, stdout, stderr) => {
    if (error) {
      console.error(`Pandoc error for ${format}:`, error);
      console.error(`Pandoc stderr:`, stderr);
      console.error(`Pandoc stdout:`, stdout);

      // Provide more specific error messages
      let errorMessage = `Failed to export to ${format.toUpperCase()}`;

      if (error.message.includes('not found') || error.message.includes('not recognized')) {
        errorMessage += '\n\nPandoc is not installed or not found in PATH.';
        errorMessage += '\nPlease install Pandoc from: https://pandoc.org/installing.html';
      } else if (stderr) {
        errorMessage += `\n\nError details: ${stderr}`;
      } else {
        errorMessage += `\n\nError details: ${error.message}`;
      }

      errorMessage += `\n\nCommand used: ${pandocCmd}`;

      dialog.showErrorBox('Export Error', errorMessage);
    } else {
      console.log(`Successfully exported to ${format}:`, outputFile);
      console.log(`Pandoc stdout:`, stdout);
      if (stderr) {
        console.warn(`Pandoc stderr (non-fatal):`, stderr);
      }

      // Add headers/footers to DOCX if enabled
      if (format === 'docx' && headerFooterSettings.enabled) {
        try {
          const filename = currentFile ? path.basename(currentFile, path.extname(currentFile)) : 'document';
          const metadata = {
            filename: filename,
            title: filename,
            author: ''
          };
          await addHeaderFooterToDocx(outputFile, metadata);
          console.log('Headers/footers added to DOCX');
        } catch (hfError) {
          console.error('Error adding headers/footers to DOCX:', hfError);
          // Continue with success message even if header/footer fails
        }
      }

      // Add headers/footers to ODT if enabled
      if (format === 'odt' && headerFooterSettings.enabled) {
        // ODT format is similar to DOCX in structure, we could implement this
        console.log('ODT header/footer support not yet implemented');
      }

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
    const pandocCmd = `${getPandocPath()} "${inputFile}" -t markdown -o "${outputFile}"`;
    
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
  const theme = store.get('theme', 'github');
  event.reply('theme-changed', theme);
});

// Handle tab file tracking for exports
ipcMain.on('set-current-file', (event, filePath) => {
  currentFile = filePath;
});

// Handle actual printing when renderer is ready
ipcMain.on('do-print', (event, { withStyles }) => {
  if (mainWindow) {
    // Renderer has already hidden UI, waited 300ms, and prepared the page
    // Print immediately - DOM is fully rendered
    mainWindow.webContents.print({
      silent: false,
      printBackground: withStyles,
      color: true,
      margin: { marginType: 'default' }
    });
  }
});

// Handle renderer ready for file association
ipcMain.on('renderer-ready', (event) => {
  console.log('[MAIN] renderer-ready received, rendererReady was:', rendererReady);
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(`console.log('[MAIN->RENDERER] renderer-ready received, rendererReady was: ${rendererReady}')`);
  }
  rendererReady = true;
  console.log('[MAIN] app.pendingFile:', app.pendingFile);
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(`console.log('[MAIN->RENDERER] app.pendingFile: ${app.pendingFile}')`);
  }
  if (app.pendingFile) {
    console.log('[MAIN] Opening pending file:', app.pendingFile);
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(`console.log('[MAIN->RENDERER] Opening pending file: ${app.pendingFile}')`);
    }
    openFileFromPath(app.pendingFile);
    app.pendingFile = null;
  }
});

// Handle export with options
ipcMain.on('export-with-options', (event, { format, options }) => {
  performExportWithOptions(format, options);
});

// Handle batch conversion
ipcMain.on('batch-convert', (event, { inputFolder, outputFolder, format, options }) => {
  performBatchConversion(inputFolder, outputFolder, format, options);
});

// Handle folder selection for batch conversion
ipcMain.on('select-folder', (event, type) => {
  const folder = dialog.showOpenDialogSync(mainWindow, {
    properties: ['openDirectory']
  });

  if (folder && folder[0]) {
    event.reply('folder-selected', { type, path: folder[0] });
  }
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

      if (format === 'csv') {
        // Convert tables to CSV format
        let csvContent = '';
        tables.forEach((table, index) => {
          if (index > 0) csvContent += '\n\n'; // Separate multiple tables
          if (tables.length > 1) csvContent += `"Table ${index + 1}"\n`;

          table.forEach(row => {
            const csvRow = row.map(cell => {
              // Escape quotes and wrap in quotes if necessary
              const cleanCell = cell.replace(/"/g, '""');
              return cleanCell.includes(',') || cleanCell.includes('"') || cleanCell.includes('\n')
                ? `"${cleanCell}"` : cleanCell;
            }).join(',');
            csvContent += csvRow + '\n';
          });
        });

        fs.writeFileSync(outputFile, csvContent, 'utf-8');
      }

      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Export Complete',
        message: `${format.toUpperCase()} exported successfully to ${outputFile}`,
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

function performBatchConversion(inputFolder, outputFolder, format, options) {
  if (!fs.existsSync(inputFolder)) {
    dialog.showErrorBox('Error', 'Input folder does not exist');
    return;
  }

  // Create output folder if it doesn't exist
  if (!fs.existsSync(outputFolder)) {
    try {
      fs.mkdirSync(outputFolder, { recursive: true });
    } catch (error) {
      dialog.showErrorBox('Error', `Failed to create output folder: ${error.message}`);
      return;
    }
  }

  // Find all markdown files in input folder
  const markdownFiles = [];

  function findMarkdownFiles(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        findMarkdownFiles(fullPath); // Recursive search
      } else if (file.match(/\.(md|markdown)$/i)) {
        markdownFiles.push(fullPath);
      }
    }
  }

  findMarkdownFiles(inputFolder);

  if (markdownFiles.length === 0) {
    dialog.showErrorBox('No Files Found', 'No markdown files found in the selected folder');
    return;
  }

  // Show progress dialog
  let completedCount = 0;
  const totalCount = markdownFiles.length;

  // Process each file
  const processNextFile = async (index) => {
    if (index >= markdownFiles.length) {
      // All files processed
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Batch Conversion Complete',
        message: `Successfully converted ${completedCount} out of ${totalCount} files to ${format.toUpperCase()}.`,
        buttons: ['OK']
      });
      return;
    }

    const inputFile = markdownFiles[index];
    const relativePath = path.relative(inputFolder, inputFile);
    const baseName = path.basename(relativePath, path.extname(relativePath));
    let outputExtension = format;
    if (format === 'docx-enhanced') outputExtension = 'docx';
    if (format === 'pdf-enhanced') outputExtension = 'pdf';
    const outputFile = path.join(outputFolder, relativePath.replace(/\.(md|markdown)$/i, `.${outputExtension}`));

    // Create subdirectories in output folder if needed
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Handle DOCX Enhanced format with WordTemplateExporter
    if (format === 'docx-enhanced') {
      try {
        const content = fs.readFileSync(inputFile, 'utf-8');
        const exporter = new WordTemplateExporter(wordTemplatePath, templateStartPage);
        await exporter.convert(content, outputFile);

        completedCount++;

        // Update progress
        mainWindow.webContents.send('batch-progress', {
          completed: index + 1,
          total: totalCount,
          currentFile: path.basename(inputFile),
          success: true
        });

        // Process next file
        processNextFile(index + 1);
      } catch (error) {
        // Update progress with error
        mainWindow.webContents.send('batch-progress', {
          completed: index + 1,
          total: totalCount,
          currentFile: path.basename(inputFile),
          success: false
        });

        // Process next file even if this one failed
        processNextFile(index + 1);
      }
      return;
    }

    // Handle PDF Enhanced format with Word Template → PDF conversion
    if (format === 'pdf-enhanced') {
      try {
        const content = fs.readFileSync(inputFile, 'utf-8');

        // Step 1: Create temporary DOCX file using Word template
        const tempDocxPath = outputFile.replace(/\.pdf$/, '_temp.docx');
        const exporter = new WordTemplateExporter(wordTemplatePath, templateStartPage);
        await exporter.convert(content, tempDocxPath);

        // Step 2: Convert DOCX to PDF using LibreOffice
        const soffice = process.platform === 'win32'
          ? '"C:\\Program Files\\LibreOffice\\program\\soffice.exe"'
          : 'soffice';

        const outputDir = path.dirname(outputFile);
        const convertCmd = `${soffice} --headless --convert-to pdf --outdir "${outputDir}" "${tempDocxPath}"`;

        exec(convertCmd, (error, stdout, stderr) => {
          // Clean up temporary DOCX file
          try {
            fs.unlinkSync(tempDocxPath);
          } catch (e) {
            console.error('Failed to delete temp file:', e);
          }

          if (error) {
            // Update progress with error
            mainWindow.webContents.send('batch-progress', {
              completed: index + 1,
              total: totalCount,
              currentFile: path.basename(inputFile),
              success: false
            });
            processNextFile(index + 1);
            return;
          }

          // LibreOffice creates file with same base name as input
          const generatedPdfPath = tempDocxPath.replace(/\.docx$/, '.pdf');

          // Rename if needed
          if (generatedPdfPath !== outputFile) {
            try {
              fs.renameSync(generatedPdfPath, outputFile);
            } catch (e) {
              console.error('Failed to rename PDF:', e);
            }
          }

          completedCount++;

          // Update progress
          mainWindow.webContents.send('batch-progress', {
            completed: index + 1,
            total: totalCount,
            currentFile: path.basename(inputFile),
            success: true
          });

          // Process next file
          processNextFile(index + 1);
        });

      } catch (error) {
        // Update progress with error
        mainWindow.webContents.send('batch-progress', {
          completed: index + 1,
          total: totalCount,
          currentFile: path.basename(inputFile),
          success: false
        });

        // Process next file even if this one failed
        processNextFile(index + 1);
      }
      return;
    }

    // Build pandoc command for other formats
    let pandocCmd = `${getPandocPath()} "${inputFile}" -o "${outputFile}"`;

    // Add template if specified
    if (options.template && options.template !== 'default') {
      pandocCmd += ` --template="${options.template}"`;
    }

    // Add metadata
    if (options.metadata) {
      for (const [key, value] of Object.entries(options.metadata)) {
        if (value.trim()) {
          pandocCmd += ` -M ${key}="${value.replace(/"/g, '\\"')}"`;
        }
      }
    }

    // Add variables
    if (options.variables) {
      for (const [key, value] of Object.entries(options.variables)) {
        if (value.trim()) {
          pandocCmd += ` -V ${key}="${value.replace(/"/g, '\\"')}"`;
        }
      }
    }

    // Add other options
    if (options.toc) pandocCmd += ' --toc';
    if (options.tocDepth) pandocCmd += ` --toc-depth=${options.tocDepth}`;
    if (options.numberSections) pandocCmd += ' --number-sections';
    if (options.citeproc) pandocCmd += ' --citeproc';
    if (options.bibliography) pandocCmd += ` --bibliography="${options.bibliography}"`;
    if (options.csl) pandocCmd += ` --csl="${options.csl}"`;

    // Add PDF-specific options with header/footer support
    if (format === 'pdf') {
      const pdfEngine = options.pdfEngine || 'xelatex';
      pandocCmd += ` --pdf-engine="${pdfEngine}"`;
      if (options.geometry) pandocCmd += ` -V geometry:"${options.geometry}"`;

      // Add header/footer if enabled
      if (headerFooterSettings.enabled) {
        const filename = path.basename(inputFile, path.extname(inputFile));
        const metadata = { filename, title: filename, author: '' };

        const headerLeft = processDynamicFields(headerFooterSettings.header.left, metadata);
        const headerCenter = processDynamicFields(headerFooterSettings.header.center, metadata);
        const headerRight = processDynamicFields(headerFooterSettings.header.right, metadata);
        const footerLeft = processDynamicFields(headerFooterSettings.footer.left, metadata);
        const footerCenter = processDynamicFields(headerFooterSettings.footer.center, metadata);
        const footerRight = processDynamicFields(headerFooterSettings.footer.right, metadata);

        // Create LaTeX header
        const latexHeader = `
\\usepackage{fancyhdr}
\\pagestyle{fancy}
\\fancyhf{}
\\lhead{${headerLeft.replace(/\\/g, '\\\\')}}
\\chead{${headerCenter.replace(/\\/g, '\\\\')}}
\\rhead{${headerRight.replace(/\\/g, '\\\\')}}
\\lfoot{${footerLeft.replace(/\\/g, '\\\\')}}
\\cfoot{${footerCenter.replace(/[$]PAGE[$]/g, '\\\\thepage').replace(/[$]TOTAL[$]/g, '\\\\pageref{LastPage}').replace(/\\/g, '\\\\')}}
\\rfoot{${footerRight.replace(/\\/g, '\\\\')}}
\\renewcommand{\\headrulewidth}{0.4pt}
\\renewcommand{\\footrulewidth}{0.4pt}
`;
        const headerFile = path.join(require('os').tmpdir(), `header_batch_${Date.now()}.tex`);
        fs.writeFileSync(headerFile, latexHeader, 'utf-8');
        pandocCmd += ` --include-in-header="${headerFile}"`;
        pandocCmd += ' --variable header-includes="\\\\usepackage{lastpage}"';
      }
    }

    // Add DOCX-specific handling
    if (format === 'docx') {
      pandocCmd += ' -t docx';
    }

    // Add PowerPoint footer if enabled
    if (format === 'pptx' && headerFooterSettings.enabled && headerFooterSettings.footer.center) {
      const filename = path.basename(inputFile, path.extname(inputFile));
      const metadata = { filename, title: filename, author: '' };
      const footerText = processDynamicFields(headerFooterSettings.footer.center, metadata);
      pandocCmd += ` --variable footer="${footerText}"`;
    }

    // Execute conversion
    exec(pandocCmd, async (error, stdout, stderr) => {
      if (!error) {
        // Add headers/footers to DOCX if enabled
        if (format === 'docx' && headerFooterSettings.enabled) {
          try {
            const filename = path.basename(inputFile, path.extname(inputFile));
            const metadata = { filename, title: filename, author: '' };
            await addHeaderFooterToDocx(outputFile, metadata);
          } catch (hfError) {
            console.error('Batch: Error adding headers/footers to DOCX:', hfError);
          }
        }
        completedCount++;
      }

      // Update progress (you could send this to renderer for a progress bar)
      mainWindow.webContents.send('batch-progress', {
        completed: index + 1,
        total: totalCount,
        currentFile: path.basename(inputFile),
        success: !error
      });

      // Process next file
      processNextFile(index + 1);
    });
  };

  // Start processing
  processNextFile(0);
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

  // Get metadata for dynamic fields
  const filename = currentFile ? path.basename(currentFile, path.extname(currentFile)) : 'document';
  const metadata = {
    filename: filename,
    title: filename,
    author: '',
  };

  switch (format) {
    case 'pdf':
      command += ' --pdf-engine=xelatex --variable geometry:margin=1in';

      // Add header/footer if enabled
      if (headerFooterSettings.enabled) {
        // Process dynamic fields
        const headerLeft = processDynamicFields(headerFooterSettings.header.left, metadata);
        const headerCenter = processDynamicFields(headerFooterSettings.header.center, metadata);
        const headerRight = processDynamicFields(headerFooterSettings.header.right, metadata);
        const footerLeft = processDynamicFields(headerFooterSettings.footer.left, metadata);
        const footerCenter = processDynamicFields(headerFooterSettings.footer.center, metadata);
        const footerRight = processDynamicFields(headerFooterSettings.footer.right, metadata);

        // Add Pandoc variables for fancyhdr package
        if (headerLeft) command += ` --variable header-left="${headerLeft}"`;
        if (headerCenter) command += ` --variable header-center="${headerCenter}"`;
        if (headerRight) command += ` --variable header-right="${headerRight}"`;
        if (footerLeft) command += ` --variable footer-left="${footerLeft}"`;
        if (footerCenter) command += ` --variable footer-center="${footerCenter}"`;
        if (footerRight) command += ` --variable footer-right="${footerRight}"`;

        // Create custom LaTeX header with fancyhdr
        const latexHeader = `
\\usepackage{fancyhdr}
\\pagestyle{fancy}
\\fancyhf{}
\\lhead{${headerLeft.replace(/\\/g, '\\\\')}}
\\chead{${headerCenter.replace(/\\/g, '\\\\')}}
\\rhead{${headerRight.replace(/\\/g, '\\\\')}}
\\lfoot{${footerLeft.replace(/\\/g, '\\\\')}}
\\cfoot{${footerCenter.replace(/[$]PAGE[$]/g, '\\\\thepage').replace(/[$]TOTAL[$]/g, '\\\\pageref{LastPage}').replace(/\\/g, '\\\\')}}
\\rfoot{${footerRight.replace(/\\/g, '\\\\')}}
\\renewcommand{\\headrulewidth}{0.4pt}
\\renewcommand{\\footrulewidth}{0.4pt}
`;
        const headerFile = path.join(require('os').tmpdir(), `header_${Date.now()}.tex`);
        fs.writeFileSync(headerFile, latexHeader, 'utf-8');
        command += ` --include-in-header="${headerFile}"`;

        // Add lastpage package for $TOTAL$ support
        command += ' --variable header-includes="\\\\usepackage{lastpage}"';
      }
      break;

    case 'html':
      command += ' --self-contained --css';
      break;

    case 'docx':
      command += ' --reference-doc';

      // For DOCX, header/footer are handled via reference document or separate processing
      // We'll add a note that DOCX headers/footers require reference doc or post-processing
      break;

    case 'odt':
      // ODT headers/footers are handled via reference document
      break;

    case 'latex':
      command += ' --standalone';
      break;

    case 'pptx':
      command += ' --slide-level=2';
      // PowerPoint footer can be added with --variable
      if (headerFooterSettings.enabled && headerFooterSettings.footer.center) {
        const footerText = processDynamicFields(headerFooterSettings.footer.center, metadata);
        command += ` --variable footer="${footerText}"`;
      }
      break;
  }

  return command;
}

app.whenReady().then(() => {
  // Load saved Word template path and settings
  wordTemplatePath = store.get('wordTemplatePath', null);
  templateStartPage = store.get('templateStartPage', 3);

  // Load header/footer settings
  const savedHFSettings = store.get('headerFooterSettings', null);
  if (savedHFSettings) {
    headerFooterSettings = savedHFSettings;
  }

  // Check for command line conversion requests
  const args = process.argv.slice(2);
  if (args.length >= 2 && (args[0] === '--convert' || args[0] === '--convert-to')) {
    handleCLIConversion(args);
    return; // Don't create window for CLI operations
  }

  createWindow();
  
  // Handle file association on app startup
  // In packaged apps, process.argv structure is different:
  // Development: ['electron', 'app.js', 'file.md'] - need slice(2)
  // Packaged: ['PanConverter.exe', 'file.md'] - need slice(1)
  // We'll check all arguments after the executable
  console.log('[MAIN] Full command line args:', JSON.stringify(process.argv));
  console.log('[MAIN] App is packaged:', app.isPackaged);

  // Start from index 1 (skip executable) and check each argument
  const startIndex = app.isPackaged ? 1 : 2;
  const fileArgs = process.argv.slice(startIndex);
  console.log('[MAIN] File args to process (starting from index', startIndex + '):', fileArgs);

  for (const arg of fileArgs) {
    console.log('[MAIN] Checking arg:', arg);
    if ((arg.endsWith('.md') || arg.endsWith('.markdown'))) {
      // Try to resolve the path (might be relative)
      const resolvedPath = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
      console.log('[MAIN] Resolved path:', resolvedPath);
      if (fs.existsSync(resolvedPath)) {
        // Store the file to open after window is ready
        console.log('[MAIN] Setting pendingFile to:', resolvedPath);
        app.pendingFile = resolvedPath;
        break;
      } else {
        console.log('[MAIN] File does not exist:', resolvedPath);
      }
    }
  }
  console.log('[MAIN] Final app.pendingFile:', app.pendingFile);
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

// IPC handlers for recent files
ipcMain.on('save-recent-files', (event, recentFiles) => {
  try {
    const userDataPath = app.getPath('userData');
    const recentFilesPath = path.join(userDataPath, 'recent-files.json');
    fs.writeFileSync(recentFilesPath, JSON.stringify(recentFiles, null, 2));
  } catch (error) {
    console.error('Error saving recent files:', error);
  }
});

ipcMain.on('clear-recent-files', (event) => {
  try {
    const userDataPath = app.getPath('userData');
    const recentFilesPath = path.join(userDataPath, 'recent-files.json');
    fs.writeFileSync(recentFilesPath, JSON.stringify([], null, 2));
    // Rebuild menu to reflect changes
    createMenu();
    event.reply('recent-files-cleared');
  } catch (error) {
    console.error('Error clearing recent files:', error);
  }
});

// Handle file opening on macOS
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow && rendererReady) {
    openFileFromPath(filePath);
  } else {
    // Store the file path to open after window and renderer are ready
    app.pendingFile = filePath;
  }
});

// Handle file opening from command line or file association
function openFileFromPath(filePath) {
  console.log('[MAIN] openFileFromPath called with:', filePath);
  console.log('[MAIN] rendererReady:', rendererReady, 'mainWindow exists:', !!mainWindow);
  if (fs.existsSync(filePath)) {
    currentFile = filePath;
    const content = fs.readFileSync(filePath, 'utf-8');
    console.log('[MAIN] File read successfully, content length:', content.length);
    if (mainWindow && mainWindow.webContents && rendererReady) {
      // Send file immediately - renderer-ready means UI is initialized
      console.log('[MAIN] Sending file-opened to renderer');
      mainWindow.webContents.send('file-opened', { path: filePath, content });
    } else {
      // Store file to open after renderer is ready
      console.log('[MAIN] Storing as pending file');
      app.pendingFile = filePath;
    }
  } else {
    console.error('[MAIN] File does not exist:', filePath);
  }
}

// ========================================
// PDF EDITOR OPERATIONS (using pdf-lib)
// ========================================

// Helper function to parse page ranges (e.g., "1-5, 7, 9-12")
function parsePageRanges(rangeString, totalPages) {
  const pages = [];
  const ranges = rangeString.split(',').map(r => r.trim());

  for (const range of ranges) {
    if (range.includes('-')) {
      const [start, end] = range.split('-').map(n => parseInt(n.trim()));
      for (let i = start; i <= end && i <= totalPages; i++) {
        if (i > 0 && !pages.includes(i - 1)) { // Convert to 0-indexed
          pages.push(i - 1);
        }
      }
    } else {
      const page = parseInt(range);
      if (page > 0 && page <= totalPages && !pages.includes(page - 1)) {
        pages.push(page - 1);
      }
    }
  }

  return pages.sort((a, b) => a - b);
}

// Helper function to convert hex color to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 0, g: 0, b: 0 };
}

// PDF Merge Operation
async function pdfMerge(data) {
  try {
    const mergedPdf = await PDFDocument.create();

    for (const filePath of data.inputFiles) {
      const pdfBytes = fs.readFileSync(filePath);
      const pdf = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach(page => mergedPdf.addPage(page));
    }

    const pdfBytes = await mergedPdf.save();
    fs.writeFileSync(data.outputPath, pdfBytes);

    return { success: true, message: `Successfully merged ${data.inputFiles.length} PDFs` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// PDF Split Operation
async function pdfSplit(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const totalPages = pdf.getPageCount();

    let splits = [];

    if (data.splitMode === 'pages') {
      // Split by page ranges
      const ranges = data.pageRanges.split(',').map(r => r.trim());
      for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i];
        let pages = [];

        if (range.includes('-')) {
          const [start, end] = range.split('-').map(n => parseInt(n.trim()));
          for (let p = start; p <= end && p <= totalPages; p++) {
            pages.push(p - 1);
          }
        } else {
          const page = parseInt(range);
          if (page > 0 && page <= totalPages) {
            pages.push(page - 1);
          }
        }

        if (pages.length > 0) {
          splits.push({ pages, name: `part_${i + 1}` });
        }
      }
    } else if (data.splitMode === 'interval') {
      // Split every N pages
      const interval = data.interval;
      for (let i = 0; i < totalPages; i += interval) {
        const pages = [];
        for (let j = i; j < i + interval && j < totalPages; j++) {
          pages.push(j);
        }
        splits.push({ pages, name: `part_${Math.floor(i / interval) + 1}` });
      }
    } else if (data.splitMode === 'size') {
      // Split by size (approximate - we'll split evenly)
      // This is complex, so we'll do a simple even split for now
      const maxSize = data.maxSize * 1024 * 1024; // Convert MB to bytes
      // For simplicity, split into fixed page chunks
      const chunkSize = Math.max(1, Math.floor(totalPages / 5)); // Split into ~5 parts
      for (let i = 0; i < totalPages; i += chunkSize) {
        const pages = [];
        for (let j = i; j < i + chunkSize && j < totalPages; j++) {
          pages.push(j);
        }
        splits.push({ pages, name: `part_${Math.floor(i / chunkSize) + 1}` });
      }
    }

    // Create split PDFs
    const baseName = path.basename(data.inputPath, '.pdf');
    for (const split of splits) {
      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(pdf, split.pages);
      copiedPages.forEach(page => newPdf.addPage(page));

      const outputPath = path.join(data.outputFolder, `${baseName}_${split.name}.pdf`);
      const newPdfBytes = await newPdf.save();
      fs.writeFileSync(outputPath, newPdfBytes);
    }

    return { success: true, message: `Successfully split PDF into ${splits.length} files` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// PDF Compress Operation
async function pdfCompress(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);

    // pdf-lib doesn't have built-in compression, but we can save with default compression
    // For actual compression, we would need additional libraries like Ghostscript
    // For now, we'll save with standard options which provides some compression
    const compressedPdfBytes = await pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50
    });

    fs.writeFileSync(data.outputPath, compressedPdfBytes);

    const originalSize = fs.statSync(data.inputPath).size;
    const compressedSize = fs.statSync(data.outputPath).size;
    const savings = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);

    return {
      success: true,
      message: `PDF compressed. Size reduced by ${savings}% (${(originalSize / 1024).toFixed(1)}KB → ${(compressedSize / 1024).toFixed(1)}KB)`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// PDF Rotate Pages Operation
async function pdfRotate(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const totalPages = pdf.getPageCount();

    let pagesToRotate = [];
    if (data.pages && data.pages.trim()) {
      pagesToRotate = parsePageRanges(data.pages, totalPages);
    } else {
      // Rotate all pages
      pagesToRotate = Array.from({ length: totalPages }, (_, i) => i);
    }

    pagesToRotate.forEach(pageIndex => {
      const page = pdf.getPage(pageIndex);
      page.setRotation(degrees(data.angle));
    });

    const rotatedPdfBytes = await pdf.save();
    fs.writeFileSync(data.outputPath, rotatedPdfBytes);

    return {
      success: true,
      message: `Successfully rotated ${pagesToRotate.length} page(s) by ${data.angle}°`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// PDF Delete Pages Operation
async function pdfDeletePages(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const totalPages = pdf.getPageCount();

    const pagesToDelete = parsePageRanges(data.pages, totalPages);

    // Remove pages in reverse order to maintain indices
    pagesToDelete.sort((a, b) => b - a).forEach(pageIndex => {
      pdf.removePage(pageIndex);
    });

    const newPdfBytes = await pdf.save();
    fs.writeFileSync(data.outputPath, newPdfBytes);

    return {
      success: true,
      message: `Successfully deleted ${pagesToDelete.length} page(s). New PDF has ${totalPages - pagesToDelete.length} pages`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// PDF Reorder Pages Operation
async function pdfReorder(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const totalPages = pdf.getPageCount();

    // Parse new page order
    const newOrder = data.newOrder.split(',').map(n => parseInt(n.trim()) - 1); // Convert to 0-indexed

    // Validate new order
    if (newOrder.length !== totalPages) {
      return { success: false, error: `New order must include all ${totalPages} pages` };
    }

    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdf, newOrder);
    copiedPages.forEach(page => newPdf.addPage(page));

    const reorderedPdfBytes = await newPdf.save();
    fs.writeFileSync(data.outputPath, reorderedPdfBytes);

    return { success: true, message: 'Successfully reordered PDF pages' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// PDF Watermark Operation
async function pdfWatermark(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const totalPages = pdf.getPageCount();

    // Determine which pages to watermark
    let pagesToWatermark = [];
    if (data.pages === 'all') {
      pagesToWatermark = Array.from({ length: totalPages }, (_, i) => i);
    } else if (data.pages === 'custom' && data.customPages) {
      pagesToWatermark = parsePageRanges(data.customPages, totalPages);
    }

    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const color = hexToRgb(data.color);

    for (const pageIndex of pagesToWatermark) {
      const page = pdf.getPage(pageIndex);
      const { width, height } = page.getSize();

      let x, y, rotation = 0;

      // Calculate position based on selected position
      switch (data.position) {
        case 'center':
          x = width / 2;
          y = height / 2;
          break;
        case 'diagonal':
          x = width / 2;
          y = height / 2;
          rotation = 45;
          break;
        case 'top-left':
          x = 50;
          y = height - 50;
          break;
        case 'top-center':
          x = width / 2;
          y = height - 50;
          break;
        case 'top-right':
          x = width - 50;
          y = height - 50;
          break;
        case 'bottom-left':
          x = 50;
          y = 50;
          break;
        case 'bottom-center':
          x = width / 2;
          y = 50;
          break;
        case 'bottom-right':
          x = width - 50;
          y = 50;
          break;
        default:
          x = width / 2;
          y = height / 2;
      }

      page.drawText(data.text, {
        x,
        y,
        size: data.fontSize,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity: data.opacity,
        rotate: degrees(rotation)
      });
    }

    const watermarkedPdfBytes = await pdf.save();
    fs.writeFileSync(data.outputPath, watermarkedPdfBytes);

    return {
      success: true,
      message: `Successfully added watermark to ${pagesToWatermark.length} page(s)`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// PDF Encrypt (Password Protection) Operation
async function pdfEncrypt(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);

    // pdf-lib has limited encryption support in v1.17.1
    // We'll save with password (basic encryption)
    const encryptedPdfBytes = await pdf.save({
      userPassword: data.userPassword,
      ownerPassword: data.ownerPassword || data.userPassword,
      permissions: {
        printing: data.permissions.printing ? 'highResolution' : 'lowResolution',
        modifying: data.permissions.modifying,
        copying: data.permissions.copying,
        annotating: data.permissions.annotating,
        fillingForms: data.permissions.fillingForms,
        contentAccessibility: data.permissions.contentAccessibility,
        documentAssembly: data.permissions.documentAssembly
      }
    });

    fs.writeFileSync(data.outputPath, encryptedPdfBytes);

    return { success: true, message: 'Successfully added password protection to PDF' };
  } catch (error) {
    // If pdf-lib doesn't support encryption in this version, provide a helpful error
    if (error.message.includes('encrypt') || error.message.includes('password')) {
      return {
        success: false,
        error: 'PDF encryption requires pdf-lib with encryption support. This feature may not be available in the current version.'
      };
    }
    return { success: false, error: error.message };
  }
}

// PDF Decrypt (Remove Password) Operation
async function pdfDecrypt(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes, { password: data.password });

    // Save without password
    const decryptedPdfBytes = await pdf.save();
    fs.writeFileSync(data.outputPath, decryptedPdfBytes);

    return { success: true, message: 'Successfully removed password protection from PDF' };
  } catch (error) {
    if (error.message.includes('password') || error.message.includes('encrypted')) {
      return { success: false, error: 'Incorrect password or PDF is not encrypted' };
    }
    return { success: false, error: error.message };
  }
}

// PDF Permissions Operation
async function pdfSetPermissions(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const loadOptions = data.currentPassword ? { password: data.currentPassword } : {};
    const pdf = await PDFDocument.load(pdfBytes, loadOptions);

    const newPdfBytes = await pdf.save({
      ownerPassword: data.ownerPassword,
      permissions: {
        printing: data.permissions.printing ? 'highResolution' : 'lowResolution',
        modifying: data.permissions.modifying,
        copying: data.permissions.copying,
        annotating: data.permissions.annotating,
        fillingForms: data.permissions.fillingForms,
        contentAccessibility: data.permissions.contentAccessibility,
        documentAssembly: data.permissions.documentAssembly
      }
    });

    fs.writeFileSync(data.outputPath, newPdfBytes);

    return { success: true, message: 'Successfully updated PDF permissions' };
  } catch (error) {
    if (error.message.includes('encrypt') || error.message.includes('permission')) {
      return {
        success: false,
        error: 'PDF permissions require pdf-lib with encryption support. This feature may not be available in the current version.'
      };
    }
    return { success: false, error: error.message };
  }
}

// IPC Handler for PDF Operations
ipcMain.on('process-pdf-operation', async (event, data) => {
  try {
    mainWindow.webContents.send('pdf-operation-progress', {
      message: `Processing ${data.operation}...`,
      progress: 10
    });

    let result;

    switch (data.operation) {
      case 'merge':
        result = await pdfMerge(data);
        break;
      case 'split':
        result = await pdfSplit(data);
        break;
      case 'compress':
        result = await pdfCompress(data);
        break;
      case 'rotate':
        result = await pdfRotate(data);
        break;
      case 'delete':
        result = await pdfDeletePages(data);
        break;
      case 'reorder':
        result = await pdfReorder(data);
        break;
      case 'watermark':
        result = await pdfWatermark(data);
        break;
      case 'encrypt':
        result = await pdfEncrypt(data);
        break;
      case 'decrypt':
        result = await pdfDecrypt(data);
        break;
      case 'permissions':
        result = await pdfSetPermissions(data);
        break;
      default:
        result = { success: false, error: `Unknown operation: ${data.operation}` };
    }

    mainWindow.webContents.send('pdf-operation-complete', result);
  } catch (error) {
    mainWindow.webContents.send('pdf-operation-complete', {
      success: false,
      error: error.message
    });
  }
});

// IPC Handler for getting PDF page count
ipcMain.on('get-pdf-page-count', async (event, filePath) => {
  try {
    const pdfBytes = fs.readFileSync(filePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const count = pdf.getPageCount();
    event.reply('pdf-page-count', { count });
  } catch (error) {
    event.reply('pdf-page-count', { error: error.message });
  }
});

// IPC Handler for folder selection (for PDF operations)
ipcMain.on('select-pdf-folder', (event, inputId) => {
  const folder = dialog.showOpenDialogSync(mainWindow, {
    properties: ['openDirectory']
  });

  if (folder && folder[0]) {
    event.reply('pdf-folder-selected', { inputId, path: folder[0] });
  }
});