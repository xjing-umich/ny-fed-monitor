// 纯函数：拼 X / Telegram 的分享意图链接。URLSearchParams 负责编码。
export function xIntentUrl(text: string, url: string): string {
  const q = new URLSearchParams({ text, url });
  return `https://twitter.com/intent/tweet?${q.toString()}`;
}

export function telegramIntentUrl(text: string, url: string): string {
  const q = new URLSearchParams({ url, text });
  return `https://t.me/share/url?${q.toString()}`;
}
