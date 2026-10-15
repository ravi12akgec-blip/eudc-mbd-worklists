# EUDC MBD Work Lists

Field app for EUDC Moradabad staff to record the **result of visit** against work lists (still disconnected, defaulters, TD cases …), with an office view for uploading lists, approving staff and downloading the action abstract.

- Hosted free on **GitHub Pages** (this repository holds only code and settings, no consumer data).
- **Google sign-in**; the office approves each new account once.
- Lists and actions are saved in **Firebase Firestore**; the consumer master (names, addresses, outstanding) is in **Firebase Storage**, readable only by approved users.

---

## Everyday use

| Who | What |
|---|---|
| Staff | Open the site → *Sign in with Google* → wait for approval (first time only) → **Work lists** → pick division / substation → tap an account → choose **Result of visit** → **Save action**. |
| Office | **Office records** tab: approve new users, upload a new work list (Excel/CSV with an account column), see the abstract by list, download action lists. |

### Change the Result of visit options (on GitHub)
1. Open `config/results.json` in this repository → click the ✏️ pencil.
2. Add, rename or remove an option. Each option has a `name` and a `type`:
   - `pay` – asks amount paid + receipt no.
   - `promise` – asks a promised date (`"days": 7` pre-fills a date a week ahead)
   - `dispute` – asks a case / complaint number (`"caseLabel"` changes the label)
   - `other_source` – asks the other account ID supplying the premises
   - `plain` – nothing extra
3. Click **Commit changes**. The site picks it up within about a minute (staff just reload).

Example – add “Paid at camp” to the Payment group:
```json
{ "name": "Paid at camp", "type": "pay" }
```
Keep names unique. Renaming an option does not change actions already saved under the old name.

### Upload another work list
Office records → **Upload a work list** → choose the Excel/CSV → check the sheet and account column → **Match with Master and upload**. Every account is matched to its Master substation and feeder. Use **Manage work lists** to switch a list off for staff or delete it.

---

## One-time setup (about 20 minutes)

### 1. Firebase project (use `eudc-mbd-console`)
1. Go to <https://console.firebase.google.com> → open **eudc-mbd-console**.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable → Save.**
   Then **Settings → Authorized domains → Add domain →** `ravi12akgec-blip.github.io`.
3. **Build → Firestore Database → Create database** (production mode, region `asia-south1` Mumbai).
   Open the **Rules** tab, paste the contents of `firestore.rules` from this repo, **Publish**.
4. **Build → Storage → Get started** (needs the Blaze pay-as-you-go plan; normal use stays inside the free quota).
   Open the **Rules** tab, paste `storage.rules`, **Publish**.
5. **Project settings (⚙) → Your apps → Add app → Web (</>)** → name it *worklists* → copy the `firebaseConfig` values.
   In this repo open `config/firebase-config.js` → ✏️ → paste the values → **Commit**.

### 2. Allow the site to read the master data files (one command)
Firebase Storage needs a CORS setting so the website can download files. In the Google Cloud Shell (console.cloud.google.com → the `>_` icon, project eudc-mbd-console) run:
```bash
cat > cors.json <<'EOF'
[{"origin":["*"],"method":["GET"],"maxAgeSeconds":3600}]
EOF
gsutil cors set cors.json gs://eudc-mbd-console.firebasestorage.app
```
(Use your bucket name from Storage if it differs.)

### 3. Turn on GitHub Pages
Repository **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save.**
Your site will be at `https://ravi12akgec-blip.github.io/eudc-mbd-worklists/`.

### 4. Make yourself admin (first time only)
1. Open the site and **Sign in with Google**. You will see *Waiting for approval*.
2. Firebase console → **Firestore Database → users** → open your document → set `status` = `approved` and `role` = `admin` → Update.
3. Reload the site. You now see **Office records**, where you approve everyone else.

### 5. Upload the consumer master data
Office records → **Consumer master data** → select **all** files from the master data folder Claude prepared (`a0.json` … `a96.json`, `s0.json` …, `idx2.json`, `sublabels.json`, `ref.json`, `worklists.json`) → **Upload master data**. Repeat whenever Claude prepares a refreshed master.

---

## Files
| File | Purpose |
|---|---|
| `index.html` | The app |
| `firebase-shim.js` | Connects the app to Firebase (sign-in, database, storage) |
| `config/results.json` | Result of visit options – **edit this on GitHub** |
| `config/firebase-config.js` | Your Firebase web app settings |
| `firestore.rules`, `storage.rules` | Security rules to paste into Firebase |
| `cors.json` | Storage download setting (step 2) |

Roles: **staff** (work lists only), **office** (plus Office records), **admin** (same as office; cannot be blocked by others).
