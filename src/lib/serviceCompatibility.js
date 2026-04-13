import { DEFAULT_SERVICE_NAME } from './domain'

const DEFAULT_SERVICE_NAMES = new Set([
  DEFAULT_SERVICE_NAME.toLowerCase(),
  'servico padrao',
  'serviço padrão',
])

export const normalizeServiceRecord = (service) => ({
  ...service,
  price: Number(service?.price || 0),
  color: service?.color || '',
})

export const ensureServiceCompatibility = ({ services = [], appointments = [], createId }) => {
  const normalizedServices = services.map(normalizeServiceRecord)
  const normalizedAppointments = appointments.map((appointment) => ({
    ...appointment,
    value: appointment?.value ?? null,
  }))

  const missingServiceAppointments = normalizedAppointments.filter(
    (appointment) => !appointment.blocked && !appointment.serviceId,
  )

  if (missingServiceAppointments.length === 0) {
    return {
      services: normalizedServices,
      appointments: normalizedAppointments,
      createdService: null,
      patchedAppointments: [],
    }
  }

  let fallbackService = normalizedServices.find((service) =>
    DEFAULT_SERVICE_NAMES.has(String(service?.name || '').trim().toLowerCase()),
  )

  let createdService = null
  if (!fallbackService) {
    fallbackService = {
      id: createId(),
      name: DEFAULT_SERVICE_NAME,
      price: 0,
      color: '',
      createdAt: new Date().toISOString(),
    }
    createdService = fallbackService
    normalizedServices.push(fallbackService)
  }

  const patchedAppointments = normalizedAppointments.map((appointment) => {
    if (appointment.blocked || appointment.serviceId) return appointment
    return {
      ...appointment,
      serviceId: fallbackService.id,
      value: appointment.value ?? fallbackService.price,
    }
  })

  return {
    services: normalizedServices,
    appointments: patchedAppointments,
    createdService,
    patchedAppointments: patchedAppointments.filter(
      (appointment) => !appointment.blocked && appointment.serviceId === fallbackService.id,
    ),
  }
}
