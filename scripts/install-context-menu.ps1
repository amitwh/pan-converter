# PanConverter Context Menu Installation Script
# This script installs PanConverter context menu integration for Windows Explorer

param(
    [switch]$Uninstall = $false
)

# Check if running as administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "This script requires Administrator privileges. Restarting with elevated permissions..." -ForegroundColor Yellow
    Start-Process PowerShell -Verb RunAs "-File `"$PSCommandPath`" $(if ($Uninstall) { '-Uninstall' })"
    exit
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appPath = "${env:LOCALAPPDATA}\Programs\PanConverter\PanConverter.exe"

if ($Uninstall) {
    Write-Host "Uninstalling PanConverter context menu integration..." -ForegroundColor Yellow
    $regFile = Join-Path $scriptDir "uninstall-context-menu.reg"
    
    if (Test-Path $regFile) {
        reg import $regFile
        if ($LASTEXITCODE -eq 0) {
            Write-Host "PanConverter context menu has been successfully removed!" -ForegroundColor Green
        } else {
            Write-Host "Failed to remove context menu entries." -ForegroundColor Red
        }
    } else {
        Write-Host "Uninstall registry file not found: $regFile" -ForegroundColor Red
    }
} else {
    Write-Host "Installing PanConverter context menu integration..." -ForegroundColor Yellow
    
    # Check if PanConverter is installed
    if (-not (Test-Path $appPath)) {
        Write-Host "Warning: PanConverter executable not found at: $appPath" -ForegroundColor Yellow
        Write-Host "Please make sure PanConverter is installed before running this script." -ForegroundColor Yellow
        $continue = Read-Host "Continue anyway? (y/N)"
        if ($continue -ne 'y' -and $continue -ne 'Y') {
            exit
        }
    }
    
    $regFile = Join-Path $scriptDir "install-context-menu.reg"
    
    if (Test-Path $regFile) {
        reg import $regFile
        if ($LASTEXITCODE -eq 0) {
            Write-Host "PanConverter context menu has been successfully installed!" -ForegroundColor Green
            Write-Host "" 
            Write-Host "You can now right-click on supported files (MD, HTML, DOCX, PDF, etc.) and select:" -ForegroundColor Cyan
            Write-Host "• 'Convert with PanConverter' - Shows conversion dialog" -ForegroundColor Cyan
            Write-Host "• 'PanConverter > Convert to...' - Direct conversion options (for Markdown files)" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "Supported file types: .md, .markdown, .html, .htm, .docx, .odt, .rtf, .tex, .pdf, .pptx, .ppt, .odp" -ForegroundColor Gray
        } else {
            Write-Host "Failed to install context menu entries." -ForegroundColor Red
        }
    } else {
        Write-Host "Install registry file not found: $regFile" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")