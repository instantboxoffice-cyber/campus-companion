# Campus Companion — Project Documentation

**Status as of:** initial build (Phase 1 scaffold complete)
**Purpose of this file:** so any developer or AI assistant picking this project up — cold, with no prior context — can understand every decision made so far and continue safely without breaking existing choices or re-introducing paid services by accident.

---

## 1. What this app is

Campus Companion is a WhatsApp-style Progressive Web App (PWA) [an installable web app that works like a native app]. Structurally it looks and behaves like WhatsApp — a chat list, a chat thread, message bubbles, timestamps. But there are no other human contacts. The one "contact" is an AI companion.

The user types raw, natural language into the chat — e.g. *"remind me to submit the assignment by 6pm tomorrow"* — and the app:
1. Reads the message and extracts what's being asked (task, date/time, recurrence).
2. Saves it as a reminder.
3. Messages the user back inside the same chat thread, at the right time, to remind them.

## 2. Hard constraint: everything must be free

This is non-negotiable for the project. Every service chosen below has a genuine, indefinite free tier — not a trial. **Before adding any new dependency or third-party service, confirm it has a free tier with no time limit, and flag it to the user before integrating.**

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | React 19 + Vite | Same as the Ipayetori/campusmate stack, fast dev loop |
| Styling | Tailwind CSS v4 | Utility-first, uses the new `@tailwindcss/vite` plugin (no `tailwind.config.js` needed for basics) |
| PWA support | `vite-plugin-pwa` | Free, generates the service worker + manifest |
| Backend | Supabase (Postgres, Auth, Edge Functions, Realtime, Storage) | Free tier: 500MB DB, 50k monthly active auth users, 100k Edge Function calls/month |
| Scheduling | Supabase `pg_cron` + `pg_net` | Built into Supabase's free tier by default — no extra service needed to run "check every minute" jobs |
| AI parsing (Phase 2) | Groq API | Free tier, no credit card: 30 requests/min, 14,400/day — plenty for a personal reminder bot |
| Push delivery (Phase 4) | Web Push (VAPID keys) | Native browser feature, completely free, no Firebase dependency |
| Auth email delivery | Supabase default SMTP → Resend (free tier) | See Section 6 — default SMTP is too limited for real use |

## 4. Repository structure

```
src/
  lib/
    supabaseClient.js
  features/
    auth/
      AuthPage.jsx
    chat/
      ChatPage.jsx
      MessageBubble.jsx
    reminders/          (Phase 2)
  routes/
    ProtectedRoute.jsx
  App.jsx
  main.jsx
  index.css
```

## 5. Environment variables

Client-side (`.env.local`, safe to expose — these are public keys):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

**Server-side only** — set these as Supabase Edge Function secrets, never in a client `.env` file, because they are true secrets:
```
GROQ_API_KEY=...        (Phase 2)
VAPID_PRIVATE_KEY=...   (Phase 4)
```

For browser push reminders, also set `VAPID_PUBLIC_KEY` as an Edge Function secret
and `VITE_VAPID_PUBLIC_KEY` in the Vercel production environment. The public key
must be the same key pair as the private key. Deploy the three reminder functions
and apply `supabase/cron/check_due_reminders.sql` in the Supabase SQL editor.
The cron job checks every minute, writes the due reminder into the chat, and sends
a native browser push notification. Users must grant browser notification
permission while signed in; the chat list registers their device automatically.

## 6. Auth strategy — the free equivalent of WhatsApp login

WhatsApp logs users in with a phone number and an SMS one-time code. Real SMS delivery (Twilio, Vonage, etc.) is **not free at any real scale** — free SMS tiers are trial credit, not permanent.

The closest permanently-free equivalent, and what this project uses: **email + one-time code**, via Supabase Auth's OTP mode (`signInWithOtp`). The user enters their email, receives a 6-digit code, enters it, and is logged in — same rhythm as WhatsApp's phone flow, just over email instead of SMS.

