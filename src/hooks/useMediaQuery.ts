import { useEffect, useState } from 'react'

/** メディアクエリにマッチするかどうかを返す。viewport 変化に追従する。 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    // 初回マウント時は SSR 既定値の可能性があるので 1 度だけ現在値で同期
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMatches(mql.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}
