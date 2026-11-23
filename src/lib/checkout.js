import { base44 } from '@/api/base44Client';

// Sends the buyer to Stripe Checkout. The price and plan are decided by the
// server; this only carries the tier key.
export async function startCheckout(tier) {
  const isFramed = window.self !== window.top;
  const checkoutTab = isFramed ? window.open('', '_blank') : null;
  if (isFramed && !checkoutTab) throw new Error('Allow popups to continue to checkout.');
  if (checkoutTab) checkoutTab.opener = null;

  try {
    const response = await base44.functions.invoke('createCheckoutSession', { tier });
    const url = response?.data?.url;
    if (!url) throw new Error(response?.data?.error || 'Checkout could not be started.');

    if (checkoutTab) {
      checkoutTab.location.replace(url);
    } else {
      window.location.assign(url);
    }
  } catch (error) {
    checkoutTab?.close();
    throw new Error(error?.response?.data?.error || error?.message || 'Checkout could not be started.');
  }
}