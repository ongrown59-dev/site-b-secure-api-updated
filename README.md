# Site B Frontend

One-page member interface for the secure Site B backend.

## Security model
- This frontend contains **no provider API secret**.
- It talks only to your backend URL (`VITE_API_BASE_URL`).
- The Supabase publishable key is intentionally browser-safe; never place a Supabase secret/service key here.
- Authentication uses Supabase user sessions and sends only the user's access token to your backend.
- Audio is fetched through your backend with authentication, then played from a local browser Blob URL.

## Local setup
1. Copy `.env.example` to `.env`.
2. Set:
   - `VITE_API_BASE_URL=http://localhost:3001`
   - `VITE_SUPABASE_URL=` your existing Supabase project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY=` the `sb_publishable_...` key
3. Never put `AI84_API_KEY` or `sb_secret_...` in this frontend `.env`.
4. Install and run:

```powershell
npm.cmd install
npm.cmd run dev
```

5. Open `http://localhost:3000`.

## First admin account
The site is invite/login-only. Create your first account in Supabase Authentication, then set its profile role to `admin` and assign a credit limit. This can be done in Supabase SQL Editor after the user exists:

```sql
update public.profiles
set role = 'admin', monthly_limit = 1000000
where email = 'YOUR_ADMIN_EMAIL';
```

Do not use the example email literally.

## Important
The backend must remain running at `http://localhost:3001` while using the local frontend.
