; Baglib setup wizard: adds the welcome page, an options page and Arabic for the template's install-mode page.
; 1033 is English and 1025 is Arabic. The LANG_ names are not defined yet when this file is included.
; electron-builder ships no Arabic for its install-mode page, so these replace its English fallback.

!include nsDialogs.nsh

LangString baglibOptionsTitle 1033 "Setup options"
LangString baglibOptionsTitle 1025 "خيارات التثبيت"
LangString baglibOptionsSubtitle 1033 "Choose how Baglib fits into Windows."
LangString baglibOptionsSubtitle 1025 "اختر كيف يعمل بَغْلِب مع ويندوز."
LangString baglibOptionDesktop 1033 "Create a desktop shortcut"
LangString baglibOptionDesktop 1025 "إنشاء اختصار على سطح المكتب"
LangString baglibOptionStartMenu 1033 "Create a Start menu shortcut"
LangString baglibOptionStartMenu 1025 "إنشاء اختصار في قائمة ابدأ"
LangString baglibOptionAssociations 1033 "Add Baglib to Open with for books (PDF, EPUB, MOBI and more)"
LangString baglibOptionAssociations 1025 "إضافة بَغْلِب إلى قائمة الفتح بواسطة للكتب (PDF وEPUB وMOBI وغيرها)"
LangString baglibOptionOcr 1033 "Install text recognition (OCR) with Arabic and English data, about 240 MB"
LangString baglibOptionOcr 1025 "تثبيت التعرف الضوئي على النصوص مع بيانات العربية والإنجليزية، نحو 240 ميغابايت"

!macro baglibAssistedArabic
  LangString chooseInstallationOptions 1025 "اختر خيارات التثبيت"
  LangString chooseUninstallationOptions 1025 "اختر خيارات إلغاء التثبيت"
  LangString whichInstallationShouldBeRemoved 1025 "أي نسخة تريد إزالتها؟"
  LangString whoShouldThisApplicationBeInstalledFor 1025 "لمن تريد تثبيت هذا البرنامج؟"
  LangString selectUserMode 1025 "حدد هل تريد إتاحة هذا البرنامج لجميع المستخدمين أم لك وحدك"
  LangString whichInstallationRemove 1025 "هذا البرنامج مثبت لجميع المستخدمين ولهذا المستخدم أيضًا.$\r$\nأي نسخة تريد إزالتها؟"
  LangString freshInstallForAll 1025 "تثبيت جديد لجميع المستخدمين. (ستُطلب بيانات المسؤول)"
  LangString freshInstallForCurrent 1025 "تثبيت جديد للمستخدم الحالي فقط."
  LangString onlyForMe 1025 "لي &وحدي"
  LangString forAll 1025 "كل من يستخدم هذا الجهاز (&جميع المستخدمين)"
  LangString loginWithAdminAccount 1025 "يجب تسجيل الدخول بحساب ضمن مجموعة المسؤولين للمتابعة..."
  LangString perUserInstallExists 1025 "توجد نسخة مثبتة لهذا المستخدم."
  LangString perUserInstall 1025 "توجد نسخة مثبتة لهذا المستخدم."
  LangString perMachineInstallExists 1025 "توجد نسخة مثبتة لهذا الجهاز."
  LangString perMachineInstall 1025 "توجد نسخة مثبتة لهذا الجهاز."
  LangString reinstallUpgrade 1025 "ستُعاد عملية التثبيت أو الترقية."
  LangString uninstall 1025 "ستُلغى عملية التثبيت."
!macroend

; APP_UNASSOCIATE leaves the extension pointing at the class it deleted, which could orphan a real .pdf.
!macro baglibUnregisterFileType EXT FILECLASS
  !insertmacro APP_UNASSOCIATE "${EXT}" "${FILECLASS}"
  DeleteRegValue SHCTX "Software\Classes\.${EXT}" ""
!macroend

; Must match fileAssociations in electron-builder.yml. tests/services/installer-script.test.ts checks this.
!macro baglibRemoveFileAssociations
  ; associations-begin
  !insertmacro baglibUnregisterFileType "epub" "Electronic Publication"
  !insertmacro baglibUnregisterFileType "pdf" "Portable Document Format"
  !insertmacro baglibUnregisterFileType "mobi" "Mobipocket E-Book"
  !insertmacro baglibUnregisterFileType "azw3" "Kindle Format 8"
  !insertmacro baglibUnregisterFileType "azw" "Amazon Kindle E-Book"
  !insertmacro baglibUnregisterFileType "fb2" "FictionBook 2.0"
  !insertmacro baglibUnregisterFileType "cbz" "Comic Book Zip"
  !insertmacro baglibUnregisterFileType "cbr" "Comic Book RAR"
  !insertmacro baglibUnregisterFileType "cbt" "Comic Book Tar"
  !insertmacro baglibUnregisterFileType "cb7" "Comic Book 7z"
  !insertmacro baglibUnregisterFileType "txt" "Plain Text Document"
  !insertmacro baglibUnregisterFileType "md" "Markdown Document"
  !insertmacro baglibUnregisterFileType "docx" "Microsoft Word Document"
  ; associations-end
!macroend

