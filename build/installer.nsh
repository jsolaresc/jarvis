; Instalador de Jarvis: página propia, después de elegir la carpeta.
; Pregunta cómo querés llamar al asistente y qué componentes bajar. Lo elegido queda en
; %APPDATA%\Jarvis\datos\instalacion.txt y Jarvis lo aplica la primera vez que abre
; (ver src/main/componentes.js). En las actualizaciones automáticas esta página no aparece.

; Siempre "solo para mí": no pide permisos de administrador ni muestra la página de modo de instalación.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customPageAfterChangeDir
  !include nsDialogs.nsh
  !include LogicLib.nsh

  Var JarvisDlg
  Var JarvisTxtNombre
  Var JarvisNombre
  Var JarvisCVoz
  Var JarvisCDaniela
  Var JarvisCKokoro
  Var JarvisCFfmpeg
  Var JarvisCYtdlp
  Var JarvisCInicio

  Page custom JarvisOpcionesCrear JarvisOpcionesSalir

  Function JarvisOpcionesCrear
    ${If} ${isUpdated}
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "Tu asistente" "Elegí su nombre y qué querés bajar. Todo se puede cambiar después en Ajustes."
    nsDialogs::Create 1018
    Pop $JarvisDlg
    ${If} $JarvisDlg == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 10u "¿Cómo querés llamarme?"
    Pop $0
    ${If} $JarvisNombre == ""
      StrCpy $JarvisNombre "Jarvis"
    ${EndIf}
    ${NSD_CreateText} 0 11u 55% 13u "$JarvisNombre"
    Pop $JarvisTxtNombre
    ${NSD_CreateLabel} 0 27u 100% 18u "Es la palabra que me despierta: $\"che Jarvis, poné música$\". Puede ser cualquier nombre; si es cortito, decí un saludo antes (che, hey)."
    Pop $0

    ${NSD_CreateLabel} 0 50u 100% 18u "Componentes: se bajan de internet la primera vez que abras el asistente. Lo que no tildes ahora lo podés bajar cuando quieras desde Ajustes → Sistema → Componentes."
    Pop $0
    ${NSD_CreateCheckbox} 0 70u 100% 10u "Escuchar y hablar: modelos de voz (~530 MB, recomendado)"
    Pop $JarvisCVoz
    ${NSD_Check} $JarvisCVoz
    ${NSD_CreateCheckbox} 0 82u 100% 10u "Voz argentina Daniela (~110 MB)"
    Pop $JarvisCDaniela
    ${NSD_CreateCheckbox} 0 94u 100% 10u "Voces más naturales Dora y Alex (Kokoro, ~365 MB)"
    Pop $JarvisCKokoro
    ${NSD_CreateCheckbox} 0 106u 100% 10u "ffmpeg: clips de pantalla, notas de voz y unir video al descargar (~80 MB)"
    Pop $JarvisCFfmpeg
    ${NSD_CreateCheckbox} 0 118u 100% 10u "yt-dlp: $\"descargá este video$\" de YouTube y otros sitios (~18 MB)"
    Pop $JarvisCYtdlp
    ${NSD_CreateCheckbox} 0 132u 100% 10u "Abrir el asistente al iniciar Windows"
    Pop $JarvisCInicio
    ${NSD_Check} $JarvisCInicio

    nsDialogs::Show
  FunctionEnd

  Function JarvisOpcionesSalir
    ${NSD_GetText} $JarvisTxtNombre $JarvisNombre
    ${If} $JarvisNombre == ""
      StrCpy $JarvisNombre "Jarvis"
    ${EndIf}

    ; La carpeta de datos es la del usuario que instala (aunque el instalador corra elevado).
    ReadEnvStr $0 APPDATA
    CreateDirectory "$0\Jarvis\datos"
    ClearErrors
    FileOpen $1 "$0\Jarvis\datos\instalacion.txt" w
    ${If} ${Errors}
      Return
    ${EndIf}
    FileWriteWord $1 0xFEFF
    FileWriteUTF16LE $1 "nombre=$JarvisNombre$\r$\n"
    ${NSD_GetState} $JarvisCVoz $2
    FileWriteUTF16LE $1 "voz=$2$\r$\n"
    ${NSD_GetState} $JarvisCDaniela $2
    FileWriteUTF16LE $1 "voz_daniela=$2$\r$\n"
    ${NSD_GetState} $JarvisCKokoro $2
    FileWriteUTF16LE $1 "voz_kokoro=$2$\r$\n"
    ${NSD_GetState} $JarvisCFfmpeg $2
    FileWriteUTF16LE $1 "ffmpeg=$2$\r$\n"
    ${NSD_GetState} $JarvisCYtdlp $2
    FileWriteUTF16LE $1 "ytdlp=$2$\r$\n"
    ${NSD_GetState} $JarvisCInicio $2
    FileWriteUTF16LE $1 "inicio=$2$\r$\n"
    FileClose $1
  FunctionEnd
!macroend
