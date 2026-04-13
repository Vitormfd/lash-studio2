import { useState } from 'react'
import { AUTH } from '../lib/auth'
import { local, getSupabaseConfig } from '../lib/supabase'
import Icon from '../components/Icon'
import { APP_NAME, DEFAULT_PROFESSIONAL_TYPE, PROFESSIONAL_TYPE_OPTIONS } from '../lib/domain'

const AUTH_REMEMBER_KEY = 'lash_remember_login'

const AuthScreen = ({ onLogin }) => {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(() => {
    const s = local.get(AUTH_REMEMBER_KEY)
    return { name: '', email: s?.email || '', password: s?.password || '', confirm: '', professionalType: DEFAULT_PROFESSIONAL_TYPE }
  })
  const [rememberMe, setRememberMe] = useState(() => {
    const s = local.get(AUTH_REMEMBER_KEY)
    return !!(s && s.email)
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const isSupabase = !!getSupabaseConfig()

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setError('') }

  const switchMode = (m) => {
    setMode(m)
    setError('')
    if (m === 'register') {
      setForm({ name: '', email: '', password: '', confirm: '', professionalType: DEFAULT_PROFESSIONAL_TYPE })
      setRememberMe(false)
    } else {
      const s = local.get(AUTH_REMEMBER_KEY)
      setForm({ name: '', email: s?.email || '', password: s?.password || '', confirm: '', professionalType: DEFAULT_PROFESSIONAL_TYPE })
      setRememberMe(!!(s && s.email))
    }
  }

  const handle = async () => {
    if (!form.email || !form.password) { setError('Preencha e-mail e senha.'); return }
    if (mode === 'register') {
      if (!form.name) { setError('Preencha seu nome.'); return }
      if (form.password.length < 6) { setError('Senha deve ter ao menos 6 caracteres.'); return }
      if (form.password !== form.confirm) { setError('As senhas não coincidem.'); return }
    }
    setLoading(true); setError('')
    try {
      const session = mode === 'login'
        ? await AUTH.signIn(form.email, form.password)
        : await AUTH.signUp(form.name, form.email, form.password, form.professionalType)
      if (mode === 'login') {
        if (rememberMe) local.set(AUTH_REMEMBER_KEY, { email: form.email, password: form.password })
        else local.del(AUTH_REMEMBER_KEY)
      }
      AUTH.saveLocalSession(session)
      onLogin(session)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const eyeIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {showPass
        ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
        : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
    </svg>
  )

  const inputBase = { width: '100%', padding: '10px 14px', border: '1.5px solid var(--border-mid)', borderRadius: 10, fontSize: 14, color: 'var(--text)', background: 'var(--surface)', transition: 'border-color 0.2s', fontFamily: 'inherit' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--off-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="auth-card" style={{ width: '100%', maxWidth: 400 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, var(--rose) 0%, var(--rose-deep) 100%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, boxShadow: '0 8px 24px rgba(193,123,130,0.35)' }}>
            <Icon name="star" size={26} color="#fff" />
          </div>
          <h1 className="serif" style={{ fontSize: 26, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>{APP_NAME}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-light)' }}>
            {isSupabase ? '☁️ Conectado ao Supabase' : '💾 Modo local (sem nuvem)'}
          </p>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--surface)', borderRadius: 20, padding: '28px 28px 24px', border: '1px solid var(--rose-light)', boxShadow: '0 4px 40px rgba(139,77,85,0.08)' }}>
          {/* Toggle */}
          <div style={{ display: 'flex', background: 'var(--rose-light)', borderRadius: 10, padding: 3, marginBottom: 24 }}>
            {[['login', 'Entrar'], ['register', 'Criar conta']].map(([m, l]) => (
              <button key={m} onClick={() => switchMode(m)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s', background: mode === m ? 'var(--surface)' : 'transparent', color: mode === m ? 'var(--rose-dark)' : 'var(--text-light)', boxShadow: mode === m ? '0 1px 6px rgba(139,77,85,0.1)' : 'none' }}>
                {l}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'register' && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-light)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Seu nome</label>
                <input className="auth-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex: Juliana Silva" style={inputBase} />
              </div>
            )}
            {mode === 'register' && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-light)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Qual sua área de atuação?</label>
                <select className="auth-input" value={form.professionalType} onChange={(e) => set('professionalType', e.target.value)} style={inputBase}>
                  {PROFESSIONAL_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-light)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>E-mail</label>
              <input className="auth-input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handle()} placeholder="seu@email.com" style={inputBase} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-light)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Senha</label>
              <div style={{ position: 'relative' }}>
                <input className="auth-input" type={showPass ? 'text' : 'password'} value={form.password} onChange={(e) => set('password', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handle()} placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : '••••••••'} style={{ ...inputBase, padding: '10px 40px 10px 14px' }} />
                <button onClick={() => setShowPass((s) => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', display: 'flex', padding: 2 }}>
                  {eyeIcon}
                </button>
              </div>
            </div>
            {mode === 'register' && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-light)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Confirmar senha</label>
                <input className="auth-input" type={showPass ? 'text' : 'password'} value={form.confirm} onChange={(e) => set('confirm', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handle()} placeholder="Repita a senha" style={inputBase} />
              </div>
            )}
            {mode === 'login' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', marginTop: 2 }}>
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--rose-deep)', cursor: 'pointer' }} />
                <span style={{ fontSize: 13, color: 'var(--text-mid)' }}>Lembrar e-mail e senha neste aparelho</span>
              </label>
            )}
          </div>

          {error && (
            <div style={{ marginTop: 12, padding: '9px 14px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B' }}>
              {error}
            </div>
          )}

          <button onClick={handle} disabled={loading} style={{ width: '100%', marginTop: 20, padding: '12px 0', borderRadius: 12, border: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', background: loading ? 'var(--rose)' : 'var(--rose-deep)', color: '#fff', transition: 'background 0.2s' }}>
            {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-light)', marginTop: 16 }}>
          {isSupabase ? 'Dados salvos com segurança na nuvem ☁️' : 'Dados salvos localmente neste navegador'}
        </p>
      </div>
    </div>
  )
}

export default AuthScreen
