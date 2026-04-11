export const CHECKOUT_URL = import.meta.env.VITE_CHECKOUT_URL || 'https://checkout.stripe.com/pay/REPLACE_ME'

export const openCheckout = () => {
  if (typeof window === 'undefined') return
  window.location.href = CHECKOUT_URL
}
