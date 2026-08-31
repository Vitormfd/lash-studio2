import { useState, useEffect, useCallback, useRef } from 'react'
import { initSupabase, DB, uid, getClient } from './lib/supabase'
import { AUTH } from './lib/auth'
import { apptDurationMin, apptIntervalsOverlap } from './lib/utils'
import { toLocalYmd } from './lib/dashboardStats'
import { progressPushBody } from './lib/dayMessages'
import { useLocalReminders } from './hooks/useLocalReminders'
import { applyTheme, getSavedThemeId } from './lib/theme'
import { useToast } from './hooks/useToast'
import { CHECKOUT_URL, openCheckout } from './lib/billing'
import { AccessProvider, canUserEdit as canUserEditByLevel, defaultAccessProfile, fetchUserAccessProfile } from './lib/access'
import { APP_NAME, DEFAULT_PROFESSIONAL_TYPE } from './lib/domain'
import { ensureServiceCompatibility } from './lib/serviceCompatibility'

import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import Modal from './components/Modal'
import Toast from './components/Toast'
import AppointmentForm from './components/AppointmentForm'
import { Spinner } from './components/UI'
import DashboardSkeleton from './components/DashboardSkeleton'
import PaywallModal from './components/PaywallModal'

import AuthScreen from './pages/AuthScreen'
import Dashboard from './pages/Dashboard'
import Agenda from './pages/Agenda'
import Clients from './pages/Clients'
import Services from './pages/Services'
import Inventory from './pages/Inventory'
import Finance from './pages/Finance'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import PublicBooking from './pages/PublicBooking'
import OperatorSelect from './pages/OperatorSelect'
import ActivityLog from './pages/ActivityLog'
import {
  OperatorContext,
  saveOperatorSession,
  loadOperatorSession,
  clearOperatorSession,
  touchOperatorActivity,
  isOperatorSessionExpired,
  getAccountOwner,
  notificationsForOperator,
} from './lib/operator'
import { getExistingPushSubscription } from './lib/pushClient'

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
  activity: 'Histórico',
  settings: 'Configurações',
}

const DEMO_ALLOWED_PAGES = ['dashboard', 'agenda', 'clients', 'services', 'inventory', 'finance', 'reports', 'activity', 'settings']

const BARBER_STARTER_SERVICES = [
  { name: 'Corte', price: 50, color: '#7BAF9A' },
  { name: 'Barba', price: 35, color: '#9B8FB8' },
  { name: 'Corte + Barba', price: 75, color: '#C17B82' },
]

const RECOVERY_SESSION_KEY = 'lash-password-recovery'
const PASSWORD_RESET_PATH = '/reset-password'
const BOOKING_PATH_PREFIX = '/booking/'

const isBookingPath = () => {
  if (typeof window === 'undefined') return false
  const path = window.location.pathname || ''
  return path === '/booking' || path.startsWith(BOOKING_PATH_PREFIX)
}

const getBookingProfessionalIdFromPath = () => {
  if (typeof window === 'undefined') return ''
  const path = window.location.pathname || ''
  if (!path.startsWith(BOOKING_PATH_PREFIX)) return ''
  const id = decodeURIComponent(path.slice(BOOKING_PATH_PREFIX.length)).split('/')[0]
  return id || ''
}

const isPasswordResetPath = () => {
  if (typeof window === 'undefined') return false
  return window.location.pathname === PASSWORD_RESET_PATH
}

const hasRecoveryParams = () => {
  if (typeof window === 'undefined') return false
  const hashParams = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
  const searchParams = new URLSearchParams(window.location.search)
  return hashParams.get('type') === 'recovery' || searchParams.get('type') === 'recovery'
}

