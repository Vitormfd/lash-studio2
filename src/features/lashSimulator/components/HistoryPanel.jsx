import { useCallback, useEffect, useState } from 'react'
import Modal from '../../../components/Modal'
import { Btn } from '../../../components/UI'
import { describeSettings, formatThickness, formatVolume, getCurl, getMapping, getTechnique } from '../catalog'
import { getDemoModel } from '../models'
import { deleteSimulation, fetchQuota, listSimulations } from '../simulationsApi'
import BeforeAfterSlider from './BeforeAfterSlider'
import { MappingSparkline, SimIcon } from './SimIcons'

const formatWhen = (iso) => new Date(iso).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

const beforeSrcOf = (simulation) =>
  simulation.originalUrl || getDemoModel(simulation.modelId)?.src || ''

export const SettingsSummary = ({ settings }) => {
  const rows = [
    ['Técnica', getTechnique(settings.technique).label],
    ['Quantidade', settings.volume ? formatVolume(settings.volume) : 'Não se aplica'],
    ['Curvatura', getCurl(settings.curl).label],
    ['Espessura', formatThickness(settings.thicknessMm)],
  ]
  if (settings.classicThicknessMm) rows.push(['Fio a fio', formatThickness(settings.classicThicknessMm)])
  rows.push(['Mapeamento', getMapping(settings.mapping).label])
  return (
    <>
      <dl className="ls-summary">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd title={value}>{value}</dd>
          </div>
        ))}
        <div>
          <dt>Comprimentos</dt>
          <dd style={{ color: 'var(--rose-deep)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <MappingSparkline lengths={settings.lengths} width={52} height={16} />
            <span style={{ color: 'var(--text)', fontSize: 11 }}>
              {Math.min(...settings.lengths)}–{Math.max(...settings.lengths)} mm
            </span>
          </dd>
        </div>
      </dl>
    </>
  )
}

const HistoryPanel = ({ isDemo, addToast, refreshKey }) => {
  const [items, setItems] = useState([])
  const [quota, setQuota] = useState(null)
  const [status, setStatus] = useState('loading')
  const [open, setOpen] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const [list, usage] = await Promise.all([listSimulations(), fetchQuota().catch(() => null)])
      setItems(list)
      setQuota(usage)
      setStatus('ready')
    } catch (error) {
      setStatus('error')
      addToast(error.message || 'Não conseguimos carregar o histórico.', 'error')
    }
  }, [addToast])

  useEffect(() => {
    if (isDemo) return
    load()
  }, [isDemo, load, refreshKey])

  const handleDelete = async () => {
    if (!open || deleting) return
    setDeleting(true)
    try {
      await deleteSimulation(open)
      setItems((list) => list.filter((item) => item.id !== open.id))
      setOpen(null)
      setConfirmDelete(false)
      addToast('Simulação excluída.', 'success')
    } catch (error) {
      addToast(error.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  if (isDemo) {
    return (
      <div className="ls-card ls-empty">
        O histórico fica disponível quando você entra com sua conta do Easy Studio.
      </div>
    )
  }

  return (
    <div className="ls-card">
      <div className="ls-section-title">
        <span>Simulações salvas</span>
        {quota && quota.limit > 0 && (
          <span style={{ textTransform: 'none', letterSpacing: 0 }}>{quota.used} de {quota.limit} neste mês</span>
        )}
      </div>

      {status === 'loading' && (
        <div className="ls-empty"><div className="ls-spinner" style={{ margin: '0 auto 10px' }} />Carregando histórico…</div>
      )}
      {status === 'error' && (
        <div className="ls-empty">
          Não conseguimos carregar o histórico.
          <div style={{ marginTop: 12 }}><Btn variant="outline" sm onClick={load}>Tentar de novo</Btn></div>
        </div>
      )}
      {status === 'ready' && items.length === 0 && (
        <div className="ls-empty">Nenhuma simulação salva ainda. Gere uma simulação e toque em “Salvar simulação”.</div>
      )}
      {status === 'ready' && items.length > 0 && (
        <div className="ls-history">
          {items.map((item) => (
            <button key={item.id} type="button" className="ls-history-item" onClick={() => { setOpen(item); setConfirmDelete(false) }}>
              <img src={item.resultUrl} alt="Resultado da simulação" loading="lazy" />
              <span className="ls-history-meta">
                <strong>{getTechnique(item.settings.technique).label}</strong>
                {getMapping(item.settings.mapping).label} · {formatWhen(item.createdAt)}
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="ls-hint" style={{ marginTop: 14 }}>
        As fotos ficam guardadas de forma privada e só você tem acesso. Excluir uma simulação apaga também as fotos.
      </p>

      <Modal open={!!open} onClose={() => { if (!deleting) setOpen(null) }} title="Simulação salva" wide>
        {open && (
          <div>
            {beforeSrcOf(open)
              ? <BeforeAfterSlider beforeSrc={beforeSrcOf(open)} afterSrc={open.resultUrl} />
              : <img src={open.resultUrl} alt="Resultado da simulação" style={{ width: '100%', borderRadius: 14 }} />}
            <p style={{ fontSize: 12, color: 'var(--text-light)', margin: '12px 0 10px' }}>
              {formatWhen(open.createdAt)} · {describeSettings(open.settings)}
            </p>
            <SettingsSummary settings={open.settings} />
            <div className="ls-row">
              <a
                href={open.resultUrl}
                download="simulacao-cilios.jpg"
                target="_blank"
                rel="noopener noreferrer"
                className="ls-chip"
                style={{ textDecoration: 'none' }}
              >
                <SimIcon name="download" size={16} /> Abrir / baixar
              </a>
              {!confirmDelete ? (
                <Btn variant="ghost" onClick={() => setConfirmDelete(true)}>
                  <SimIcon name="trash" size={15} /> Excluir
                </Btn>
              ) : (
                <Btn variant="danger" onClick={handleDelete} loading={deleting}>
                  Confirmar exclusão
                </Btn>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default HistoryPanel
