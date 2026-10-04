; ============================================================
; KubeJS 物品属性编辑器 —— 自定义卸载流程
;
; 通过 electron-builder 的 nsis.include 引入（见 electron-builder.yml）。
; electron-builder 会把 customUnInit 插到卸载器的 .onInit，
; 把 customUnInstall 插到卸载段（见 app-builder-lib/templates/nsis/uninstaller.nsh）。
;
; 目标：
;  1) 执行前弹窗询问用户是否卸载，并告知会删除哪些文件、不会删除哪些文件；
;  2) 由用户决定是否一并删除配置与编辑记录；
;  3) **绝不触碰游戏目录**：kubejs/ 下已生成的 .js 脚本、config/ 配置、游戏存档全部保留。
; ============================================================

!define KUBEIE_SHORTCUT_NAME "KubeIE"

; 安装：创建桌面 / 开始菜单快捷方式，图标用 exe 同目录的 icon.ico。
; （electron-builder.yml 里已关闭它自带的快捷方式创建，避免图标退回默认 Electron 图标）
!macro customInstall
  CreateShortCut "$DESKTOP\${KUBEIE_SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\icon.ico" 0
  CreateDirectory "$SMPROGRAMS\${KUBEIE_SHORTCUT_NAME}"
  CreateShortCut "$SMPROGRAMS\${KUBEIE_SHORTCUT_NAME}\${KUBEIE_SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\icon.ico" 0
!macroend

!macro customUnInit
  MessageBox MB_YESNO|MB_ICONEXCLAMATION \
    "即将卸载「KubeIE」。$\r$\n$\r$\n将删除：$\r$\n    1. 程序安装目录：$INSTDIR$\r$\n    2. 桌面 / 开始菜单快捷方式$\r$\n    3. 用户配置与编辑记录：$APPDATA\kubeie（下一步单独询问是否删除）$\r$\n$\r$\n不会删除：$\r$\n    - 游戏目录 kubejs\ 下已生成的 .js 脚本$\r$\n    - 游戏目录 config\ 下的配置文件$\r$\n    - 任何游戏存档$\r$\n$\r$\n确定要继续卸载吗？" \
    /SD IDYES IDYES kubeie_uninstall_continue
  Abort

  kubeie_uninstall_continue:
!macroend

!macro customUnInstall
  ; 删除安装时自建的快捷方式（electron-builder 自带的快捷方式创建已关闭）
  Delete "$DESKTOP\${KUBEIE_SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${KUBEIE_SHORTCUT_NAME}\${KUBEIE_SHORTCUT_NAME}.lnk"
  RMDir "$SMPROGRAMS\${KUBEIE_SHORTCUT_NAME}"

  MessageBox MB_YESNO|MB_ICONQUESTION \
    "是否同时删除用户配置与编辑记录？$\r$\n$\r$\n目录：$APPDATA\kubeie$\r$\n（包含 config.json、编辑记录、物品库 / 饰品库等）$\r$\n$\r$\n选择「否」会保留这些文件，下次安装可继续使用；$\r$\n无论选哪个，都不会删除游戏目录里已生成的脚本。" \
    /SD IDNO IDNO kubeie_uninstall_keep_data
  RMDir /r "$APPDATA\kubeie"
  ; 兼容更名前（KubeIE 之前叫 kubejs-item-editor）留下的旧数据目录
  RMDir /r "$APPDATA\kubejs-item-editor"

  kubeie_uninstall_keep_data:
!macroend