const isRecoveryFlowActive = () => {
  if (isPasswordResetPath() || hasRecoveryParams()) return true
  try {
    return sessionStorage.getItem(RECOVERY_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

const setRecoveryFlowActive = (active) => {
  try {
    if (active) sessionStorage.setItem(RECOVERY_SESSION_KEY, '1')
    else sessionStorage.removeItem(RECOVERY_SESSION_KEY)
  } catch {}
}

const clearRecoveryUrl = () => {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  params.delete('type')
  const nextSearch = params.toString()
  window.history.replaceState({}, document.title, `${isPasswordResetPath() ? '/' : window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`)
}

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
  const [cashExpenses, setCashExpenses] = useState([])
  const [config, setConfigState] = useState({ avgCost: 12.35, salaryPercentage: 50, stateUf: '', city: '', workHours: null })
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [swUpdateReady, setSwUpdateReady] = useState(false)
  const [pwaOnboardingOpen, setPwaOnboardingOpen] = useState(false)
  const [pwaCanInstall, setPwaCanInstall] = useState(false)
  const [isIosDevice, setIsIosDevice] = useState(false)
  const [accessProfile, setAccessProfile] = useState(defaultAccessProfile)
  const [paywallOpen, setPaywallOpen] = useState(false)
  const [paywallHint, setPaywallHint] = useState('')
  const [teamMembers, setTeamMembers] = useState([])
  const [activeOperator, setActiveOperator] = useState(null)
  const [operatorGateOpen, setOperatorGateOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [inboxOpen, setInboxOpen] = useState(false)
  const [agendaFocus, setAgendaFocus] = useState(null)

  const professionalType = accessProfile.professionalType || session.professionalType || DEFAULT_PROFESSIONAL_TYPE
  const isBarber = professionalType === 'barbeiro'

  const { toasts, addToast, removeToast } = useToast()
  const [notifGate, setNotifGate] = useState(0)

  const canUserEdit = canUserEditByLevel(accessProfile.accessLevel)

  const openPaywall = useCallback((hint = '') => {
    setPaywallHint(hint)
    setPaywallOpen(true)
  }, [])

  const handleUpgrade = useCallback(async () => {
    try {
      await openCheckout({ userId, email: session?.email })
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Nao foi possivel abrir o checkout agora.'
      addToast(message, 'error')
    }
  }, [userId, session?.email, addToast])

  const guardRestrictedWrite = useCallback((hint) => {
    if (canUserEdit) return false
    addToast(hint || 'Desbloqueie para continuar.', 'warning')
    openPaywall(hint)
    return true
  }, [canUserEdit, addToast, openPaywall])

  const refreshTeamMembers = useCallback(async () => {
    const members = await DB.getTeamMembers(userId)
    setTeamMembers(members)
    return members
  }, [userId])

  const handleOperatorSelected = useCallback((member) => {
    const operator = { id: member.id, name: member.name, color: member.color || null }
    saveOperatorSession(userId, operator)
    setActiveOperator(operator)
    setOperatorGateOpen(false)
    getExistingPushSubscription()
      .then((sub) => {
        if (!sub) return
        return DB.bindPushSubscriptionToOperator(userId, sub, operator.id)
      })
      .catch(() => {})
  }, [userId])

  const requestOperatorSwitch = useCallback(() => {
    clearOperatorSession(userId)
    setActiveOperator(null)
    setOperatorGateOpen(true)
  }, [userId])

  const resolveOperatorGate = useCallback((members) => {
    const activeMembers = members.filter((m) => m.active !== false)
    if (activeMembers.length === 0) {
      setOperatorGateOpen(true)
      return
    }
    const stored = loadOperatorSession(userId)
    if (!stored || isOperatorSessionExpired(userId)) {
      clearOperatorSession(userId)
      setActiveOperator(null)
      setOperatorGateOpen(true)
      return
    }
    const stillExists = activeMembers.some((m) => m.id === stored.id)
    if (!stillExists) {
      clearOperatorSession(userId)
      setActiveOperator(null)
      setOperatorGateOpen(true)
      return
    }
    setActiveOperator(stored)
    setOperatorGateOpen(false)
  }, [userId])

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

  useEffect(() => {
    if (!userId || operatorGateOpen) return undefined

    const markActivity = () => touchOperatorActivity(userId)
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll']
    events.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }))

    const timer = window.setInterval(() => {
      if (isOperatorSessionExpired(userId)) requestOperatorSwitch()
    }, 60_000)

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, markActivity))
      window.clearInterval(timer)
    }
  }, [userId, operatorGateOpen, requestOperatorSwitch])

  const localNotifEnabled =
    typeof Notification !== 'undefined' && Notification.permission === 'granted'

  useLocalReminders({
    appointments,
    enabled: localNotifEnabled,
    reminderMinutesBefore: 60,
    permissionVersion: notifGate,
    professionalType,
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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.navigator?.standalone === true
    if (isStandalone) return undefined

    const storageKey = `lash-pwa-onboarding-seen:${userId}`
    let seen = false
    try {
      seen = localStorage.getItem(storageKey) === '1'
    } catch {}
    if (seen) return undefined

    const ua = window.navigator?.userAgent || ''
    const ios = /iPhone|iPad|iPod/i.test(ua)
    setIsIosDevice(ios)
    setPwaCanInstall(!!window.__lashPwa?.getInstallPrompt?.())
    setPwaOnboardingOpen(true)

    const handleInstallReady = () => setPwaCanInstall(true)
    window.addEventListener('lash-pwa-install-ready', handleInstallReady)

    return () => {
      window.removeEventListener('lash-pwa-install-ready', handleInstallReady)
    }
  }, [userId])

  const dismissPwaOnboarding = useCallback(() => {
    try {
      localStorage.setItem(`lash-pwa-onboarding-seen:${userId}`, '1')
    } catch {}
    setPwaOnboardingOpen(false)
  }, [userId])

  const installFromOnboarding = useCallback(async () => {
    const prompt = window.__lashPwa?.getInstallPrompt?.()
    if (!prompt) {
      setPage('settings')
      addToast('Abra Configuracoes para ver os passos de instalacao.', 'info')
      dismissPwaOnboarding()
      return
    }

    prompt.prompt()
    const { outcome } = await prompt.userChoice
    window.__lashPwa?.clearInstallPrompt?.()
    setPwaCanInstall(false)

    if (outcome === 'accepted') {
      addToast('App instalado com sucesso!', 'success')
      dismissPwaOnboarding()
      return
    }

    addToast('Instalacao cancelada. Voce pode tentar novamente em Configuracoes.', 'warning')
  }, [addToast, dismissPwaOnboarding])

  const reloadData = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [c, s, a, invItems, invMovs, expenses, cfg, members, notifRows] = await Promise.all([
        DB.getClients(userId),
        DB.getServices(userId),
        DB.getAppointments(userId),
        DB.getInventoryItems(userId),
        DB.getInventoryMovements(userId),
        DB.getCashExpenses(userId),
        DB.getConfig(userId),
        DB.getTeamMembers(userId),
        DB.getNotifications(userId),
      ])
      const compatibility = ensureServiceCompatibility({
        services: s,
        appointments: a,
        createId: uid,
      })
      let nextServices = compatibility.services

      if (isBarber && nextServices.length === 0) {
        const created = []
        for (const svc of BARBER_STARTER_SERVICES) {
          try {
            const saved = await DB.saveService(userId, { id: uid(), ...svc, _new: true })
            created.push(saved)
          } catch {}
        }
        if (created.length > 0) nextServices = created
      }

      setClients(c)
      setServices(nextServices)
      setAppointments(compatibility.appointments)
      setInventoryItems(invItems)
      setInventoryMovements(invMovs)
      setCashExpenses(expenses)
      setConfigState(cfg)
      setTeamMembers(members)
      setNotifications(notifRows)
      resolveOperatorGate(members)

      if (compatibility.createdService || compatibility.patchedAppointments.length > 0) {
        Promise.resolve().then(async () => {
          try {
            if (compatibility.createdService) {
              await DB.saveService(userId, { ...compatibility.createdService, _new: true })
            }
            for (const appointment of compatibility.patchedAppointments) {
              await DB.saveAppointment(userId, appointment)
            }
          } catch {}
        })
      }
    } catch {
      setLoadError(true)
      addToast('Não foi possível carregar seus dados. Verifique a conexão e tente de novo.', 'error')
    } finally {
      setLoading(false)
    }
  }, [userId, addToast, isBarber, resolveOperatorGate])

  useEffect(() => {
    reloadData()
  }, [reloadData])

  const refreshNotifications = useCallback(async () => {
    const rows = await DB.getNotifications(userId)
    setNotifications(rows)
    return rows
  }, [userId])

  const silentReloadAgenda = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([
        DB.getClients(userId),
        DB.getAppointments(userId),
      ])
      setClients(c)
      setAppointments(a)
    } catch {}
  }, [userId])

  const notifToastSeen = useRef(new Set())
  const notifSeeded = useRef(false)

  useEffect(() => {
    if (loading || notifSeeded.current) return
    notifications.forEach((n) => {
      if (n?.id) notifToastSeen.current.add(n.id)
    })
    notifSeeded.current = true
  }, [loading, notifications])

  useEffect(() => {
    if (isDemo) return undefined

    const onIncoming = async (row) => {
      const mine = !row?.operator_id || row.operator_id === activeOperator?.id
      if (mine && row?.id && !row.read_at && !notifToastSeen.current.has(row.id)) {
        notifToastSeen.current.add(row.id)
        addToast(row.body || row.title || 'Novo agendamento.', 'success')
      }
      await Promise.all([refreshNotifications(), silentReloadAgenda()])
    }

    const sb = getClient()
    const channel = sb
      ? sb
          .channel(`app_notifications:${userId}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'app_notifications', filter: `user_id=eq.${userId}` },
            (payload) => { onIncoming(payload.new) },
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'app_notifications', filter: `user_id=eq.${userId}` },
            () => { refreshNotifications() },
          )
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'app_notifications', filter: `user_id=eq.${userId}` },
            () => { refreshNotifications() },
          )
          .subscribe()
      : null

    const poll = () => { refreshNotifications() }
    const intervalId = window.setInterval(poll, 30_000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') poll()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
      if (sb && channel) sb.removeChannel(channel)
    }
  }, [userId, isDemo, activeOperator?.id, refreshNotifications, silentReloadAgenda, addToast])

  useEffect(() => {
    let alive = true
    fetchUserAccessProfile(userId, isDemo)
      .then((profile) => {
        if (!alive) return
        setAccessProfile(profile)
      })
      .catch(() => {
        if (!alive) return
        setAccessProfile(defaultAccessProfile)
      })
    return () => { alive = false }
  }, [userId, isDemo])

  useEffect(() => {
    if (isDemo) return undefined

    const refreshAccess = () => {
      fetchUserAccessProfile(userId, isDemo)
        .then((profile) => {
          setAccessProfile(profile)
          if (canUserEditByLevel(profile.accessLevel)) {
            setPaywallOpen(false)
          }
        })
        .catch(() => {})
    }

    refreshAccess()
    const onFocus = () => refreshAccess()
    const onOnline = () => refreshAccess()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshAccess()
    }
    const intervalId = window.setInterval(refreshAccess, 60_000)

    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [userId, isDemo])

  useEffect(() => {
    applyTheme(getSavedThemeId(userId))
  }, [userId])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkoutStatus = params.get('checkout')
    if (!checkoutStatus) return

    if (checkoutStatus === 'success') {
      addToast('Pagamento confirmado. Atualizando seu acesso...', 'success')
      ;(async () => {
        for (const delay of [0, 1500, 3500]) {
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
          await AUTH.getSession().catch(() => null)
          const profile = await fetchUserAccessProfile(userId, isDemo)
          setAccessProfile(profile)
          if (canUserEditByLevel(profile.accessLevel)) break
        }
      })().catch(() => {})
    } else if (checkoutStatus === 'canceled') {
      addToast('Checkout cancelado. Voce pode tentar novamente quando quiser.', 'warning')
    }

    params.delete('checkout')
    const nextSearch = params.toString()
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
    window.history.replaceState({}, document.title, nextUrl)
  }, [addToast, userId, isDemo])

  // ── CLIENTS ──
  const handleAddClient = async (client) => {
    if (guardRestrictedWrite('Desbloqueie para salvar clientes.')) return
    setClients((c) => [...c, client])
    try {
      const saved = await DB.saveClient(userId, { ...client, _new: true })
      setClients((c) => c.map((x) => (x.id === saved.id ? saved : x)))
    } catch {
      setClients((c) => c.filter((x) => x.id !== client.id))
      addToast('Não foi possível salvar o celular do cliente no banco.', 'error')
    }
  }
  const handleUpdateClient = async (client) => {
    if (guardRestrictedWrite('Desbloqueie para editar clientes.')) return
    try {
      const saved = await DB.saveClient(userId, client)
      setClients((c) => c.map((x) => (x.id === saved.id ? saved : x)))
    } catch {
      addToast('Não foi possível atualizar o celular do cliente no banco.', 'error')
    }
  }
  const handleDeleteClient = async (id) => {
    if (guardRestrictedWrite('Desbloqueie para editar clientes.')) return
    await DB.deleteClient(userId, id)
    setClients((c) => c.filter((x) => x.id !== id))
  }

  // ── SERVICES ──
  const handleAddService = async (svc) => {
    if (guardRestrictedWrite('Tenha acesso completo ao sistema.')) return
    const saved = await DB.saveService(userId, { ...svc, _new: true })
    setServices((s) => [...s, saved])
  }
  const handleUpdateService = async (svc) => {
    if (guardRestrictedWrite('Tenha acesso completo ao sistema.')) return
    const saved = await DB.saveService(userId, svc)
    setServices((s) => s.map((x) => (x.id === saved.id ? saved : x)))
  }
  const handleDeleteService = async (id) => {
    if (guardRestrictedWrite('Tenha acesso completo ao sistema.')) return
    await DB.deleteService(userId, id)
    setServices((s) => s.filter((x) => x.id !== id))
  }

  // ── APPOINTMENTS ──
  const saveAppt = async (form) => {
    if (guardRestrictedWrite('Desbloqueie para criar agendamentos.')) return
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
      if (!form.blocked) {
        const owner = getAccountOwner(teamMembers)
        DB.notifyOwnerStaffBooking(userId, {
          appointment: saved,
          ownerOperatorId: owner?.id,
          actorOperatorId: activeOperator?.id,
          actorName: activeOperator?.name,
          clientName: clients.find((c) => c.id === saved.clientId)?.name || '',
          serviceName: services.find((s) => s.id === saved.serviceId)?.name || '',
          teamMembers,
        }).catch(() => {})
      }
    }
  }

  const deleteAppt = async (id) => {
    if (guardRestrictedWrite('Tenha acesso completo ao sistema.')) return
    await DB.deleteAppointment(userId, id)
    setAppointments((a) => a.filter((x) => x.id !== id))
    addToast('Removido.', 'success')
  }

  const markAppointmentStatus = async (appt, status, paymentData) => {
    if (guardRestrictedWrite('Desbloqueie para marcar atendimento como concluido.')) return
    try {
      const prevStatus = appt.status
      const withPayment =
        status === 'done' && paymentData
          ? {
              ...appt,
              status,
              paymentMethod: paymentData.paymentMethod,
              paymentValue: Number(paymentData.paymentValue || 0),
              paymentNotes: paymentData.paymentNotes || '',
              paidAt: new Date().toISOString(),
            }
          : { ...appt, status }
      const saved = await DB.saveAppointment(userId, withPayment)
      const merged = appointments.map((x) => (x.id === appt.id ? saved : x))
      setAppointments(merged)
      if (status === 'done' && prevStatus !== 'done') {
        const v = Number(saved.paymentValue != null ? saved.paymentValue : saved.value || 0)
        addToast(`+ R$${v.toFixed(2).replace('.', ',')} registrado 💰`, 'success')
        const todayStr = toLocalYmd(new Date())
        const totalDone = merged
          .filter((a) => a.date === todayStr && a.status === 'done')
          .reduce((s, a) => s + Number(a.paymentValue != null ? a.paymentValue : a.value || 0), 0)
        if (
          totalDone >= 100 &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          setTimeout(() => {
            try {
              new Notification(APP_NAME, {
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
        addToast(isBarber ? 'Corte atualizado.' : 'Atendimento atualizado.', 'success')
      } else {
        addToast('Status atualizado.', 'success')
      }
    } catch {
      addToast('Não foi possível atualizar o status.', 'error')
    }
  }

  // ── CONFIG ──
  const saveConfig = async (cfg) => {
    if (guardRestrictedWrite('Organize seu negócio sem limitações.')) return
    await DB.saveConfig(userId, cfg)
    setConfigState(cfg)
  }

  // ── INVENTORY ──
  const handleSaveInventoryItem = async (item) => {
    if (guardRestrictedWrite('Tenha acesso completo ao sistema.')) return
    const saved = await DB.saveInventoryItem(userId, item)
    setInventoryItems((list) => {
      const exists = list.some((x) => x.id === saved.id)
      return exists ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved]
    })
  }

  const handleDeleteInventoryItem = async (id) => {
    if (guardRestrictedWrite('Tenha acesso completo ao sistema.')) return
    await DB.deleteInventoryItem(userId, id)
    setInventoryItems((list) => list.filter((x) => x.id !== id))
  }

  const handleSaveInventoryMovement = async (movement) => {
    if (guardRestrictedWrite('Tenha acesso completo ao sistema.')) return
    const saved = await DB.saveInventoryMovement(userId, movement)
    setInventoryMovements((list) => [saved, ...list])
  }

  // ── CASH EXPENSES ──
  const handleSaveCashExpense = async (expense) => {
    if (guardRestrictedWrite('Tenha acesso completo ao sistema.')) return
    const saved = await DB.saveCashExpense(userId, expense)
    setCashExpenses((list) => {
      const exists = list.some((x) => x.id === saved.id)
      return exists ? list.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...list]
    })
    return saved
  }

  const handleDeleteCashExpense = async (id) => {
    if (guardRestrictedWrite('Tenha acesso completo ao sistema.')) return
    await DB.deleteCashExpense(userId, id)
    setCashExpenses((list) => list.filter((x) => x.id !== id))
  }

  // ── COMPAT SETTERS (para páginas que usam setClients/setServices como array-setter) ──
  const setClientsCompat = (valOrFn) => {
    if (!canUserEdit) { guardRestrictedWrite('Desbloqueie para salvar clientes.'); return }
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
    if (!canUserEdit) { guardRestrictedWrite('Tenha acesso completo ao sistema.'); return }
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

  const soonItems = appointments
    .filter((a) => {
      if (a.blocked || a.status === 'cancelled') return false
      const diff = (new Date(a.date + 'T' + a.time) - new Date()) / 60000
      return diff > 0 && diff < 30
    })
    .sort((a, b) => String(a.time).localeCompare(String(b.time)))
    .map((a) => {
      const clientName = clients.find((c) => c.id === a.clientId)?.name || 'Cliente'
      const serviceName = services.find((s) => s.id === a.serviceId)?.name || ''
      const mins = Math.max(1, Math.round((new Date(a.date + 'T' + a.time) - new Date()) / 60000))
      return {
        id: a.id,
        date: a.date,
        title: `Em ${mins} min`,
        body: serviceName ? `${clientName} — ${serviceName}` : clientName,
      }
    })

  const visibleNotifications = notificationsForOperator(notifications, activeOperator, teamMembers)
  const unreadCount = visibleNotifications.filter((n) => !n.readAt).length
  const ownerMember = getAccountOwner(teamMembers)
  const includeUnscopedNotifs = !!(activeOperator?.id && ownerMember?.id === activeOperator.id)

  const openAgendaFromNotice = (date, appointmentId) => {
    setAgendaFocus({ date: date || toLocalYmd(new Date()), id: appointmentId || null, key: Date.now() })
    setPage('agenda')
    setInboxOpen(false)
  }

  const handleNotificationClick = async (item) => {
    if (item?.id && !item.readAt) {
      const nowIso = new Date().toISOString()
      setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt: n.readAt || nowIso } : n)))
      DB.markNotificationsRead(userId, [item.id]).then((next) => {
        if (Array.isArray(next) && next.length) setNotifications(next)
      }).catch(() => {})
    }
    const date = item?.payload?.date || appointments.find((a) => a.id === item?.appointmentId)?.date
    openAgendaFromNotice(date, item?.appointmentId)
  }

  const handleSoonClick = (item) => {
    openAgendaFromNotice(item?.date, item?.id)
  }

  const handleMarkAllRead = async () => {
    const nowIso = new Date().toISOString()
    const visibleIds = new Set(visibleNotifications.map((n) => n.id))
    setNotifications((prev) => prev.map((n) => (
      visibleIds.has(n.id) ? { ...n, readAt: n.readAt || nowIso } : n
    )))
    DB.markAllNotificationsRead(userId, {
      operatorId: activeOperator?.id,
      includeUnscoped: includeUnscopedNotifs,
    }).then((next) => {
      if (Array.isArray(next) && next.length) setNotifications(next)
    }).catch(() => {})
  }

  const handleDeleteNotification = async (item) => {
    if (!item?.id) return
    setNotifications((prev) => prev.filter((n) => n.id !== item.id))
    DB.deleteNotifications(userId, [item.id]).then((next) => {
      if (Array.isArray(next)) setNotifications(next)
    }).catch(() => {})
  }

  const handleDeleteAllNotifications = async () => {
    if (!visibleNotifications.length) return
    if (!window.confirm('Apagar todas as notificações deste perfil?')) return
    const visibleIds = new Set(visibleNotifications.map((n) => n.id))
    setNotifications((prev) => prev.filter((n) => !visibleIds.has(n.id)))
    DB.deleteAllNotifications(userId, {
      operatorId: activeOperator?.id,
      includeUnscoped: includeUnscopedNotifs,
    }).then((next) => {
      if (Array.isArray(next)) setNotifications(next)
    }).catch(() => {})
  }

  const copyBookingLink = async () => {
    const professionalId = userId

    if (!professionalId || professionalId === 'demo_user') {
      addToast('Link de agendamento indisponivel no modo de teste.', 'warning')
      return
    }

    const link = `${window.location.origin}/booking/${professionalId}`

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
        addToast('Link copiado!', 'success')
        return
      }
    } catch {}

    try {
      const temp = document.createElement('textarea')
      temp.value = link
      temp.setAttribute('readonly', '')
      temp.style.position = 'fixed'
      temp.style.opacity = '0'
      temp.style.pointerEvents = 'none'
      temp.style.left = '-9999px'
      temp.style.top = '0'
      document.body.appendChild(temp)
      temp.focus()
      temp.select()
      const copied = document.execCommand('copy')
      document.body.removeChild(temp)
      if (copied) {
        addToast('Link copiado!', 'success')
        return
      }
    } catch {}

    window.prompt('Copie o link de agendamento:', link)
    addToast('Nao foi possivel copiar automaticamente. Copie manualmente.', 'warning')
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

  const accessValue = {
    plan: accessProfile.plan,
    accessLevel: accessProfile.accessLevel,
    subscriptionExpiresAt: accessProfile.subscriptionExpiresAt,
    professionalType: accessProfile.professionalType,
    canUserEdit,
    checkoutUrl: CHECKOUT_URL,
    openPaywall,
  }

  const operatorValue = {
    operator: activeOperator,
    teamMembers,
    selectOperator: handleOperatorSelected,
    requestOperatorSwitch,
    refreshTeamMembers,
  }

  if (operatorGateOpen) {
    return (
      <OperatorSelect
        userId={userId}
        teamMembers={teamMembers}
        sessionName={session?.name}
        setupMode={teamMembers.filter((m) => m.active !== false).length === 0}
        onSelected={handleOperatorSelected}
        onTeamUpdated={refreshTeamMembers}
      />
    )
  }

  return (
    <AccessProvider value={accessValue}>
    <OperatorContext.Provider value={operatorValue}>
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


      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', minWidth: 0, overflow: 'visible' }}>
        <Topbar
          title={NAV_TITLES[page]}
          setOpen={setSidebarOpen}
          notifs={unreadCount + countSoonAppointments()}
          inbox={{
            unreadCount,
            soonCount: soonItems.length,
            items: visibleNotifications,
            soonItems,
            open: inboxOpen,
            onToggle: () => setInboxOpen((v) => !v),
            onClose: () => setInboxOpen(false),
            onItemClick: handleNotificationClick,
            onSoonClick: handleSoonClick,
            onMarkAllRead: handleMarkAllRead,
            onDeleteItem: handleDeleteNotification,
            onDeleteAll: handleDeleteAllNotifications,
          }}
          onNewAppt={() => {
            if (guardRestrictedWrite('Desbloqueie para criar agendamentos.')) return
            setNewApptInitial(null)
            setNewApptModal(true)
          }}
          offline={!online}
          isDemo={!canUserEdit}
          canUserEdit={canUserEdit}
          onUpgrade={() => openPaywall('Organize seu negócio sem limitações')}
          operator={activeOperator}
          onSwitchOperator={requestOperatorSwitch}
        />

        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {page === 'dashboard' && (
            <Dashboard
              appointments={appointments}
              clients={clients}
              services={services}
              config={config}
              isBarber={isBarber}
              onGoAgenda={() => setPage('agenda')}
              onNewAppointment={() => {
                if (guardRestrictedWrite('Desbloqueie para criar agendamentos.')) return
                setNewApptInitial(null)
                setNewApptModal(true)
              }}
              onGoClients={() => setPage('clients')}
              canUserEdit={canUserEdit}
              onUpgrade={() => openPaywall('Desbloqueie para salvar clientes')}
              onCopyBookingLink={copyBookingLink}
            />
          )}
          {page === 'agenda' && (
            <Agenda
              appointments={appointments}
              clients={clients}
              services={services}
              isBarber={isBarber}
              config={config}
              onNew={saveAppt}
              onEdit={(appt) => {
                if (guardRestrictedWrite('Desbloqueie para editar agendamentos.')) return
                setEditAppt(appt)
              }}
              onDelete={deleteAppt}
              onMarkStatus={markAppointmentStatus}
              addToast={addToast}
              canUserEdit={canUserEdit}
              onBlockedAction={guardRestrictedWrite}
              onUpgrade={() => openPaywall('Desbloqueie para criar agendamentos')}
              onGoSettings={() => setPage('settings')}
              focusAppointment={agendaFocus}
            />
          )}
          {page === 'clients' && (
            <Clients
              clients={clients}
              setClients={setClientsCompat}
              appointments={appointments}
              services={services}
              isBarber={isBarber}
              addToast={addToast}
              onScheduleAfterCreate={(clientId) => {
                if (guardRestrictedWrite('Desbloqueie para criar agendamentos.')) return
                setNewApptInitial({ clientId })
                setNewApptModal(true)
                setPage('dashboard')
              }}
              canUserEdit={canUserEdit}
              onBlockedAction={guardRestrictedWrite}
              onUpgrade={handleUpgrade}
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
          {page === 'finance' && (
            <Finance
              appointments={appointments}
              services={services}
              clients={clients}
              config={config}
              setConfig={saveConfig}
              isBarber={isBarber}
              cashExpenses={cashExpenses}
              onSaveCashExpense={handleSaveCashExpense}
              onDeleteCashExpense={handleDeleteCashExpense}
              addToast={addToast}
            />
          )}
          {page === 'reports' && <Reports appointments={appointments} services={services} clients={clients} isBarber={isBarber} />}
          {page === 'activity' && <ActivityLog userId={userId} />}
          {page === 'settings' && (
            <Settings
              config={config}
              setConfig={saveConfig}
              addToast={addToast}
              session={session}
              professionalType={professionalType}
              onLogout={onLogout}
              isDemo={isDemo}
              teamMembers={teamMembers}
              onTeamMembersChange={setTeamMembers}
              refreshTeamMembers={refreshTeamMembers}
            />
          )}
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

      <Modal open={pwaOnboardingOpen} onClose={dismissPwaOnboarding} title="Instale o app no celular">
        <p style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.6, marginBottom: 12 }}>
          Em poucos passos, voce coloca o {APP_NAME} na tela inicial e abre como aplicativo.
        </p>

        {isIosDevice ? (
          <ol style={{ margin: '0 0 14px 18px', color: 'var(--text)', lineHeight: 1.7, fontSize: 13 }}>
            <li>Toque no botao Compartilhar do Safari.</li>
            <li>Role o menu e toque em Adicionar a Tela de Inicio.</li>
            <li>Confirme em Adicionar para criar o icone do app.</li>
          </ol>
        ) : (
          <ol style={{ margin: '0 0 14px 18px', color: 'var(--text)', lineHeight: 1.7, fontSize: 13 }}>
            <li>Toque no menu do navegador (tres pontos).</li>
            <li>Escolha Instalar app ou Adicionar a tela inicial.</li>
            <li>Confirme para finalizar a instalacao.</li>
          </ol>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {pwaCanInstall && !isIosDevice && (
            <button
              type="button"
              onClick={() => { installFromOnboarding() }}
              style={{ background: 'var(--rose-deep)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Instalar agora
            </button>
          )}
          <button
            type="button"
            onClick={() => { setPage('settings'); dismissPwaOnboarding() }}
            style={{ background: 'var(--surface)', color: 'var(--rose-dark)', border: '1px solid var(--rose-light)', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Ver em Configuracoes
          </button>
          <button
            type="button"
            onClick={dismissPwaOnboarding}
            style={{ background: 'transparent', color: 'var(--text-light)', border: '1px solid var(--rose-light)', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Entendi
          </button>
        </div>
      </Modal>

      <Toast toasts={toasts} removeToast={removeToast} />
      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        subtitle={paywallHint}
        onUpgrade={handleUpgrade}
      />

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
    </OperatorContext.Provider>
    </AccessProvider>
  )
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
const PasswordRecoveryScreen = ({ onBackToLogin }) => {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (!password) { setError('Preencha a nova senha.'); return }
    if (password.length < 6) { setError('A senha deve ter ao menos 6 caracteres.'); return }
    if (password !== confirm) { setError('As senhas não coincidem.'); return }

    setLoading(true)
    setError('')
    try {
      await AUTH.changePassword(password)
      await AUTH.signOut()
      AUTH.clearLocalSession()
      clearRecoveryUrl()
      setRecoveryFlowActive(false)
      setDone(true)
    } catch (e) {
      setError(e?.message || 'Nao foi possivel redefinir sua senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--off-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="auth-card" style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, var(--rose) 0%, var(--rose-deep) 100%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, boxShadow: '0 8px 24px rgba(193,123,130,0.35)', color: '#fff', fontSize: 24 }}>
            ★
          </div>
          <h1 className="serif" style={{ fontSize: 26, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>{APP_NAME}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-light)', lineHeight: 1.6 }}>
            {done ? 'Senha atualizada com sucesso.' : 'Crie sua nova senha para voltar ao app.'}
          </p>
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 20, padding: '28px 28px 24px', border: '1px solid var(--rose-light)', boxShadow: '0 4px 40px rgba(139,77,85,0.08)' }}>
          {done ? (
            <>
              <div style={{ padding: '12px 14px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, fontSize: 13, color: '#065F46', lineHeight: 1.6 }}>
                Sua senha foi redefinida. Agora entre com a nova senha.
              </div>
              <button onClick={onBackToLogin} style={{ width: '100%', marginTop: 18, padding: '12px 0', borderRadius: 12, border: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', background: 'var(--rose-deep)', color: '#fff' }}>
                Ir para login
              </button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-light)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Nova senha</label>
                  <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Minimo 6 caracteres" style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border-mid)', borderRadius: 10, fontSize: 14, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-light)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Confirmar senha</label>
                  <input type="password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setError('') }} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Repita a nova senha" style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border-mid)', borderRadius: 10, fontSize: 14, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'inherit' }} />
                </div>
              </div>

              {error && (
                <div style={{ marginTop: 12, padding: '9px 14px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B' }}>
                  {error}
                </div>
              )}

              <button onClick={submit} disabled={loading} style={{ width: '100%', marginTop: 20, padding: '12px 0', borderRadius: 12, border: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', background: loading ? 'var(--rose)' : 'var(--rose-deep)', color: '#fff' }}>
                {loading ? 'Salvando...' : 'Salvar nova senha'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const App = () => {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [recoveryMode, setRecoveryMode] = useState(() => isRecoveryFlowActive())
  const [isBookingPublicPath, setIsBookingPublicPath] = useState(() => isBookingPath())
  const [bookingProfessionalId, setBookingProfessionalId] = useState(() => getBookingProfessionalIdFromPath())

  useEffect(() => {
    const syncRouteState = () => {
      setIsBookingPublicPath(isBookingPath())
      setBookingProfessionalId(getBookingProfessionalIdFromPath())
    }
    window.addEventListener('popstate', syncRouteState)
    return () => window.removeEventListener('popstate', syncRouteState)
  }, [])

  useEffect(() => {
    const sb = initSupabase(SUPABASE_URL, SUPABASE_KEY)
    if (isRecoveryFlowActive()) {
      setRecoveryFlowActive(true)
      setRecoveryMode(true)
    }

    const authSubscription = sb?.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryFlowActive(true)
        setRecoveryMode(true)
      }
    })

    AUTH.getSession()
      .then(async (s) => {
        if (s) {
          if (isRecoveryFlowActive()) {
            setRecoveryMode(true)
            return
          }
          setSession(s)
          return
        }

        const params = new URLSearchParams(window.location.search)
        const wantsDemo = params.get('demo') === '1' || params.get('trial') === '1'
        const professionalType = params.get('professional_type') || params.get('area') || DEFAULT_PROFESSIONAL_TYPE
        if (!wantsDemo) return

        const demoSession = await AUTH.createDemoSession(professionalType)
        AUTH.saveLocalSession(demoSession)
        setSession(demoSession)
        params.delete('demo')
        params.delete('trial')
        params.delete('professional_type')
        params.delete('area')
        const nextSearch = params.toString()
        const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
        window.history.replaceState({}, document.title, nextUrl)
      })
      .finally(() => setChecking(false))

    return () => {
      authSubscription?.data?.subscription?.unsubscribe?.()
    }
  }, [])

  if (isBookingPublicPath) return <PublicBooking professionalId={bookingProfessionalId} />

  if (checking) return <Spinner text="Carregando..." />

  if (recoveryMode) {
    return (
      <PasswordRecoveryScreen
        onBackToLogin={() => {
          setSession(null)
          setRecoveryMode(false)
        }}
      />
    )
  }

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
      onLogout={() => {
        if (session?.userId) clearOperatorSession(session.userId)
        AUTH.signOut()
        AUTH.clearLocalSession()
        setSession(null)
      }}
    />
  )
}

export default App
