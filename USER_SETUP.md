# FortifyGrid — Your Setup Steps (human only)

These are the only steps an LLM can't do for you. The total is about 30 minutes.
After step 5, tell the LLM "done" and it does everything else (see INFRA.md).
Use **krishnan@fortifygrid.com** everywhere.

## 1. Cloudflare account (2 min)
- Log in at dash.cloudflare.com. In the top-left account switcher, pick the account that lists **fortifygrid.com**
  (owner admin@fortifygrid.com, ID `5b09f3b0f591d77cd46739113e886479`).
- If fortifygrid.com isn't listed, the account owner must invite you: Manage Account → Members → Invite → Super Administrator.

## 2. Zero Trust (2 min)
- Left menu → **Zero Trust** → choose a team name → **Free** plan.
- Remember the team name; it's used in step 3. Ours is **`fortifyai`**.

## 3. Google sign-in (10 min) at console.cloud.google.com
1. Create a project named **FortifyGrid Login**.
2. **Google Auth Platform → Branding:**
   - App name: FortifyGrid
   - Support and developer email: krishnan@fortifygrid.com
   - Home page: `https://fortifygrid.com`
   - Privacy policy: `https://fortifygrid.com/privacy`
   - Authorized domains: `fortifygrid.com` and `cloudflareaccess.com`
   - **Don't upload a logo.** A logo triggers a review that can take weeks.
   - Save.
3. **Audience:** External → **Publish app**.
   - You can ignore the yellow "verification" banner. It only affects the app name shown on Google's screen.
4. **Clients → Create client → Web application.** Fill **Authorized redirect URIs** (not JavaScript origins) with:
   `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
   - Copy the **Client ID** and **Client secret**.

## 4. One Cloudflare API token (5 min)
Profile icon → My Profile → **API Tokens → Create Token → Create Custom Token**. Name it **fortifygrid-admin**.

| Type | Permission | Level |
|---|---|---|
| Account | Access: Apps and Policies | Edit |
| Account | Access: Organizations, Identity Providers, and Groups | Edit |
| Account | D1 | Edit |
| Account | Hyperdrive | Edit |
| Account | Workers Scripts | Edit |
| Account | Cloudflare Pages | Edit |
| Zone | Zone | Read |
| Zone | DNS | Edit |
| Zone | Workers Routes | Edit |

- **Account Resources:** Include → the fortifygrid.com account.
- **Zone Resources:** Include → Specific zone → fortifygrid.com.
- Create the token and copy it. Cloudflare shows it only once.

## 5. Save the values on your Mac (2 min)
Run this in Terminal:
```bash
mkdir -p ~/.config/fortifygrid && touch ~/.config/fortifygrid/secrets.env && chmod 600 ~/.config/fortifygrid/secrets.env && open -e ~/.config/fortifygrid/secrets.env
```
Paste these 4 lines into the file. Put each value right after the `=`, with **no spaces and no quotes**. Then save.
```
CF_SETUP_TOKEN=<token from step 4>
CF_ACCOUNT_ID=5b09f3b0f591d77cd46739113e886479
GOOGLE_CLIENT_ID=<from step 3>
GOOGLE_CLIENT_SECRET=<from step 3>
```
The file lives at `~/.config/fortifygrid/secrets.env`: outside git and outside Google Drive, and readable only by you.
**Never paste these values into chat.**

Then tell the LLM **"done"**.

## 6. After the LLM deploys (5 min)
- Open fortifygrid.com/dashboard → sign in with Google → **Manage users** → add people and pick their app roles.
- GitHub: if the LLM asks, run the one `gh secret set` command it gives you.

## Everyday (no setup)
| You want | Do |
|---|---|
| Give or remove access | fortifygrid.com/dashboard/admin → Users |
| Dashboard banner | Admin → Settings → `dashboard_notice` |
| Change the site or an app | Ask the LLM in the repo folder; it edits, pushes, and the change is live in about 1 minute |
| A new app | Ask the LLM: "add app X" (it follows INFRA.md §7). Then add users in admin |
