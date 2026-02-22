# 🚀 Hedera MRV Test Verification Dashboard

Beautiful UI to showcase test results, real blockchain transactions, and cost analysis.

## 📊 Features

- ✅ **237 Tests Passed** - Live status display
- 🔗 **Real HashScan Links** - Click to verify on blockchain
- 💰 **Cost Breakdown** - Transparent HBAR spending ($3.04 USD)
- 📈 **Carbon Credit Demo** - $3,027 market value
- 🎨 **Beautiful Gradients** - Glassmorphism design
- 📱 **Mobile Responsive** - Works on all devices

## 🚀 Deploy to Vercel

### Option 1: One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv&project-name=hedera-mrv-dashboard&root-directory=vercel-ui)

### Option 2: Manual Deploy

1. **Install Vercel CLI:**
```bash
npm i -g vercel
```

2. **Deploy:**
```bash
cd vercel-ui
vercel
```

3. **Follow prompts:**
- Project name: `hedera-mrv-dashboard`
- Deploy: Yes

### Option 3: Via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Click **"Add New Project"**
3. Import your GitHub repo
4. **Root Directory:** Set to `vercel-ui`
5. Click **"Deploy"**

## 🔧 Local Development

```bash
cd vercel-ui
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
vercel-ui/
├── app/
│   ├── api/
│   │   └── features/
│   │       └── route.ts          # API endpoint for features
│   ├── page.tsx                  # Main landing page
│   ├── layout.tsx                # Root layout
│   └── globals.css               # Global styles
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── postcss.config.js
```

## 🎨 What You'll See

### Hero Section
- 237 tests passed badge
- Key metrics (tests, cost, accuracy)

### Live Transactions
- Approved transaction with HashScan link
- Fraud detection example
- REC token details

### Test Results
- Execution time
- Real HBAR cost
- Performance benchmarks

### Cost Analysis
- Breakdown by operation
- Carbon credit value
- Market pricing

## 🔗 Live Links

After deployment, your site will be available at:
```
https://hedera-mrv-dashboard.vercel.app
```

## 📝 Environment Variables

None required! All data is hardcoded from your test results.

## 🎯 Hackathon Ready

This dashboard is perfect for:
- ✅ Demo presentations
- ✅ Investor showcases
- ✅ Technical verification
- ✅ Cost transparency
- ✅ Blockchain proof

## 🛠️ Tech Stack

- **Framework:** Next.js 14
- **Styling:** Tailwind CSS
- **Language:** TypeScript
- **Deployment:** Vercel

## 📄 License

MIT - Same as main project

---

**Built for Hedera Apex Hackathon 2026** 🏆
