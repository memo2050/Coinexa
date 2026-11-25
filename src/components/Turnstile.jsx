import { useEffect, useRef } from 'react';

// Cloudflare Turnstile (free CAPTCHA). Shown only when the site key is configured; the
// token is checked by Supabase Auth (sign-up, sign-in, reset, resend) or by our server.
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
export const captchaEnabled = Boolean(TURNSTILE_SITE_KEY);

let scriptPromise = null;
function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => reject(new Error('The security check could not load.'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// `resetKey` changes after each attempt: a token can be used only once.
export default function Turnstile({ onToken, resetKey = 0, action = 'auth' }) {
  const box = useRef(null);
  const widget = useRef(null);

  useEffect(() => {
    if (!captchaEnabled) return undefined;
    let alive = true;
    onToken(null);
    loadScript()
      .then((ts) => {
        if (!alive || !box.current) return;
        if (widget.current !== null) ts.remove(widget.current);
        widget.current = ts.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          theme: 'dark',
          callback: (token) => alive && onToken(token),
          'expired-callback': () => alive && onToken(null),
          'error-callback': () => alive && onToken(null),
        });
      })
      .catch(() => onToken(null));
    return () => {
      alive = false;
      if (widget.current !== null && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [resetKey]);

  if (!captchaEnabled) return null;
  return <div ref={box} className="min-h-[65px]" aria-label="Security check" />;
}
