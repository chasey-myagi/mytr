# mytr

AI-powered browser translation extension. WXT + Svelte 5 + TypeScript.

## Design Context

### Users
开发者/技术工作者，日常大量阅读英文技术内容。使用场景：浏览英文文章、技术文档、GitHub issue 时需要快速理解内容。用户极度重视阅读体验的纯净性，不希望工具的存在感打扰阅读。

### Brand Personality
**极简 · 克制 · 隐形**

翻译工具应该像空气一样——你知道它在，但从不抢戏。译文融入页面、UI 元素最少化、操作通过快捷键完成。成功标准：用户忘记自己装了翻译插件，但总能在需要时用到。

### Aesthetic Direction

**沿用 mymd 项目的设计语言：**
- Catppuccin Mocha 色系：`#1e1e2e`（base）、`#181825`（mantle）、`#313244`（surface0）、`#89b4fa`（accent blue）
- 精致优雅，细腻但不花哨
- system-ui 字体栈，与操作系统融合
- 快速交互 0.15s ease，面板展开 0.2s ease

**页面注入样式（译文 + 气泡）：**
- 译文融入页面：半透明 + 微妙左边框细线标记，不用背景色块
- 译文颜色与原文协调，仅通过透明度和细线区分
- 划词气泡：Catppuccin 暗色，Shadow DOM 隔离，柔和阴影

**反面参考（绝对不要）：**
- 不要页面内任何 UI 元素（悬浮球、侧边栏、工具栏）
- 不要花哨动画或装饰性效果
- 不要高对比度的背景色块突兀地打断阅读
- 不要让人一眼看出"这是翻译插件加的"

### Design Principles

1. **隐形优先（Invisible First）**：翻译结果应该像页面原生内容一样自然。所有 UI 都为"不被注意"而设计。
2. **快捷键驱动（Keyboard First）**：核心操作全部通过快捷键完成，Popup 仅用于设置。
3. **融入而非覆盖（Blend, Don't Overlay）**：译文的颜色、字号、行高应该继承页面上下文，而非强制自己的样式。
4. **克制装饰（Less Decoration）**：左边框细线是最大限度的装饰。不加图标、不加标签、不加渐变。
5. **一致性（Consistency）**：Popup、气泡、译文风格在 Catppuccin 色系下统一。

### Design Tokens

```
--mytr-accent: #89b4fa       (Catppuccin blue)
--mytr-bg: #1e1e2e           (Catppuccin base)
--mytr-bg-deep: #181825      (Catppuccin mantle)
--mytr-surface: #313244      (Catppuccin surface0)
--mytr-border: #45475a       (Catppuccin surface1)
--mytr-text: #cdd6f4         (Catppuccin text)
--mytr-subtext: #a6adc8      (Catppuccin subtext0)
--mytr-success: #a6e3a1      (Catppuccin green)
--mytr-danger: #f38ba8       (Catppuccin red)
--mytr-translation-opacity: 0.8
--mytr-translation-border: 2px solid rgba(137, 180, 250, 0.3)
--mytr-radius: 6px
--mytr-transition-fast: 0.15s ease
--mytr-transition-normal: 0.2s ease
```
