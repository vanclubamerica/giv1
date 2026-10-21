/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Supabase Edge Function URL that receives all public forms. */
  readonly PUBLIC_FORMS_ENDPOINT?: string;
  /** Cloudflare Turnstile site key (public). */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
