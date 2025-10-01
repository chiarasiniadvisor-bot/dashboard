// pipeline/build-datasets.mjs
// Node 20+, zero dipendenze. Usa fetch integrato.
// Obiettivo: scaricare TUTTI i contatti Brevo, droppare PII e produrre "public/datasets.json" con soli aggregati.

import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.BREVO_API_KEY;
if (!API_KEY) {
  console.error("Missing BREVO_API_KEY env var");
  process.exit(1);
}

const API_BASE = "https://api.brevo.com/v3";

// ---------- Utilità ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safeYearFromDateLike(val) {
  if (!val) return null;
  // Accetta "YYYY-MM-DD", "DD/MM/YYYY", "YYYY", ecc.
  const s = String(val).trim();
  const m = s.match(/(19[5-9]\d|20[0-4]\d)/); // 1950–2049
  if (!m) return null;
  const y = parseInt(m[1], 10);
  if (y < 1950 || y > 2012) return null; // tagliamo fuori over/under per sicurezza
  return y;
}

function normAteneo(raw) {
  if (!raw) return null;
  let s = String(raw)
    .normalize("NFKC")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // mini-normalizzazioni non invasive
  s = s.replace(/, sede di .+$/i, ""); // es. "Modena e Reggio Emilia, sede di Modena" -> "Modena e Reggio Emilia"
  return s || null;
}

function groupCount(items, keyFn) {
  const map = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (!k) continue;
    map.set(k, (map.get(k) || 0) + 1);
  }
  return Array.from(map, ([label, count]) => ({ label, count })).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  );
}

function bucketSmall(arr, min = 5, label = "Altro (k<5)") {
  let small = 0;
  const big = [];
  for (const r of arr) {
    if (r.count < min) small += r.count;
    else big.push(r);
  }
  if (small > 0) big.push({ label, count: small });
  return big;
}

// ---------- Fetch con paginazione + retry ----------
async function fetchContactsAll() {
  const limit = 1000;
  let offset = 0;
  const all = [];

  while (true) {
    const url = `${API_BASE}/contacts?limit=${limit}&offset=${offset}`;
    let attempt = 0;
    while (true) {
      attempt++;
      const res = await fetch(url, {
        headers: { "api-key": API_KEY, accept: "application/json" },
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt <= 5) {
          const backoff = 300 * attempt; // ms
          console.log(`Retry ${attempt} (HTTP ${res.status}) after ${backoff}ms`);
          await sleep(backoff);
          continue;
        }
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} on ${url}\n${body}`);
      }
      const data = await res.json();
      const chunk = data?.contacts ?? data?.items ?? [];
      if (!Array.isArray(chunk) || chunk.length === 0) return all;
      all.push(...chunk);
      console.log(`Fetched ${chunk.length} (total ${all.length})`);
      offset += chunk.length;
      break; // esci dal ciclo retry e vai alla pagina successiva
    }
  }
}

// ---------- Main ----------
(async () => {
  console.log("Downloading contacts from Brevo...");
  const contacts = await fetchContactsAll();

  // Evitiamo PII: NON useremo email/telefono/nomi nei dataset.
  // Usiamo SOLO:
  // - attributes.ATENEO
  // - attributes.CORSO_ACQUISTATO
  // - attributes.DATA_DI_NASCITA
  // - listIds (solo come numeri)
  // Tutto il resto ignorato.

  const perLista = groupCount(
    contacts.flatMap((c) => (Array.isArray(c.listIds) ? c.listIds : []).map((id) => String(id))),
    (id) => id
  );

  const ateneiRaw = groupCount(contacts, (c) => normAteneo(c?.attributes?.ATENEO));
  const atenei = bucketSmall(ateneiRaw, 5, "Altro (k<5)");

  const corsiRaw = groupCount(
    contacts,
    (c) => (c?.attributes?.CORSO_ACQUISTATO ? String(c.attributes.CORSO_ACQUISTATO).trim() : null)
  );
  const corsi = bucketSmall(corsiRaw, 5, "Altro (k<5)");

  const yearOfBirth = groupCount(contacts, (c) => {
    const y = safeYearFromDateLike(c?.attributes?.DATA_DI_NASCITA);
    return y ? String(y) : null;
  });

  const out = {
    generatedAt: new Date().toISOString(),
    totals: {
      contacts: contacts.length,
    },
    datasets: {
      per_lista_ids: perLista, // [{label:"6",count:...}, ...]
      distribuzione_atenei: atenei, // [{label:"Bari Aldo Moro",count:...}, ... , {label:"Altro...",count:X}]
      distribuzione_corsi: corsi, // [{label:"Corso Full...",count:...}, ...]
      distribuzione_anno_nascita: yearOfBirth, // [{label:"1998",count:...}, ...]
    },
    // NOTE: nessun record singolo, solo aggregati.
  };

  const outDir = path.join(process.cwd(), "public");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "datasets.json");
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`✅ Wrote ${outFile}`);
})();
