import { useCallback, useEffect, useRef, useState } from 'react'
import { Btn } from '../../components/UI'
import { createDefaultSettings, describeSettings, normalizeSettings } from './catalog'
import { FaceAnalysisError, analyzeFace, loadFaceLandmarker } from './faceAnalysis'
import {
  ACCEPT_ATTR,
  ImageInputError,
  buildDownloadName,
  canShareFiles,
  canvasToBlob,
  downloadBlob,
  loadImageFromFile,
  loadImageFromUrl,
} from './imageUtils'
import { renderLashSimulation } from './lashRenderer'
import { generateAiSimulation } from './aiSimulation'
import { DEFAULT_ADJUSTMENT, loadOverlayImage, loadOverlayManifest, renderFilteredPhoto } from './overlayFilter'
import FilterCanvas from './components/FilterCanvas'
import FilterPanel from './components/FilterPanel'
import { DEMO_MODELS, getDemoModel } from './models'
import { saveSimulation } from './simulationsApi'
import BeforeAfterSlider from './components/BeforeAfterSlider'
import ConfigPanel from './components/ConfigPanel'
import HistoryPanel, { SettingsSummary } from './components/HistoryPanel'
import { SimIcon } from './components/SimIcons'
import './lashSimulator.css'

const GENERATE_ERROR = 'Não conseguimos gerar a simulação desta foto. Tente utilizar uma foto mais frontal e com boa iluminação.'
const LIVE_UPDATE_DELAY_MS = 160

// Cede a vez para a interface mostrar o progresso antes do desenho (setTimeout em vez
// de requestAnimationFrame, que pausa quando a aba não está sendo pintada).
const nextFrame = () => new Promise((resolve) => window.setTimeout(resolve, 16))
const settingsKey = (settings) => JSON.stringify(settings)

/**
 * No celular o resultado fica acima da configuração: rola até ele se estiver fora
 * da tela, usando o elemento que realmente rola (contêiner ou a própria janela).
 */
