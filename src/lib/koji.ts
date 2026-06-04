/**
 * Koji 記法の変換ユーティリティ
 *
 * v7 デコーダは koji_preprocess.py の特殊トークンをそのまま出力する:
 *   <ruby>親<rt>よみ</rt>[<rt2>左よみ</rt2>]</ruby>  ふりがな
 *   <KAERI>レ</KAERI>                                返り点
 *   <OKURI>かな</OKURI>                              送り仮名
 *   <WARI>右<WARI_SEP>左</WARI>                      割書（双行注）
 *   <TATE>                                           連読符（縦点）
 *   <BLOCK>                                          見出しブロック区切り
 *
 * これらを みんなで翻刻 の Koji 記法表層形へ逆変換する:
 *   親（よみ） / 親（よみ｜左よみ） / ＿レ / ￣かな / 《割書：右｜左》
 *
 * 参照: koji_preprocess.py の preprocess_koji（koji→トークン）を逆向きに辿る。
 */

const RUBY_RE = /<ruby>([^<]*)<rt>([^<]*)<\/rt>(?:<rt2>([^<]*)<\/rt2>)?<\/ruby>/g
const KAERI_RE = /<KAERI>([^<]*)<\/KAERI>/g

// 直前の文字が漢字かどうか（ふりがな base 直前の「／」要否判定）。
// 暗黙ふりがなの base は「（の直前の漢字の連続」なので、直前が漢字のときだけ
// 「／」で base の開始を明示する必要がある（直前が仮名・記号・行頭なら不要）。
function precededByKanji(s: string, offset: number): boolean {
  if (offset <= 0) return false
  let cp = s.codePointAt(offset - 1)!
  // サロゲートペアの下位を踏んだ場合は 1 つ前から取り直す
  if (cp >= 0xdc00 && cp <= 0xdfff && offset - 2 >= 0) cp = s.codePointAt(offset - 2)!
  return (
    (cp >= 0x3400 && cp <= 0x9fff) || // CJK統合漢字 + 拡張A
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK互換漢字
    (cp >= 0x20000 && cp <= 0x2fa1f)  // 拡張B以降
  )
}
const OKURI_RE = /<OKURI>([^<]*)<\/OKURI>/g
const WARI_RE = /<WARI>([^<]*?)(?:<WARI_SEP>([^<]*?))?<\/WARI>/g
const ANY_TAG_RE = /<[^>]+>/g

/** Koji トークン列（生文字列）→ Koji 記法の表層形 */
export function rawToKoji(raw: string): string {
  if (!raw) return ''
  let s = raw
  // 「／」を base の直前に挿入してふりがなの対象範囲を確定する。ただし直前が漢字で
  // 連続してしまう場合に限る（直前が仮名・記号・行頭なら暗黙規則で base が確定するため不要）。
  // 例: 本<ruby>漢字<rt>かんじ</rt></ruby> → 本／漢字（かんじ）
  //     は<ruby>漢字<rt>かんじ</rt></ruby> → は漢字（かんじ）
  s = s.replace(RUBY_RE, (_m, base, rt, rt2, offset, str) => {
    const slash = precededByKanji(str, offset) ? '／' : ''
    return rt2 ? `${slash}${base}（${rt}｜${rt2}）` : `${slash}${base}（${rt}）`
  })
  s = s.replace(WARI_RE, (_m, right, left) =>
    left != null ? `《割書：${right}｜${left}》` : `《割書：${right}》`
  )
  s = s.replace(KAERI_RE, (_m, x) => `＿${x}`)
  s = s.replace(OKURI_RE, (_m, x) => `￣${x}`)
  s = s.replace(/<TATE>/g, 'ー')
  s = s.replace(/<BLOCK>/g, '')
  // 取りこぼした未知タグを除去
  s = s.replace(ANY_TAG_RE, '')
  return s
}

/** Koji トークン列 → タグを除去した素テキスト（コピー/書き出し用）。
 *  python の plain() と同じく、ruby 内のよみも含めて連結される。 */
export function rawToPlain(raw: string): string {
  if (!raw) return ''
  return raw.replace(ANY_TAG_RE, '')
}
