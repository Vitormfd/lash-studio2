/**
 * Facebook Pixel utility functions
 * Handles initialization and event tracking for Meta Pixel
 */

const PIXEL_ID = import.meta.env.VITE_FACEBOOK_PIXEL_ID;

/**
 * Initialize Facebook Pixel with the configured pixel ID
 */
export const initFacebookPixel = () => {
  if (!PIXEL_ID || typeof window === 'undefined' || !window.fbq) {
    console.warn('Facebook Pixel ID not configured or fbq not available');
    return;
  }

  try {
    // Initialize the pixel
    window.fbq('init', PIXEL_ID);
    // Track page view
    window.fbq('track', 'PageView');
  } catch (error) {
    console.error('Error initializing Facebook Pixel:', error);
  }
};

/**
 * Track a CompleteRegistration event
 * Called after successful user signup
 */
export const trackCompleteRegistration = () => {
  if (!PIXEL_ID || typeof window === 'undefined' || !window.fbq) {
    console.warn('Facebook Pixel ID not configured or fbq not available');
    return;
  }

  try {
    window.fbq('track', 'CompleteRegistration');
  } catch (error) {
    console.error('Error tracking CompleteRegistration:', error);
  }
};

/**
 * Track a custom event
 * @param {string} eventName - Name of the event to track
 * @param {object} data - Optional data to pass with the event
 */
export const trackPixelEvent = (eventName, data = {}) => {
  if (!PIXEL_ID || typeof window === 'undefined' || !window.fbq) {
    console.warn('Facebook Pixel ID not configured or fbq not available');
    return;
  }

  try {
    window.fbq('track', eventName, data);
  } catch (error) {
    console.error(`Error tracking ${eventName}:`, error);
  }
};
