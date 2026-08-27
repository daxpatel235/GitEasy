; Installer hooks for GitEasy.
;
; Tauri's NSIS template already creates the Start Menu entry, the uninstaller
; and the Add/Remove Programs registration. These hooks add the one thing it
; does not: a desktop shortcut, created on install and removed on uninstall,
; the same way the VS Code setup does it.
;
; $INSTDIR is where the app was installed, and ${MAINBINARYNAME} is the exe
; name Tauri generated — both are provided by the template.

!macro NSIS_HOOK_POSTINSTALL
  ; A desktop icon, pointing at the installed executable.
  CreateShortcut "$DESKTOP\GitEasy.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Leaving a dead shortcut behind after an uninstall is the thing people
  ; notice, so it goes first — before the executable it points at is removed.
  Delete "$DESKTOP\GitEasy.lnk"
!macroend
