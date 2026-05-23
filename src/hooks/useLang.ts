import { useState, useCallback } from 'react'

export type Language = 'ja' | 'en'

const STORAGE_KEY = 'honkoku_lang'

function getStored(): Language {
  return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ja'
}

/** 言語(ja/en)の保持と切替のみ。UI 文言は各コンポーネントで lang === 'ja' ? … で分岐する。 */
export function useLang() {
  const [lang, setLang] = useState<Language>(getStored)

  const toggleLanguage = useCallback(() => {
    setLang((prev) => {
      const next: Language = prev === 'ja' ? 'en' : 'ja'
      localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }, [])

  return { lang, toggleLanguage }
}
