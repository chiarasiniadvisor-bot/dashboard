import React, { useEffect, useState } from "react";

type CountItem = { label: string; count: number };
type Data = {
  generatedAt: string;
  totals: { contacts: number };
  datasets: {
    per_lista_ids: CountItem[];
    distribuzione_atenei: CountItem[];
    distribuzione_corsi: CountItem[];
    distribuzione_anno_nascita: CountItem[];
  };
};

export default function App() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // leggeremo datasets.json dallo stesso sito (lo copieremo in fase di deploy)
    fetch("./datasets.json", { cache: "no-store" })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch(e => setErr(String(e)));
  }, []);

  if (err) return <div style={{ padding: 24 }}>Errore: {err}</div>;
  if (!data) return <div style={{ padding: 24 }}>Caricamento…</div>;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24, lineHeight: 1.4 }}>
      <h1 style={{ marginBottom: 8 }}>Dashboard</h1>
      <div style={{ opacity: 0.8, marginBottom: 16 }}>
        Aggiornato: {new Date(data.generatedAt).toLocaleString("it-IT")}
      </div>
      <h2>Totale contatti: {data.totals.contacts.toLocaleString("it-IT")}</h2>

      <section>
        <h3 style={{ marginTop: 24 }}>Per lista (prime 10)</h3>
        <ol>
          {data.datasets.per_lista_ids.slice(0, 10).map(r => (
            <li key={r.label}>
              Lista {r.label}: <strong>{r.count.toLocaleString("it-IT")}</strong>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 style={{ marginTop: 24 }}>Atenei (prime 10)</h3>
        <ol>
          {data.datasets.distribuzione_atenei.slice(0, 10).map(r => (
            <li key={r.label}>
              {r.label}: <strong>{r.count.toLocaleString("it-IT")}</strong>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

