import { useState } from 'react';
import { ArrowRight, CheckCircle2, Clock, Globe, Loader2, Mail, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { serviceOptions } from '@/data/site';

const emptyForm = { name: '', email: '', service: '', message: '' };

export default function Contact() {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle');
  const [serverError, setServerError] = useState('');

  const update = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Please tell us your name.';
    if (!form.email.trim()) next.email = 'We need an email to reply to.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()))
      next.email = 'That email address looks incomplete.';
    if (!form.service) next.service = 'Choose the closest service.';
    if (form.message.trim().length < 12) next.message = 'A sentence or two about the project helps.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setServerError('');
    if (!validate()) return;
    setStatus('sending');
    try {
      const response = await base44.functions.invoke('submitInquiry', {
        name: form.name.trim(),
        email: form.email.trim(),
        service: form.service,
        message: form.message.trim(),
      });
      if (response?.data?.success === false) {
        throw new Error(response.data.error || 'Something went wrong.');
      }
      setStatus('sent');
      setForm(emptyForm);
    } catch (error) {
      setStatus('idle');
      setServerError(
        error?.response?.data?.error || error?.message || 'We could not send that. Please try again.'
      );
    }
  };

  const inputClass =
    'w-full rounded-xl border border-white/10 bg-[#0d131f] px-4 py-3 text-sm text-white placeholder:text-slate-500 transition-colors duration-300 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/15';

  return (
    <section id="contact" className="relative scroll-mt-24 py-20 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#080d16]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 -top-24 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.28),transparent_65%)]" />
            <div className="absolute -bottom-32 right-0 h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.14),transparent_68%)]" />
          </div>

          <div className="relative grid gap-12 p-7 sm:p-10 lg:grid-cols-2 lg:gap-16 lg:p-12">
            <div>
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-sky-300">
                Get in touch
              </span>
              <h2 className="mt-5 font-heading text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-white sm:text-4xl">
                Let&apos;s build something <span className="text-gradient">remarkable</span>
              </h2>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-400 sm:text-base">
                Tell us about your challenge. You will hear back from a senior engineer within one
                business day — no sales sequence, no discovery call funnel.
              </p>

              <div className="mt-9 space-y-4">
                {[
                  { icon: Globe, label: 'www.coinexa.net' },
                  { icon: Mail, label: 'hello@coinexa.net' },
                  { icon: Clock, label: 'Mon–Fri, 9:00–18:00 (UTC)' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3 text-sm text-slate-400">
                    <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-sky-300">
                      <item.icon className="h-4 w-4" />
                    </span>
                    {item.label}
                  </div>
                ))}
              </div>

              <div className="mt-9 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-xs text-slate-400">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                NDA available on request. We never share details of an engagement.
              </div>
            </div>

            <div>
              {status === 'sent' ? (
                <div className="flex h-full flex-col items-start justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-8">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 font-heading text-xl font-semibold text-white">
                    Message received
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    Thanks for the detail. A senior engineer will reply within one business day.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStatus('idle')}
                    className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-300 hover:text-white"
                  >
                    Send another message
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <div>
                    <label htmlFor="name" className="mb-1.5 block text-xs font-medium text-slate-400">
                      Your name
                    </label>
                    <input
                      id="name"
                      value={form.name}
                      onChange={update('name')}
                      placeholder="Alex Morgan"
                      className={inputClass}
                      aria-invalid={Boolean(errors.name)}
                    />
                    {errors.name && <p className="mt-1.5 text-xs text-rose-400">{errors.name}</p>}
                  </div>

                  <div>
                    <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-slate-400">
                      Work email
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={update('email')}
                      placeholder="alex@company.com"
                      className={inputClass}
                      aria-invalid={Boolean(errors.email)}
                    />
                    {errors.email && <p className="mt-1.5 text-xs text-rose-400">{errors.email}</p>}
                  </div>

                  <div>
                    <label
                      htmlFor="service"
                      className="mb-1.5 block text-xs font-medium text-slate-400"
                    >
                      What do you need?
                    </label>
                    <select
                      id="service"
                      value={form.service}
                      onChange={update('service')}
                      className={`${inputClass} appearance-none`}
                      aria-invalid={Boolean(errors.service)}
                    >
                      <option value="">Select a service</option>
                      {serviceOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    {errors.service && (
                      <p className="mt-1.5 text-xs text-rose-400">{errors.service}</p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="message"
                      className="mb-1.5 block text-xs font-medium text-slate-400"
                    >
                      Tell us about your project
                    </label>
                    <textarea
                      id="message"
                      rows={4}
                      value={form.message}
                      onChange={update('message')}
                      placeholder="What are you building, and what does success look like?"
                      className={`${inputClass} resize-y`}
                      aria-invalid={Boolean(errors.message)}
                    />
                    {errors.message && (
                      <p className="mt-1.5 text-xs text-rose-400">{errors.message}</p>
                    )}
                  </div>

                  {serverError && (
                    <p className="rounded-xl border border-rose-400/25 bg-rose-400/[0.07] px-4 py-3 text-xs text-rose-300">
                      {serverError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={status === 'sending'}
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_16px_40px_-18px_rgba(34,211,238,0.95)] transition-transform duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                  >
                    {status === 'sending' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                        Send message
                      </>
                    )}
                  </button>
                  <p className="text-center text-[0.7rem] text-slate-500">
                    By sending you agree to be contacted about this enquiry only.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}