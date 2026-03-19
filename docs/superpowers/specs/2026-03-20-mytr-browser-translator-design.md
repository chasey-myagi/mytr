# mytr — AI 浏览器翻译扩展设计文档

## 概述

mytr 是一个面向个人日常使用的浏览器翻译扩展，纯 AI 翻译路线，不依赖任何传统翻译 API。核心目标：自主可控，想要什么功能开发什么功能。

## 优先级

| 优先级 | 功能 |
|--------|------|
| **P0** | 整页双语对照翻译、划词翻译、AI 引擎管理、Popup 设置、快捷键 |
| **P1** | PDF 页内覆盖翻译、YouTube 视频字幕翻译 |
| **P2** | 输入框翻译（写中文翻译成英文发出去） |

### P1/P2 技术方向（确保 P0 架构不阻碍扩展）

- **PDF 翻译**：通过 Content Script 操作浏览器内置 PDF.js 渲染层，在文本层上方叠加译文。复用 `TranslationProvider` 接口和批处理逻辑。
- **YouTube 字幕翻译**：拦截 YouTube 字幕 API 响应（`/api/timedtext`），提取字幕文本，翻译后注入自定义字幕轨道。复用 `TranslationProvider` 接口。
- **输入框翻译**：监听 `contentEditable` / `<textarea>` 的输入事件，快捷键触发将内容发送翻译，替换回输入框。复用 `TranslationProvider` 接口。

## 技术栈

- **框架**: WXT（浏览器扩展专用框架，内建跨浏览器支持）
- **UI**: Svelte 5（仅 Popup 设置面板）
- **Content Script**: 纯 TypeScript（轻量，不带框架）
- **语言**: TypeScript
- **浏览器**: Chrome 优先（Manifest V3），架构兼容所有 Chromium 系

选择 WXT 的理由：
- 内建跨浏览器支持（`wxt build --browser firefox` 一条命令）
- Content Script 可用纯 TS，不强制框架开销
- 社区活跃，是当前扩展开发主流选择
- Read Frog、FluentRead 等同类项目验证了此技术栈

## 架构

```
┌─────────────────────────────────────────────────┐
│                    Browser                       │
│                                                  │
│  ┌──────────┐   chrome.runtime    ┌───────────┐ │
│  │ Content   │ ◄════════════════► │ Background │ │
│  │ Script    │   message passing  │ Service    │ │
│  │ (纯 TS)   │                    │ Worker     │ │
│  │           │                    │            │ │
│  │ · DOM遍历  │                    │ · AI API   │ │
│  │ · 文本提取  │                    │ · 翻译调度  │ │
│  │ · 译文注入  │                    │ · 设置管理  │ │
│  │ · 划词检测  │                    │ · 缓存     │ │
│  └──────────┘                    └───────────┘ │
│                                       ▲         │
│  ┌──────────┐                         │         │
│  │ Popup     │ ◄══════════════════════╝         │
│  │ (Svelte5) │   chrome.storage                 │
│  │           │                                  │
│  │ · API配置  │                                  │
│  │ · 语言设置  │                                  │
│  │ · Prompt   │                                  │
│  │ · 黑白名单  │                                  │
│  └──────────┘                                   │
└─────────────────────────────────────────────────┘
```

三个入口点：
1. **Content Script（纯 TS）**——按需注入页面，负责 DOM 操作。不带任何框架，保持轻量。注入策略：轻量 bootstrap script 在所有页面注入（仅检测是否在白名单 / 监听快捷键指令），按需通过 `chrome.scripting.executeScript` 加载完整翻译逻辑。
2. **Background Service Worker**——处理 AI API 调用、翻译队列管理、缓存。是整个翻译逻辑的核心。
3. **Popup（Svelte 5）**——点击插件图标弹出的设置面板。

通信：Content Script ↔ Background 通过 `chrome.runtime.sendMessage` 双向通信。

设计原则：**不注入任何页面内 UI 元素**（除翻译结果本身和划词气泡外）。没有悬浮球、没有侧边栏按钮、没有工具栏。

## 整页双语对照翻译

### 文本提取

- 遍历 DOM，识别可翻译文本块（`<p>`, `<h1>`-`<h6>`, `<li>`, `<td>`, `<blockquote>` 等）
- 智能主体识别：优先翻译 `<article>/<main>` 内的内容，跳过 `<nav>/<footer>/<header>` 等非内容区域。Fallback：当页面无语义化标签时，翻译 `<body>` 下所有可见文本块（仍排除导航/脚注类元素）
- 跳过不翻译的元素：`<script>`, `<style>`, `<code>`, `<pre>`, 已翻译元素, 纯符号/数字
- 保留元素的 DOM 引用，用于后续注入译文

