# mytr — AI 浏览器翻译扩展设计文档

## 概述

mytr 是一个面向个人日常使用的浏览器翻译扩展，纯 AI 翻译路线，不依赖任何传统翻译 API。核心目标：自主可控，想要什么功能开发什么功能。

## 优先级

| 优先级 | 功能 |
|--------|------|
| **P0** | 整页双语对照翻译、划词翻译、AI 引擎管理、Popup 设置、快捷键 |
| **P1** | PDF 页内覆盖翻译、YouTube 视频字幕翻译 |
| **P2** | 输入框翻译（写中文翻译成英文发出去） |

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
1. **Content Script（纯 TS）**——注入每个页面，负责 DOM 操作。不带任何框架，保持轻量。
2. **Background Service Worker**——处理 AI API 调用、翻译队列管理、缓存。是整个翻译逻辑的核心。
3. **Popup（Svelte 5）**——点击插件图标弹出的设置面板。

通信：Content Script ↔ Background 通过 `chrome.runtime.sendMessage` 双向通信。

设计原则：**不注入任何页面内 UI 元素**（除翻译结果本身和划词气泡外）。没有悬浮球、没有侧边栏按钮、没有工具栏。

## 整页双语对照翻译

### 文本提取

- 遍历 DOM，识别可翻译文本块（`<p>`, `<h1>`-`<h6>`, `<li>`, `<td>`, `<blockquote>` 等）
- 智能主体识别：优先翻译 `<article>/<main>` 内的内容，跳过 `<nav>/<footer>/<header>` 等非内容区域
- 跳过不翻译的元素：`<script>`, `<style>`, `<code>`, `<pre>`, 已翻译元素, 纯符号/数字
- 保留元素的 DOM 引用，用于后续注入译文

### 翻译策略——视口优先 + 滚动懒加载

- 先翻译当前视口内的段落，用户立即看到结果
- `IntersectionObserver` 监听滚动，段落进入视口前触发翻译
- 快速滚动时 300ms 防抖，避免 API 风暴
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
- 关闭策略：`Esc` / 点击外部 / 新选区出现 / 页面滚动

## AI 翻译引擎

### 统一接口

```typescript
interface TranslationProvider {
  name: string
  translate(request: TranslateRequest): AsyncIterable<string>
}

interface TranslateRequest {
  text: string
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
| `Cmd/Alt + T` | 翻译当前页（整页双语） |
| `Cmd/Alt + S` | 停止翻译 / 清除译文 |
| `Cmd/Alt + D` | 切换显示模式（双语 → 仅译文 → 仅原文） |
| `Cmd/Alt + Q` | 翻译选中文字（快捷键模式下） |

用户可在 `chrome://extensions/shortcuts` 自定义快捷键。

## 缓存

```
缓存 key = hash(原文 + 目标语言 + 提供商 + 模型)
缓存 value = 译文
存储 = chrome.storage.local
```

- 相同内容不重复调用 API
- 上限 50MB，LRU 淘汰
- Popup 中可手动清除

## 设置存储

- `chrome.storage.sync`——设置项跨设备同步（API key、语言、风格、网站规则）
- `chrome.storage.local`——大体积数据本地存储（翻译缓存）

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
