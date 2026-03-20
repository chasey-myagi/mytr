export interface PageContext {
  title: string;
  hostname: string;
}

export interface TranslatePagePayload {
  tabId: number;
  pageContext: PageContext;
}

export interface TranslateSelectionPayload {
  text: string;
  tabId: number;
}

export interface StopTranslationPayload {
  tabId: number;
}

export interface TranslationChunkPayload {
  blockId: string;
  chunk: string;
  done: boolean;
}

export interface ToggleDisplayModePayload {
  tabId: number;
}

export interface TranslateBatchPayload {
  blocks: Array<{ id: string; text: string }>;
  content: string;
  pageContext: string;
  targetLang: string;
  sourceLang: string;
  style: string;
  customPrompt: string;
}

export interface SelectionChunkPayload {
  chunk: string;
  done: boolean;
}

export interface SelectionErrorPayload {
  error: string;
}

export interface CommandPayload {
  command: string;
}

export interface ExtractAndTranslatePayload {
  pageContext: string;
  targetLang: string;
  sourceLang: string;
  style: string;
  customPrompt: string;
  provider: string;
  model: string;
}

export interface MessageMap {
  'translate-page': TranslatePagePayload;
  'translate-selection': TranslateSelectionPayload;
  'stop-translation': StopTranslationPayload;
  'cancel-selection': Record<string, never>;
  'translation-chunk': TranslationChunkPayload;
  'toggle-display-mode': ToggleDisplayModePayload;
  'translate-batch': TranslateBatchPayload;
  'selection-chunk': SelectionChunkPayload;
  'selection-error': SelectionErrorPayload;
  'command': CommandPayload;
  'extract-and-translate': ExtractAndTranslatePayload;
}

export interface Message<T extends keyof MessageMap = keyof MessageMap> {
  type: T;
  payload: MessageMap[T];
}

export type TranslatePageMessage = Message<'translate-page'>;
export type TranslateSelectionMessage = Message<'translate-selection'>;
export type StopTranslationMessage = Message<'stop-translation'>;
export type TranslationChunkResponse = Message<'translation-chunk'>;

export function createMessage<T extends keyof MessageMap>(
  type: T,
  payload: MessageMap[T],
): Message<T> {
  return { type, payload };
}

export async function sendToBackground<T extends keyof MessageMap>(
  type: T,
  payload: MessageMap[T],
): Promise<void> {
  await chrome.runtime.sendMessage(createMessage(type, payload));
}

export function onMessage<T extends keyof MessageMap>(
  type: T,
  handler: (payload: MessageMap[T], sender: chrome.runtime.MessageSender) => void | Promise<void>,
): () => void {
  const listener = (
    message: Message,
    sender: chrome.runtime.MessageSender,
  ) => {
    if (message.type === type) {
      handler(message.payload as MessageMap[T], sender);
    }
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
