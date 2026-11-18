import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import Icon from './Icon'
import { Btn, Field, Inp, Sel, Textarea } from './UI'
import { DEFAULT_CONSENT_TEXT } from '../lib/extras'
import {
  ANAMNESE_FIELDS,
  addClientPhoto,
  deleteClientPhoto,
  getClientRecord,
  listClientPhotos,
  saveClientRecord,
} from '../lib/clientRecords'

const TABS = [
  { id: 'anamnese', label: 'Anamnese' },
  { id: 'termo', label: 'Termo' },
  { id: 'fotos', label: 'Fotos' },
]
const KIND_LABEL = { antes: 'Antes', depois: 'Depois', outro: 'Foto' }
const isRealAccount = (userId) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(userId || ''))

const formatDateTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Quadro para a cliente assinar com o dedo. */
const SignaturePad = ({ onChange }) => {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const last = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ratio = window.devicePixelRatio || 1
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    const ctx = canvas.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1f1416'
  }, [])

  const point = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const start = (e) => {
    e.preventDefault()
    canvasRef.current.setPointerCapture?.(e.pointerId)
    drawing.current = true
    last.current = point(e)
  }
  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const p = point(e)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    onChange(canvasRef.current)
  }
  const end = () => { drawing.current = false }
  const clear = () => {
    const c = canvasRef.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    onChange(null)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        aria-label="Área para assinar"
        style={{ width: '100%', height: 160, border: '1.5px dashed var(--border-mid)', borderRadius: 12, background: '#fff', touchAction: 'none', display: 'block' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-light)' }}>Assine com o dedo dentro do quadro</span>
        <button type="button" onClick={clear} style={{ background: 'none', border: 'none', color: 'var(--rose-deep)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Limpar</button>
      </div>
    </div>
  )
}

const ClientRecordModal = ({ client, userId, consentText, canUserEdit, onBlockedAction, addToast, onClose }) => {
  const [tab, setTab] = useState('anamnese')
  const [record, setRecord] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [anamnese, setAnamnese] = useState({})
  const [saving, setSaving] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signName, setSignName] = useState(client.name || '')
  const [signatureCanvas, setSignatureCanvas] = useState(null)
  const [photos, setPhotos] = useState(null)
  const [photoKind, setPhotoKind] = useState('antes')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  const termText = consentText || DEFAULT_CONSENT_TEXT
  const realAccount = isRealAccount(userId)

  useEffect(() => {
    let alive = true
    getClientRecord(userId, client.id)
      .then((r) => {
        if (!alive) return
        setRecord(r)
        setAnamnese(r.anamnese || {})
        setSigning(!r.consentSignedAt)
      })
      .catch((e) => { if (alive) setLoadError(e.message) })
    return () => { alive = false }
  }, [userId, client.id])

  const loadPhotos = () => {
    if (!realAccount) { setPhotos([]); return }
    listClientPhotos(userId, client.id).then(setPhotos).catch((e) => { setPhotos([]); addToast(e.message, 'error') })
  }
  useEffect(() => {
    if (tab === 'fotos' && photos === null) loadPhotos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const guard = () => {
    if (canUserEdit) return false
    onBlockedAction?.('Desbloqueie para salvar a ficha.')
    return true
  }

  const saveAnamnese = async () => {
    if (guard()) return
    setSaving(true)
    try {
      const next = await saveClientRecord(userId, { ...record, clientId: client.id, anamnese })
      setRecord(next)
      addToast('Anamnese salva!', 'success')
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveSignature = async () => {
    if (guard()) return
    if (signName.trim().length < 3) return addToast('Escreva o nome de quem está assinando.', 'warning')
    if (!signatureCanvas) return addToast('Peça para a cliente assinar no quadro.', 'warning')
    setSaving(true)
    try {
      const signatureDataUrl = realAccount ? null : signatureCanvas.toDataURL('image/png')
      const signatureBlob = realAccount ? await new Promise((res) => signatureCanvas.toBlob(res, 'image/png')) : null
      const next = await saveClientRecord(
        userId,
        { ...record, clientId: client.id, anamnese, consentText: termText, consentName: signName.trim(), consentSignedAt: new Date().toISOString() },
        { signatureBlob, signatureDataUrl },
      )
      setRecord(next)
      setSigning(false)
      setSignatureCanvas(null)
      addToast('Termo assinado e salvo!', 'success')
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || guard()) return
    setUploading(true)
    try {
      await addClientPhoto(userId, client.id, file, { kind: photoKind })
      addToast('Foto salva!', 'success')
      loadPhotos()
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = async (photo) => {
    if (guard()) return
    if (!window.confirm('Apagar esta foto? Não dá para desfazer.')) return
    try {
      await deleteClientPhoto(userId, photo)
      setPhotos((list) => (list || []).filter((p) => p.id !== photo.id))
      addToast('Foto apagada.', 'success')
    } catch (e) {
      addToast(e.message, 'error')
    }
  }

  return (
    <Modal open onClose={onClose} title={`Ficha — ${client.name}`} wide>
      <div role="tablist" aria-label="Partes da ficha" style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{ padding: '7px 14px', borderRadius: 999, border: 'none', fontFamily: 'inherit', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === t.id ? 'var(--rose-deep)' : 'var(--rose-light)', color: tab === t.id ? '#fff' : 'var(--text-mid)' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loadError && <p style={{ color: '#9B3D4A', fontSize: 13 }}>{loadError}</p>}
      {!record && !loadError && <p style={{ fontSize: 13, color: 'var(--text-light)' }}>Abrindo a ficha...</p>}

      {record && tab === 'anamnese' && (
        <div>
          {ANAMNESE_FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              {f.yesNo ? (
                <Sel value={anamnese[f.key] || ''} onChange={(e) => setAnamnese((a) => ({ ...a, [f.key]: e.target.value }))}>
                  <option value="">—</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                </Sel>
              ) : (
                <Textarea rows={2} value={anamnese[f.key] || ''} onChange={(e) => setAnamnese((a) => ({ ...a, [f.key]: e.target.value.slice(0, 500) }))} />
              )}
            </Field>
          ))}
          {record.updatedAt && <p style={{ fontSize: 11, color: 'var(--text-light)', margin: '-6px 0 12px' }}>Última atualização: {formatDateTime(record.updatedAt)}</p>}
          <Btn onClick={saveAnamnese} loading={saving}><Icon name="check" size={14} color="#fff" /> Salvar anamnese</Btn>
        </div>
      )}

      {record && tab === 'termo' && (
        <div>
          <div style={{ border: '1px solid var(--rose-light)', borderRadius: 12, padding: 14, background: 'var(--off-white)', marginBottom: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-line' }}>
              {record.consentSignedAt && !signing ? (record.consentText || termText) : termText}
            </p>
          </div>

          {record.consentSignedAt && !signing ? (
            <div>
              <p style={{ fontSize: 13, color: '#065F46', fontWeight: 600, marginBottom: 8 }}>
                ✓ Assinado por {record.consentName} em {formatDateTime(record.consentSignedAt)}
              </p>
              {record.signatureUrl && (
                <img src={record.signatureUrl} alt={`Assinatura de ${record.consentName}`} style={{ width: '100%', maxWidth: 360, border: '1px solid var(--rose-light)', borderRadius: 10, background: '#fff' }} />
              )}
              <div style={{ marginTop: 12 }}>
                <Btn variant="ghost" sm onClick={() => setSigning(true)}>Assinar de novo</Btn>
              </div>
            </div>
          ) : (
            <div>
              <Field label="Nome de quem assina">
                <Inp value={signName} onChange={(e) => setSignName(e.target.value)} maxLength={80} />
              </Field>
              <SignaturePad onChange={setSignatureCanvas} />
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <Btn onClick={saveSignature} loading={saving}><Icon name="check" size={14} color="#fff" /> Salvar assinatura</Btn>
                {record.consentSignedAt && <Btn variant="ghost" onClick={() => setSigning(false)}>Cancelar</Btn>}
              </div>
            </div>
          )}
        </div>
      )}

      {record && tab === 'fotos' && (
        <div>
          {!realAccount ? (
            <p style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.55 }}>
              As fotos de antes e depois ficam guardadas na sua conta. Na demonstração elas não são salvas.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ width: 140 }}>
                  <Field label="Tipo">
                    <Sel value={photoKind} onChange={(e) => setPhotoKind(e.target.value)}>
                      <option value="antes">Antes</option>
                      <option value="depois">Depois</option>
                      <option value="outro">Outra</option>
                    </Sel>
                  </Field>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <Btn onClick={() => fileRef.current?.click()} loading={uploading}><Icon name="upload" size={14} color="#fff" /> Adicionar foto</Btn>
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} style={{ display: 'none' }} />
              </div>
              {photos === null ? (
                <p style={{ fontSize: 13, color: 'var(--text-light)' }}>Carregando fotos...</p>
              ) : photos.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-light)' }}>Nenhuma foto ainda.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                  {photos.map((p) => (
                    <figure key={p.id} style={{ margin: 0, border: '1px solid var(--rose-light)', borderRadius: 12, overflow: 'hidden', background: 'var(--off-white)' }}>
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noopener noreferrer">
                          <img src={p.url} alt={`${KIND_LABEL[p.kind] || 'Foto'} de ${client.name}`} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} />
                        </a>
                      ) : (
                        <div style={{ aspectRatio: '1 / 1' }} />
                      )}
                      <figcaption style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', fontSize: 11, color: 'var(--text-mid)' }}>
                        <span><strong>{KIND_LABEL[p.kind] || 'Foto'}</strong> · {String(p.takenOn || '').split('-').reverse().join('/')}</span>
                        <button type="button" aria-label="Apagar foto" onClick={() => removePhoto(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                          <Icon name="trash" size={12} color="#C5515F" />
                        </button>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

export default ClientRecordModal