### 翻译策略——视口优先 + 滚动懒加载

- 先翻译当前视口内的段落，用户立即看到结果
- `IntersectionObserver` 监听滚动，段落进入视口前触发翻译
- 快速滚动时 300ms 防抖，避免 API 风暴（注：划词检测用 200ms debounce，两个值面向不同场景——滚动翻译容忍更高延迟以节省 API 调用）
- 段落打包成 batch（≤10 段 / ≤2000 tokens 为一批）

### 译文注入

```html
<!-- 原文 -->
<p>The quick brown fox jumps over the lazy dog.</p>
<!-- 译文：紧跟原文后方插入 -->
<p class="mytr-translation" lang="zh">
  敏捷的棕色狐狸跳过了懒狗。
</p>
```

- 译文作为新元素插入原文正下方
- `mytr-translation` class 标识，样式默认区分于原文
- 流式显示——AI 返回的 token 实时追加到译文元素中
- 已翻译段落标记 `data-mytr-id`，不重复翻译

### 显示模式切换

快捷键一键切换三种模式：双语对照 / 仅原文 / 仅译文

### 动态页面支持

- `MutationObserver` 监听 DOM 变化，SPA 路由切换 / 动态加载内容自动追翻
- 监听 `popstate` / `hashchange` 事件检测路由变化
- 路由变化时清除当前页译文，重新翻译新内容

## 划词翻译

### 触发方式

两种模式，通过设置切换：
1. **自动模式**——选中文字后自动触发翻译
2. **快捷键模式**——选中文字 + 按快捷键触发

### 选择检测

- 双事件监听：`mouseup` + `selectionchange`
- debounce 200ms，避免频繁触发
- 排除规则：输入框（`<input>/<textarea>/contentEditable`）、已翻译内容、过短文本（< 2 字符）自动忽略

### 译文气泡

- **Shadow DOM 隔离**——气泡注入 Shadow DOM 容器，样式不被页面 CSS 污染
- **智能定位**——检测视口空间，自动选择最佳弹出方向（上/下/左/右），避免被视口边缘截断
- 流式显示翻译结果，逐 token 追加
- 关闭策略：`Esc` / 点击外部 / 新选区出现

## AI 翻译引擎

### 统一接口

```typescript
interface TranslationProvider {
  name: string
  translate(request: TranslateRequest): AsyncIterable<string>
}

interface TranslateRequest {
  text: string
  sourceLang: string | "auto"   // "auto" 时由 AI 自动检测
  targetLang: string
  style: string
  context?: string
}

interface ProviderConfig {
  provider: string
  apiKey: string
  baseUrl: string
  model: string
}
```

### 提供商实现

只需两个实现：

1. **OpenAI 兼容实现**——通过 `baseUrl` + `model` 覆盖 OpenAI / DeepSeek / Groq / 各种中转站（90% 场景）
2. **Claude 实现**——Anthropic Messages API 格式不同，需单独实现

### Prompt 缓存策略

三层 prompt 结构，最大化 API prompt caching 命中：

| 层级 | 内容 | 变化频率 | 缓存效果 |
|------|------|---------|---------|
| System Prompt | 翻译规则 + 风格 | 用户改设置才变 | 跨页面、跨会话缓存 |
| User Message 1 | 页面上下文（`document.title` + `hostname`） | 换页才变 | 同一页面内所有 batch 共享 |
| User Message 2 | 待翻译段落 | 每 batch 不同 | 不缓存 |

System Prompt 结构：

```
你是一个专业翻译器。将以下文本翻译成{targetLang}。
风格要求：{style}
规则：
- 只输出译文，不要解释
- 保留原文中的代码、URL、专有名词不翻译
- 多段翻译时用 [SEP] 分隔
- 保持原文的格式标记（加粗、斜体等）
```

页面上下文让 AI 从文本本身推断领域（学术/技术/新闻），不做任何非 AI 的检测逻辑。

### 批处理

整页翻译时多个短段落合并为一次请求：

```
User: [1] First paragraph here.
      [2] Second paragraph here.
      [3] Third paragraph here.

AI:   [1] 第一段翻译。
      [SEP]
      [2] 第二段翻译。
      [SEP]
      [3] 第三段翻译。
```

- 合并上限：≤2000 tokens 或 ≤10 段落
- 流式解析 `[SEP]`，解析到一段立即注入页面
- **`[SEP]` 解析鲁棒性**：维护流式 buffer，检测到完整 `[SEP]` 标记才分割（处理 token 边界切割，如先收到 `[SE` 再收到 `P]`）。以 `[N]` 编号为主定位依据，`[SEP]` 为辅。当 AI 输出段数与输入不匹配时，回退到按 `[SEP]` 顺序依次匹配原文段落

