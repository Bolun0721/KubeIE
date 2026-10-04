# KubeIE

> **KubeJS 可视化编辑器** —— 不用手写脚本，点几下就能改物品属性、写配方、造自定义物品、做 Curios 饰品。

针对 **Minecraft 1.20.1 / Forge / KubeJS 6** 的桌面工具（Electron + Vue 3 + TypeScript），
把常见的 KubeJS 脚本编写变成可视化操作，所有生成结果都会校验后再写入游戏目录，并自动备份原文件。

> 📖 完整文档见随包分发的 [`使用手册.md`](./使用手册.md)

---

## 功能一览

| 模块 | 说明 | 脚本落点 |
|---|---|---|
| **物品属性** | 通用属性（堆叠、耐久、稀有度、发光、防火…）与工具属性，支持多模板 | `kubejs/startup_scripts/KubeIE/attributes/` |
| **物品配方** | 选择配方类型 → 填格子 → 生成配方脚本，支持导入已有配方 | `kubejs/server_scripts/KubeIE/recipes/` |
| **物品自定义** | 造型武器 / 工具 / 盔甲 / 食物，可自定义工具等级与盔甲等级 | `kubejs/startup_scripts/KubeIE/items/` |
| **自定义饰品（Curios）** | 饰品本体 + Curios 栏位配置（`curios-common.toml`），含 **21 张事件卡**自由组合 | `kubejs/startup_scripts/KubeIE/curios/`（事件脚本在 `kubejs/server_scripts/KubeIE/curios/`） |
| **食物属性** | 数值、食用速度、食用效果，写入 FoodTweaker 配置 | `config/foodtweaker.json` |

其它特性：

- **编辑记录**：每次写入都留档，按脚本名分组查看，可回看具体改了什么
- **模板机制**：内置多套 KubeJS 属性模板，也可保存自己的修改队列
- **安全写入**：路径校验（禁止写出游戏目录）+ 自动备份（`.js.bak`）+ 临时文件原子写入（UTF-8）
- **数据目录可选**：默认 `%APPDATA%\kubeie`，也支持**便携模式**（数据放程序目录，可整目录拷走）
- **前置模组检测**：启动时自动检查 Curios / kubejs_curios 并在操作日志中提示

支持把生成的脚本按 `KubeIE/` 分类子目录存放（KubeJS 会递归加载，最多 10 层）。

---

## 环境要求

**软件本身**：Windows 10 / 11（x64）

**游戏侧前置**（做饰品必须装）：

| 模组 | 版本 | 必需性 |
|---|---|---|
| Minecraft | 1.20.1 | 必需 |
| Minecraft Forge | 47.x | 必需 |
| [KubeJS](https://kubejs.com/) | `forge-2001.6.x` | 必需 |
| [Curios](https://www.curseforge.com/minecraft/mc-mods/curios) | `5.14.x` | 做饰品必需 |
| kubejs_curios | `1.0.4` | 做饰品必需（缺少时 `attachCuriosCapability` 不存在） |
| FoodTweaker | `1.0.0` | 改食物必需 |

> 软件不会修改游戏本体的任何文件，只在你选定的游戏目录里写入 `kubejs/`、`config/` 下的脚本与配置。

---

## 下载与安装

在 [Releases](../../releases) 页面下载：

| 文件 | 适用场景 |
|---|---|
| `KubeIE-<版本>-setup.exe` | 安装版（含桌面/开始菜单快捷方式，可从系统「应用和功能」卸载） |
| `KubeIE-<版本>-win.zip` | 便携版，**解压即用**，适合放 U 盘或直接分发 |

> 本项目**未做代码签名**，首次运行 Windows SmartScreen 可能提示「未知发布者」，选择「仍要运行」即可。
> 卸载程序**不会删除**游戏目录里已生成的 `.js` 脚本与存档。

---

## 快速上手

1. 启动软件，在引导页选择你的 **游戏版本目录**（例：`.minecraft/versions/1.20.1-Forge_47.4.23`，开了版本隔离时不要选 `.minecraft` 根目录）；
2. 顶部切到对应模块（物品属性 / 物品配方 / 物品自定义）；
3. 在左侧物品列表选物品 → 中间填参数 → 右侧「加入队列」→ 点**应用修改**；
4. 按提示生效：
   - 物品属性 / 自定义物品 / 饰品 → **重启游戏**；
   - 配方 → 游戏内 `/kubejs reload server_scripts` 或 `/reload`；
   - 食物 → `/foodtweaker reload`。

生成的文件在哪、每个字段什么意思、踩过哪些坑（KubeJS 6 API 变更、常见报错排查），都写在 [`使用手册.md`](./使用手册.md) 里。

---

## 开发者

```bash
npm install          # 安装依赖（.npmrc 已配置国内镜像）
npm run dev          # 开发模式（Electron + Vite HMR）
npm run typecheck    # 类型检查（tsc + vue-tsc）
npm test             # 单元 / 集成测试（vitest）
npm run build        # 构建到 out/
npm run dist         # 打包安装包 + 便携 zip 到 release/
```

**技术栈**：Electron 30 · electron-vite · Vue 3 · Element Plus · TypeScript · Vitest · electron-builder

**结构**：

```
src/
├─ main/        主进程：IPC 路由、脚本生成器、文件写入与备份、路径探测
├─ preload/     contextBridge 暴露的类型化 API
├─ renderer/    渲染层（Vue 3 单文件组件 + 组合式 API）
└─ shared/      主/渲染共用：类型、校验、模板、事件卡（curioEvents/）
tests/          Vitest 用例
build/          NSIS 自定义卸载脚本
assets/         图标等静态资源
```

**打包说明**：默认关闭 `win.signAndEditExecutable`（避免 winCodeSign 在无符号链接权限的机器上解压失败而中断打包）；
如需把图标嵌入 exe，请开启 Windows 开发者模式后参照使用手册 Q10 配置。

---

## 免责声明

- 本项目为**第三方工具**，与 Mojang / Microsoft / KubeJS 官方无关；
- 仓库内**不包含**任何 Minecraft 游戏资源或模组文件，需自行安装；
- 修改脚本存在风险，**请先备份存档**。虽然软件会做校验与备份，但仍建议在测试存档中先行验证。

---

## 链接

- 使用手册：[`使用手册.md`](./使用手册.md)
- 开发者 B 站：<https://space.bilibili.com/525703803>
- 问题反馈：[Issues](../../issues)

## License

[MIT](./LICENSE)
