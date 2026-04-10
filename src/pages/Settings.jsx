import { useState, useEffect } from 'react'
import { Btn, Field, Inp } from '../components/UI'
import Icon from '../components/Icon'
import { AUTH } from '../lib/auth'
import { DB } from '../lib/supabase'
import {
  isPushSupported,
  getVapidPublicKey,
  subscribeToPush,
  unsubscribePush,
  getExistingPushSubscription,
} from '../lib/pushClient'
import { THEME_LIST, getSavedThemeId, saveAndApplyTheme } from '../lib/theme'

const Settings = ({ config, setConfig, addToast, session, onLogout }) => {
  const [cost, setCost] = useState(config.avgCost)
  const [themeId, setThemeId] = useState(getSavedThemeId(session?.userId))
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [pwaStandalone, setPwaStandalone] = useState(false)
  const [pwaCanInstall, setPwaCanInstall] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushOn, setPushOn] = useState(false)
  const userId = session?.userId

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

  const enablePushNotifications = async () => {
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
        'Chave VAPID pública ausente no app. No Vercel/hosting, adicione VITE_VAPID_PUBLIC_KEY (mesma do par web-push) e faça um novo deploy.',
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
      })
      setPushOn(true)
      addToast('Notificações ativadas neste aparelho.', 'success')
    } catch {
      addToast('Não foi possível ativar notificações.', 'error')
    } finally {
      setPushBusy(false)
    }
  }

  const disablePushNotifications = async () => {
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
    const p = window.__lashPwa?.getInstallPrompt?.()
    if (!p) { addToast('Use o menu do navegador (⋮) → Instalar app ou atalho.', 'warning'); return }
    p.prompt()
    const { outcome } = await p.userChoice
    window.__lashPwa?.clearInstallPrompt?.()
    setPwaCanInstall(false)
    if (outcome === 'accepted') addToast('App instalado!', 'success')
  }

  const changePassword = async () => {
    if (!pwForm.next) { setPwError('Preencha a nova senha.'); return }
    if (pwForm.next.length < 6) { setPwError('Nova senha deve ter ao menos 6 caracteres.'); return }
    if (pwForm.next !== pwForm.confirm) { setPwError('As senhas não coincidem.'); return }
    try {
      await AUTH.changePassword(pwForm.next)
      setPwForm({ current: '', next: '', confirm: '' }); setPwError('')
      addToast('Senha alterada!', 'success')
    } catch (e) { setPwError(e.message) }
  }

  const applySelectedTheme = (id) => {
    const next = saveAndApplyTheme(session?.userId, id)
    setThemeId(next)
    addToast('Tema aplicado!', 'success')
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Supabase status */}
      <div style={{ background: '#D1FAE5', borderRadius: 12, padding: '12px 16px', border: '1px solid #A7F3D0', maxWidth: 480, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#059669', flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#065F46' }}>Conectado ao Supabase ☁️</p>
          <p style={{ fontSize: 11, color: '#047857', marginTop: 1 }}>Dados salvos com segurança na nuvem</p>
        </div>
      </div>

      {/* Financial settings */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Configurações Financeiras</h3>
        <Field label="Custo médio por cliente (R$)">
          <Inp type="number" value={cost} onChange={(e) => setCost(e.target.value)} step="0.01" />
          <p style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 5 }}>
            Usado para calcular o lucro real de cada atendimento
          </p>
        </Field>
        <Btn onClick={() => { setConfig({ ...config, avgCost: Number(cost) }); addToast('Configurações salvas!', 'success') }}>
          <Icon name="check" size={14} color="#fff" /> Salvar configurações
        </Btn>
      </div>

      {/* Theme settings */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }}>
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
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  background: active ? 'var(--rose-light)' : '#fff',
                  border: `1px solid ${active ? 'var(--rose-deep)' : 'var(--rose-light)'}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                  color: 'var(--text)',
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
          <Btn variant="ghost" sm onClick={() => applySelectedTheme('rose')}>
            Voltar ao tema padrão
          </Btn>
        </div>
      </div>

      {/* Account */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Minha conta</h3>
        <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 16 }}>{session?.email}</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="Nova senha" half>
            <Inp type="password" value={pwForm.next} onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))} placeholder="Mín. 6 caracteres" />
          </Field>
          <Field label="Confirmar" half>
            <Inp type="password" value={pwForm.confirm} onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))} placeholder="Repita" />
          </Field>
        </div>
        {pwError && <p style={{ fontSize: 12, color: '#C5515F', marginBottom: 10 }}>{pwError}</p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Btn onClick={changePassword}><Icon name="check" size={14} color="#fff" /> Alterar senha</Btn>
          <Btn variant="ghost" onClick={onLogout}>Sair da conta</Btn>
        </div>
      </div>

      {/* Notificações push — permissão só aqui, não ao abrir o app */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Lembretes no celular</h3>
        <p style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6, marginBottom: 14 }}>
          Receba aviso antes do próximo horário e resumos do dia. Ative quando quiser — não pedimos permissão ao entrar no app.
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
            <Btn variant="outline" touch full onClick={disablePushNotifications} loading={pushBusy} disabled={pushBusy}>
              Desativar
            </Btn>
          </div>
        ) : !getVapidPublicKey() ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', padding: '10px 12px', borderRadius: 10, lineHeight: 1.55 }}>
              <strong>Deploy:</strong> o app precisa da variável <code style={{ fontSize: 10 }}>VITE_VAPID_PUBLIC_KEY</code> no painel do Vercel (ou outro host), com o mesmo valor da chave <strong>pública</strong> do par VAPID. Depois disso, faça um <strong>novo deploy</strong> — o Vite só embute essa chave na build.
            </p>
            <Btn touch full disabled title="Configure a variável de ambiente e faça redeploy">
              Ativar lembretes (indisponível sem chave)
            </Btn>
          </div>
        ) : (
          <Btn touch full onClick={enablePushNotifications} loading={pushBusy} disabled={pushBusy}>
            <Icon name="calendar" size={14} color="#fff" /> Ativar lembretes
          </Btn>
        )}
        <p style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 12, lineHeight: 1.5 }}>
          O envio com app fechado usa o servidor (Supabase). Rode o SQL em <code style={{ fontSize: 10 }}>supabase/sql/push_subscriptions.sql</code> e configure a Edge Function conforme{' '}
          <code style={{ fontSize: 10 }}>supabase/functions/send-scheduled-pushes/README.md</code>.
        </p>
      </div>

      {/* PWA Install */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '20px', border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>App no celular (PWA)</h3>
        {pwaStandalone ? (
          <p style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6 }}>
            Você está usando o <strong>Lash Studio</strong> como aplicativo instalado.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6, marginBottom: 12 }}>
              Instale para abrir direto da tela inicial, com ícone próprio e melhor experiência no celular.
            </p>
            {pwaCanInstall ? (
              <Btn onClick={installPwa}><Icon name="check" size={14} color="#fff" /> Instalar app</Btn>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-light)', lineHeight: 1.65 }}>
                <strong>Chrome / Edge (Android ou desktop):</strong> menu ⋮ → &quot;Instalar app&quot; ou ícone na barra de endereço.<br />
                <strong>Safari (iPhone):</strong> botão Compartilhar → &quot;Adicionar à Tela de Início&quot;.
              </p>
            )}
          </>
        )}
      </div>

      {/* About */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Sobre o Sistema</h3>
        <p style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6 }}>
          <strong>Lash Studio</strong> — Gestão profissional para lash designers.<br />
          Versão 2.1 · PWA · Supabase (nuvem)
        </p>
      </div>
    </div>
  )
}

export default Settings
