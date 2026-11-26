; NSIS hooks for the installer, included through bundle.windows.nsis.installerHooks.
;
; todoflow-mcp.exe is bundled as a sidecar and MCP clients (Claude Desktop and
; friends) keep it running. A running exe can neither be overwritten nor
; deleted, but it can be renamed: move the in-use file aside, write the new one
; under the original name, and remove the old file once its process is gone.
; The installer template only checks whether the main binary is running, so the
; sidecar is handled here.

!include LogicLib.nsh

; Overridable so that a small test installer can exercise these macros on another file.
!ifndef TODOFLOW_SIDECAR
  !define TODOFLOW_SIDECAR "todoflow-mcp.exe"
!endif

!macro NSIS_HOOK_PREINSTALL
  ; Leftovers from earlier upgrades: the process behind them has usually ended
  ; by now, so try to delete them first.
  Delete "$INSTDIR\${TODOFLOW_SIDECAR}.old*"
  Push $R8
  Push $R9
  ${If} ${FileExists} "$INSTDIR\${TODOFLOW_SIDECAR}"
    ; A leftover that is still in use cannot be replaced, so fall through to
    ; .old1, .old2, ... until a free name is found.
    StrCpy $R8 "$INSTDIR\${TODOFLOW_SIDECAR}.old"
    ${For} $R9 1 5
      ClearErrors
      Rename "$INSTDIR\${TODOFLOW_SIDECAR}" "$R8"
      IfErrors 0 todoflow_sidecar_moved
      StrCpy $R8 "$INSTDIR\${TODOFLOW_SIDECAR}.old$R9"
    ${Next}
    todoflow_sidecar_moved:
  ${EndIf}
  Pop $R9
  Pop $R8
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; The previous server may still be running from the renamed file: leave it,
  ; a later install or the uninstaller removes it.
  Delete /REBOOTOK "$INSTDIR\${TODOFLOW_SIDECAR}.old*"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete /REBOOTOK "$INSTDIR\${TODOFLOW_SIDECAR}.old*"
!macroend
