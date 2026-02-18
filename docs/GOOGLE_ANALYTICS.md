# Google Analytics – start to finish

Follow these steps in order. You’ll create two GA4 properties (Production + Development), then plug the IDs into your app so analytics work in both environments.

---

## Part A: Create the Production property and get the ID

1. Open **https://analytics.google.com** and sign in with your Google account.
2. Click **Admin** (gear icon at bottom left).
3. In the **Property** column (middle), click **Create property**.
4. **Property name:** type `statsBuildr Production` (or any name). Click **Next**.
5. Choose time zone and currency. Click **Next**.
6. Choose industry/size or skip. Click **Create**.
7. When asked “How do you want to get started?”, click **Web**.
8. **Website URL:** enter your live site, e.g. `https://statsbuildr.com`.
9. **Stream name:** type `Production` (or leave default). Click **Create stream**.
10. On the next screen you’ll see **Web stream details**. Find **Measurement ID** – it looks like `G-XXXXXXXXXX`. **Copy it and save it somewhere** (e.g. a note). This is your **Production ID**.

---

## Part B: Create the Development property and get the ID

11. Click **Admin** again (gear, bottom left).
12. In the **Property** column, click **Create property**.
13. **Property name:** type `statsBuildr Development`. Click **Next**.
14. Set time zone and currency. Click **Next** → **Create**.
15. Click **Web**.
16. **Website URL:** enter `http://localhost:3000`.
17. **Stream name:** type `Development`. Click **Create stream**.
18. Copy the **Measurement ID** for this stream. Save it. This is your **Development ID**.

You should now have two IDs written down: one for Production, one for Development.

---

## Part C: Turn on analytics in your app

### For local (your machine)

19. In your project folder, open the file **`.env.local`** (create it if it doesn’t exist, in the same folder as `package.json`).
20. Add this line (use your **Development** ID, not Production):
    ```bash
    NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
    ```
    Replace `G-XXXXXXXXXX` with the Development Measurement ID you copied.
21. Save the file.
22. If the app is running, stop it (Ctrl+C) and start again: **`npm run dev`**.

### For production (e.g. Vercel)

23. Go to your hosting dashboard (e.g. **vercel.com** → your project).
24. Open **Settings** → **Environment Variables**.
25. Click **Add New** (or **Add**).
26. **Key/Name:** type `NEXT_PUBLIC_GA_MEASUREMENT_ID`.
27. **Value:** paste your **Production** Measurement ID (the one from Part A).
28. Under **Environments**, select **Production** only. Save.
29. Trigger a new deploy (e.g. **Deployments** → **Redeploy** the latest, or push a new commit) so the variable is applied.

---

## Part D: Check that it’s working

30. **Production:** Open your live site in a browser. In Google Analytics, use the **property selector** (top left) to switch to **statsBuildr Production**. Go to **Reports** → **Realtime**. Within a minute you should see at least 1 user.
31. **Development:** With the app running locally (`npm run dev`), open **http://localhost:3000** in your browser. In GA4, switch to **statsBuildr Development** → **Reports** → **Realtime**. You should see your visit there.

If Realtime stays at 0, wait a minute and refresh the site. If it still doesn’t show, double‑check the ID in `.env.local` (for dev) or in the host’s Environment Variables (for prod), and that you restarted the dev server or redeployed after changing the variable.

---

**Done.** Production traffic is tracked in the Production property; local (and optionally preview) traffic is tracked in the Development property.
