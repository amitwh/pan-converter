@echo off
echo PanConverter Context Menu Installation
echo =====================================
echo.

REM Check for administrator privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Running with administrator privileges...
) else (
    echo This script requires administrator privileges.
    echo Please right-click and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

REM Check if PanConverter is installed
if not exist "%LOCALAPPDATA%\Programs\PanConverter\PanConverter.exe" (
    echo Warning: PanConverter not found at the expected location.
    echo Please ensure PanConverter is installed before continuing.
    echo Expected location: %LOCALAPPDATA%\Programs\PanConverter\PanConverter.exe
    echo.
    set /p continue="Continue anyway? (y/N): "
    if /i not "%continue%"=="y" exit /b 1
)

echo Installing context menu entries...
reg import "%~dp0install-context-menu.reg"

if %errorLevel% == 0 (
    echo.
    echo Context menu integration installed successfully!
    echo.
    echo You can now right-click on supported files and select:
    echo • "Convert with PanConverter" - Shows conversion dialog  
    echo • "PanConverter > Convert to..." - Direct conversion ^(for Markdown^)
    echo.
    echo Supported file types:
    echo .md .markdown .html .htm .docx .odt .rtf .tex .pdf .pptx .ppt .odp
) else (
    echo.
    echo Failed to install context menu entries.
    echo Please check that the registry file exists and try again.
)

echo.
pause