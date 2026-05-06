# PolyHedge

50/50 market scanner for Polymarket. Hedge both sides, farm volume, earn the airdrop.

## Deploy to Vercel (2 dakika)

1. [vercel.com](https://vercel.com)'a git, GitHub ile giriş yap
2. "Add New Project" → bu klasörü upload et (veya GitHub'a push et)
3. Framework: **Other** (vanilla HTML)
4. Deploy!

Vercel otomatik URL verir: `polyhedge.vercel.app` gibi

## Lokal çalıştırma

```bash
# Python ile
python3 -m http.server 3000
# Sonra: http://localhost:3000
```

## Ayarlar

Kodda değil, arayüzden:
- **Max distance from 50¢**: 50/50'ye ne kadar yakın olsun
- **Expires within**: kaç gün içinde biten marketler
- **Min liquidity**: minimum likidite (düşük = yüksek spread riski)
