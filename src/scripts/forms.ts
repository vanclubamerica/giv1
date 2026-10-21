/**
 * Progressive enhancement for every public form (petition, volunteer,
 * contact, newsletter, RSVP).
 *
 * - Validates with the same rules the server uses (shared module), shows
 *   accessible inline errors plus a summary, and focuses the first problem.
 * - Sends JSON to the Supabase Edge Function and shows success ONLY when the
 *   server confirms the record was stored.
 * - On any failure the form keeps what the person typed so they can retry.
 */

import {
  type FieldErrors,
  type FormType,
  type ValidationResult,
  type ZipRequirement,
  validateContact,
  validateNewsletter,
  validatePetition,
  validateRsvp,
  validateVolunteer,
} from '../../supabase/functions/_shared/forms.ts';

declare global {
  interface Window {
    turnstile?: {
      reset: (widget?: string | HTMLElement) => void;
      getResponse: (widget?: string | HTMLElement) => string | undefined;
    };
  }
}

type SubmittableForm = Exclude<FormType, 'newsletter-confirm' | 'newsletter-unsubscribe'>;

const validators: Record<SubmittableForm, (data: Record<string, unknown>, form: HTMLFormElement) => ValidationResult<unknown>> = {
  petition: (data, form) => validatePetition(data, { zip: (form.dataset.zip as ZipRequirement) || 'optional' }),
  volunteer: (data) => validateVolunteer(data),
  contact: (data) => validateContact(data),
  newsletter: (data) => validateNewsletter(data),
  rsvp: (data) => validateRsvp(data),
};

const NETWORK_ERROR =
  'We couldn’t reach our server, so nothing was saved. Check your internet connection and try again.';
const TIMEOUT_ERROR = 'The request took too long and may not have been saved. Please try again in a moment.';
const GENERIC_ERROR = 'Something went wrong and your submission was not saved. Please try again in a few minutes.';

let turnstileRequested = false;

function loadTurnstile(): void {
  if (turnstileRequested) return;
  turnstileRequested = true;
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

function collect(form: HTMLFormElement): Record<string, unknown> {
  const fd = new FormData(form);
  const multi = new Set(Array.from(form.querySelectorAll<HTMLElement>('[data-multiple]')).map((el) => el.dataset.multiple!));
  const data: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key === 'website' || key === 'cf-turnstile-response') continue;
    data[key] = multi.has(key) ? fd.getAll(key).map(String) : String(fd.get(key) ?? '');
  }
  for (const name of multi) if (!(name in data)) data[name] = [];
  form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not([data-multiple-item])').forEach((box) => {
    data[box.name] = box.checked;
  });
  return data;
}

function initForm(form: HTMLFormElement): void {
  const type = form.dataset.gvForm as SubmittableForm;
  const endpoint = form.dataset.endpoint ?? '';
  const validate = validators[type];
  if (!validate || !endpoint) return;

  const loadedAt = performance.now();
  const wrapper = form.closest<HTMLElement>('[data-form-wrapper]') ?? form.parentElement!;
  const summary = form.querySelector<HTMLElement>('[data-error-summary]');
  const summaryList = summary?.querySelector('ul');
  const status = form.querySelector<HTMLElement>('[data-status]');
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const success = wrapper.querySelector<HTMLElement>('[data-success]');
  const honeypot = form.querySelector<HTMLInputElement>('input[name="website"]');
  const widget = form.querySelector<HTMLElement>('.cf-turnstile');
  const submitLabel = submit?.innerHTML ?? '';
  let busy = false;

  if (widget) loadTurnstile();

  function fieldFor(name: string): HTMLElement | null {
    return form.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`);
  }

  function clearErrors(): void {
    form.querySelectorAll<HTMLElement>('[data-error-for]').forEach((el) => (el.textContent = ''));
    form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
    if (summary) summary.hidden = true;
    if (summaryList) summaryList.innerHTML = '';
    setStatus('');
  }

  function showErrors(errors: FieldErrors, message?: string): void {
    const entries = Object.entries(errors);
    let first: HTMLElement | null = null;
    for (const [name, text] of entries) {
      const errorEl = form.querySelector<HTMLElement>(`[data-error-for="${CSS.escape(name)}"]`);
      if (errorEl) errorEl.textContent = text;
      const field = fieldFor(name);
      field?.setAttribute('aria-invalid', 'true');
      if (!first && field) first = field;
      if (summaryList) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = field?.id ? `#${field.id}` : '#';
        a.textContent = text;
        a.addEventListener('click', (event) => {
          event.preventDefault();
          field?.focus();
        });
        li.appendChild(a);
        summaryList.appendChild(li);
      }
    }
    if (summary && entries.length) {
      const heading = summary.querySelector('[data-summary-heading]');
      if (heading) heading.textContent = message ?? (entries.length === 1 ? 'Please fix 1 problem' : `Please fix ${entries.length} problems`);
      summary.hidden = false;
      summary.focus();
    } else {
      (first as HTMLElement | null)?.focus();
    }
  }

  function setStatus(text: string, tone: 'info' | 'error' = 'info'): void {
    if (!status) return;
    status.textContent = text;
    status.className = text ? `form-status notice ${tone === 'error' ? 'notice--preview' : ''}` : 'form-status';
  }

  function setBusy(value: boolean): void {
    busy = value;
    form.setAttribute('aria-busy', String(value));
    if (submit) {
      submit.disabled = value;
      submit.innerHTML = value ? 'Sending…' : submitLabel;
    }
  }

  function turnstileToken(): string | undefined {
    if (!widget) return undefined;
    const input = form.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
    return input?.value || window.turnstile?.getResponse(widget) || undefined;
  }

  // Clear a field's error as soon as the person edits it.
  form.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.getAttribute('aria-invalid') === 'true') {
      target.removeAttribute('aria-invalid');
      const err = form.querySelector<HTMLElement>(`[data-error-for="${CSS.escape(target.name)}"]`);
      if (err) err.textContent = '';
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    clearErrors();

    const data = collect(form);
    const result = validate(data, form);
    if (!result.ok) {
      showErrors(result.errors);
      return;
    }

    const token = turnstileToken();
    if (widget && !token) {
      setStatus('Please complete the “verify you are human” check above the button, then submit again.', 'error');
      return;
    }

    setBusy(true);
    setStatus('Sending…');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form: type,
          data,
          meta: {
            elapsedMs: Math.round(performance.now() - loadedAt),
            website: honeypot?.value ?? '',
            turnstileToken: token,
          },
        }),
        signal: AbortSignal.timeout(20000),
      });
      let body: { ok?: boolean; message?: string; fieldErrors?: FieldErrors } | null = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      if (res.ok && body?.ok) {
        setStatus('');
        form.hidden = true;
        if (success) {
          const message = success.querySelector('[data-success-message]');
          if (message && body.message) message.textContent = body.message;
          success.hidden = false;
          success.focus();
        }
        // The signer's own signature should show up in the count right away.
        if (type === 'petition') void initCounts(true);
        return;
      }

      if (body?.fieldErrors && Object.keys(body.fieldErrors).length) {
        setStatus('');
        showErrors(body.fieldErrors, body.message);
      } else {
        setStatus(body?.message ?? GENERIC_ERROR, 'error');
      }
    } catch (error) {
      setStatus(error instanceof DOMException && error.name === 'TimeoutError' ? TIMEOUT_ERROR : NETWORK_ERROR, 'error');
    } finally {
      setBusy(false);
      if (widget && window.turnstile) {
        try {
          window.turnstile.reset(widget);
        } catch {
          /* widget not rendered yet */
        }
      }
    }
  });
}