Two things to configure in the Supabase dashboard (not yet done as of Phase 1):
1. **Authentication → Providers → Email**: switch the template mode to send a numeric OTP code, not a magic link.
2. **Authentication → SMTP**: Supabase's default mail sender is capped at **2 emails per hour** — unusable beyond your own testing. Connect **Resend** (free tier: 3,000 emails/month, 100/day, no credit card) as custom SMTP before showing this to any real user.

> Open item: if the user later insists on real phone-number OTP, that requires a paid SMS provider. Confirm with the user explicitly before adding one — it breaks the "completely free" constraint.

> **Gotcha found 2026-09-09:** the email OTP's digit count is a per-project GoTrue setting (`GOTRUE_MAILER_OTP_LENGTH`, exposed in the Supabase Dashboard under Authentication → Emails), not a fixed platform behavior. It defaults to 6 in most guides but can be provisioned at anywhere from 6-10 depending on the project — this project was actually sending 8-digit codes while the client hardcoded a "6-digit" claim and an 8-character input cap, which is why codes looked mismatched. `AuthPage.jsx` now reads its expected length from a single `OTP_LENGTH` constant at the top of the file instead of hardcoding it in three places — set that constant (and, ideally, the Dashboard setting) to 6 so the code matches this doc.

## 7. Design system — visual identity

Explicitly **not** WhatsApp's green. Brief from the user: blue-based, "chill," Twitter-ish but a bit more serious, still a little fun.

| Role | Hex | Notes |
|---|---|---|
| Primary (sent bubbles, buttons, active states) | `#1D9BF0` | Twitter-blue — the "serious but current" anchor color |
| Primary-dark (headers, pressed states) | `#0F172A` | Deep slate-navy, not pure black — keeps it "chill" rather than harsh |
| Received bubbles | `#F1F5F9` | Soft cool gray, not white — quiet contrast against the blue |
| Accent / fun touch | `#38BDF8` (sky) | Used sparingly — unread badges, typing indicator, small highlights |
| Background | `#FFFFFF` / `#0B1220` | Light and dark mode base |
| Text — primary | `#0F172A` | |
| Text — secondary/timestamps | `#64748B` | |

Tailwind v4 theme tokens (add to `index.css` under the `@theme` block once the UI phase starts):
```css
@theme {
  --color-primary: #1D9BF0;
  --color-primary-dark: #0F172A;
  --color-bubble-received: #F1F5F9;
  --color-accent: #38BDF8;
}
```

## 8. UI pattern (WhatsApp clone shape)

- **Chat list screen**: single row — the AI Companion — avatar, name, last message preview, timestamp. (Room to add more "contacts" later if the product ever grows beyond one companion.)
- **Chat thread**: bubbles right-aligned in `--color-primary` for the user, left-aligned in `--color-bubble-received` for the companion. Timestamps under each bubble, same as WhatsApp.
- **Top bar**: companion avatar + name + a status line (e.g. "3 reminders pending").
- **Composer**: text input + send button, fixed to the bottom, same as WhatsApp.

## 9. Build status

**Phase 1 — done:**
- Vite + React 19 + Tailwind v4 + vite-plugin-pwa scaffolded
- Supabase project created; `messages` and `reminders` tables created with Row Level Security
- `pg_cron` and `pg_net` extensions enabled
- Protected routing skeleton (`ProtectedRoute.jsx`)
- Real email-OTP auth flow (`AuthPage.jsx`) — no password fields remain

**Phase 2 — done:**
- Groq parsing Edge Function (`parse-reminder`) live, returns `intent` (reminder/clarify/chat) + `reply`
- Conversation history passed into the Edge Function so multi-turn clarification works
- `check-due-reminders` Edge Function + `pg_cron` job wired up

