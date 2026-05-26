# Raigon Chat Hub

Raigon Chat Hub is a modern, high-performance chat service built with Next.js, Tailwind CSS, and Supabase.

## Features

- **Real-time Messaging**: Powered by Supabase Realtime.
- **COPPA Compliance**: Age-gated sign-up, parental consent for under 13, and restricted access for younger users.
- **Admin Dashboard**: Manage users and chats (exclusive to user `Admin`).
- **Storage Management**: Automated message pruning and inactive chat cleanup.
- **Modern UI**: Dark/Light mode support with a custom Rainbow Dragon logo.

## Setup Instructions

### 1. Supabase Setup

1. Create a new project in [Supabase](https://supabase.com).
2. Go to the **SQL Editor** and run the contents of `supabase/migrations/20260525000000_initial_schema.sql`.
3. Enable **Google Auth** in the Authentication settings.
4. Add the following environment variables to your `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

### 2. Local Development

```bash
npm install
npm run dev
```

### 3. Deployment to GitHub Pages

The project is configured for static export and includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml`.

1. In GitHub, open **Settings > Pages** and set **Source** to **GitHub Actions**.
2. Add repository variables or secrets for:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```
3. For a normal project page, the workflow automatically uses `/<repo-name>` as `NEXT_PUBLIC_BASE_PATH`.
4. If you use a custom domain, set the repository variable `NEXT_PUBLIC_BASE_PATH=/`.
5. Push to `main`, or run the **Deploy to GitHub Pages** workflow manually.

To test the same path behavior locally:

```bash
NEXT_PUBLIC_BASE_PATH=/Raigon-Chat-Hub npm run build
```


