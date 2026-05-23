import { useState, useCallback } from 'react'
import {
  type Language,
  type TranslationParams,
  createTranslator,
  getStoredLang,
  LANG_STORAGE_KEY,
} from '../i18n'

export function useI18n() {
  const [lang, setLang] = useState<Language>(getStoredLang)

  const t = useCallback(
    (key: string, params?: TranslationParams) => createTranslator(lang)(key, params),
    [lang]
  )

  const toggleLanguage = useCallback(() => {
    const next: Language = lang === 'ja' ? 'en' : 'ja'
    setLang(next)
    localStorage.setItem(LANG_STORAGE_KEY, next)
  }, [lang])

  return { lang, t, toggleLanguage }
}
