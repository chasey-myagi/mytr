export function buildSystemPrompt(
  targetLang: string,
  style: string,
  customPrompt: string,
): string {
  const styleMap: Record<string, string> = {
    natural: '自然流畅，符合目标语言的表达习惯',
    academic: '学术严谨，使用专业术语',
    casual: '口语化，轻松自然',
    literal: '直译，尽可能保留原文结构',
  };

  const styleDesc = styleMap[style] ?? style;

  let prompt = `你是一个专业翻译器。将以下文本翻译成${targetLang}。
风格要求：${styleDesc}
规则：
- 只输出译文，不要解释
- 保留原文中的代码、URL、专有名词不翻译
- 多段翻译时，每段译文前标注对应编号如 [1]、[2]，段间用 [SEP] 分隔
- 保持原文的格式标记（加粗、斜体等）`;

  if (customPrompt) {
    prompt += `\n\n用户附加要求：\n${customPrompt}`;
  }

  return prompt;
}

export function buildPageContext(title: string, hostname: string): string {
  return `页面：${title}\n来源：${hostname}`;
}

export function buildTranslationContent(paragraphs: string[]): string {
  if (paragraphs.length === 1) {
    return paragraphs[0];
  }
  return paragraphs.map((p, i) => `[${i + 1}] ${p}`).join('\n\n');
}
