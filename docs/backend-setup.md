# Forms backend setup (Supabase, Cloudflare Turnstile, Resend)

GitHub Pages only serves files. It cannot receive form submissions. Petitions,
volunteer sign-ups, contact messages, newsletter sign-ups and event RSVPs are
handled by a small server function on **Supabase**, which also stores them in
a private Postgres database.

```
Visitor's browser ──POST JSON──▶ Supabase Edge Function "submit"
   (getinvolvedvan.com)              │  checks origin, honeypot, timing,
                                     │  Turnstile, rate limit, validation,
                                     │  whether the petition/RSVP is open
                                     ▼  (reads /api/forms-manifest.json)
                               Postgres (row level security: no public access)
                                     │
                                     └─▶ Resend: confirmation + organizer emails
```

Until this is set up, every form on the site says plainly that online
submissions aren't connected yet, and stays switched off. Nothing pretends to
work.

**Cost:** all three services have free tiers that comfortably cover a small
local organization (check each provider's current pricing).

---

## 1. Create the Supabase project

1. Sign up at <https://supabase.com> with an organization email address.
2. **New project** → name `getinvolvedvan`, a strong database password (store
   it in a password manager), and a region in the United States (for example
   *East US*). Write the region down: the privacy policy should mention it.
3. Install the CLI locally (no global install needed):
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   ```
   The project ref is in the dashboard URL: `supabase.com/dashboard/project/<ref>`.

## 2. Create the database tables

```bash
npx supabase db push
```

This applies `supabase/migrations/20261021000000_initial_schema.sql`, which
creates the tables, locks them down, and creates the organizer report views.

Check it worked: **Database → Tables** should list `petition_signatures`,
`volunteer_signups`, `contact_messages`, `newsletter_subscribers`,
`event_rsvps` and `submission_attempts`, each marked **RLS enabled**.

## 3. Set up spam protection (Cloudflare Turnstile)

1. Sign up at <https://dash.cloudflare.com> → **Turnstile** → **Add widget**.
2. Hostnames: `getinvolvedvan.com`, `www.getinvolvedvan.com` (add
   `vanclubamerica.github.io` too if you use the preview address).
3. Widget mode: **Managed**. Copy the **site key** (public) and **secret key**.

## 4. Set up email (Resend)

1. Sign up at <https://resend.com> → **Domains** → add `getinvolvedvan.com` and
   create the DNS records it lists at your domain registrar. Wait until it shows
   **Verified**.
2. **API Keys** → create a key with *Sending access* only.

Newsletter sign-up stays switched off (with an honest message) until email is
configured, because double opt-in needs a confirmation email.

## 5. Store the function's secrets

Create `supabase/.env.production` (ignored by Git, never commit it):

```bash
SITE_URL=https://getinvolvedvan.com
ALLOWED_ORIGINS=https://getinvolvedvan.com,https://www.getinvolvedvan.com
TURNSTILE_SECRET_KEY=<turnstile secret key>
RATE_LIMIT_SALT=<output of: node -e "console.log(crypto.randomBytes(32).toString('hex'))">
RESEND_API_KEY=<resend api key>
EMAIL_FROM=Get Involved Van <updates@getinvolvedvan.com>
ORGANIZER_EMAIL=<the inbox that should hear about new messages and volunteers>
```

Then:

```bash
npx supabase secrets set --env-file supabase/.env.production
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to the function
automatically. Never put the service-role key in the website, in GitHub, or in
this repository.

> Serving from `https://vanclubamerica.github.io/giv1/` before the domain is
> live? Use `SITE_URL=https://vanclubamerica.github.io/giv1` and add
> `https://vanclubamerica.github.io` to `ALLOWED_ORIGINS`.

## 6. Deploy the function

```bash
npx supabase functions deploy submit
```

The function URL is `https://<project-ref>.supabase.co/functions/v1/submit`.
`supabase/config.toml` turns off JWT verification for this one function
because the website calls it without a key. Abuse protection is built in
(origin check, Turnstile, honeypot, timing check, per-IP rate limits).

Quick check (should answer `400` with a JSON message, proving it runs):

```bash
curl -i -X POST https://<project-ref>.supabase.co/functions/v1/submit -H "Origin: https://getinvolvedvan.com" -H "Content-Type: application/json" -d "{}"
```

## 7. Connect the website

GitHub repository → **Settings → Secrets and variables → Actions → Variables**:

| Variable | Value |
| --- | --- |
| `PUBLIC_FORMS_ENDPOINT` | `https://<project-ref>.supabase.co/functions/v1/submit` |
| `PUBLIC_TURNSTILE_SITE_KEY` | the Turnstile **site** key |

These are *variables*, not secrets: both values are public by design. Re-run
the **Build and deploy** workflow (Actions tab → *Run workflow*). The forms
switch on automatically.

## 8. Test with real submissions

Use your own email address on the live site:

1. **Contact:** send a message; confirm it appears in `contact_messages` and
   the organizer inbox gets a notification.
2. **Volunteer:** sign up; check `volunteer_signups`.
3. **Newsletter:** sign up, click the link in the confirmation email, then use
   the unsubscribe link; watch `status` go `pending → subscribed → unsubscribed`.
4. **Petition:** publish a test petition with `status: published` and
   `state: open`, sign it, sign it again with the same email (no duplicate row),
   then set it back to `draft` and delete the test rows:
   ```sql
   delete from public.petition_signatures where petition_slug = 'your-test-petition';
   ```

---

## Reading and exporting submissions (organizers)

Only people you invite to the Supabase project can see submissions. Invite
organizers under **Organization → Team** and give each person their own login.
Turn on two-factor authentication.

**Table Editor** shows each table. For tidy exports, use the **SQL Editor** and
the read-only report views, then click **Download CSV**:

```sql
select * from reports.petition_signatures where petition_slug = 'my-petition';
select * from reports.petition_totals;
select * from reports.volunteers;
select * from reports.contact_inbox;
select * from reports.newsletter_confirmed;   -- includes each person's unsubscribe link
select * from reports.event_rsvps where event_slug = 'my-event';
```

Mark progress by editing the `status` column (for example contact messages:
`new → replied`; volunteers: `new → contacted → active`).

**Sending the newsletter:** export `reports.newsletter_confirmed` into your
email tool and include each person's `unsubscribe_url` in every email. Only
email addresses in that view (confirmed, not unsubscribed) may be contacted.

**Removing a petition signature** without losing the record of the decision:

```sql
update public.petition_signatures set status = 'removed' where id = '<row id>';
```

### Privacy requests

To delete everything held about one person:

```sql
delete from public.petition_signatures   where email_normalized = lower('person@example.com');
delete from public.volunteer_signups      where lower(email) = lower('person@example.com');
delete from public.contact_messages       where lower(email) = lower('person@example.com');
delete from public.event_rsvps            where email_normalized = lower('person@example.com');
delete from public.newsletter_subscribers where email_normalized = lower('person@example.com');
```

## Security notes

- Tables have row level security on, no policies, and no privileges for the
  public `anon`/`authenticated` roles. The `gi_*` functions can only be run by
  the service role. These rules are covered by automated tests
  (`tests/backend/database.test.ts`).
- The function stores a salted hash of each visitor's IP address for rate
  limiting and deletes it after two days. Raw IP addresses are never stored.
- Logs contain event names only (for example `petition_signed`), never names,
  emails or messages.
- Rotate `RATE_LIMIT_SALT` or the Resend/Turnstile keys at any time with
  `npx supabase secrets set` (no redeploy of the website needed).

## Developing locally without Supabase

1. Start the local backend in one terminal:
   ```bash
   npm run backend:local
   ```
2. Create a file named `.env` in the project folder (it is ignored by Git) containing:
   ```
   PUBLIC_FORMS_ENDPOINT=http://localhost:8787/submit
   ```
3. Start (or restart) the site in a second terminal:
   ```bash
   npm run dev
   ```

`backend:local` runs the same handler and SQL against an in-memory database,
prints emails to the terminal, and shows stored data at
<http://localhost:8787/__local/state>. Nothing is kept when it stops.
