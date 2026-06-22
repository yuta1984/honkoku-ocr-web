import { useState, useCallback } from 'react'
import type { LlmProvider } from '../lib/llm'
import { PROVIDER_MODELS, defaultModel } from '../lib/llm'
import * as keyStore from '../lib/keyStore'
import type { StorageMode } from '../lib/keyStore'

const P_KEY = 'honkoku_llm_provider'
const M_KEY = 'honkoku_llm_model'
const S_KEY = 'honkoku_llm_storage'

function getProvider(): LlmProvider {
  const v = localStorage.getItem(P_KEY)
  return v === 'openai' || v === 'gemini' ? v : 'anthropic'
}
function getStorageMode(): StorageMode {
  const v = localStorage.getItem(S_KEY)
  return v === 'local' || v === 'encrypted' ? v : 'session'
}
function getModel(provider: LlmProvider): string {
  const v = localStorage.getItem(M_KEY)
  return v && PROVIDER_MODELS[provider].some((m) => m.value === v) ? v : defaultModel(provider)
}

/**
 * LLM 現代語訳の設定（プロバイダ/モデル/保存方式）と API キーを管理。
 * provider/model/storageMode は localStorage（非機密）。apiKey は keyStore（3 方式）。
 */
export function useLlmSettings() {
  const [provider, setProviderState] = useState<LlmProvider>(getProvider)
  const [model, setModelState] = useState<string>(() => getModel(getProvider()))
  const [storageMode, setStorageModeState] = useState<StorageMode>(getStorageMode)
  const [apiKey, setApiKey] = useState<string | null>(() => keyStore.getKeySync())
  const [needsUnlock, setNeedsUnlock] = useState<boolean>(() => keyStore.needsUnlock())

  const setProvider = useCallback((p: LlmProvider) => {
    localStorage.setItem(P_KEY, p)
    setProviderState(p)
    // 現モデルが新プロバイダに無ければ既定へ
    setModelState((cur) => {
      const ok = PROVIDER_MODELS[p].some((m) => m.value === cur)
      const next = ok ? cur : defaultModel(p)
      localStorage.setItem(M_KEY, next)
      return next
    })
  }, [])

  const setModel = useCallback((m: string) => {
    localStorage.setItem(M_KEY, m)
    setModelState(m)
  }, [])

  const setStorageMode = useCallback((m: StorageMode) => {
    localStorage.setItem(S_KEY, m)
    setStorageModeState(m)
  }, [])

  /** キーを現在の保存方式で保存（encrypted は passphrase 必須）。 */
  const saveApiKey = useCallback(async (key: string, passphrase?: string) => {
    await keyStore.saveKey(key, storageMode, passphrase)
    setApiKey(key)
    setNeedsUnlock(false)
  }, [storageMode])

  /** encrypted 保存をパスフレーズで復号してメモリにロード。 */
  const unlock = useCallback(async (passphrase: string) => {
    const key = await keyStore.unlockEncrypted(passphrase)
    setApiKey(key)
    setNeedsUnlock(false)
  }, [])

  const clearApiKey = useCallback(() => {
    keyStore.clearKey()
    setApiKey(null)
    setNeedsUnlock(false)
  }, [])

  return {
    provider, model, storageMode, apiKey, needsUnlock,
    hasKeyStored: keyStore.storedMode() != null,
    setProvider, setModel, setStorageMode, saveApiKey, unlock, clearApiKey,
  }
}
