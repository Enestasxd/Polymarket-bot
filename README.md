# PolyHedge v2

50/50 market scanner + hedge execution for Polymarket. Her iki tarafa gir, volume kas, airdrop kazan.

## Yeni özellikler (v2)
- **Fee hesabı düzeltildi** — %2 × 2 taraf = $4 sabit + spread kaybı ayrı gösterilir
- **Auto-refresh** — her 30 saniyede bir otomatik yenileme
- **Telegram onayı** — bot fırsat bulunca sana bildirim atar, sen onaylayınca trade gönderir
- **Multi-wallet** — Cüzdan A YES alır, Cüzdan B NO alır (sybil riskini düşürür)
- **CSV export** — tüm işlem geçmişini indir
- **Gerçek trade execution** — Polymarket CLOB API üzerinden EIP-712 imzalı order

---

## Telegram Bot Kurulumu (5 dakika)

### 1. Bot oluştur
1. Telegram'da **@BotFather**'a yaz
2. `/newbot` komutunu gönder
3. Bot adı gir (örn: `PolyHedgeBot`)
4. Kullanıcı adı gir (örn: `polyhedge_notify_bot`)
5. BotFather sana **token** verecek: `1234567890:ABCdefGHI...`

### 2. Chat ID bul
**Kişisel Chat ID:**
1. @userinfobot'a `/start` yaz
2. Sana ID'ni söyler (örn: `123456789`)

**Grup Chat ID (birden fazla kişi için):**
1. Botu gruba ekle
2. Gruba herhangi bir mesaj yaz
3. `https://api.telegram.org/bot<TOKEN>/getUpdates` adresine git
4. `"chat":{"id":` alanındaki negatif sayı grup ID'si (örn: `-100123456789`)

### 3. PolyHedge'e ekle
1. Sağ üstteki **⚙** butonuna tıkla
2. Token ve Chat ID'yi gir
3. "Test Mesajı Gönder" ile dene
4. Kaydet

---

## Multi-wallet Sybil Koruması

İki cüzdanın aynı kişiye ait olduğu anlaşılmasın diye:

- ✅ Her cüzdana **farklı kaynaktan** USDC/MATIC gönder (farklı exchange, farklı bridge)
- ✅ Mümkünse farklı IP (VPN veya farklı bağlantı)
- ✅ Her iki cüzdanı da başka işlemler için de kullan (swap, LP, vs.)
- ❌ Aynı exchange withdrawal'dan ikisine de gönderme
- ❌ Aynı TX'ten ikisini de fund'lama

---

## Vercel'e Deploy (2 dakika)

1. [vercel.com](https://vercel.com)'a git, GitHub ile giriş yap
2. "Add New Project" → bu klasörü upload et
3. Framework: **Other** (vanilla HTML)
4. Deploy!

## Lokal çalıştırma

```bash
python3 -m http.server 3000
# Sonra: http://localhost:3000
```

---

## Fee Hesabı Detayı

| Durum | Formül | $100+$100 örneği |
|-------|--------|-----------------|
| Sabit fee | amount × %2 × 2 | **$4.00** |
| Spread kaybı | (YES+NO-100)/100 × amount | YES=51,NO=51 → **$2.00** |
| **Toplam max kayıp** | fee + spread | **$6.00** |

Eğer YES=49 + NO=49 = 98¢ ise spread **negatif** (kazanç) → sadece $4 fee ödersin.

---

> ⚠ Private key'ler sadece tarayıcı localStorage'ında tutulur. Bu aracı sadece kendi bilgisayarında çalıştır.
> Not financial advice.
