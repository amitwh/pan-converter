# PanConverter Windows Explorer Context Menu Integration

This directory contains scripts to add PanConverter to the Windows Explorer context menu, allowing you to right-click on files and convert them directly without opening the full application.

## Features

### Context Menu Options
- **Convert with PanConverter**: Shows a format selection dialog for any supported file
- **PanConverter > Convert to...**: Direct conversion options (for Markdown files)
  - PDF
  - HTML  
  - DOCX
  - LaTeX
  - PowerPoint

### Supported File Types
- **Markdown**: `.md`, `.markdown`
- **HTML**: `.html`, `.htm`
- **Documents**: `.docx`, `.odt`, `.rtf`
- **LaTeX**: `.tex`
- **PDF**: `.pdf`
- **Presentations**: `.pptx`, `.ppt`, `.odp`

## Installation Methods

### Method 1: Automatic (During PanConverter Installation)
When installing PanConverter using the Windows installer, you'll be prompted to install context menu integration automatically.

### Method 2: Manual Installation

#### Using PowerShell (Recommended)
1. Right-click on `install-context-menu.ps1`
2. Select "Run with PowerShell"
3. Follow the prompts (will request administrator privileges)

#### Using Batch File
1. Right-click on `install-context-menu.bat`
2. Select "Run as administrator"
3. Follow the prompts

#### Using Registry File Directly
1. Right-click on `install-context-menu.reg`
2. Select "Merge" 
3. Confirm the registry modification

## Uninstallation

### Using PowerShell
```powershell
.\install-context-menu.ps1 -Uninstall
```

### Using Batch File
Run `uninstall-context-menu.bat` as administrator

### Using Registry File
Run `uninstall-context-menu.reg`

## How It Works

### Command Line Interface
The context menu integration works by passing command line arguments to PanConverter:

- `--convert <file>`: Shows conversion dialog for the specified file
- `--convert-to <format> <file>`: Directly converts to the specified format

### Examples
```batch
# Show conversion dialog
PanConverter.exe --convert "document.md"

# Direct conversion to PDF
PanConverter.exe --convert-to pdf "document.md"
```

### Conversion Process
1. PanConverter reads the input file
2. Creates a temporary file if needed
3. Uses Pandoc to convert to the target format
4. Saves the output in the same directory as the input file
5. Shows a Windows notification when complete

## Requirements

- PanConverter must be installed in the default location: `%LOCALAPPDATA%\Programs\PanConverter\`
- Pandoc must be installed and accessible from the command line
- Administrator privileges required for registry modifications

## Troubleshooting

### Context Menu Not Appearing
1. Ensure you ran the installation script as administrator
2. Try logging out and back in, or restart Windows Explorer
3. Check if PanConverter is installed in the expected location

### Conversion Failures
1. Verify Pandoc is installed: `pandoc --version`
2. Check if the input file is not corrupted or locked
3. Ensure you have write permissions in the output directory

### Permission Errors
- The installation scripts require administrator privileges to modify the registry
- If you get permission errors, right-click and "Run as administrator"

## File Descriptions

- `install-context-menu.reg`: Registry entries for context menu
- `uninstall-context-menu.reg`: Registry entries removal
- `install-context-menu.ps1`: PowerShell installation script
- `install-context-menu.bat`: Batch installation script  
- `uninstall-context-menu.bat`: Batch uninstallation script
- `nsis-installer.nsh`: NSIS installer integration script

## Security Note

The scripts modify the Windows registry to add context menu entries. Only run these scripts if you trust the source and understand the changes being made to your system.