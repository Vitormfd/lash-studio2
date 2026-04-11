import { useState, useEffect, useCallback } from 'react'
import { initSupabase, DB, uid } from './lib/supabase'
import { AUTH } from './lib/auth'
import { apptDurationMin, apptIntervalsOverlap } from './lib/utils'
import { toLocalYmd } from './lib/dashboardStats'
import { progressPushBody } from './lib/dayMessages'
import { useLocalReminders } from './hooks/useLocalReminders'
import { applyTheme, getSavedThemeId } from './lib/theme'
import { useToast } from './hooks/useToast'

import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import Modal from './components/Modal'
import Toast from './components/Toast'
import AppointmentForm from './components/AppointmentForm'
import { Spinner } from './components/UI'
import DashboardSkeleton from './components/DashboardSkeleton'

import AuthScreen from './pages/AuthScreen'
import Dashboard from './pages/Dashboard'
import Agenda from './pages/Agenda'
import Clients from './pages/Clients'
import Services from './pages/Services'
import Inventory from './pages/Inventory'
import Finance from './pages/Finance'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

const SUPABASE_URL = 'https://mbxfswxjrdikdyzpukmw.supabase.co'
const SUPABASE_KEY = 'sb_publishable_X8Pu3A3o_MfOKR0octLAyw_p_SzMKO3'

const NAV_TITLES = {
  dashboard: 'Dashboard',
  agenda: 'Agenda',
  clients: 'Clientes',
  services: 'Serviços',
  inventory: 'Estoque',
  finance: 'Financeiro',
  reports: 'Relatórios',
  settings: 'Configurações',
}

const DEMO_ALLOWED_PAGES = ['dashboard', 'agenda', 'clients', 'services']