/** Confirm / unsubscribe pages: a single button that posts the emailed token. */
function initTokenAction(root: HTMLElement): void {
  const action = root.dataset.tokenAction as 'newsletter-confirm' | 'newsletter-unsubscribe';
  const endpoint = root.dataset.endpoint ?? '';
  const button = root.querySelector<HTMLButtonElement>('button');
  const result = root.querySelector<HTMLElement>('[data-result]');
  const missing = root.querySelector<HTMLElement>('[data-missing-token]');
  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    if (button) button.hidden = true;
    if (missing) missing.hidden = false;
    return;
  }

  button?.addEventListener('click', async () => {
    if (!result) return;
    button.disabled = true;
    const label = button.innerHTML;
    button.innerHTML = 'Working…';
    result.hidden = false;
    result.className = 'notice';
    result.textContent = 'Working…';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: action, data: { token }, meta: {} }),
        signal: AbortSignal.timeout(20000),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      result.className = res.ok && body?.ok ? 'notice notice--success' : 'notice notice--preview';
      result.textContent = body?.message ?? GENERIC_ERROR;
      if (res.ok && body?.ok) {
        button.hidden = true;
        result.focus();
        return;
      }
    } catch {
      result.className = 'notice notice--preview';
      result.textContent = NETWORK_ERROR;
    }
    button.disabled = false;
    button.innerHTML = label;
  });
}

/** Live signature counts (only for petitions configured to show them). */
async function initCounts(fresh = false): Promise<void> {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-signature-count]'));
  if (!nodes.length) return;
  const endpoint = nodes[0]!.dataset.endpoint;
  if (!endpoint) return;
  const slugs = [...new Set(nodes.map((n) => n.dataset.signatureCount!))];
  try {
    const res = await fetch(`${endpoint}?counts=${encodeURIComponent(slugs.join(','))}`, {
      signal: AbortSignal.timeout(10000),
      cache: fresh ? 'no-cache' : 'default',
    });
    if (!res.ok) return;
    const body = (await res.json()) as { counts?: Record<string, number> };
    for (const node of nodes) {
      const count = body.counts?.[node.dataset.signatureCount!];
      if (typeof count !== 'number') continue;
      const value = node.querySelector('[data-count-value]');
      if (value) value.textContent = count.toLocaleString('en-US');
      const noun = node.querySelector('[data-count-noun]');
      if (noun) noun.textContent = count === 1 ? 'signature' : 'signatures';
      node.hidden = false;
    }
  } catch {
    /* Counts are optional; leave them hidden if unavailable. */
  }
}

document.querySelectorAll<HTMLFormElement>('form[data-gv-form]').forEach(initForm);
document.querySelectorAll<HTMLElement>('[data-token-action]').forEach(initTokenAction);
void initCounts();