const revealResult = (element) => {
  if (!element) return
  let scroller = element.parentElement
  while (scroller && !(
    /(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight
  )) scroller = scroller.parentElement
  const top = element.getBoundingClientRect().top
  if (!scroller) {
    if (top >= 0 && top < window.innerHeight * 0.5) return
    window.scrollTo({ top: window.scrollY + top - 72, behavior: 'smooth' })
    return
  }
  const offset = top - scroller.getBoundingClientRect().top
  if (offset >= 0 && offset < scroller.clientHeight * 0.5) return
  scroller.scrollTo({ top: scroller.scrollTop + offset - 12, behavior: 'smooth' })
}

const ModelGallery = ({ selectedId, onSelect }) => (
  <div className="ls-models">
    {DEMO_MODELS.map((model) => (
      <button
        key={model.id}
        type="button"
        className="ls-model"
        aria-pressed={model.id === selectedId}
        aria-label={`${model.name}: ${model.eyeShape}`}
        onClick={() => onSelect(model)}
      >
        <img src={model.thumb} alt="" loading="lazy" />
        <span className="ls-model-label">{model.eyeShape}</span>
      </button>
    ))}
  </div>
)

/**
 * Simulador de Cílios — exclusivo para Lash Designers (o App só monta esta página
 * para professional_type = 'lash'; o banco reforça a regra com RLS).
 */
const LashSimulatorPage = ({ isDemo, canUserEdit, addToast, onUpgrade }) => {
  const [tab, setTab] = useState('new')
  const [photo, setPhoto] = useState(null)
  const [picking, setPicking] = useState(true)
  const [loadingPhoto, setLoadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [analysis, setAnalysis] = useState({ status: 'idle' })
  const [settings, setSettings] = useState(createDefaultSettings)
  const [result, setResult] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [saving, setSaving] = useState(false)
  const [savedKey, setSavedKey] = useState('')
  const [historyKey, setHistoryKey] = useState(0)
  const [ai, setAi] = useState({ status: 'idle', message: '' })
  const [aiUsage, setAiUsage] = useState(null)
  // Modo Filtro manual (cílios prontos sobrepostos e ajustados com o dedo).
  const [mode, setMode] = useState('auto')
  const [overlays, setOverlays] = useState([])
  const [overlaysStatus, setOverlaysStatus] = useState('idle')
  const [filterId, setFilterId] = useState('')
  const [filterImage, setFilterImage] = useState(null)
  const [adjustments, setAdjustments] = useState([DEFAULT_ADJUSTMENT, DEFAULT_ADJUSTMENT])
  const [linked, setLinked] = useState(true)
  const [activeEye, setActiveEye] = useState(1)
  const [filterEditing, setFilterEditing] = useState(true)

  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const photoTokenRef = useRef(0)
  const renderTokenRef = useRef(0)
  const urlsRef = useRef(new Set())
  const resultSectionRef = useRef(null)
  const aiAbortRef = useRef(null)
  // Resultados da IA já pagos, por foto + configuração: voltar a uma configuração
  // anterior não gera nova cobrança.
  const aiCacheRef = useRef(new Map())
  // Sessão de demonstração local não tem login no servidor: só a prévia.
  const aiEnabled = !isDemo

  const trackUrl = (blob) => {
    const url = URL.createObjectURL(blob)
    urlsRef.current.add(url)
    return url
  }
  const releaseUrl = (url) => {
    if (url && urlsRef.current.has(url)) {
      URL.revokeObjectURL(url)
      urlsRef.current.delete(url)
    }
  }

  // Libera todas as imagens em memória ao sair da página. A liberação espera um
  // tick: se o componente for remontado na hora (StrictMode / Fast Refresh), o
  // estado continua usando essas URLs e elas não podem ser revogadas.
  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      window.setTimeout(() => {
        if (mountedRef.current) return
        photoTokenRef.current += 1
        renderTokenRef.current += 1
        aiAbortRef.current?.abort()
        urlsRef.current.forEach((url) => URL.revokeObjectURL(url))
        urlsRef.current.clear()
      }, 0)
    }
  }, [])

  // Pré-carrega o motor de análise facial enquanto a profissional escolhe a foto.
  useEffect(() => {
    const timer = window.setTimeout(() => { loadFaceLandmarker().catch(() => {}) }, 300)
    return () => window.clearTimeout(timer)
  }, [])

  const clearResult = useCallback(() => {
    renderTokenRef.current += 1
    aiAbortRef.current?.abort()
    aiAbortRef.current = null
    setAi({ status: 'idle', message: '' })
    setResult((prev) => {
      if (prev) releaseUrl(prev.url)
      return null
    })
    setGenerating(false)
    setProgress(0)
    setSavedKey('')
  }, [])

  const removePhoto = useCallback(() => {
    photoTokenRef.current += 1
    clearResult()
    setPhoto((prev) => {
      if (prev) releaseUrl(prev.url)
      return null
    })
    setAnalysis({ status: 'idle' })
    setPhotoError('')
    setLoadingPhoto(false)
    setPicking(true)
  }, [clearResult])

  const selectPhoto = async (loader, meta) => {
    const token = ++photoTokenRef.current
    setPhotoError('')
    setLoadingPhoto(true)
    try {
      const canvas = await loader()
      if (token !== photoTokenRef.current) return
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9)
      if (token !== photoTokenRef.current) return

      clearResult()
      const url = trackUrl(blob)
      setPhoto((prev) => {
        if (prev) releaseUrl(prev.url)
        return { ...meta, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, canvas, blob, url }
      })
      setPicking(false)
      setLoadingPhoto(false)
      setAdjustments([DEFAULT_ADJUSTMENT, DEFAULT_ADJUSTMENT])
      setFilterEditing(true)
      setAnalysis({ status: 'loading' })

      const data = await analyzeFace(canvas)
      if (token !== photoTokenRef.current) return
      setAnalysis({ status: 'ready', data })
    } catch (error) {
      if (token !== photoTokenRef.current) return
      setLoadingPhoto(false)
      if (error instanceof ImageInputError) {
        setPhotoError(error.message)
        return
      }
      if (error instanceof FaceAnalysisError) {
        console.warn('[lash-simulator] analysis rejected', error.code, error.detail)
        setAnalysis({ status: 'error', code: error.code, message: error.message, guidance: error.guidance })
        return
      }
      console.error('[lash-simulator] photo load failed', error)
      setPhotoError('Não conseguimos abrir esta foto. Tente outra imagem.')
    }
  }

  const handleFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    selectPhoto(() => loadImageFromFile(file), { source: 'upload', modelId: null })
  }

  const handleModel = (model) => {
    if (photo?.modelId === model.id && analysis.status !== 'error') {
      setPicking(false)
      return
    }
    selectPhoto(() => loadImageFromUrl(model.src), { source: 'model', modelId: model.id })
  }

  const showResult = (blob, currentSettings, kind) => {
    const url = trackUrl(blob)
    setResult((prev) => {
      if (prev) releaseUrl(prev.url)
      return { url, blob, key: settingsKey(currentSettings), settings: currentSettings, kind }
    })
  }

  /**
   * Prévia local (instantânea, gratuita). Se a IA já gerou esta mesma configuração
   * para esta foto, mostra a versão da IA guardada. Devolve o canvas da prévia.
   */
  const runRender = useCallback(async (currentSettings, { live = false } = {}) => {
    if (!photo || analysis.status !== 'ready') return null
    const token = ++renderTokenRef.current
    setGenerating(true)
    setProgress(live ? 60 : 20)
    try {
      await nextFrame()
      if (token !== renderTokenRef.current) return null
      const canvas = renderLashSimulation(photo.canvas, analysis.data, currentSettings)
      const cached = aiCacheRef.current.get(`${photo.id}|${settingsKey(currentSettings)}`)
      const blob = cached || await canvasToBlob(canvas, 'image/jpeg', 0.92)
      if (token !== renderTokenRef.current) return null
      showResult(blob, currentSettings, cached ? 'ai' : 'preview')
      setProgress(100)
      if (!live) window.setTimeout(() => revealResult(resultSectionRef.current), 50)
      return { canvas, cached: !!cached }
    } catch (error) {
      console.error('[lash-simulator] render failed', error)
      if (token === renderTokenRef.current) addToast(GENERATE_ERROR, 'error')
      return null
    } finally {
      if (token === renderTokenRef.current) setGenerating(false)
    }
  }, [photo, analysis, addToast])

  // Depois da primeira simulação, mudanças na configuração atualizam a prévia.
  // A IA (paga) só roda quando a profissional toca em "Gerar simulação".
  const hasResult = !!result
  const currentKey = settingsKey(settings)
  useEffect(() => {
    if (mode !== 'auto' || !hasResult || result?.key === currentKey || ai.status === 'running') return undefined
    const timer = window.setTimeout(() => runRender(settings, { live: true }), LIVE_UPDATE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [currentKey, hasResult])

  const runAi = async (currentSettings, previewCanvas) => {
    const photoId = photo.id
    const controller = new AbortController()
    aiAbortRef.current?.abort()
    aiAbortRef.current = controller
    setAi({ status: 'running', message: '' })
    try {
      const { canvas, usage } = await generateAiSimulation({
        original: photo.canvas,
        previewCanvas,
        analysis: analysis.data,
        settings: currentSettings,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92)
      if (controller.signal.aborted) return
      aiCacheRef.current.set(`${photoId}|${settingsKey(currentSettings)}`, blob)
      renderTokenRef.current += 1
      showResult(blob, currentSettings, 'ai')
      if (usage?.limit) setAiUsage(usage)
      setAi({ status: 'done', message: '' })
    } catch (error) {
      if (controller.signal.aborted) return
      setAi({ status: 'error', message: error.message, code: error.code })
    } finally {
      if (aiAbortRef.current === controller) aiAbortRef.current = null
    }
  }

  const handleGenerate = async () => {
    if (generating || ai.status === 'running' || analysis.status !== 'ready') return
    const current = settings
    const rendered = await runRender(current)
    if (!rendered || rendered.cached || !aiEnabled) return
    runAi(current, rendered.canvas)
  }

  // ─── Filtro manual ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'filter' || overlaysStatus === 'loading' || overlaysStatus === 'ready') return
    setOverlaysStatus('loading')
    loadOverlayManifest().then((list) => {
      setOverlays(list)
      setOverlaysStatus(list.length ? 'ready' : 'empty')
    })
  }, [mode, overlaysStatus])

  const selectedOverlay = overlays.find((o) => o.id === filterId) || null

  useEffect(() => {
    if (!selectedOverlay) {
      setFilterImage(null)
      return undefined
    }
    let alive = true
    loadOverlayImage(selectedOverlay.file)
      .then((img) => { if (alive) setFilterImage(img) })
      .catch((error) => {
        console.error('[lash-simulator] overlay load failed', error)
        if (alive) addToast('Não conseguimos carregar este filtro. Tente outro.', 'error')
      })
    return () => { alive = false }
  }, [selectedOverlay, addToast])

  const clampAdjustment = (a) => ({
    dx: a.dx,
    dy: a.dy,
    scale: Math.min(2, Math.max(0.5, a.scale)),
    rotate: Math.min(45, Math.max(-45, a.rotate)),
  })

  /** Ajusta um olho; com "espelhado" o outro recebe o ajuste simétrico. */
  const handleAdjust = (eye, update, base) => {
    const current = base[eye]
    const updated = clampAdjustment(update(current))
    const next = [...base]
    next[eye] = updated
    if (linked) {
      const other = 1 - eye
      const b = base[other]
      next[other] = clampAdjustment({
        dx: b.dx - (updated.dx - current.dx),
        dy: b.dy + (updated.dy - current.dy),
        scale: b.scale * (updated.scale / current.scale),
        rotate: b.rotate - (updated.rotate - current.rotate),
      })
    }
    setAdjustments(next)
    setFilterEditing(true)
  }

  const resetAdjustments = () => {
    setAdjustments([DEFAULT_ADJUSTMENT, DEFAULT_ADJUSTMENT])
    setFilterEditing(true)
  }

  const selectFilter = (id) => {
    setFilterId(id)
    resetAdjustments()
  }

  const filterKey = selectedOverlay ? `filter:${selectedOverlay.id}:${JSON.stringify(adjustments)}` : ''

  const applyFilter = async () => {
    if (!selectedOverlay || !filterImage || analysis.status !== 'ready') return
    try {
      const canvas = renderFilteredPhoto(photo.canvas, analysis.data, selectedOverlay, filterImage, adjustments)
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92)
      const url = trackUrl(blob)
      const filterSettings = normalizeSettings(selectedOverlay.settings || {})
      setResult((prev) => {
        if (prev) releaseUrl(prev.url)
        return { url, blob, key: filterKey, settings: filterSettings, kind: 'filter', label: selectedOverlay.label }
      })
      setSavedKey('')
      setFilterEditing(false)
      window.setTimeout(() => revealResult(resultSectionRef.current), 50)
    } catch (error) {
      console.error('[lash-simulator] filter apply failed', error)
      addToast(GENERATE_ERROR, 'error')
    }
  }

  const changeMode = (next) => {
    if (next === mode) return
    clearResult()
    setFilterEditing(true)
    setMode(next)
  }

  const handleDownload = () => {
    if (!result) return
    downloadBlob(result.blob, buildDownloadName())
  }

  const shareFile = result ? new File([result.blob], buildDownloadName(), { type: 'image/jpeg' }) : null
  const canShare = !!shareFile && canShareFiles(shareFile)

  const handleShare = async () => {
    if (!shareFile) return
    try {
      await navigator.share({ files: [shareFile], title: 'Simulação de cílios' })
    } catch (error) {
      if (error?.name !== 'AbortError') addToast('Não foi possível compartilhar. Use “Baixar”.', 'warning')
    }
  }

  const handleSave = async () => {
    if (!result || saving) return
    if (isDemo) {
      addToast('Crie sua conta para salvar simulações no histórico.', 'warning')
      return
    }
    if (!canUserEdit) {
      onUpgrade('Salve as simulações das suas clientes no histórico.')
      return
    }
    if (savedKey === result.key) {
      addToast('Esta simulação já está salva no histórico.', 'success')
      return
    }
    setSaving(true)
    try {
      await saveSimulation({
        resultBlob: result.blob,
        originalBlob: photo?.source === 'upload' ? photo.blob : null,
        source: photo?.source || 'upload',
        modelId: photo?.modelId || null,
        settings: result.settings,
      })
      setSavedKey(result.key)
      setHistoryKey((k) => k + 1)
      addToast('Simulação salva no histórico.', 'success')
    } catch (error) {
      if (error?.code === 'lash_sim_full_access_required') onUpgrade(error.message)
      else addToast(error.message || 'Não conseguimos salvar a simulação.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const resultIsCurrent = result?.key === (mode === 'filter' ? filterKey : currentKey)
  const aiRunning = ai.status === 'running'

  let generateLabel = 'Gerar simulação'
  let generateDisabled = analysis.status !== 'ready' || generating || aiRunning
  if (aiRunning) generateLabel = 'Gerando com IA…'
  else if (result && resultIsCurrent && result.kind === 'ai') {
    generateLabel = 'Simulação gerada'
    generateDisabled = true
  } else if (result && aiEnabled) generateLabel = 'Gerar versão realista'
  else if (result) {
    generateLabel = resultIsCurrent ? 'Prévia atualizada' : 'Atualizar prévia'
    generateDisabled = generateDisabled || resultIsCurrent
  }
  const model = photo?.modelId ? getDemoModel(photo.modelId) : null
  const showPicker = picking || !photo

  const picker = (
    <div className="ls-card">
      <div className="ls-section-title">
        <span>Escolha a foto</span>
        {photo && (
          <button type="button" className="ls-tab" onClick={() => setPicking(false)} style={{ minHeight: 28, padding: '4px 10px' }}>
            Cancelar
          </button>
        )}
      </div>
      <div className="ls-source-grid">
        <button type="button" className="ls-source-btn" onClick={() => fileInputRef.current?.click()}>
          <span className="ls-icon-badge"><SimIcon name="image" /></span>
          <strong>Enviar foto da cliente</strong>
          <span>JPG, PNG ou WEBP. Foto frontal, bem iluminada e com os olhos abertos.</span>
        </button>
        <button type="button" className="ls-source-btn" onClick={() => cameraInputRef.current?.click()}>
          <span className="ls-icon-badge"><SimIcon name="camera" /></span>
          <strong>Tirar foto agora</strong>
          <span>Abre a câmera do celular. Peça para a cliente olhar para a câmera.</span>
        </button>
      </div>
      <input ref={fileInputRef} type="file" accept={ACCEPT_ATTR} onChange={handleFile} hidden />
      <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={handleFile} hidden />

      {photoError && (
        <div className="ls-status ls-status--error" role="alert">
          <SimIcon name="alert" size={16} /> <span>{photoError}</span>
        </div>
      )}
      {loadingPhoto && (
        <div className="ls-status ls-status--info">
          <div className="ls-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> <span>Abrindo a foto…</span>
        </div>
      )}

      <div className="ls-section" style={{ marginTop: 18 }}>
        <div className="ls-section-title"><span>Ou escolha uma modelo</span></div>
        <ModelGallery selectedId={photo?.modelId} onSelect={handleModel} />
        <p className="ls-hint">Modelos com diferentes formatos de olhos para demonstrar as técnicas.</p>
      </div>

      <p className="ls-hint" style={{ marginTop: 16 }}>
        🔒 A análise do rosto acontece no seu aparelho. A foto só é enviada ao servidor se você salvar a simulação no histórico.
      </p>
    </div>
  )

  const stage = photo && (
    <div className="ls-card">
      <div ref={resultSectionRef} style={{ scrollMarginTop: 80 }} />
      {mode === 'filter' && analysis.status === 'ready' && selectedOverlay && filterImage && (filterEditing || !result) ? (
        <FilterCanvas
          photo={photo}
          analysis={analysis.data}
          overlay={selectedOverlay}
          image={filterImage}
          adjustments={adjustments}
          linked={linked}
          activeEye={activeEye}
          onSelectEye={setActiveEye}
          onAdjust={handleAdjust}
        />
      ) : result ? (
        <div style={{ position: 'relative' }}>
          <BeforeAfterSlider beforeSrc={photo.url} afterSrc={result.url} />
          <span className={`ls-kind ls-kind--${result.kind}`}>
            {result.kind === 'ai' ? 'Versão realista (IA)' : result.kind === 'filter' ? `Filtro: ${result.label}` : 'Prévia rápida'}
          </span>
          {aiRunning && (
            <div className="ls-stage-overlay" style={{ borderRadius: 14 }}>
              <div className="ls-spinner" />
              Criando os cílios realistas com IA…
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-light)' }}>Leva de 5 a 20 segundos. Só a região dos cílios é alterada.</span>
              <div className="ls-progress ls-progress--indeterminate"><div /></div>
            </div>
          )}
        </div>
      ) : (
        <div className="ls-stage">
          <img src={photo.url} alt="Foto selecionada" />
          {analysis.status === 'loading' && (
            <div className="ls-stage-overlay">
              <div className="ls-spinner" />
              Identificando o rosto e a linha dos cílios…
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-light)' }}>Na primeira vez pode levar alguns segundos.</span>
            </div>
          )}
          {generating && (
            <div className="ls-stage-overlay">
              Aplicando os fios…
              <div className="ls-progress"><div style={{ width: `${progress}%` }} /></div>
            </div>
          )}
        </div>
      )}

      {analysis.status === 'ready' && !result && (
        <div className="ls-status ls-status--ok"><SimIcon name="check" size={16} /> <span>Olhos identificados. Configure a extensão e gere a simulação.</span></div>
      )}
      {analysis.status === 'error' && (
        <div className="ls-status ls-status--error" role="alert">
          <SimIcon name="alert" size={16} />
          <span>
            <strong style={{ display: 'block', fontWeight: 600 }}>{analysis.guidance || analysis.message}</strong>
            {analysis.guidance && <span style={{ display: 'block', marginTop: 4 }}>{analysis.message}</span>}
          </span>
        </div>
      )}
      {result && generating && !aiRunning && (
        <div className="ls-status ls-status--info"><div className="ls-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> <span>Atualizando prévia…</span></div>
      )}
      {ai.status === 'error' && result && (
        <div className="ls-status ls-status--error" role="alert">
          <SimIcon name="alert" size={16} /> <span>{ai.message}</span>
        </div>
      )}
      {mode === 'auto' && result?.kind === 'preview' && resultIsCurrent && ai.status !== 'error' && !aiRunning && (
        <div className="ls-status ls-status--info">
          <SimIcon name="sparkle" size={16} />
          <span>
            {aiEnabled
              ? 'Esta é a prévia rápida. Toque em “Gerar versão realista” para criar os cílios com IA.'
              : 'Esta é a prévia rápida. A versão realista com IA fica disponível ao entrar com sua conta.'}
          </span>
        </div>
      )}

      {mode === 'filter' && result?.kind === 'filter' && !filterEditing && (
        <div className="ls-row">
          <Btn variant="outline" sm touch onClick={() => setFilterEditing(true)}>
            <SimIcon name="refresh" size={15} /> Editar ajuste do filtro
          </Btn>
        </div>
      )}

      <div className="ls-row">
        <Btn variant="ghost" sm touch onClick={() => setPicking(true)}>
          <SimIcon name="refresh" size={15} /> Trocar foto
        </Btn>
        <Btn variant="ghost" sm touch onClick={removePhoto}>
          <SimIcon name="trash" size={15} /> Remover
        </Btn>
      </div>
      {model && (
        <p className="ls-hint">
          {model.name} · foto de {model.credit.author} ({model.credit.license})
        </p>
      )}

      {result && (
        <div className="ls-section">
          <div className="ls-section-title"><span>Resultado</span></div>
          <SettingsSummary settings={result.settings} />
          <div className="ls-row">
            <Btn touch onClick={handleDownload} disabled={!resultIsCurrent}>
              <SimIcon name="download" size={16} /> Baixar resultado
            </Btn>
            {canShare && (
              <Btn variant="outline" touch onClick={handleShare} disabled={!resultIsCurrent}>
                <SimIcon name="share" size={16} /> Compartilhar
              </Btn>
            )}
            <Btn variant="outline" touch onClick={handleSave} loading={saving} disabled={!resultIsCurrent || saving}>
              <SimIcon name="save" size={16} /> {savedKey && savedKey === result.key ? 'Salva no histórico' : 'Salvar simulação'}
            </Btn>
          </div>
          {!isDemo && !canUserEdit && (
            <p className="ls-hint">Baixar é liberado. Salvar no histórico faz parte do plano completo.</p>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className={`ls-page${tab === 'new' && photo ? ' ls-page--with-bar' : ''}`}>
      <div className="ls-header">
        <div>
          <h2 className="ls-title">Simulador de Cílios</h2>
          <p className="ls-subtitle">Mostre para a cliente como fica a extensão antes de aplicar.</p>
        </div>
        <div className="ls-tabs" role="tablist" aria-label="Simulador">
          <button type="button" role="tab" className="ls-tab" aria-selected={tab === 'new'} onClick={() => setTab('new')}>Nova simulação</button>
          <button type="button" role="tab" className="ls-tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}>Histórico</button>
        </div>
      </div>

      {tab === 'history' && <HistoryPanel isDemo={isDemo} addToast={addToast} refreshKey={historyKey} />}

      {tab === 'new' && showPicker && !photo && picker}

      {tab === 'new' && photo && (
        <div className="ls-layout">
          <div className="ls-sticky">
            {showPicker ? picker : stage}
          </div>
          <div>
            <div className="ls-card">
              <div className="ls-mode" role="tablist" aria-label="Modo de simulação">
                <button type="button" role="tab" aria-selected={mode === 'auto'} onClick={() => changeMode('auto')}>
                  <strong>Automático</strong>
                  <span>Configure técnica e mapeamento</span>
                </button>
                <button type="button" role="tab" aria-selected={mode === 'filter'} onClick={() => changeMode('filter')}>
                  <strong>Filtro manual</strong>
                  <span>Cílios prontos, ajuste com o dedo</span>
                </button>
              </div>

              {mode === 'filter' ? (
                <FilterPanel
                  overlays={overlays}
                  status={overlaysStatus}
                  selectedId={filterId}
                  onSelect={selectFilter}
                  adjustments={adjustments}
                  activeEye={activeEye}
                  onSelectEye={setActiveEye}
                  linked={linked}
                  onLinkedChange={setLinked}
                  onAdjust={handleAdjust}
                  onReset={resetAdjustments}
                  onApply={applyFilter}
                  disabled={analysis.status !== 'ready' || !filterImage || (resultIsCurrent && !filterEditing)}
                />
              ) : (
                <>
                  <div className="ls-section-title" style={{ marginBottom: 0, marginTop: 16 }}>
                    <span>Configuração da extensão</span>
                  </div>
                  <div
                    style={aiRunning ? { pointerEvents: 'none', opacity: 0.55 } : undefined}
                    aria-busy={aiRunning}
                  >
                    <ConfigPanel settings={settings} onChange={setSettings} />
                  </div>
                  <div className="ls-actionbar">
                    <Btn
                      full
                      touch
                      onClick={handleGenerate}
                      disabled={generateDisabled}
                      loading={aiRunning || (generating && !result)}
                    >
                      <SimIcon name="sparkle" size={16} />
                      {generateLabel}
                    </Btn>
                    <p className="ls-hint" style={{ textAlign: 'center' }}>
                      {describeSettings(settings)}
                      {aiUsage?.limit ? ` · IA: ${aiUsage.used} de ${aiUsage.limit} no mês` : ''}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LashSimulatorPage
