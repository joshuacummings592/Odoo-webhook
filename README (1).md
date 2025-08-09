# Odoo Webhook (Vercel)

Deploy to Vercel. Endpoint:
- **GET/POST** `/api/odoo-command` with a `text` prompt, e.g. `Bill: OpenAI 5000 GYD admin software`.

## Env Vars (Vercel → Project → Settings → Environment Variables)
- `ODOO_URL` = e.g. `https://theoasis.odoo.com`
- `ODOO_DB`  = e.g. `theoasis`
- `ODOO_LOGIN` = your Odoo login email
- `ODOO_API_KEY` = your Odoo API key
- `WEBHOOK_SECRET` = a long random string you choose

## Test (GET)
https://<your-project>.vercel.app/api/odoo-command?secret=YOUR_SECRET&text=Bill%3A%20OpenAI%205000%20GYD%20admin%20software

## Test (POST)
curl -X POST https://<your-project>.vercel.app/api/odoo-command   -H "Content-Type: application/json"   -d '{ "secret": "YOUR_SECRET", "text": "Bill: OpenAI 5000 GYD admin software" }'