// ─── APP MAIN (autenticado) ───────────────────────────────────────────────────
const AppMain = ({ session, onLogout }) => {
  const userId = session.userId
  const isDemo = !!session?.isDemo
  const [page, setPage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [newApptModal, setNewApptModal] = useState(false)
  const [newApptInitial, setNewApptInitial] = useState(null)
  const [editAppt, setEditAppt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [clients, setClients] = useState([])
  const [services, setServices] = useState([])
  const [appointments, setAppointments] = useState([])
  const [inventoryItems, setInventoryItems] = useState([])
  const [inventoryMovements, setInventoryMovements] = useState([])
  const [config, setConfigState] = useState({ avgCost: 12.35 })
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [swUpdateReady, setSwUpdateReady] = useState(false)

  const { toasts, addToast, removeToast } = useToast()
  const [notifGate, setNotifGate] = useState(0)

  const guardDemoWrite = useCallback(() => {
    if (!isDemo) return false
    addToast('Modo demonstracao: esta acao esta bloqueada no teste gratis.', 'warning')
    return true
  }, [isDemo, addToast])

  useEffect(() => {
    if (!isDemo) return
    if (DEMO_ALLOWED_PAGES.includes(page)) return
    setPage('dashboard')
  }, [isDemo, page])

  useEffect(() => {
    const bump = () => setNotifGate((g) => g + 1)
    window.addEventListener('lash-notification-settings-changed', bump)
    return () => window.removeEventListener('lash-notification-settings-changed', bump)
  }, [])

  const localNotifEnabled =
    typeof Notification !== 'undefined' && Notification.permission === 'granted'

  useLocalReminders({
    appointments,
    enabled: localNotifEnabled,
    reminderMinutesBefore: 60,
    permissionVersion: notifGate,
  })

  useEffect(() => {
    const onUp = () => setOnline(true)
    const onDown = () => setOnline(false)
    const onSwUpdate = () => setSwUpdateReady(true)
    window.addEventListener('online', onUp)
    window.addEventListener('offline', onDown)
    window.addEventListener('lash-pwa-update-ready', onSwUpdate)
    return () => {
      window.removeEventListener('online', onUp)
      window.removeEventListener('offline', onDown)
      window.removeEventListener('lash-pwa-update-ready', onSwUpdate)
    }
  }, [])

  const reloadData = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [c, s, a, invItems, invMovs, cfg] = await Promise.all([
        DB.getClients(userId),
        DB.getServices(userId),
        DB.getAppointments(userId),
        DB.getInventoryItems(userId),
        DB.getInventoryMovements(userId),
        DB.getConfig(userId),
      ])
      setClients(c); setServices(s); setAppointments(a); setInventoryItems(invItems); setInventoryMovements(invMovs); setConfigState(cfg)
    } catch {
      setLoadError(true)
      addToast('Não foi possível carregar seus dados. Verifique a conexão e tente de novo.', 'error')
    } finally {
      setLoading(false)
    }
  }, [userId, addToast])

  useEffect(() => {
    reloadData()
  }, [reloadData])

  useEffect(() => {
    applyTheme(getSavedThemeId(userId))
  }, [userId])

  // ── CLIENTS ──
  const handleAddClient = async (client) => {
    if (guardDemoWrite()) return
    setClients((c) => [...c, client])
    const saved = await DB.saveClient(userId, { ...client, _new: true })
    setClients((c) => c.map((x) => (x.id === saved.id ? saved : x)))
  }
  const handleUpdateClient = async (client) => {
    if (guardDemoWrite()) return
    const saved = await DB.saveClient(userId, client)
    setClients((c) => c.map((x) => (x.id === saved.id ? saved : x)))
  }
  const handleDeleteClient = async (id) => {
    if (guardDemoWrite()) return
    await DB.deleteClient(userId, id)
    setClients((c) => c.filter((x) => x.id !== id))
  }

  // ── SERVICES ──
  const handleAddService = async (svc) => {
    if (guardDemoWrite()) return
    const saved = await DB.saveService(userId, { ...svc, _new: true })
    setServices((s) => [...s, saved])
  }
  const handleUpdateService = async (svc) => {
    if (guardDemoWrite()) return
    const saved = await DB.saveService(userId, svc)
    setServices((s) => s.map((x) => (x.id === saved.id ? saved : x)))
  }
  const handleDeleteService = async (id) => {
    if (guardDemoWrite()) return
    await DB.deleteService(userId, id)
    setServices((s) => s.filter((x) => x.id !== id))
  }

  // ── APPOINTMENTS ──
  const saveAppt = async (form) => {
    if (guardDemoWrite()) return
    const dur = Number(form.durationMinutes) || 60
    const overlapsOther = (idToSkip) =>
      appointments.find((a) => {
        if (idToSkip && a.id === idToSkip) return false
        return apptIntervalsOverlap(form.date, form.time, dur, a.date, a.time, apptDurationMin(a))
      })

    if (editAppt) {
      if (overlapsOther(editAppt.id)) { addToast('Conflito com outro horário ou bloqueio.', 'error'); return }
      const saved = await DB.saveAppointment(userId, { ...form, id: editAppt.id })
      setAppointments((a) => a.map((x) => (x.id === editAppt.id ? saved : x)))
      setEditAppt(null); addToast('Agendamento salvo com sucesso!', 'success')
    } else {
      if (overlapsOther(null)) { addToast('Horário conflita com outro agendamento ou bloqueio.', 'error'); return }
      const newAppt = { ...form, id: uid(), status: form.blocked ? 'blocked' : 'pending', _new: true }
      const saved = await DB.saveAppointment(userId, newAppt)
      setAppointments((a) => [...a, saved])
      setNewApptModal(false)
      setNewApptInitial(null)
      addToast(form.blocked ? 'Horário bloqueado com sucesso!' : 'Agendamento criado!', 'success')
    }
  }

  const deleteAppt = async (id) => {
    if (guardDemoWrite()) return
    await DB.deleteAppointment(userId, id)
    setAppointments((a) => a.filter((x) => x.id !== id))
    addToast('Removido.', 'success')
  }

  const markAppointmentStatus = async (appt, status) => {
    if (guardDemoWrite()) return
    try {
      const prevStatus = appt.status
      const saved = await DB.saveAppointment(userId, { ...appt, status })
      const merged = appointments.map((x) => (x.id === appt.id ? saved : x))
      setAppointments(merged)
      if (status === 'done' && prevStatus !== 'done') {
        const v = Number(appt.value || 0)
        addToast(`+ R$ ${v.toFixed(2).replace('.', ',')} adicionados hoje 💰`, 'success')
        const todayStr = toLocalYmd(new Date())
        const totalDone = merged
          .filter((a) => a.date === todayStr && a.status === 'done')
          .reduce((s, a) => s + Number(a.value || 0), 0)
        if (
          totalDone >= 100 &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          setTimeout(() => {
            try {
              new Notification('Lash Studio', {
                body: progressPushBody(totalDone),
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: `fat-${todayStr}`,
              })
            } catch (_) {}
          }, 400)
        }
      } else if (status === 'cancelled') {
        addToast('Agendamento cancelado.', 'warning')
      } else if (status === 'confirmed' && prevStatus === 'pending') {
        addToast('Agendamento confirmado!', 'success')
      } else if (status === 'done') {
        addToast('Atendimento atualizado.', 'success')
      } else {
        addToast('Status atualizado.', 'success')
      }
    } catch {
      addToast('Não foi possível atualizar o status.', 'error')
    }
  }

  // ── CONFIG ──
  const saveConfig = async (cfg) => {
    if (guardDemoWrite()) return
    await DB.saveConfig(userId, cfg)
    setConfigState(cfg)
  }

  // ── INVENTORY ──
  const handleSaveInventoryItem = async (item) => {
    if (guardDemoWrite()) return
    const saved = await DB.saveInventoryItem(userId, item)
    setInventoryItems((list) => {
      const exists = list.some((x) => x.id === saved.id)
      return exists ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved]
    })
  }

  const handleDeleteInventoryItem = async (id) => {
    if (guardDemoWrite()) return
    await DB.deleteInventoryItem(userId, id)
    setInventoryItems((list) => list.filter((x) => x.id !== id))
  }

  const handleSaveInventoryMovement = async (movement) => {
    if (guardDemoWrite()) return
    const saved = await DB.saveInventoryMovement(userId, movement)
    setInventoryMovements((list) => [saved, ...list])
  }

  // ── COMPAT SETTERS (para páginas que usam setClients/setServices como array-setter) ──
  const setClientsCompat = (valOrFn) => {
    if (isDemo) { guardDemoWrite(); return }
    const next = typeof valOrFn === 'function' ? valOrFn(clients) : valOrFn
    const added = next.find((c) => !clients.find((x) => x.id === c.id))
    const removed = clients.find((c) => !next.find((x) => x.id === c.id))
    const changed = next.find((c) => { const old = clients.find((x) => x.id === c.id); return old && JSON.stringify(old) !== JSON.stringify(c) })
    if (added) { handleAddClient(added); return }
    if (removed) { handleDeleteClient(removed.id); return }
    if (changed) { handleUpdateClient(changed); return }
    setClients(next)
  }

  const setServicesCompat = (valOrFn) => {
    if (isDemo) { guardDemoWrite(); return }
    const next = typeof valOrFn === 'function' ? valOrFn(services) : valOrFn
    const added = next.find((s) => !services.find((x) => x.id === s.id))
    const removed = services.find((s) => !next.find((x) => x.id === s.id))
    const changed = next.find((s) => { const old = services.find((x) => x.id === s.id); return old && JSON.stringify(old) !== JSON.stringify(s) })
    if (added) { handleAddService(added); return }
    if (removed) { handleDeleteService(removed.id); return }
    if (changed) { handleUpdateService(changed); return }
    setServices(next)
  }

  const countSoonAppointments = () =>
    appointments.filter((a) => {
      if (a.blocked || a.status === 'cancelled') return false
      const diff = (new Date(a.date + 'T' + a.time) - new Date()) / 60000
      return diff > 0 && diff < 30
    }).length

  const todayNotifs = countSoonAppointments()

  const handleBellClick = () => {
    const n = countSoonAppointments()
    setPage('agenda')
    if (n > 0) {
      addToast(
        `${n === 1 ? '1 horário' : `${n} horários`} começando nos próximos 30 min — confira na agenda.`,
        'info',
      )
    } else {
      addToast('Nenhum atendimento nos próximos 30 min. Toque em Configurações para ativar lembretes no celular.', 'info')
    }
  }

  if (loading) return <DashboardSkeleton />

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--off-white)' }}>
        <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, border: '1px solid var(--rose-light)', maxWidth: 400, textAlign: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Algo deu errado ao carregar</p>
          <p style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 18 }}>Verifique sua internet e tente novamente.</p>
          <button
            type="button"
            onClick={() => reloadData()}
            style={{
              background: 'var(--rose-deep)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Tentar de novo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', minWidth: 0, width: '100%', background: 'var(--off-white)' }}>
      <Sidebar
        active={page}
        setActive={setPage}
        open={sidebarOpen}
        setOpen={setSidebarOpen}
        session={session}
        onLogout={onLogout}
        allowedNavIds={isDemo ? DEMO_ALLOWED_PAGES : null}
      />


      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', minWidth: 0, overflow: 'hidden' }}>
        <Topbar
          title={NAV_TITLES[page]}
          setOpen={setSidebarOpen}
          notifs={todayNotifs}
          onBellClick={handleBellClick}
          onNewAppt={() => {
            if (isDemo) { guardDemoWrite(); return }
            setNewApptInitial(null)
            setNewApptModal(true)
          }}
          offline={!online}
          isDemo={isDemo}
        />

        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {page === 'dashboard' && (
            <Dashboard
              appointments={appointments}
              clients={clients}
              services={services}
              config={config}
              onGoAgenda={() => setPage('agenda')}
              onNewAppointment={() => {
                if (isDemo) { guardDemoWrite(); return }
                setNewApptInitial(null)
                setNewApptModal(true)
              }}
              onGoClients={() => setPage('clients')}
            />
          )}
          {page === 'agenda' && (
            <Agenda
              appointments={appointments}
              clients={clients}
              services={services}
              onNew={saveAppt}
              onEdit={(appt) => {
                if (isDemo) { guardDemoWrite(); return }
                setEditAppt(appt)
              }}
              onDelete={deleteAppt}
              onMarkStatus={markAppointmentStatus}
              addToast={addToast}
            />
          )}
          {page === 'clients' && (
            <Clients
              clients={clients}
              setClients={setClientsCompat}
              appointments={appointments}
              services={services}
              addToast={addToast}
              onScheduleAfterCreate={(clientId) => {
                setNewApptInitial({ clientId })
                setNewApptModal(true)
                setPage('dashboard')
              }}
            />
          )}
          {page === 'services' && <Services services={services} setServices={setServicesCompat} appointments={appointments} addToast={addToast} />}
          {page === 'inventory' && (
            <Inventory
              items={inventoryItems}
              movements={inventoryMovements}
              onSaveItem={handleSaveInventoryItem}
              onDeleteItem={handleDeleteInventoryItem}
              onSaveMovement={handleSaveInventoryMovement}
              addToast={addToast}
            />
          )}
          {page === 'finance' && <Finance appointments={appointments} services={services} clients={clients} config={config} setConfig={saveConfig} />}
          {page === 'reports' && <Reports appointments={appointments} services={services} clients={clients} />}
          {page === 'settings' && <Settings config={config} setConfig={saveConfig} addToast={addToast} session={session} onLogout={onLogout} />}
        </div>
      </main>

      {/* Modals */}
      <Modal open={newApptModal} onClose={() => { setNewApptModal(false); setNewApptInitial(null) }} title="Novo Agendamento">
        <AppointmentForm
          key={newApptInitial?.clientId || 'new'}
          initial={newApptInitial || undefined}
          clients={clients}
          services={services}
          onClose={() => { setNewApptModal(false); setNewApptInitial(null) }}
          onSave={saveAppt}
        />
      </Modal>
      <Modal open={!!editAppt} onClose={() => setEditAppt(null)} title="Editar Agendamento">
        {editAppt && <AppointmentForm initial={editAppt} clients={clients} services={services} onClose={() => setEditAppt(null)} onSave={saveAppt} />}
      </Modal>

      <Toast toasts={toasts} removeToast={removeToast} />

      {/* PWA update banner */}
      {swUpdateReady && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10001, background: 'linear-gradient(135deg, var(--rose-deep) 0%, var(--rose-dark) 100%)', color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap', boxShadow: '0 -8px 32px rgba(44,26,30,0.2)' }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Nova versão do app disponível.</span>
          <button type="button" onClick={() => { if (window.__lashPwaApplyUpdate) window.__lashPwaApplyUpdate() }} style={{ background: 'var(--surface)', color: 'var(--rose-dark)', border: 'none', borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Atualizar agora
          </button>
          <button type="button" onClick={() => setSwUpdateReady(false)} style={{ background: 'transparent', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            Depois
          </button>
        </div>
      )}
    </div>
  )
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
const App = () => {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    initSupabase(SUPABASE_URL, SUPABASE_KEY)
    AUTH.getSession()
      .then(async (s) => {
        if (s) {
          setSession(s)
          return
        }

        const params = new URLSearchParams(window.location.search)
        const wantsDemo = params.get('demo') === '1' || params.get('trial') === '1'
        if (!wantsDemo) return

        const demoSession = await AUTH.createDemoSession()
        AUTH.saveLocalSession(demoSession)
        setSession(demoSession)
        params.delete('demo')
        params.delete('trial')
        const nextSearch = params.toString()
        const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
        window.history.replaceState({}, document.title, nextUrl)
      })
      .finally(() => setChecking(false))
  }, [])

  if (checking) return <Spinner text="Carregando..." />

  if (!session) {
    return (
      <AuthScreen
        onLogin={(s) => { AUTH.saveLocalSession(s); setSession(s) }}
      />
    )
  }

  return (
    <AppMain
      session={session}
      onLogout={() => { AUTH.signOut(); AUTH.clearLocalSession(); setSession(null) }}
    />
  )
}

export default App
