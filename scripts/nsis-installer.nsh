; PanConverter NSIS Installer Include File
; Handles context menu installation and uninstallation

!include "LogicLib.nsh"
!include "MUI2.nsh"

; Custom installation page for context menu option
Var ContextMenuCheckbox
Var ContextMenuState

Function ContextMenuPage
    !insertmacro MUI_HEADER_TEXT "Additional Options" "Choose additional installation options"
    
    nsDialogs::Create 1018
    Pop $0
    
    ${If} $0 == error
        Abort
    ${EndIf}
    
    ${NSD_CreateLabel} 0 0 100% 20u "Select additional features to install:"
    Pop $0
    
    ${NSD_CreateCheckbox} 20u 30u 280u 15u "Add PanConverter to Windows Explorer context menu"
    Pop $ContextMenuCheckbox
    ${NSD_SetState} $ContextMenuCheckbox ${BST_CHECKED}
    
    ${NSD_CreateLabel} 20u 50u 280u 30u "This will allow you to right-click on supported files and convert them directly using PanConverter."
    Pop $0
    
    nsDialogs::Show
FunctionEnd

Function ContextMenuPageLeave
    ${NSD_GetState} $ContextMenuCheckbox $ContextMenuState
FunctionEnd

; Install context menu entries
Function InstallContextMenu
    ${If} $ContextMenuState == ${BST_CHECKED}
        DetailPrint "Installing context menu integration..."
        
        ; Create registry entries for context menu
        WriteRegStr HKCR ".md\shell\PanConverter" "" "Convert with PanConverter"
        WriteRegStr HKCR ".md\shell\PanConverter" "Icon" "$INSTDIR\PanConverter.exe"
        WriteRegStr HKCR ".md\shell\PanConverter\command" "" '"$INSTDIR\PanConverter.exe" --convert "%1"'
        
        WriteRegStr HKCR ".markdown\shell\PanConverter" "" "Convert with PanConverter"  
        WriteRegStr HKCR ".markdown\shell\PanConverter" "Icon" "$INSTDIR\PanConverter.exe"
        WriteRegStr HKCR ".markdown\shell\PanConverter\command" "" '"$INSTDIR\PanConverter.exe" --convert "%1"'
        
        ; Context menu for HTML files
        WriteRegStr HKCR ".html\shell\PanConverter" "" "Convert with PanConverter"
        WriteRegStr HKCR ".html\shell\PanConverter" "Icon" "$INSTDIR\PanConverter.exe"
        WriteRegStr HKCR ".html\shell\PanConverter\command" "" '"$INSTDIR\PanConverter.exe" --convert "%1"'
        
        WriteRegStr HKCR ".htm\shell\PanConverter" "" "Convert with PanConverter"
        WriteRegStr HKCR ".htm\shell\PanConverter" "Icon" "$INSTDIR\PanConverter.exe"
        WriteRegStr HKCR ".htm\shell\PanConverter\command" "" '"$INSTDIR\PanConverter.exe" --convert "%1"'
        
        ; Context menu for DOCX files
        WriteRegStr HKCR ".docx\shell\PanConverter" "" "Convert with PanConverter"
        WriteRegStr HKCR ".docx\shell\PanConverter" "Icon" "$INSTDIR\PanConverter.exe"
        WriteRegStr HKCR ".docx\shell\PanConverter\command" "" '"$INSTDIR\PanConverter.exe" --convert "%1"'
        
        ; Context menu for ODT files
        WriteRegStr HKCR ".odt\shell\PanConverter" "" "Convert with PanConverter"
        WriteRegStr HKCR ".odt\shell\PanConverter" "Icon" "$INSTDIR\PanConverter.exe"
        WriteRegStr HKCR ".odt\shell\PanConverter\command" "" '"$INSTDIR\PanConverter.exe" --convert "%1"'
        
        ; Context menu for RTF files
        WriteRegStr HKCR ".rtf\shell\PanConverter" "" "Convert with PanConverter"
        WriteRegStr HKCR ".rtf\shell\PanConverter" "Icon" "$INSTDIR\PanConverter.exe"
        WriteRegStr HKCR ".rtf\shell\PanConverter\command" "" '"$INSTDIR\PanConverter.exe" --convert "%1"'
        
        ; Context menu for LaTeX files
        WriteRegStr HKCR ".tex\shell\PanConverter" "" "Convert with PanConverter"
        WriteRegStr HKCR ".tex\shell\PanConverter" "Icon" "$INSTDIR\PanConverter.exe"
        WriteRegStr HKCR ".tex\shell\PanConverter\command" "" '"$INSTDIR\PanConverter.exe" --convert "%1"'
        
        ; Context menu for PDF files
        WriteRegStr HKCR ".pdf\shell\PanConverter" "" "Convert with PanConverter"
        WriteRegStr HKCR ".pdf\shell\PanConverter" "Icon" "$INSTDIR\PanConverter.exe"
        WriteRegStr HKCR ".pdf\shell\PanConverter\command" "" '"$INSTDIR\PanConverter.exe" --convert "%1"'
        
        ; Context menu for PowerPoint files
        WriteRegStr HKCR ".pptx\shell\PanConverter" "" "Convert with PanConverter"
        WriteRegStr HKCR ".pptx\shell\PanConverter" "Icon" "$INSTDIR\PanConverter.exe"
        WriteRegStr HKCR ".pptx\shell\PanConverter\command" "" '"$INSTDIR\PanConverter.exe" --convert "%1"'
        
        WriteRegStr HKCR ".ppt\shell\PanConverter" "" "Convert with PanConverter"
        WriteRegStr HKCR ".ppt\shell\PanConverter" "Icon" "$INSTDIR\PanConverter.exe"
        WriteRegStr HKCR ".ppt\shell\PanConverter\command" "" '"$INSTDIR\PanConverter.exe" --convert "%1"'
        
        ; Context menu for ODP files
        WriteRegStr HKCR ".odp\shell\PanConverter" "" "Convert with PanConverter"
        WriteRegStr HKCR ".odp\shell\PanConverter" "Icon" "$INSTDIR\PanConverter.exe"
        WriteRegStr HKCR ".odp\shell\PanConverter\command" "" '"$INSTDIR\PanConverter.exe" --convert "%1"'
        
        ; Submenu for Markdown files with direct conversion options
        WriteRegStr HKCR ".md\shell\PanConverterMenu" "" "PanConverter"
        WriteRegStr HKCR ".md\shell\PanConverterMenu" "MUIVerb" "Convert to..."
        WriteRegStr HKCR ".md\shell\PanConverterMenu" "Icon" "$INSTDIR\PanConverter.exe"
        WriteRegStr HKCR ".md\shell\PanConverterMenu" "SubCommands" ""
        
        WriteRegStr HKCR ".md\shell\PanConverterMenu\shell\PDF" "" "PDF"
        WriteRegStr HKCR ".md\shell\PanConverterMenu\shell\PDF\command" "" '"$INSTDIR\PanConverter.exe" --convert-to pdf "%1"'
        
        WriteRegStr HKCR ".md\shell\PanConverterMenu\shell\HTML" "" "HTML"
        WriteRegStr HKCR ".md\shell\PanConverterMenu\shell\HTML\command" "" '"$INSTDIR\PanConverter.exe" --convert-to html "%1"'
        
        WriteRegStr HKCR ".md\shell\PanConverterMenu\shell\DOCX" "" "DOCX"
        WriteRegStr HKCR ".md\shell\PanConverterMenu\shell\DOCX\command" "" '"$INSTDIR\PanConverter.exe" --convert-to docx "%1"'
        
        WriteRegStr HKCR ".md\shell\PanConverterMenu\shell\LaTeX" "" "LaTeX"
        WriteRegStr HKCR ".md\shell\PanConverterMenu\shell\LaTeX\command" "" '"$INSTDIR\PanConverter.exe" --convert-to latex "%1"'
        
        WriteRegStr HKCR ".md\shell\PanConverterMenu\shell\PPTX" "" "PowerPoint"
        WriteRegStr HKCR ".md\shell\PanConverterMenu\shell\PPTX\command" "" '"$INSTDIR\PanConverter.exe" --convert-to pptx "%1"'
        
        DetailPrint "Context menu integration installed successfully!"
    ${EndIf}
FunctionEnd

; Uninstall context menu entries
Function un.RemoveContextMenu
    DetailPrint "Removing context menu integration..."
    
    ; Remove context menu entries for all file types
    DeleteRegKey HKCR ".md\shell\PanConverter"
    DeleteRegKey HKCR ".md\shell\PanConverterMenu"
    DeleteRegKey HKCR ".markdown\shell\PanConverter"
    DeleteRegKey HKCR ".html\shell\PanConverter"
    DeleteRegKey HKCR ".htm\shell\PanConverter"
    DeleteRegKey HKCR ".docx\shell\PanConverter"
    DeleteRegKey HKCR ".odt\shell\PanConverter"
    DeleteRegKey HKCR ".rtf\shell\PanConverter"
    DeleteRegKey HKCR ".tex\shell\PanConverter"
    DeleteRegKey HKCR ".pdf\shell\PanConverter"
    DeleteRegKey HKCR ".pptx\shell\PanConverter"
    DeleteRegKey HKCR ".ppt\shell\PanConverter"
    DeleteRegKey HKCR ".odp\shell\PanConverter"
    
    DetailPrint "Context menu integration removed successfully!"
FunctionEnd