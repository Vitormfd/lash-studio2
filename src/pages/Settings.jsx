import { useState, useEffect } from 'react'
import { Btn, Field, Inp, Sel } from '../components/UI'
import Icon from '../components/Icon'
import { AUTH } from '../lib/auth'
import { DB, uid } from '../lib/supabase'
import { hashPin, verifyMemberPin, pickMemberColor, getAccountOwner, useOperator } from '../lib/operator'
import {
  isPushSupported,
  getVapidPublicKey,
  subscribeToPush,
  unsubscribePush,
  getExistingPushSubscription,
} from '../lib/pushClient'
import { THEME_LIST, getSavedThemeId, saveAndApplyTheme } from '../lib/theme'
import { APP_DESCRIPTION, APP_NAME, getProfessionalTypeMeta } from '../lib/domain'
import { BRAZIL_STATES } from '../lib/holidays'
import {
  DEFAULT_WORK_HOURS,
  WORK_DAY_ORDER,
  WORK_TIME_OPTIONS,
  normalizeWorkHours,
} from '../lib/workHours'

const SUPPORT_WHATSAPP = '5574999348744'
const SUPPORT_WHATSAPP_TEXT = 'Olá! Preciso de ajuda com o app.'

const Settings = ({
  config,
  setConfig,
  addToast,
  session,
  professionalType,
  onLogout,
  isDemo = false,
  teamMembers = [],
  onTeamMembersChange,
  refreshTeamMembers,
}) => {
  const [cost, setCost] = useState(config.avgCost)
  const [stateUf, setStateUf] = useState(config.stateUf || '')
  const [city, setCity] = useState(config.city || '')
  const [workHours, setWorkHours] = useState(() => normalizeWorkHours(config.workHours))
  const [themeId, setThemeId] = useState(getSavedThemeId(session?.userId))
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [pinForm, setPinForm] = useState({ current: '', next: '', confirm: '' })
  const [pinError, setPinError] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [pwaStandalone, setPwaStandalone] = useState(false)
  const [pwaCanInstall, setPwaCanInstall] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushOn, setPushOn] = useState(false)
  const [memberForm, setMemberForm] = useState({ name: '', pin: '' })
  const [memberBusy, setMemberBusy] = useState(false)
  const userId = session?.userId
  const professionalMeta = getProfessionalTypeMeta(professionalType)
  const { operator } = useOperator()
  const accountOwner = getAccountOwner(teamMembers)
  const myMember = teamMembers.find((m) => m.id === operator?.id) || null
  const myHasPin = !!myMember?.pinHash

  const digitsOnly = (value) => String(value || '').replace(/\D/g, '').slice(0, 4)

  const blockDemoAction = () => {
    if (!isDemo) return false
    addToast('Modo demonstracao: configuracoes em somente leitura.', 'info')
    return true
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const sub = await getExistingPushSubscription()
      if (!cancelled) setPushOn(!!sub)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true
    setPwaStandalone(standalone)
    const checkPrompt = () => {
      if (window.__lashPwa?.getInstallPrompt?.()) setPwaCanInstall(true)
    }
    checkPrompt()
    window.addEventListener('lash-pwa-install-ready', checkPrompt)
    return () => window.removeEventListener('lash-pwa-install-ready', checkPrompt)
  }, [])

  useEffect(() => {
    setThemeId(getSavedThemeId(session?.userId))
  }, [session?.userId])

  useEffect(() => {
    setCost(config.avgCost)
    setStateUf(config.stateUf || '')
    setCity(config.city || '')
    setWorkHours(normalizeWorkHours(config.workHours))
  }, [config.avgCost, config.stateUf, config.city, config.workHours])

  const updateWorkDay = (key, patch) => {
    setWorkHours((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }))
  }

  const enablePushNotifications = async () => {
    if (blockDemoAction()) return
    if (!isPushSupported()) {
      addToast('Este navegador não suporta notificações push.', 'warning')
      return
    }
    if (!userId) {
      addToast('Faça login novamente para ativar notificações.', 'warning')
      return
    }
    if (!getVapidPublicKey()) {
      addToast(
        'Esta versão do app não tem a chave no build. No Vercel, abra a variável VITE_VAPID_PUBLIC_KEY e marque também Production (não só Preview). Salve, faça Redeploy e atualize o app.',
        'warning',
      )
      return
    }
    setPushBusy(true)
    try {
      const perm = await Notification.requestPermission()
      window.dispatchEvent(new CustomEvent('lash-notification-settings-changed'))
      if (perm !== 'granted') {
        addToast('Sem permissão. Você pode ativar depois nas configurações do navegador.', 'warning')
        return
      }
      const sub = await subscribeToPush()
      if (!sub) {
        addToast('Não foi possível registrar o push. Verifique se a chave pública corresponde à privada no servidor.', 'error')
        return
      }
      await DB.savePushSubscription(userId, sub, {
        morningEnabled: true,
        reminderMinutesBefore: 60,
        progressEnabled: true,
      }, operator?.id || null)
      setPushOn(true)
      addToast('Notificações ativadas neste aparelho.', 'success')
    } catch {
      addToast('Não foi possível ativar notificações.', 'error')
    } finally {
      setPushBusy(false)
    }
  }

  const disablePushNotifications = async () => {
    if (blockDemoAction()) return
    if (!userId) return
    setPushBusy(true)
    try {
      const sub = await getExistingPushSubscription()
      if (sub) {
        await DB.deletePushSubscription(userId, sub)
        await unsubscribePush()
      }
      setPushOn(false)
      window.dispatchEvent(new CustomEvent('lash-notification-settings-changed'))
      addToast('Notificações desativadas.', 'info')
    } catch {
      addToast('Erro ao desativar.', 'error')
    } finally {
      setPushBusy(false)
    }
  }

  const installPwa = async () => {
    if (blockDemoAction()) return
    const p = window.__lashPwa?.getInstallPrompt?.()
    if (!p) { addToast('Use o menu do navegador (⋮) → Instalar app ou atalho.', 'warning'); return }
    p.prompt()
    const { outcome } = await p.userChoice
    window.__lashPwa?.clearInstallPrompt?.()
    setPwaCanInstall(false)
    if (outcome === 'accepted') addToast('App instalado!', 'success')
  }

  const changePassword = async () => {
    if (blockDemoAction()) return
    if (!pwForm.next) { setPwError('Preencha a nova senha.'); return }
    if (pwForm.next.length < 6) { setPwError('Nova senha deve ter ao menos 6 caracteres.'); return }
    if (pwForm.next !== pwForm.confirm) { setPwError('As senhas não coincidem.'); return }
    try {
      await AUTH.changePassword(pwForm.next)
      setPwForm({ current: '', next: '', confirm: '' }); setPwError('')
      addToast('Senha alterada!', 'success')
    } catch (e) { setPwError(e.message) }
  }

  const changeMyPin = async () => {
    if (blockDemoAction()) return
    if (!userId || !myMember) {
      setPinError('Selecione um perfil de operador para alterar o PIN.')
      return
    }
    setPinError('')
    if (myHasPin) {
      if (pinForm.current.length !== 4) {
        setPinError('Informe o PIN atual (4 dígitos).')
        return
      }
      const ok = await verifyMemberPin(myMember, pinForm.current)
      if (!ok) {
        setPinError('PIN atual incorreto.')
        return
      }
    }
    if (pinForm.next.length !== 4) {
      setPinError('O novo PIN deve ter 4 dígitos.')
      return
    }
    if (pinForm.next !== pinForm.confirm) {
      setPinError('Os PINs não coincidem.')
      return
    }
    if (myHasPin && pinForm.next === pinForm.current) {
      setPinError('O novo PIN deve ser diferente do atual.')
      return
    }
    setPinBusy(true)
    try {
      const pinHash = await hashPin(pinForm.next)
      const saved = await DB.saveTeamMember(userId, {
        ...myMember,
        pinHash,
      })
      const next = teamMembers.map((m) => (m.id === saved.id ? saved : m))
      onTeamMembersChange?.(next)
      await refreshTeamMembers?.()
      setPinForm({ current: '', next: '', confirm: '' })
      addToast(myHasPin ? 'PIN alterado!' : 'PIN definido!', 'success')
    } catch {
      setPinError('Não foi possível salvar o PIN.')
      addToast('Não foi possível alterar o PIN.', 'error')
    } finally {
      setPinBusy(false)
    }
  }

  const removeMyPin = async () => {
    if (blockDemoAction()) return
    if (!userId || !myMember || !myHasPin) return
    setPinError('')
    if (pinForm.current.length !== 4) {
      setPinError('Informe o PIN atual para remover.')
      return
    }
    const ok = await verifyMemberPin(myMember, pinForm.current)
    if (!ok) {
      setPinError('PIN atual incorreto.')
      return
    }
    setPinBusy(true)
    try {
      const saved = await DB.saveTeamMember(userId, {
        ...myMember,
        pinHash: null,
      })
      const next = teamMembers.map((m) => (m.id === saved.id ? saved : m))
      onTeamMembersChange?.(next)
      await refreshTeamMembers?.()
      setPinForm({ current: '', next: '', confirm: '' })
      addToast('PIN removido.', 'info')
    } catch {
      setPinError('Não foi possível remover o PIN.')
      addToast('Não foi possível remover o PIN.', 'error')
    } finally {
      setPinBusy(false)
    }
  }

  const applySelectedTheme = (id) => {
    if (blockDemoAction()) return
    const next = saveAndApplyTheme(session?.userId, id)
    setThemeId(next)
    addToast('Tema aplicado!', 'success')
  }

  const addTeamMember = async () => {
    if (blockDemoAction()) return
    const name = memberForm.name.trim()
    if (!name || !userId) return
    setMemberBusy(true)
    try {
      const pinHash = memberForm.pin.trim() ? await hashPin(memberForm.pin) : null
      const saved = await DB.saveTeamMember(userId, {
        id: uid(),
        name,
        color: pickMemberColor(teamMembers.length),
        pinHash,
        active: true,
        _new: true,
      })
      onTeamMembersChange?.([...teamMembers, saved])
      await refreshTeamMembers?.()
      setMemberForm({ name: '', pin: '' })
      addToast('Operador adicionado!', 'success')
    } catch {
      addToast('Não foi possível adicionar operador.', 'error')
    } finally {
      setMemberBusy(false)
    }
  }

  const removeTeamMember = async (memberId) => {
    if (blockDemoAction()) return
    if (!userId) return
    setMemberBusy(true)
    try {
      await DB.deleteTeamMember(userId, memberId)
      const next = teamMembers.filter((m) => m.id !== memberId)
      onTeamMembersChange?.(next)
      await refreshTeamMembers?.()
      addToast('Operador removido.', 'info')
    } catch {
      addToast('Não foi possível remover operador.', 'error')
    } finally {
      setMemberBusy(false)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      {isDemo && (
        <div style={{ background: '#FEF3C7', borderRadius: 12, padding: '12px 16px', border: '1px solid #FCD34D', maxWidth: 480, marginBottom: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#92400E' }}>Modo demonstracao: somente leitura</p>
          <p style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>Nesta tela, alteracoes de configuracao ficam bloqueadas no teste gratis.</p>
        </div>
      )}

      {/* Cloud status */}
      <div style={{ background: '#D1FAE5', borderRadius: 12, padding: '12px 16px', border: '1px solid #A7F3D0', maxWidth: 480, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#059669', flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#065F46' }}>Conectado na nuvem ☁️</p>
          <p style={{ fontSize: 11, color: '#047857', marginTop: 1 }}>Dados salvos com segurança na nuvem</p>
        </div>
      </div>

      {/* Financial settings */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Configurações Financeiras</h3>
        <Field label="Custo padrão por cliente (R$)">
          <Inp type="number" value={cost} onChange={(e) => setCost(e.target.value)} step="0.01" disabled={isDemo} />
          <p style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 5 }}>
            Usado quando o serviço não tem custo próprio cadastrado
          </p>
        </Field>
        <Btn
          onClick={() => {
            if (blockDemoAction()) return
            setConfig({ ...config, avgCost: Number(cost) })
            addToast('Configurações salvas!', 'success')
          }}
          disabled={isDemo}
        >
          <Icon name="check" size={14} color="#fff" /> Salvar configurações
        </Btn>
      </div>

      {/* Work hours */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Horário de trabalho</h3>
        <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 14, lineHeight: 1.55 }}>
          Defina os dias e horários em que você atende. O agendamento público só libera horários dentro dessa janela.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          {WORK_DAY_ORDER.map(({ key, label }) => {
            const day = workHours[key] || DEFAULT_WORK_HOURS[key]
            return (
              <div
                key={key}
                style={{
                  border: '1px solid var(--rose-light)',
                  borderRadius: 12,
                  padding: '12px 12px',
                  background: day.closed ? 'var(--off-white)' : 'var(--surface)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: day.closed ? 0 : 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{label}</span>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-mid)', cursor: isDemo ? 'default' : 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!day.closed}
                      disabled={isDemo}
                      onChange={(e) => updateWorkDay(key, { closed: !e.target.checked })}
                      style={{ width: 16, height: 16, accentColor: 'var(--rose-deep)' }}
                    />
                    Aberto
                  </label>
                </div>
                {!day.closed && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ flex: '1 1 120px', minWidth: 110 }}>
                      <Sel
                        value={day.start}
                        disabled={isDemo}
                        onChange={(e) => updateWorkDay(key, { start: e.target.value })}
                      >
                        {WORK_TIME_OPTIONS.map((t) => (
                          <option key={`s-${key}-${t}`} value={t}>{t}</option>
                        ))}
                      </Sel>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-light)' }}>até</span>
                    <div style={{ flex: '1 1 120px', minWidth: 110 }}>
                      <Sel
                        value={day.end}
                        disabled={isDemo}
                        onChange={(e) => updateWorkDay(key, { end: e.target.value })}
                      >
                        {WORK_TIME_OPTIONS.map((t) => (
                          <option key={`e-${key}-${t}`} value={t}>{t}</option>
                        ))}
                      </Sel>
                    </div>
                  </div>
                )}
                {day.closed && (
                  <p style={{ fontSize: 12, color: 'var(--text-light)', margin: 0 }}>Fechado — sem horários no link público</p>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 14 }}>
          <Btn
            onClick={() => {
              if (blockDemoAction()) return
              const normalized = normalizeWorkHours(workHours)
              const invalid = WORK_DAY_ORDER.some(({ key }) => {
                const d = normalized[key]
                if (d.closed) return false
                return !d.start || !d.end || d.start >= d.end
              })
              if (invalid) {
                addToast('Revise os horários: o fim precisa ser depois do início.', 'warning')
                return
              }
              setWorkHours(normalized)
              setConfig({
                ...config,
                workHours: normalized,
              })
              addToast('Horário de trabalho salvo! O agendamento público já usa essa janela.', 'success')
            }}
            disabled={isDemo}
          >
            <Icon name="check" size={14} color="#fff" /> Salvar horário de trabalho
          </Btn>
        </div>
      </div>

      {/* Location / holidays */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Localização e feriados</h3>
        <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 14, lineHeight: 1.55 }}>
          Informe onde você atende para a agenda marcar feriados nacionais, estaduais e municipais (das principais cidades).
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Estado (UF)" half>
            <Sel
              value={stateUf}
              onChange={(e) => setStateUf(e.target.value)}
              disabled={isDemo}
            >
              <option value="">Selecionar…</option>
              {BRAZIL_STATES.map((s) => (
                <option key={s.uf} value={s.uf}>{s.uf} — {s.name}</option>
              ))}
            </Sel>
          </Field>
          <Field label="Cidade" half>
            <Inp
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ex.: São Paulo"
              disabled={isDemo}
            />
          </Field>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-light)', marginTop: -4, marginBottom: 14, lineHeight: 1.5 }}>
          Sem UF, só aparecem feriados nacionais. A cidade ativa feriados municipais quando o município está na lista.
        </p>
        <Btn
          onClick={() => {
            if (blockDemoAction()) return
            setConfig({
              ...config,
              stateUf: stateUf || '',
              city: city.trim(),
            })
            addToast('Localização salva! A agenda já usa os feriados.', 'success')
          }}
          disabled={isDemo}
        >
          <Icon name="check" size={14} color="#fff" /> Salvar localização
        </Btn>
      </div>

      {/* Theme settings */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Tema do app</h3>
        <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 12 }}>
          Escolha a paleta de cores que deseja usar no app.
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          {THEME_LIST.map((theme) => {
            const active = themeId === theme.id
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => applySelectedTheme(theme.id)}
                disabled={isDemo}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  background: active ? 'var(--rose-light)' : 'var(--surface)',
                  border: `1px solid ${active ? 'var(--rose-deep)' : 'var(--rose-light)'}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                  color: 'var(--text)',
                  cursor: isDemo ? 'not-allowed' : 'pointer',
                  opacity: isDemo ? 0.7 : 1,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 500 }}>{theme.label}</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: theme.vars['--rose-deep'] }} />
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: theme.vars['--rose'] }} />
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: theme.vars['--nude'] }} />
                </span>
              </button>
            )
          })}
        </div>
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <Btn variant="ghost" sm onClick={() => applySelectedTheme('rose')} disabled={isDemo}>
            Voltar ao tema padrão
          </Btn>
        </div>
      </div>

      {/* Team operators */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Equipe (quem usa o app)</h3>
        <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 14, lineHeight: 1.55 }}>
          Cadastre quem trabalha no estúdio. A primeira pessoa é a dona da conta: funcionária agenda → avisa a dona; dona agenda → avisa as funcionárias.
          PIN opcional na troca de perfil.
        </p>

        {teamMembers.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
            {teamMembers.filter((m) => m.active !== false).map((member) => (
              <div
                key={member.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--rose-light)',
                  background: 'var(--off-white)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: member.color || 'var(--rose-deep)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                    {member.name[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{member.name}</span>
                      {accountOwner?.id === member.id && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--rose-deep)', background: 'var(--rose-light)', borderRadius: 999, padding: '2px 8px' }}>
                          Dona da conta
                        </span>
                      )}
                    </div>
                    {member.pinHash && (
                      <div style={{ fontSize: 10, color: 'var(--text-light)', marginTop: 2 }}>Com PIN</div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeTeamMember(member.id)}
                  disabled={isDemo || memberBusy}
                  style={{ background: 'transparent', border: 'none', color: '#C5515F', cursor: isDemo ? 'not-allowed' : 'pointer', padding: 4 }}
                  title="Remover operador"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Nome" half>
            <Inp
              value={memberForm.name}
              onChange={(e) => setMemberForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex.: Ana"
              disabled={isDemo}
            />
          </Field>
          <Field label="PIN (opcional)" half>
            <Inp
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={memberForm.pin}
              onChange={(e) => setMemberForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
              placeholder="4 dígitos"
              disabled={isDemo}
            />
          </Field>
        </div>
        <Btn onClick={addTeamMember} loading={memberBusy} disabled={isDemo || !memberForm.name.trim() || memberBusy}>
          <Icon name="plus" size={14} color="#fff" /> Adicionar operador
        </Btn>
      </div>

      {/* Meu PIN (operador ativo) */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Meu PIN</h3>
        {!myMember ? (
          <p style={{ fontSize: 12, color: 'var(--text-light)', lineHeight: 1.55 }}>
            Selecione um perfil de operador para definir ou alterar o PIN deste aparelho.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 14, lineHeight: 1.55 }}>
              Perfil: <strong style={{ color: 'var(--text)' }}>{myMember.name}</strong>
              {myHasPin ? ' · PIN ativo' : ' · sem PIN'}. O PIN protege a troca de perfil no app.
            </p>
            {myHasPin && (
              <Field label="PIN atual">
                <Inp
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinForm.current}
                  onChange={(e) => setPinForm((f) => ({ ...f, current: digitsOnly(e.target.value) }))}
                  placeholder="4 dígitos"
                  disabled={isDemo || pinBusy}
                  autoComplete="off"
                />
              </Field>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Field label="Novo PIN" half>
                <Inp
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinForm.next}
                  onChange={(e) => setPinForm((f) => ({ ...f, next: digitsOnly(e.target.value) }))}
                  placeholder="4 dígitos"
                  disabled={isDemo || pinBusy}
                  autoComplete="off"
                />
              </Field>
              <Field label="Confirmar PIN" half>
                <Inp
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinForm.confirm}
                  onChange={(e) => setPinForm((f) => ({ ...f, confirm: digitsOnly(e.target.value) }))}
                  placeholder="Repita"
                  disabled={isDemo || pinBusy}
                  autoComplete="off"
                />
              </Field>
            </div>
            {pinError && <p style={{ fontSize: 12, color: '#C5515F', marginBottom: 10 }}>{pinError}</p>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Btn onClick={changeMyPin} loading={pinBusy} disabled={isDemo || pinBusy}>
                <Icon name="check" size={14} color="#fff" /> {myHasPin ? 'Alterar PIN' : 'Definir PIN'}
              </Btn>
              {myHasPin && (
                <Btn variant="ghost" onClick={removeMyPin} disabled={isDemo || pinBusy}>
                  Remover PIN
                </Btn>
              )}
            </div>
          </>
        )}
      </div>

      {/* Account */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Minha conta</h3>
        <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 16 }}>{session?.email}</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="Nova senha" half>
            <Inp type="password" value={pwForm.next} onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))} placeholder="Mín. 6 caracteres" disabled={isDemo} />
          </Field>
          <Field label="Confirmar" half>
            <Inp type="password" value={pwForm.confirm} onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))} placeholder="Repita" disabled={isDemo} />
          </Field>
        </div>
        {pwError && <p style={{ fontSize: 12, color: '#C5515F', marginBottom: 10 }}>{pwError}</p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Btn onClick={changePassword} disabled={isDemo}><Icon name="check" size={14} color="#fff" /> Alterar senha</Btn>
          <Btn variant="ghost" onClick={onLogout}>Sair da conta</Btn>
        </div>
      </div>

      {/* Notificações push — permissão só aqui, não ao abrir o app */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Lembretes no celular</h3>
        <p style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6, marginBottom: 14 }}>
          Ative neste aparelho com o perfil que está usando agora (PIN). Funcionária agenda → push na dona; dona agenda → push nas funcionárias. Agendamento pelo link público e lembretes de horário chegam em todos os perfis que ativaram.
          No iPhone, instale o app na tela inicial para melhor suporte a notificações.
        </p>
        {!isPushSupported() ? (
          <p style={{ fontSize: 12, color: 'var(--text-light)' }}>Notificações não disponíveis neste navegador.</p>
        ) : Notification.permission === 'denied' ? (
          <p style={{ fontSize: 12, color: '#B45309' }}>
            Permissão bloqueada. Abra as configurações do navegador e permita notificações para este site.
          </p>
        ) : pushOn ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 13, color: '#065F46', fontWeight: 600 }}>Notificações ativas neste dispositivo ✓</p>
            <Btn variant="outline" touch full onClick={disablePushNotifications} loading={pushBusy} disabled={pushBusy || isDemo}>
              Desativar
            </Btn>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!getVapidPublicKey() && (
              <p style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', padding: '10px 12px', borderRadius: 10, lineHeight: 1.55 }}>
                <strong>Erro comum:</strong> no Vercel a variável está só em <strong>Preview</strong>, mas o site que você abre no celular usa <strong>Production</strong>. Edite <code style={{ fontSize: 10 }}>VITE_VAPID_PUBLIC_KEY</code> e marque <strong>Production</strong> (e Preview se quiser). Depois <strong>Redeploy</strong> e atualize o PWA.
              </p>
            )}
            <Btn touch full onClick={enablePushNotifications} loading={pushBusy} disabled={pushBusy || isDemo}>
              <Icon name="calendar" size={14} color="#fff" /> Ativar lembretes
            </Btn>
          </div>
        )}
        <p style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 12, lineHeight: 1.5 }}>
          O envio com app fechado usa o servidor na nuvem. Rode o SQL em <code style={{ fontSize: 10 }}>supabase/sql/push_subscriptions.sql</code> e configure a Edge Function conforme{' '}
          <code style={{ fontSize: 10 }}>supabase/functions/send-scheduled-pushes/README.md</code>.
        </p>
      </div>

      {/* PWA Install */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>App no celular (PWA)</h3>
        {pwaStandalone ? (
          <p style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6 }}>
            Você está usando o <strong>{APP_NAME}</strong> como aplicativo instalado.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6, marginBottom: 12 }}>
              Instale para abrir direto da tela inicial, com ícone próprio e melhor experiência no celular.
            </p>
            {pwaCanInstall ? (
              <Btn onClick={installPwa} disabled={isDemo}><Icon name="check" size={14} color="#fff" /> Instalar app</Btn>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-light)', lineHeight: 1.65 }}>
                <strong>Chrome / Edge (Android ou desktop):</strong> menu ⋮ → &quot;Instalar app&quot; ou ícone na barra de endereço.<br />
                <strong>Safari (iPhone):</strong> botão Compartilhar → &quot;Adicionar à Tela de Início&quot;.
              </p>
            )}
          </>
        )}
      </div>

      {/* Support */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Suporte</h3>
        <p style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6, marginBottom: 14 }}>
          Precisa de ajuda? Fale comigo pelo WhatsApp.
        </p>
        <button
          type="button"
          onClick={() => {
            const url = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(SUPPORT_WHATSAPP_TEXT)}`
            window.open(url, '_blank', 'noopener,noreferrer')
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            minHeight: 48,
            padding: '13px 22px',
            border: '1px solid #0E8A64',
            borderRadius: 10,
            cursor: 'pointer',
            color: '#fff',
            background: 'linear-gradient(180deg, #1ECB78 0%, #10A867 100%)',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            boxShadow: '0 2px 6px rgba(16,168,103,0.35)',
          }}
        >
          <Icon name="whatsapp" size={16} color="#fff" /> Falar no WhatsApp
        </button>
      </div>

      {/* About */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Sobre o Sistema</h3>
        <p style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6 }}>
          <strong>{APP_NAME}</strong> — {APP_DESCRIPTION}<br />
          Área atual: {professionalMeta.label}.<br />
          Versão 2.1 · PWA · Nuvem
        </p>
      </div>
    </div>
  )
}

export default Settings
