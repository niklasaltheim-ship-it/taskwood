; Nach der Deinstallation auch den gemerkten Installationsordner aus der Registry entfernen.
; Die Nutzerdaten (WebView-Ordner) bleiben wie üblich erhalten, außer man wählt
; im Uninstaller "Anwendungsdaten löschen".
!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Drahtgeber\Taskwood"
  DeleteRegKey /ifempty HKCU "Software\Drahtgeber"
!macroend

; Autostart-Eintrag (Einstellung "Mit Windows starten") beim Deinstallieren entfernen
!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Taskwood"
!macroend
