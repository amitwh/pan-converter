@echo off
echo PanConverter Context Menu Uninstallation
echo ========================================
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

echo Removing context menu entries...
reg import "%~dp0uninstall-context-menu.reg"

if %errorLevel% == 0 (
    echo.
    echo Context menu integration removed successfully!
    echo PanConverter entries have been removed from the Windows Explorer context menu.
) else (
    echo.
    echo Failed to remove context menu entries.
    echo Please check that the registry file exists and try again.
)

echo.
pause