### 错误处理

- API 报错 → 指数退避重试（最多 3 次）
- 单批失败 → 拆分为单段重试
- API key 无效 → 通知用户检查设置
- 网络断开 → 暂停翻译，恢复后继续

## Popup 设置面板

Svelte 5 实现，折叠式分组：

- **翻译引擎**：提供商选择、API Key、Base URL（自定义 endpoint）、模型
- **翻译偏好**：目标语言、风格预设（学术严谨/口语化/直译）、自定义 Prompt
- **行为设置**：划词模式（自动/快捷键）
- **网站规则**：始终翻译列表、永不翻译列表
- **底部固定区**：当前页状态、翻译此页/停止按钮

## 快捷键

通过 `chrome.commands` 注册，平台自适应（Mac 用 `Cmd`，其他用 `Alt`）：

| 快捷键 | 功能 |
|--------|------|
| `Alt+Shift+T` | 翻译当前页（整页双语） |
| `Alt+Shift+S` | 停止翻译 / 清除译文 |
| `Alt+Shift+D` | 切换显示模式（双语 → 仅译文 → 仅原文） |
| `Alt+Shift+Q` | 翻译选中文字（快捷键模式下） |

注意：`chrome.commands` 最多注册 4 个快捷键。默认用 `Alt+Shift` 组合避免与浏览器/系统快捷键冲突（`Cmd+T` 是新建标签页，`Cmd+Q` 是退出应用）。

用户可在 `chrome://extensions/shortcuts` 自定义快捷键。

## 缓存

```
缓存 key = hash(原文 + sourceLang + 目标语言 + 提供商 + 模型)
缓存 value = 译文
存储 = chrome.storage.local
```

- 相同内容不重复调用 API
- 上限 50MB，LRU 淘汰（需在 manifest 中声明 `"unlimitedStorage"` 权限，`chrome.storage.local` 默认限额仅 10MB）
- Popup 中可手动清除

## 设置存储

- `chrome.storage.sync`——非敏感设置跨设备同步（语言、风格、网站规则）。容量限制 102KB，单项 8KB。
- `chrome.storage.local`——敏感数据（API Key）+ 大体积数据（翻译缓存）本地存储。API Key 不走 sync，避免通过 Google 账号泄露。

## 项目结构

```
mytr/
├── wxt.config.ts
├── package.json
├── tsconfig.json
│
├── entrypoints/
│   ├── background/
│   │   └── index.ts                 # Service Worker
│   ├── content/
│   │   └── index.ts                 # Content Script（纯 TS）
│   └── popup/
│       ├── index.html
│       ├── main.ts
│       └── App.svelte               # 设置面板
│
├── lib/
│   ├── providers/                   # AI 翻译引擎
│   │   ├── types.ts                 # TranslationProvider 接口
│   │   ├── openai-compatible.ts     # OpenAI 兼容（覆盖 90% 提供商）
│   │   └── claude.ts                # Anthropic Messages API
│   │
│   ├── translator/                  # 核心翻译逻辑
│   │   ├── extractor.ts             # DOM 文本提取 + 主体识别
│   │   ├── injector.ts              # 译文注入（段落级，流式）
│   │   ├── selector.ts              # 划词翻译（Shadow DOM 气泡）
│   │   ├── batcher.ts               # 批处理（合并段落、解析 [SEP]）
│   │   └── observer.ts              # MutationObserver + IntersectionObserver
│   │
│   ├── prompt/
│   │   └── builder.ts               # 三层 prompt 构建
│   │
│   ├── storage/
│   │   ├── settings.ts              # chrome.storage.sync 设置
│   │   └── cache.ts                 # chrome.storage.local 缓存（LRU）
│   │
│   └── messaging/
│       └── bridge.ts                # Content ↔ Background 消息协议
│
├── assets/
│   └── icons/
│
└── tests/
```

## 竞品参考

设计过程中参考了以下开源项目的实现：

| 项目 | 参考点 |
|------|--------|
| [沉浸式翻译](https://github.com/immersive-translate/immersive-translate) | 整体产品形态、双语对照模式 |
| [Read Frog](https://github.com/mengxi-ream/read-frog) | WXT 技术栈验证、智能批处理（70% 成本节省）、Floating UI 气泡定位 |
| [FluentRead](https://github.com/Bistutu/FluentRead) | WXT + 多引擎架构、MutationObserver 动态内容 |
| [Linguist](https://github.com/translate-tools/linguist) | 600ms 防抖策略、Shadow DOM 隔离 |
| [XTranslate](https://github.com/ixrock/XTranslate) | 快捷键集成、Shadow DOM 气泡 |
