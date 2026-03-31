import { useState, useEffect } from 'react'
import { Btn, Field, Inp } from '../components/UI'
import Icon from '../components/Icon'
import { AUTH } from '../lib/auth'

const Settings = ({ config, setConfig, addToast, session, onLogout }) => {
  const [cost, setCost] = useState(config.avgCost)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [pwaStandalone, setPwaStandalone] = useState(false)
  const [pwaCanInstall, setPwaCanInstall] = useState(false)

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

      {/* PWA Install */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid var(--rose-light)', maxWidth: 480, marginTop: 14 }}>
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
