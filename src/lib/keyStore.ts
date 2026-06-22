/**
 * LLM API キーのローカル保存。3 方式を提供する:
 *  - 'session'   : sessionStorage（タブを閉じると消える。最も安全寄り）
 *  - 'local'     : localStorage 平文（一度入力で永続。XSS リスクあり）
 *  - 'encrypted' : localStorage に AES-GCM 暗号文（パスフレーズで保護。at rest 暗号化）
 *
 * 注意: 静的アプリのため鍵は使用時に必ずブラウザのメモリに乗り、HTTPS で
 *       プロバイダへ送信される。守れるのは「保存時(at rest)」のみ。
 */

export type StorageMode = 'session' | 'local' | 'encrypted'

const SS_KEY = 'honkoku_llm_key'        // sessionStorage 平文
const LS_KEY = 'honkoku_llm_key'        // localStorage 平文
const LS_ENC = 'honkoku_llm_key_enc'    // localStorage 暗号文(JSON)

/** 復号済みキーのメモリキャッシュ（encrypted モードの unlock 後・セッション内で再利用） */
let memKey: string | null = null

// ---- base64 <-> bytes ----
function b64encode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}
function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase) as BufferSource, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 200_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

interface EncBlob { v: 1; salt: string; iv: string; ct: string }

/** どの方式でキーが保存されているかを返す（UI 表示用） */
export function storedMode(): StorageMode | null {
  if (sessionStorage.getItem(SS_KEY)) return 'session'
  if (localStorage.getItem(LS_KEY)) return 'local'
  if (localStorage.getItem(LS_ENC)) return 'encrypted'
  return null
}

/** 同期で取り出せるキー（session/local、または unlock 済み encrypted のメモリ値）。
 *  encrypted で未 unlock の場合は null を返す（呼び出し側は needsUnlock() を見る）。 */
export function getKeySync(): string | null {
  if (memKey) return memKey
  const ss = sessionStorage.getItem(SS_KEY)
  if (ss) return ss
  const ls = localStorage.getItem(LS_KEY)
  if (ls) return ls
  return null
}

/** encrypted 保存があり、かつまだ unlock していない（メモリにキーが無い）か */
export function needsUnlock(): boolean {
  return !memKey && !!localStorage.getItem(LS_ENC)
}

/** 全保存先から鍵を削除（メモリも含む） */
export function clearKey(): void {
  memKey = null
  sessionStorage.removeItem(SS_KEY)
  localStorage.removeItem(LS_KEY)
  localStorage.removeItem(LS_ENC)
}

/** キーを指定方式で保存。encrypted の場合は passphrase 必須。 */
export async function saveKey(key: string, mode: StorageMode, passphrase?: string): Promise<void> {
  clearKey()
  memKey = key
  if (mode === 'session') {
    sessionStorage.setItem(SS_KEY, key)
  } else if (mode === 'local') {
    localStorage.setItem(LS_KEY, key)
  } else {
    if (!passphrase) throw new Error('passphrase required for encrypted mode')
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ck = await deriveKey(passphrase, salt)
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, ck, new TextEncoder().encode(key) as BufferSource)
    const blob: EncBlob = { v: 1, salt: b64encode(salt.buffer), iv: b64encode(iv.buffer), ct: b64encode(ct) }
    localStorage.setItem(LS_ENC, JSON.stringify(blob))
  }
}

/** encrypted 保存をパスフレーズで復号し、メモリにロードして返す。失敗時は例外。 */
export async function unlockEncrypted(passphrase: string): Promise<string> {
  const raw = localStorage.getItem(LS_ENC)
  if (!raw) throw new Error('no encrypted key stored')
  const blob = JSON.parse(raw) as EncBlob
  const ck = await deriveKey(passphrase, b64decode(blob.salt))
  let ptBuf: ArrayBuffer
  try {
    ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64decode(blob.iv) as BufferSource }, ck, b64decode(blob.ct) as BufferSource)
  } catch {
    throw new Error('wrong passphrase')
  }
  const key = new TextDecoder().decode(ptBuf)
  memKey = key
  return key
}