!macro customHeader
  ; Runs after electron-builder's fallback strings, so these win.
  !insertmacro baglibAssistedArabic

  !ifndef BUILD_UNINSTALLER
    Var baglibOptionsShown
    Var baglibDesktopBox
    Var baglibStartMenuBox
    Var baglibAssociationsBox
    Var baglibDesktop
    Var baglibStartMenu
    Var baglibAssociations
    Var baglibSkipTypes
    Var baglibOcrBox
    Var baglibOcr
    Var baglibSkipOcr

    Function baglibOptionsShow
      ; An update keeps the choices made at first install.
      ${if} ${isUpdated}
        Abort
      ${endIf}
      ${if} $baglibOptionsShown != "1"
        StrCpy $baglibDesktop ${BST_CHECKED}
        StrCpy $baglibStartMenu ${BST_CHECKED}
        StrCpy $baglibAssociations ${BST_CHECKED}
        StrCpy $baglibOcr ${BST_CHECKED}
      ${endIf}
      !insertmacro MUI_HEADER_TEXT "$(baglibOptionsTitle)" "$(baglibOptionsSubtitle)"
      nsDialogs::Create 1018
      Pop $0
      ${NSD_CreateCheckbox} 0 8u 100% 14u "$(baglibOptionDesktop)"
      Pop $baglibDesktopBox
      ${NSD_SetState} $baglibDesktopBox $baglibDesktop
      ${NSD_CreateCheckbox} 0 30u 100% 14u "$(baglibOptionStartMenu)"
      Pop $baglibStartMenuBox
      ${NSD_SetState} $baglibStartMenuBox $baglibStartMenu
      ${NSD_CreateCheckbox} 0 52u 100% 14u "$(baglibOptionAssociations)"
      Pop $baglibAssociationsBox
      ${NSD_SetState} $baglibAssociationsBox $baglibAssociations
      ${NSD_CreateCheckbox} 0 74u 100% 14u "$(baglibOptionOcr)"
      Pop $baglibOcrBox
      ${NSD_SetState} $baglibOcrBox $baglibOcr
      ; nsDialogs mirrors the text but not the box, so Arabic moves it to the right by hand.
      ${if} "$(^RTL)" == "1"
        ${NSD_AddStyle} $baglibDesktopBox 0x220
        ${NSD_AddStyle} $baglibStartMenuBox 0x220
        ${NSD_AddStyle} $baglibAssociationsBox 0x220
        ${NSD_AddStyle} $baglibOcrBox 0x220
      ${endIf}
      nsDialogs::Show
    FunctionEnd

    Function baglibOptionsLeave
      ${NSD_GetState} $baglibDesktopBox $baglibDesktop
      ${NSD_GetState} $baglibStartMenuBox $baglibStartMenu
      ${NSD_GetState} $baglibAssociationsBox $baglibAssociations
      ${NSD_GetState} $baglibOcrBox $baglibOcr
      StrCpy $baglibOptionsShown "1"
    FunctionEnd
  !endif
!macroend

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customPageAfterChangeDir
  Page custom baglibOptionsShow baglibOptionsLeave
!macroend

!macro customInit
  ; An update removes the old version first, so the saved choice has to be read before that.
  ReadRegStr $baglibSkipTypes HKCU "Software\${APP_GUID}\Setup" "SkipFileAssociations"
  ReadRegStr $baglibSkipOcr HKCU "Software\${APP_GUID}\Setup" "SkipOcr"
!macroend

!macro customInstall
  ; A silent install leaves $baglibOptionsShown empty and keeps the defaults.
  ${if} $baglibOptionsShown == "1"
    ${if} $baglibDesktop != ${BST_CHECKED}
      Delete "$newDesktopLink"
    ${endIf}
    ${if} $baglibStartMenu != ${BST_CHECKED}
      Delete "$newStartMenuLink"
      StrCpy $launchLink "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${endIf}
    ${if} $baglibAssociations == ${BST_CHECKED}
      StrCpy $baglibSkipTypes ""
    ${else}
      StrCpy $baglibSkipTypes "1"
    ${endIf}
    ${if} $baglibOcr == ${BST_CHECKED}
      StrCpy $baglibSkipOcr ""
    ${else}
      StrCpy $baglibSkipOcr "1"
    ${endIf}
  ${endIf}
  ; The template registers file types on every run, so an update re-applies this choice.
  ${if} $baglibSkipTypes == "1"
    !insertmacro baglibRemoveFileAssociations
    WriteRegStr HKCU "Software\${APP_GUID}\Setup" "SkipFileAssociations" "1"
  ${else}
    DeleteRegValue HKCU "Software\${APP_GUID}\Setup" "SkipFileAssociations"
  ${endIf}
  ; Skipped OCR is removed after copying. Running the installer again with the box ticked restores it,
  ; and an update keeps the earlier choice. The app reports OCR as unavailable and falls back.
  ${if} $baglibSkipOcr == "1"
    RMDir /r "$INSTDIR\resources\pdf-engine\tesseract"
    RMDir /r "$INSTDIR\resources\pdf-engine\ocr-best"
    RMDir /r "$INSTDIR\resources\pdf-engine\tessdata"
    WriteRegStr HKCU "Software\${APP_GUID}\Setup" "SkipOcr" "1"
  ${else}
    DeleteRegValue HKCU "Software\${APP_GUID}\Setup" "SkipOcr"
  ${endIf}
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    !insertmacro baglibRemoveFileAssociations
    DeleteRegKey HKCU "Software\${APP_GUID}\Setup"
  ${endIf}
!macroend