**Phase 3 — first redesign pass done (2026-09-09):**
- Added the chat-list ("Chats") screen this section originally called for and that was never built — `ChatListPage.jsx`, now the app's home route (`/`)
- Chat thread (`ChatPage.jsx`) rebuilt to WhatsApp's actual structure: back-arrow app bar with avatar/name/status, dotted "wallpaper" background (an original pattern, not WhatsApp's actual doodle asset — see note below), tailed bubbles with in-bubble timestamp + sent-checkmark, rounded composer with a circular send button
- Auth screens (`AuthPage.jsx`) rebuilt as full-bleed onboarding screens (no floating card) with a real multi-box, auto-advancing OTP input and a resend countdown
- Reminders screen restyled to a plain checklist consistent with the rest of the app, replacing the stat-card dashboard look
- Shared `components/Icons.jsx` and `components/Avatar.jsx` added so the four screens stay visually consistent
- **Deliberate deviation from WhatsApp:** WhatsApp's chat header also has video-call/voice-call icons. Since there's nothing for those to do in an AI-companion app, they were left out rather than added as decoration that does nothing when tapped — the header instead has a `⋮` overflow menu (Reminders / Log out), which keeps WhatsApp's icon-only header language without shipping dead buttons. Flag it if a full 1:1 visual match matters more than that.
- **Not done in this pass:** chat-list unread badges (would need a `read` column added to `messages`, currently out of scope), a splash/welcome screen before the email step, dark mode

**Not started:**
- Phase 4 — Web Push registration and delivery (scaffolding for this exists in `pushNotifications.js` / `send-reminder-push`, not yet verified end-to-end)
- Phase 5 — polish (dark mode, recurrence editing UI)

## 10. Handoff notes — read this first if you're a new AI or developer

- **The free-only constraint is the single most important rule in this project.** Check Section 3's table before suggesting any new service.
- The color scheme is intentionally blue, not WhatsApp green — see Section 7. Don't default back to green out of habit.
- Auth is email-OTP, not password — see Section 6 (this conversion is finished; no password fields remain in `AuthPage.jsx`).
- `AuthPage.jsx` must always navigate away from `/auth` itself on a successful `verifyOtp()`. `ProtectedRoute.jsx` only guards routes that require a session — it does not watch `/auth` — so a session becoming valid does nothing to move the user off the auth screen unless `AuthPage` calls `navigate()` explicitly. (This was the "signup just stays on the signup page" bug — fixed 2026-09-09, don't remove the `navigate('/', { replace: true })` call in `verifyCode()`.)
- The app's home route (`/`) is the chat list (`ChatListPage.jsx`); the actual AI conversation lives at `/chat`. Don't collapse these back into one route without updating both the auth redirect and the chat header's back-arrow target.
- Secrets (`GROQ_API_KEY`, `VAPID_PRIVATE_KEY`) belong in Supabase Edge Function environment settings, never in a client-side `.env` file.
- The user writes the code themselves (VS Code + Copilot). Give copy-pasteable snippets with plain-language explanations of *why*, rather than assuming direct repo access.
- Keep this file updated at the end of each phase — update Section 9's status and add any new open items to Section 11.

## 11. Open questions to confirm with the user

- Does campusmate's stack match Ipayetori's exactly, or does it differ anywhere?
- Should recurrence support be simple (daily/weekly/monthly) or fully custom (e.g. "every 3rd Tuesday")?
- Should one message be able to create multiple reminders (e.g. "remind me to do X and also Y")?
- Confirm the Supabase project's actual OTP length (Dashboard → Authentication → Emails) and either set it to 6 or update the `OTP_LENGTH` constant in `AuthPage.jsx` to match.
- Is the header's `⋮` overflow menu (instead of decorative call icons) an acceptable permanent deviation from WhatsApp, or should this be revisited?
- Is a chat-list unread badge worth the schema change (adding a `read`/`read_at` column to `messages`), or is last-message-preview-only sufficient?
- `eslint-plugin-react-hooks` v7's `set-state-in-effect` rule flags the "fetch on mount inside `useEffect`" pattern used throughout the app (ChatPage, ChatListPage, RemindersPage, AuthPage) as an error. This is a very new, strict rule catching a long-standing, generally-accepted React pattern — worth a deliberate decision (downgrade the rule, or restructure data-loading) rather than silently living with lint failing on every build.
