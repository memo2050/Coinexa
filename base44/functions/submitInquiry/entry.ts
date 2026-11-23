import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// The studio inbox and the two templates are fixed here. A caller can never
// choose a recipient, a template or a subject, so this endpoint cannot be used
// to send arbitrary mail.
const STUDIO_INBOX = 'hello@coinexa.net';

// Total enquiries accepted across all senders per hour. Every accepted
// submission sends two branded emails, so this is the ceiling that keeps the
// form from being used as an email amplifier.
const GLOBAL_HOURLY_CAP = 25;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX = { name: 120, email: 180, service: 80, message: 4000 };

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const name = clean(body.name);
    const email = clean(body.email);
    const service = clean(body.service);
    const message = clean(body.message);

    if (!name || name.length > MAX.name) {
      return Response.json({ error: 'Please provide your name.' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email) || email.length > MAX.email) {
      return Response.json({ error: 'Please provide a valid email address.' }, { status: 400 });
    }
    if (service.length > MAX.service) {
      return Response.json({ error: 'Please choose a listed service.' }, { status: 400 });
    }
    if (message.length < 12 || message.length > MAX.message) {
      return Response.json(
        { error: 'Please describe your project in a little more detail.' },
        { status: 400 }
      );
    }

    // The form is open to visitors and every submission sends two emails, so it
    // is capped twice: a global ceiling that protects the sending reputation
    // regardless of how many addresses an attacker uses, and a per-address rule
    // that stops one sender flooding the studio inbox.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const recentGlobally = await base44.asServiceRole.entities.Inquiry
      .count({ submitted_at: { $gte: since } })
      .catch(() => 0);
    if (recentGlobally >= GLOBAL_HOURLY_CAP) {
      console.warn(`submitInquiry: global hourly cap reached (${recentGlobally})`);
      return Response.json(
        { error: 'We are receiving a lot of enquiries right now. Please try again in a little while.' },
        { status: 429 }
      );
    }

    const recent = await base44.asServiceRole.entities.Inquiry
      .count({ email, submitted_at: { $gte: since } })
      .catch(() => 0);
    if (recent >= 3) {
      return Response.json(
        { error: 'You have already sent a few enquiries. Please give us a moment to reply.' },
        { status: 429 }
      );
    }

    const reference = `NX-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const submittedAt = new Date().toISOString();

    const record = await base44.asServiceRole.entities.Inquiry.create({
      name,
      email,
      service: service || 'Not specified',
      message,
      status: 'new',
      reference,
      submitted_at: submittedAt,
    });

    console.log(`Inquiry ${reference} stored for ${email}`);

    // Delivery: the studio is told an enquiry arrived, and the visitor gets a
    // receipt. Both use the stored templates with fixed variables; the only
    // variable recipient is the address the visitor typed into this form, and a
    // send failure is recorded rather than hidden or retried in a loop.
    const delivered = async (label, payload) => {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail(payload);
        console.log(`Inquiry ${reference} ${label} email sent`);
        return 'sent';
      } catch (error) {
        console.error(`Inquiry ${reference} ${label} email failed`, error?.message);
        return `failed: ${String(error?.message || 'unknown').slice(0, 160)}`;
      }
    };

    const studioNotifyStatus = await delivered('studio notification', {
      to: STUDIO_INBOX,
      template_name: 'NewInquiry',
      category: 'transactional',
      variables: {
        name,
        email,
        service: service || 'Not specified',
        reference,
        message,
        submitted_at: submittedAt,
      },
    });

    // The acknowledgement carries the reference and nothing the sender typed.
    // Echoing visitor-supplied text back inside a branded email turns this
    // endpoint into a relay for attacker-chosen content.
    const visitorAckStatus = await delivered('visitor acknowledgement', {
      to: email,
      template_name: 'InquiryReceived',
      category: 'transactional',
      variables: { reference },
    });

    const outcome: Record<string, string> = {
      studio_notify_status: studioNotifyStatus,
      visitor_ack_status: visitorAckStatus,
      studio_notified_at: studioNotifyStatus === 'sent' ? submittedAt : '',
      visitor_ack_at: visitorAckStatus === 'sent' ? submittedAt : '',
    };

    await base44.asServiceRole.entities.Inquiry
      .update(record.id, outcome)
      .catch((error) => console.error(`Inquiry ${reference} outcome not saved`, error?.message));

    return Response.json({
      success: true,
      reference,
      id: record?.id ?? null,
      studio_notify_status: studioNotifyStatus,
      visitor_ack_status: visitorAckStatus,
    });
  } catch (error) {
    console.error('submitInquiry failed', error);
    return Response.json({ error: 'We could not send that right now. Please try again.' }, { status: 500 });
  }
}