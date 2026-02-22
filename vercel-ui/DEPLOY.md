# 🚀 Deploy to Vercel - Step by Step

## Method 1: Import via Vercel Dashboard (RECOMMENDED)

### Step 1: Go to Vercel
Visit: https://vercel.com/new

### Step 2: Import Repository
1. Click **"Import Git Repository"**
2. Paste: `https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv`
3. Click **"Import"**

### Step 3: Configure Project
**⚠️ CRITICAL - Set these values:**

```
Project Name: hedera-mrv-dashboard
Framework Preset: Next.js
Root Directory: vercel-ui          ← MUST SET THIS!
Build Command: npm run build       (auto-detected)
Output Directory: .next            (auto-detected)
```

### Step 4: Deploy
Click **"Deploy"** button

Wait 2-3 minutes for build to complete.

### Step 5: View Your Site
Your site will be live at:
```
https://hedera-mrv-dashboard.vercel.app
```

---

## Method 2: One-Click Deploy Button

Click this button:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv&project-name=hedera-mrv-dashboard)

**Then set Root Directory to `vercel-ui` in the settings!**

---

## Method 3: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy from vercel-ui folder
cd vercel-ui
vercel --prod
```

---

## ⚠️ Common Issues

### "Cannot find module 'next'"
**Problem:** Root directory not set
**Solution:** In Vercel dashboard → Settings → General → Root Directory → Set to `vercel-ui`

### "404 on all pages"
**Problem:** Wrong build output
**Solution:** Redeploy with correct root directory

### "Build failed"
**Problem:** Dependencies not installed
**Solution:** Ensure `vercel-ui/package.json` exists with all dependencies

---

## ✅ What You'll See After Deployment

- 📊 Test results dashboard (237 tests passed)
- 🔗 Live HashScan transaction links
- 💰 Cost analysis ($3.04 breakdown)
- 📈 Carbon credit value ($3,027.91)
- 🎨 Beautiful gradient UI
- 📱 Mobile responsive

---

## 🔗 Useful Links

- Vercel Dashboard: https://vercel.com/dashboard
- Vercel Docs: https://vercel.com/docs
- Next.js Docs: https://nextjs.org/docs

---

**Ready to deploy? Start with Method 1 above!** 🚀
