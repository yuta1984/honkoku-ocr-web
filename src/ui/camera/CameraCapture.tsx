import { useCallback, useEffect, useRef, useState } from 'react'
import type { Language } from '../../hooks/useLang'

interface CameraCaptureProps {
  lang: Language
  onCapture: (file: File) => void
  onClose: () => void
}

/**
 * PC の Web カメラ（getUserMedia）でくずし字資料を撮影し、JPEG の File にして返す。
 * ライブプレビュー → 撮影 → 確認（使う / 撮り直し）の 2 段階。撮影画像はブラウザ内で完結し外部送信しない。
 * getUserMedia は安全なコンテキスト（HTTPS / localhost）でのみ動作する。
 */
export function CameraCapture({ lang, onCapture, onClose }: CameraCaptureProps) {
  const t = lang === 'ja'
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [captured, setCaptured] = useState<{ url: string; blob: Blob } | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
  }, [])

  const start = useCallback(async (id?: string) => {
    setError(null)
    stop()
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new DOMException('getUserMedia unavailable', 'NotSupportedError')
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: id ? { deviceId: { exact: id } } : { width: { ideal: 3840 }, height: { ideal: 2160 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => { /* autoplay は muted で許可される */ })
      }
      // 許可後に列挙すると label が入る（複数カメラの切替用）
      const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
      setDevices(list)
      const active = stream.getVideoTracks()[0]?.getSettings().deviceId
      if (active) setDeviceId(active)
    } catch (e) {
      const err = e as DOMException
      setError(
        err.name === 'NotAllowedError'
          ? (t ? 'カメラへのアクセスが許可されませんでした。ブラウザのアドレスバーのカメラ設定で許可してください。' : 'Camera access was denied. Allow it from the camera setting in the address bar.')
          : err.name === 'NotFoundError'
            ? (t ? '利用できるカメラが見つかりませんでした。' : 'No camera was found.')
            : err.name === 'NotReadableError'
              ? (t ? 'カメラを起動できませんでした。別のアプリが使用中の可能性があります。' : 'Could not start the camera. Another app may be using it.')
              : err.name === 'NotSupportedError'
                ? (t ? 'このブラウザ／接続ではカメラを利用できません（HTTPS が必要です）。' : 'Camera is not available in this browser/connection (HTTPS required).')
                : (t ? `カメラを起動できませんでした: ${err.message}` : `Could not start the camera: ${err.message}`)
      )
    }
  }, [stop, t])

  useEffect(() => {
    // microtask に逃がして effect 本体での同期 setState を避ける。
    // 初回マウント時のみ起動。撮り直し時は handleRetake から明示的に start() する。
    queueMicrotask(() => start())
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Esc で閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleCapture = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const w = video.videoWidth, h = video.videoHeight
    if (!w || !h) return
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, w, h)
    canvas.toBlob((blob) => {
      if (!blob) return
      setCaptured({ url: URL.createObjectURL(blob), blob })
      stop()
    }, 'image/jpeg', 0.95)
  }, [stop])

  const handleRetake = useCallback(() => {
    if (captured) URL.revokeObjectURL(captured.url)
    setCaptured(null)
    start(deviceId)
  }, [captured, deviceId, start])

  const handleUse = useCallback(() => {
    if (!captured) return
    const file = new File([captured.blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })
    URL.revokeObjectURL(captured.url)
    onCapture(file)
    onClose()
  }, [captured, onCapture, onClose])

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel camera-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="panel-header">
          <strong>{t ? '📷 カメラで撮影' : '📷 Take a photo'}</strong>
          <button className="btn-close" onClick={onClose} aria-label={t ? '閉じる' : 'Close'}>✕</button>
        </div>
        <div className="panel-body">
          {error ? (
            <div className="camera-error">
              <p>{error}</p>
              <button className="btn btn-primary" onClick={() => start(deviceId)}>{t ? '再試行' : 'Retry'}</button>
            </div>
          ) : (
            <>
              <div className="camera-stage">
                {captured ? (
                  <img className="camera-view" src={captured.url} alt={t ? '撮影画像' : 'Captured image'} />
                ) : (
                  <video ref={videoRef} className="camera-view" autoPlay playsInline muted />
                )}
              </div>

              {!captured && devices.length > 1 && (
                <select
                  className="camera-device-select"
                  value={deviceId ?? ''}
                  onChange={(e) => { setDeviceId(e.target.value); start(e.target.value) }}
                >
                  {devices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || (t ? `カメラ ${i + 1}` : `Camera ${i + 1}`)}
                    </option>
                  ))}
                </select>
              )}

              <div className="camera-actions">
                {captured ? (
                  <>
                    <button className="btn btn-secondary" onClick={handleRetake}>{t ? '撮り直し' : 'Retake'}</button>
                    <button className="btn btn-primary" onClick={handleUse}>{t ? 'この画像を使う' : 'Use this photo'}</button>
                  </>
                ) : (
                  <button className="btn btn-primary" onClick={handleCapture}>{t ? '📸 撮影' : '📸 Capture'}</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
