/**
 * LLM 現代語訳のプロバイダ非依存アダプタ。
 * Anthropic / OpenAI / Gemini を共通インターフェース translateToModern() に正規化する。
 * 各 SDK は使用時に動的 import（初期バンドルを膨らませない／非利用者はDLしない）。
 *
 * クライアント直叩き: いずれも各社のブラウザ利用フラグ/CORS に依存する。
 *  - Anthropic: dangerouslyAllowBrowser=true（= anthropic-dangerous-direct-browser-access ヘッダ）
 *  - OpenAI   : dangerouslyAllowBrowser=true
 *  - Gemini   : ブラウザ呼び出しを許容
 */

export type LlmProvider = 'anthropic' | 'openai' | 'gemini'

export interface LlmModelOption { value: string; labelJa: string }

export const PROVIDER_LABEL: Record<LlmProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  gemini: 'Google (Gemini)',
}

/** プロバイダ毎の選択可能モデル。先頭が既定。 */
export const PROVIDER_MODELS: Record<LlmProvider, LlmModelOption[]> = {
  anthropic: [
    { value: 'claude-sonnet-4-6', labelJa: 'Claude Sonnet 4.6（バランス・既定）' },
    { value: 'claude-opus-4-8', labelJa: 'Claude Opus 4.8（最高品質）' },
    { value: 'claude-haiku-4-5', labelJa: 'Claude Haiku 4.5（最安・最速）' },
  ],
  openai: [
    { value: 'gpt-5.4-mini', labelJa: 'GPT-5.4 mini（バランス・既定）' },
    { value: 'gpt-5.5', labelJa: 'GPT-5.5（最高品質）' },
    { value: 'gpt-5.4-nano', labelJa: 'GPT-5.4 nano（最安・最速）' },
  ],
  gemini: [
    { value: 'gemini-3.5-flash', labelJa: 'Gemini 3.5 Flash（バランス・既定）' },
    { value: 'gemini-3.1-pro-preview', labelJa: 'Gemini 3.1 Pro（最高品質）' },
    { value: 'gemini-3.1-flash-lite', labelJa: 'Gemini 3.1 Flash-Lite（最安・最速）' },
  ],
}

export function defaultModel(p: LlmProvider): string {
  return PROVIDER_MODELS[p][0].value
}

const SYSTEM_PROMPT = [
  'あなたは日本の古典籍・古文書（くずし字）の翻刻テキストを現代語訳する専門家です。',
  '入力は「みんなで翻刻」OCR が出力した翻刻テキストで、ふりがな・返り点・送り仮名・割書などの',
  '記法タグや、OCR 由来の誤字・脱字を含むことがあります。',
  '次の方針で**自然な現代日本語の訳文のみ**を出力してください:',
  '- 前置き・見出し・注釈・原文の再掲はしない（訳文だけを返す）。',
  '- 明らかな誤字は文脈から補って訳す。判読不能な箇所は［…］で示す。',
  '- 固有名詞・年号はできるだけ保持する。',
].join('\n')

const MAX_TOKENS = 8192

export interface TranslateArgs {
  text: string
  provider: LlmProvider
  model: string
  apiKey: string
  signal?: AbortSignal
  onToken?: (delta: string) => void
}

/** 翻刻テキストを現代語訳。ストリームで onToken を呼びつつ全文を返す。 */
export async function translateToModern(args: TranslateArgs): Promise<string> {
  switch (args.provider) {
    case 'anthropic': return translateAnthropic(args)
    case 'openai': return translateOpenAI(args)
    case 'gemini': return translateGemini(args)
  }
}

async function translateAnthropic({ text, model, apiKey, signal, onToken }: TranslateArgs): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  let out = ''
  const stream = client.messages.stream(
    {
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    },
    { signal },
  )
  stream.on('text', (t) => { out += t; onToken?.(t) })
  await stream.finalMessage()
  return out
}

async function translateOpenAI({ text, model, apiKey, signal, onToken }: TranslateArgs): Promise<string> {
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
  let out = ''
  const stream = await client.chat.completions.create(
    {
      model,
      // GPT-5.x の Chat Completions は max_tokens 非対応 → max_completion_tokens を使う
      max_completion_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      stream: true,
    },
    { signal },
  )
  for await (const chunk of stream) {
    const d = chunk.choices[0]?.delta?.content
    if (d) { out += d; onToken?.(d) }
  }
  return out
}

async function translateGemini({ text, model, apiKey, signal, onToken }: TranslateArgs): Promise<string> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const gm = genAI.getGenerativeModel({
    model,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: { maxOutputTokens: MAX_TOKENS },
  })
  let out = ''
  const result = await gm.generateContentStream(text, { signal } as { signal?: AbortSignal })
  for await (const chunk of result.stream) {
    const d = chunk.text()
    if (d) { out += d; onToken?.(d) }
  }
  return out
}
