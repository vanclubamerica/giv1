# Get Involved Van

Website for **Get Involved Van**, an independent, nonpartisan community organization that helps people in
Van, Texas follow local issues, show up, and take part in civic life.

Production address: **https://getinvolvedvan.com**
Associated partner: [Club America Van Activism Hub](https://tpvan.com)

---

## Contents

1. [How the site is built](#how-the-site-is-built)
2. [Run it on your computer](#run-it-on-your-computer)
3. [Project layout](#project-layout)
4. [Publishing content](#publishing-content) (articles, issues, petitions, events)
5. [The featured campaign](#the-featured-campaign)
6. [Branding: logo, favicon, images, colors](#branding)
7. [Organization details, partner link, navigation](#organization-details)
8. [Forms and submissions](#forms-and-submissions)
9. [Deployment to GitHub Pages](#deployment)
10. [Custom domain and DNS](#custom-domain-and-dns)
11. [Testing and checks](#testing-and-checks)
12. [Troubleshooting](#troubleshooting)
13. [Before launch: outstanding items](#before-launch)

---

## How the site is built

| Part | Choice | Why |
| --- | --- | --- |
| Site generator | [Astro 7](https://astro.build), static output | Fast pages with almost no JavaScript; content in Markdown files; works on GitHub Pages |
| Hosting | GitHub Pages via GitHub Actions | Free, reliable, deploys on every push to `main` |
| Content | Markdown files in `src/content/`, checked against schemas | No admin panel to secure; every change is reviewed and versioned in Git |
| Forms | One Supabase Edge Function + Postgres | GitHub Pages can't store submissions; Supabase gives a locked-down database with a dashboard for organizers |
| Spam protection | Cloudflare Turnstile, honeypot, timing check, rate limits | Privacy-friendly, no puzzles for most people |
| Email | Resend | Newsletter confirmation (double opt-in) and organizer notifications |
| Type | Public Sans (self-hosted) | Clear, sturdy, designed for public-service websites |

There are **no analytics, ad trackers or tracking cookies**. Fonts are served from this site.

## Run it on your computer

Requirements: [Node.js](https://nodejs.org) 22.18 or newer (24 recommended) and Git.

```bash
npm install
npm run dev          # http://localhost:4321, shows drafts too
npm run build        # production build into dist/
npm run preview      # serve the production build
```

Forms are switched off locally unless you point them at a backend. To try them without any accounts:

```bash
npm run backend:local
```

Then create a file named `.env` in the project folder containing
`PUBLIC_FORMS_ENDPOINT=http://localhost:8787/submit` and restart `npm run dev`. See
[docs/backend-setup.md](docs/backend-setup.md#developing-locally-without-supabase).

## Project layout

```
public/
  branding/             logo, favicon, social share image (replaceable)
  robots.txt, CNAME
src/
  assets/images/        photos used by content (resized automatically)
  assets/fonts/         Public Sans + license
  config/               ← most day-to-day settings live here
    site.ts             name, contact details, partner, navigation, footer, logo paths
    campaign.ts         homepage featured campaign
    home.ts             homepage text
    resources.ts        civic resources page links
    support.ts          donation link (off by default)
    forms.ts            reads the form backend settings
  content/              ← articles, issues, petitions, events (Markdown)
  components/ layouts/ pages/ lib/ scripts/ styles/
supabase/
  migrations/           database tables and security rules
  functions/submit/     the form-handling server function
  functions/_shared/    validation + handler (shared with the website and tests)
docs/
  backend-setup.md      step-by-step Supabase / Turnstile / Resend setup
  content-templates/    copy-and-fill templates for new content
scripts/
  verify-build.mjs      post-build checks (run in CI)
  local-backend.ts      local stand-in for the form backend
tests/                  automated tests
```

## Publishing content

All content lives in `src/content/<type>/` as Markdown files. Copy a template from
[`docs/content-templates/`](docs/content-templates), rename it, fill it in, and commit. The
**file name is the page address**: `src/content/articles/library-hours.md` becomes
`/news/library-hours/`. Use lowercase letters, numbers and hyphens.

Every file has a `status`:

| status | What happens |
| --- | --- |
| `draft` | Not on the website at all. Visible only with `npm run dev`. |
| `preview` | Page exists (so links work) but is labelled **Preview**, isn't listed anywhere, is hidden from search engines and the sitemap, and any form on it stays closed. |
| `published` | Live, listed, in the sitemap. |

If a file has a mistake (missing field, wrong date format), the build stops and tells you which file
and field. The live site keeps running the previous version.

**Articles** (`src/content/articles/`, template: [article.md](docs/content-templates/article.md)).
Choose a `kind`: `update`, `explainer`, `report`, `announcement`, or `position`. Readers see
the label, so facts and the organization's own advocacy are never confused. Use `position`
only for articles that argue for Get Involved Van's stance. Link sources in `sources`.

**Issues** (`src/content/issues/`, template: [issue.md](docs/content-templates/issue.md)).
`state` is `active`, `monitoring`, `resolved` or `archived`. Articles and petitions that set
`issue: <issue-file-name>` appear on the issue page automatically. Search and filter
controls appear on `/issues/` once there are more than six issues.

**Petitions** (`src/content/petitions/`, template: [petition.md](docs/content-templates/petition.md)).
Signing is possible only when `status: published` **and** `state: open` (and inside `opensAt`/`closesAt`
if set). The server re-checks this on every signature against the published site, so to close a
petition you just change `state: closed` and push. Signature counts are shown only if
`showSignatureCount: true`, and only count real stored signatures.

**Events** (`src/content/events/`, template: [event.md](docs/content-templates/event.md)).
Write times in local Van time (`2026-11-12T18:30`); Central daylight-saving changes are handled
automatically. Registration can be `none`, `external` (a link), or `rsvp` (a form). Each published event
gets an "Add to my calendar" file. Past events move to "Past events" by themselves: the site rebuilds
every morning, and visitors' browsers hide events that ended since the last build.

**Images:** put photos in `src/assets/images/<type>/` and reference them without the prefix, e.g.
`src: articles/library.jpg`. Use real photos of Van; always write `alt` text. Large photos are fine:
they're resized and converted to AVIF/WebP automatically.

**Homepage text, resources and support page:** edit `src/config/home.ts`, `src/config/resources.ts`
and `src/config/support.ts`. The homepage issue, event and article lists fill themselves from published content.

## The featured campaign

The large photo section on the homepage (repeated at the top of `/take-action/`) is configured in
[`src/config/campaign.ts`](src/config/campaign.ts). It currently shows the first initiative as a
**preview**: both buttons work, but they lead to a preview article and a petition that is closed.

To launch the first real initiative:

1. **Photo:** replace `src/assets/images/campaigns/featured-action.jpg` with the campaign photo
   (landscape, at least 2400 × 1350 px), keeping the file name. Set `image.alt` to describe it, and
   adjust `position` / `positionMobile` (e.g. `'50% 30%'`) if the important part of the photo gets cropped.
   The current file is a neutral placeholder texture.
2. **Article:** replace the text of `src/content/articles/first-initiative.md` and set `status: published`.
3. **Petition:** fill in `src/content/petitions/first-initiative.md` (`title`, `ask`, `recipient`,
   background), then set `status: published` and `state: open`.
4. **Campaign:** in `campaign.ts`, update `title` and `description` if needed and set `status: 'published'`.
5. Commit and push. The build refuses to publish a campaign whose article or petition isn't published yet.

To point the buttons at different files, change `article` / `petition` (file names without `.md`, or full
`https://` links). To show or hide the campaign on a schedule, set `startsAt` / `endsAt`. To remove the
section, set `enabled: false`.

## Branding

Official brand assets will replace the placeholders in `public/branding/`. **Keep the same file names**
and nothing else needs to change:

| File | Used for |
| --- | --- |
| `logo.svg` | Header (on white). Any width; displayed about 26–33 px tall. |
| `logo-light.svg` | Footer and loading screen (on dark blue). |
| `logo-dark.svg` | One-color version for other uses. |
| `logo-compact.svg`, `mark.svg` | Square symbol. |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` (180 × 180), `icon-512.png` | Browser tabs and phone home screens. |
| `social-preview.png` (1200 × 630) | Image shown when the site is shared on social media. |

If the new logo has a different shape, update its `width`/`height` in `src/config/site.ts → brand`
(they only describe proportions, to prevent layout shift). The current wordmark is a typographic
placeholder, not an official logo.

**Colors** come from the official palette and live in [`src/styles/tokens.css`](src/styles/tokens.css):
Deep Blue `#0C5678` (brand, navigation, primary buttons), Slate Blue `#6D8196` (accents, borders),
Crimson Red `#9A1F27` (campaign highlights, petition buttons, key calls to action) and White `#FFFFFF`.
Components only use the named tokens, so a color changed there changes everywhere.

## Organization details

[`src/config/site.ts`](src/config/site.ts) holds the organization name, description, **contact email,
phone and social links** (all empty until the organization decides them, and nothing is shown while
they're empty), the **partner name and link** (`https://tpvan.com`), the header navigation, the
**Get Involved** button, and the footer columns.

## Forms and submissions

Five forms send data to the Supabase function: **petition signatures, volunteer sign-ups, contact
messages, newsletter sign-ups, and event RSVPs**. The same validation code runs in the browser
(for quick feedback) and on the server (the check that counts). Success is shown only after the database
confirms the record was saved; otherwise the person sees an error and keeps what they typed.

- Setup, credentials and testing: **[docs/backend-setup.md](docs/backend-setup.md)**
- Reading and exporting submissions: [docs/backend-setup.md#reading-and-exporting-submissions-organizers](docs/backend-setup.md#reading-and-exporting-submissions-organizers)
- Privacy requests (deleting someone's data): [docs/backend-setup.md#privacy-requests](docs/backend-setup.md#privacy-requests)

Submissions are **never** stored in this repository.

### Environment variables

| Where | Name | Purpose |
| --- | --- | --- |
| GitHub → Actions **variables** | `PUBLIC_FORMS_ENDPOINT` | Supabase function URL. Turns the forms on. |
| | `PUBLIC_TURNSTILE_SITE_KEY` | Turnstile site key (public). |
| | `SITE_BASE` | `/giv1/` only while serving from `vanclubamerica.github.io/giv1/`. |
| Supabase function **secrets** | `SITE_URL`, `ALLOWED_ORIGINS`, `TURNSTILE_SECRET_KEY`, `RATE_LIMIT_SALT`, `RESEND_API_KEY`, `EMAIL_FROM`, `ORGANIZER_EMAIL` | See [`.env.example`](.env.example). |

## Deployment

Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): install, type
check, tests, build, post-build verification, then deploy to GitHub Pages. If any step fails, nothing is
deployed and the live site stays as it was. The workflow also runs every morning to keep dates current,
and can be started by hand from the **Actions** tab.

**One-time setup:** repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Until the custom domain works, the site can be served at `https://vanclubamerica.github.io/giv1/`: add
the Actions variable `SITE_BASE` = `/giv1/` and re-run the workflow. Remove the variable once
`getinvolvedvan.com` is live. Canonical links and the sitemap always use `https://getinvolvedvan.com`.

## Custom domain and DNS

1. Make sure `getinvolvedvan.com` is registered to the organization. (As of 2026-10-21 the domain did not
   resolve and had no registration record. It may need to be registered.)
2. At the domain registrar, create these DNS records:

   | Type | Name | Value |
   | --- | --- | --- |
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | AAAA | `@` | `2606:50c0:8000::153` |
   | AAAA | `@` | `2606:50c0:8001::153` |
   | AAAA | `@` | `2606:50c0:8002::153` |
   | AAAA | `@` | `2606:50c0:8003::153` |
   | CNAME | `www` | `vanclubamerica.github.io` |

3. GitHub repository **Settings → Pages → Custom domain**: enter `getinvolvedvan.com` and save. When the
   DNS check passes, tick **Enforce HTTPS** (the certificate can take up to an hour).
4. Recommended: verify the domain for the `vanclubamerica` account (**GitHub Settings → Pages → Add a
   domain**) to prevent anyone else from claiming it.
5. Remove the `SITE_BASE` variable if you set it, and re-run the workflow.

## Testing and checks

```bash
npm run check     # TypeScript and Astro type checks
npm test          # validation, database security rules, request handler, dates (Vitest + in-memory Postgres)
npm run build && npm run verify   # sitemap, robots.txt, metadata, links, drafts excluded, palette present
```

The database tests apply the real migration to an in-memory Postgres and confirm that the public API
roles cannot read or write any submission table.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Build fails with a content error | The message names the file and field. Common causes: date not in `YYYY-MM-DD`, event time not `YYYY-MM-DDTHH:MM`, an `issue:`/`petition:` reference to a file that doesn't exist. |
| `Image not found` | Put the file in `src/assets/images/` and reference it without that prefix (`articles/photo.jpg`). Check capitalization. |
| Warnings that the "issues"/"events" collection is empty | Harmless. They stop once content exists. |
| Forms say "Online submissions aren't connected yet" | `PUBLIC_FORMS_ENDPOINT` isn't set. Add the Actions variable and re-run the workflow. |
| Form error "couldn't check whether this form is open" | The function can't load `/api/forms-manifest.json` from `SITE_URL`. Check the secret and that the site is live. |
| "Submissions are only accepted from the Get Involved Van website" | Add the site's address to the `ALLOWED_ORIGINS` secret. |
| Newsletter sign-up "isn't available yet" | Set `RESEND_API_KEY` and `EMAIL_FROM` and verify the domain in Resend. |
| A new page shows 404 right after pushing | Wait for the Actions run to finish (about 2 minutes). |
| Site works at github.io but links are broken | `SITE_BASE` must be `/giv1/` for that address, and unset for the custom domain. |

## Before launch

These need decisions or accounts from the organization:

- [ ] Register/confirm `getinvolvedvan.com` and set up DNS (above).
- [ ] Enable GitHub Pages (Source: GitHub Actions).
- [ ] Create Supabase, Cloudflare Turnstile and Resend accounts; follow [docs/backend-setup.md](docs/backend-setup.md).
- [ ] Official logo, mark, favicon and social image → `public/branding/`.
- [ ] First initiative: campaign photo, article, petition (see [The featured campaign](#the-featured-campaign)).
- [ ] Public contact email and real social accounts → `src/config/site.ts`.
- [ ] Review the privacy policy and terms; decide the items listed at the top of each page, then empty
      `reviewItems` in `src/pages/privacy.astro` and `src/pages/terms.astro`.
- [ ] Optional: a hosted donation page → `src/config/support.ts`. Don't add tax-deductibility claims unless confirmed.
- [ ] Publish real issues and events as they're ready.

## License notes

Public Sans is used under the SIL Open Font License (`src/assets/fonts/PublicSans-OFL.txt`). The Texas
civic resource links point to official public websites, checked 2026-10-21.
