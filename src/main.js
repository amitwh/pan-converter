const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const Store = require('electron-store');

const store = new Store();

let mainWindow;
let currentFile = null;

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
          label: 'Export',
          submenu: [
            { label: 'HTML', click: () => exportFile('html') },
            { label: 'PDF', click: () => exportFile('pdf') },
            { label: 'DOCX', click: () => exportFile('docx') },
            { label: 'LaTeX', click: () => exportFile('latex') },
            { label: 'RTF', click: () => exportFile('rtf') },
            { label: 'ODT', click: () => exportFile('odt') },
            { label: 'EPUB', click: () => exportFile('epub') }
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
        { label: 'Redo', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
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
              title: 'About Pan Converter',
              message: 'Pan Converter',
              detail: 'A cross-platform Markdown editor and converter using Pandoc.\n\nVersion: 1.0.0\nLicense: MIT',
              buttons: ['OK']
            });
          }
        },
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/yourusername/pan-converter')
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
    const pandocCmd = `pandoc "${currentFile}" -o "${outputFile}"`;
    
    exec(pandocCmd, (error, stdout, stderr) => {
      if (error) {
        dialog.showErrorBox('Export Error', `Failed to export: ${error.message}\n\nMake sure Pandoc is installed.`);
      } else {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Export Complete',
          message: `File exported successfully to ${outputFile}`,
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

app.whenReady().then(createWindow);

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