# Cloudflare R2 & Object Storage Setup Guide ☁️📦

This guide walks you through setting up **Cloudflare R2** (or Vercel Blob) for Synapse Notes.

---

## 🌟 Why Cloudflare R2?

| Feature | Cloudflare R2 | Neon PostgreSQL (Raw) |
|---|---|---|
| **Free Storage Limit** | **10 GB / month (Free forever)** | 0.5 GB (512 MB) |
| **Egress / Download Bandwidth Fees** | **$0.00 (Zero egress fees)** | Bandwidth limits apply |
| **Best Used For** | Large slide decks, lecture PDFs, exported documents | Structured notes, stroke coordinates, user accounts |

By using Cloudflare R2 for PDFs and Neon PostgreSQL for notes/strokes, your **512 MB Neon database will last for over 50,000+ handwritten pages** without ever hitting storage limits.

---

## 🛠️ Step-by-Step Cloudflare R2 Setup (5 Minutes)

### Step 1: Create a Free Cloudflare Account
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/) and sign in or sign up.
2. In the left navigation menu, click on **R2 Object Storage**.

---

### Step 2: Create a Bucket
1. Click **Create Bucket**.
2. **Bucket Name:** `synapse-notes-files` (or any name you prefer).
3. **Location:** Leave as *Automatic* (recommended).
4. Click **Create Bucket**.

---

### Step 3: Generate S3 API Credentials
1. In the R2 Dashboard on the right sidebar, click **Manage R2 API Tokens** (or go to *Account Home > Manage Account > API Tokens*).
2. Click **Create API Token**.
3. **Token Name:** `synapse-notes-r2-token`.
4. **Permissions:** Choose **Object Read & Write**.
5. **Specify Bucket:** Select `synapse-notes-files` (or *All Buckets*).
6. Click **Create API Token**.
7. Copy the following 3 values:
   * **Access Key ID** (e.g. `2a3f89e47...`)
   * **Secret Access Key** (e.g. `98c41df8712...`)
   * **Account ID** (found in your R2 endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`)

---

### Step 4: (Optional) Enable Public Bucket Access
1. In your bucket settings (`synapse-notes-files`), go to the **Settings** tab.
2. Scroll to **Public Access** > **R2.dev subdomain**.
3. Click **Allow Access** (and type `allow`).
4. Copy the public domain URL (e.g. `https://pub-xxxxxx.r2.dev`).

---

### Step 5: Add Environment Variables

#### In Local Development (`.env.local`):
```env
# Cloudflare R2 Configuration
R2_ACCOUNT_ID="your_cloudflare_account_id_here"
R2_ACCESS_KEY_ID="your_r2_access_key_id_here"
R2_SECRET_ACCESS_KEY="your_r2_secret_access_key_here"
R2_BUCKET_NAME="synapse-notes-files"
R2_PUBLIC_DOMAIN="https://pub-yoursubdomain.r2.dev" # Optional
```

#### In Vercel Production Dashboard:
1. Go to [vercel.com](https://vercel.com/) > **Your Project (`synapse-notes`)** > **Settings** > **Environment Variables**.
2. Add:
   * `R2_ACCOUNT_ID`
   * `R2_ACCESS_KEY_ID`
   * `R2_SECRET_ACCESS_KEY`
   * `R2_BUCKET_NAME`
   * `R2_PUBLIC_DOMAIN` (optional)
3. Redeploy the project.

---

## 🔄 Automatic Fallback Behavior

Synapse Notes has built-in **3-layer storage resilience**:
1. **Cloudflare R2** (if `R2_ACCESS_KEY_ID` is set) -> uploads to your 10 GB R2 bucket.
2. **Vercel Blob** (if `BLOB_READ_WRITE_TOKEN` is set) -> uploads to Vercel Blob.
3. **Neon PostgreSQL Fallback** -> automatically saves to the `pdf_files` table in Neon Postgres if no cloud bucket is configured yet.
