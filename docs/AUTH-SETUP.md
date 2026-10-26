# UEC — Getting Google & Microsoft sign-in credentials

Everything here happens in *your* accounts (Google Cloud, Microsoft Entra, Supabase dashboard) — roughly 10 minutes for Google, 10 for Microsoft, once.

**The one value you'll paste everywhere** (the "callback" / "redirect URI" both providers must trust):

```
https://oqzxkzkyiiahxmppgrkn.supabase.co/auth/v1/callback
```

That's the game's dedicated Supabase project (`uec-game`). Users bounce Game → Google/Microsoft → that callback → back to the game. Your future custom domain changes **nothing** here — this URI stays the same.

---

## 1 · Google (Client ID + Secret)

1. Open [Google Cloud Console](https://console.cloud.google.com/) → project picker (top bar) → **New project** → name it `UEC Game` → Create, then select it.
2. **APIs & Services → OAuth consent screen** (Google now calls this *Branding* under "Google Auth Platform"):
   - User type: **External** → Create.
   - App name `UEC — Ultimate Entrepreneur Challenge`, support email = your email, developer contact = your email. Save.
   - *(Skip scopes — the defaults, email/profile/openid, are all the game uses.)*
3. **APIs & Services → Credentials → + Create credentials → OAuth client ID**:
   - Application type: **Web application**; name `UEC Web`.
   - **Authorized redirect URIs → Add URI** → paste the callback URI above. (No JavaScript origins needed.)
   - Create → a dialog shows your **Client ID** (`…apps.googleusercontent.com`) and **Client secret** — copy both now.
4. [Supabase → uec-game → Authentication → Sign In / Providers → Google](https://supabase.com/dashboard/project/oqzxkzkyiiahxmppgrkn/auth/providers): toggle **Enable**, paste Client ID + Secret, Save.
5. **Publishing status** (back in Google's consent/Branding → Audience): while in **Testing**, only email addresses you add as *Test users* can sign in (fine for now — add yourself). Before launch, click **Publish app**. Google may show an "unverified app" interstitial until you complete verification — sign-in still works; users click through "Advanced → continue".

## 2 · Microsoft (Application ID + Secret)

1. Open [Microsoft Entra admin center](https://entra.microsoft.com/) (or Azure Portal → *Microsoft Entra ID*) → **App registrations → + New registration**.
2. Name `UEC Game`. **Supported account types**: choose **"Accounts in any organizational directory and personal Microsoft accounts"** (this is what lets any Outlook/Hotmail/work account sign in — the other options will silently reject most players).
3. **Redirect URI**: platform **Web**, value = the callback URI above → Register.
4. On the app's **Overview** page, copy the **Application (client) ID**.
5. **Certificates & secrets → + New client secret** → description `uec`, expiry 24 months → Add → **copy the *Value* column immediately** (it is shown exactly once; the "Secret ID" column is *not* the secret).
   - 📅 Put the expiry date in your calendar — Microsoft secrets expire and sign-in dies silently when they do.
6. [Supabase → uec-game → Authentication → Sign In / Providers → Azure](https://supabase.com/dashboard/project/oqzxkzkyiiahxmppgrkn/auth/providers): toggle **Enable**, paste the Application ID as Client ID and the secret Value as Secret. **Azure Tenant URL**: leave it as the default / `https://login.microsoftonline.com/common` (the "common" tenant matches the account-types choice in step 2). Save.

## 3 · Supabase project settings (both providers share these)

In [uec-game → Authentication → URL Configuration](https://supabase.com/dashboard/project/oqzxkzkyiiahxmppgrkn/auth/url-configuration):

- **Site URL**: `https://aurmada.github.io/uec-ultimate-entrepreneur-challenge/`
- **Redirect URLs** — add:
  - `https://aurmada.github.io/uec-ultimate-entrepreneur-challenge/**`
  - `http://localhost:4173/**` (local dev)
  - *(your custom domain later — one extra line here, zero code changes)*

The game moved to `aurmada.github.io` from `firdous-aurmada.github.io` in October
2026, when the repository moved to the Aurmada organisation. GitHub forwards the
repository but not the Pages site, so the old address returns 404: it can come off
the Redirect URLs, and if the Site URL still names it, sign-in falls back to a dead
page. The app sends Supabase its own address (`location.origin`), so this list is
the only place an address change has to be made.

Also recommended while you're in there:
- **Authentication → Sign In / Providers → Email**: confirm enabled (magic links need no credentials).
- **Authentication → Attack protection**: enable **leaked-password protection** (flagged by the project's security advisor; harmless for us since we're passwordless, good hygiene anyway).

## 4 · Flip the gate

Already done: [src/auth.js](../src/auth.js) ships with `AUTH.REQUIRED = true`, so the game requires sign-in (then a profile) before play, and live-match wins count toward the global leaderboard automatically. To reopen guest play, set it to `false`, commit and push.

### Quick test after setup
1. Open the game → 🔐 SIGN IN → Google → complete the redirect → your handle shows on the title screen.
2. Profile → save → look for "☁️ Profile synced to your account."
3. Two signed-in accounts play a 🔴 LIVE match → both get "🌍 Global leaderboard updated!" → Leaderboard → GLOBAL tab shows you.

### If something fails
- **`redirect_uri_mismatch` (Google)** — the URI in step 1.3 doesn't exactly match the callback (check for trailing slash / http vs https).
- **`AADSTS50011` (Microsoft)** — same problem, Entra flavor: fix the Web redirect URI on the app registration.
- **"unsupported account type" (Microsoft)** — step 2.2 was set to single-tenant; change Supported account types to include personal accounts.
- **Google says app unverified** — expected pre-verification; publish + (optionally) complete verification in the consent screen settings.
