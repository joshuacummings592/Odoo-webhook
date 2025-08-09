// Vercel Serverless Function
// GET/POST /api/odoo-command
// Example:
//   GET  /api/odoo-command?secret=YOUR_SECRET&text=Bill:%20OpenAI%205000%20GYD%20admin%20software
//   POST /api/odoo-command  { "secret":"YOUR_SECRET", "text":"Bill: OpenAI 5000 GYD admin software" }

async function readBody(req) {
  if (req.method !== "POST") return {};
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); }
      catch { resolve({}); }
    });
  });
}

async function odooAuth() {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const login = process.env.ODOO_LOGIN;
  const password = process.env.ODOO_API_KEY;
  if (!url || !db || !login || !password) throw new Error("Missing Odoo env vars");

  const res = await fetch(`${url}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", params: { db, login, password } })
  });

  const setCookie = res.headers.get("set-cookie") || "";
  const m = /session_id=([^;]+)/.exec(setCookie);
  if (!m) throw new Error("Auth failed");
  return m[1];
}

async function callKw(sessionId, model, method, args = [], kwargs = {}) {
  const res = await fetch(`${process.env.ODOO_URL}/web/dataset/call_kw/${model}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": `session_id=${sessionId}` },
    body: JSON.stringify({ model, method, args, kwargs })
  });
  const data = await res.json();
  if (data.error) {
    const msg = data.error?.data?.message || data.error?.message || "Odoo error";
    throw new Error(msg);
  }
  return data.result;
}

function parsePrompt(text) {
  // "Bill: Vendor 5000 GYD description..."
  const t = (text || "").trim();
  const bill = /^bill:\s*(.+?)\s+(\d+(?:\.\d+)?)\s*(gyd|usd|gy|us)?\s*(.*)$/i.exec(t);
  if (bill) {
    const vendor = bill[1].trim();
    const amount = parseFloat(bill[2]);
    const currency = (bill[3] || "GYD").toUpperCase().replace("GY","GYD").replace("US","USD");
    const desc = (bill[4] || "Expense").trim() || "Expense";
    return { type: "bill", vendor, amount, currency, desc };
  }
  return { type: "unknown", raw: t };
}

async function ensureVendor(sessionId, name) {
  let [id] = await callKw(sessionId, "res.partner", "search", [[["name","=",name],["supplier_rank",">=",1]]], { limit: 1 });
  if (!id) {
    id = await callKw(sessionId, "res.partner", "create", [{ name, supplier_rank: 1 }]);
  }
  return id;
}

async function pickExpenseAccount(sessionId) {
  let [acct] = await callKw(sessionId, "account.account", "search", [[["name","ilike","software"],["deprecated","=",false]]], { limit: 1 });
  if (!acct) {
    [acct] = await callKw(sessionId, "account.account", "search", [[["user_type_id.name","=","Expenses"],["deprecated","=",false]]], { limit: 1 });
  }
  if (!acct) throw new Error("No expense account found");
  return acct;
}

async function createBill(sessionId, { vendor, amount, desc }) {
  const partnerId = await ensureVendor(sessionId, vendor);
  const expenseAccountId = await pickExpenseAccount(sessionId);
  const today = new Date().toISOString().slice(0,10);

  const moveId = await callKw(sessionId, "account.move", "create", [{
    move_type: "in_invoice",
    partner_id: partnerId,
    invoice_date: today,
    invoice_line_ids: [[0,0,{
      name: desc,
      quantity: 1,
      price_unit: amount,
      account_id: expenseAccountId
    }]],
    narration: "Webhook auto-created"
  }]);
  return moveId;
}

module.exports = async (req, res) => {
  try {
    const isPost = req.method === "POST";
    const body = await readBody(req);
    const qp = req.query || {};
    const providedSecret = (isPost ? body?.secret : qp?.secret) || "";
    if (providedSecret !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ ok:false, error:"Unauthorized" });
    }

    const text = (isPost ? body?.text : qp?.text) || "";
    const parsed = parsePrompt(text);
    if (parsed.type !== "bill") {
      return res.status(400).json({ ok:false, error:"Unsupported or malformed command", parsed });
    }

    const sid = await odooAuth();
    const moveId = await createBill(sid, parsed);
    return res.status(200).json({ ok:true, move_id: moveId, parsed });

  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message || String(e) });
  }
};
