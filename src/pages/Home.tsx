import { Pin } from "lucide-react";
import { useEffect, useState } from "react";
import { api, locale, useSettings, navigate, fmtDate, todayStr, useT, type FlowItem, type NoteItem, type Task } from "../lib";

type Summary = {
  counts: { notes: number; todo: number; doing: number; done: number; flows: number };
  tasks: Task[];
  notes: NoteItem[];
  flows: FlowItem[];
};

export default function Home() {
  const { t, lang } = useT();
  const { settings } = useSettings();
  const [data, setData] = useState<Summary | null>(null);
  const [quick, setQuick] = useState("");
  const [flash, setFlash] = useState(false);

  const load = () => api<Summary>("/summary").then(setData);
  useEffect(() => {
    load();
  }, []);

  const dateLine = new Date().toLocaleDateString(locale(lang), {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  async function capture(e: React.FormEvent) {
    e.preventDefault();
    const text = quick.trim();
    if (!text) return;
    setQuick("");
    await api("/notes", "POST", { title: text.slice(0, 80), content: text, tags: "inbox" });
    setFlash(true);
    setTimeout(() => setFlash(false), 2000);
    load();
  }

  const today = todayStr();
  const c = data?.counts;
  const go = (to: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(to);
  };

  return (
    <div className="page home">
      <header className="home-head">
        {settings.owner_name && <p className="eyebrow">{settings.owner_name}</p>}
        <h1>{dateLine}</h1>
      </header>

      <form className="quick" onSubmit={capture}>
        <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={t("quickPlaceholder")} aria-label={t("quickPlaceholder")} />
        {flash && <span className="quick-flash">{t("savedInbox")}</span>}
      </form>

      <section className="stats">
        <a href="/todo" onClick={go("/todo")}><b>{c?.todo ?? "–"}</b><span>{t("todo")}</span></a>
        <a href="/todo" onClick={go("/todo")}><b>{c?.doing ?? "–"}</b><span>{t("doing")}</span></a>
        <a href="/todo" onClick={go("/todo")}><b>{c?.done ?? "–"}</b><span>{t("done")}</span></a>
        <a href="/notes" onClick={go("/notes")}><b>{c?.notes ?? "–"}</b><span>{t("notes")}</span></a>
        <a href="/flow" onClick={go("/flow")}><b>{c?.flows ?? "–"}</b><span>{t("flow")}</span></a>
      </section>

      <div className="home-grid">
        <section className="panel">
          <h2>{t("openTasks")} <a href="/todo" onClick={go("/todo")}>{t("seeAll")}</a></h2>
          {data && data.tasks.length === 0 && <p className="muted">{t("empty")}</p>}
          <ul className="rows">
            {data?.tasks.map((k) => (
              <li key={k.id}>
                <a href="/todo" onClick={go("/todo")}>
                  <span className={"dot " + k.status} />
                  <span className="grow">{k.title}</span>
                  {k.due && (
                    <span className={"due" + (k.due < today ? " late" : k.due === today ? " now" : "")}>
                      {k.due < today ? t("overdue") : k.due === today ? t("today") : fmtDate(k.due, lang)}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>{t("recentNotes")} <a href="/notes" onClick={go("/notes")}>{t("seeAll")}</a></h2>
          {data && data.notes.length === 0 && <p className="muted">{t("empty")}</p>}
          <ul className="rows">
            {data?.notes.map((n) => (
              <li key={n.id}>
                <a href={"/notes/" + n.id} onClick={go("/notes/" + n.id)}>
                  <span className="grow">{n.pinned ? <Pin /> : null}{n.title || t("untitled")}</span>
                  <span className="muted small">{fmtDate(n.updated_at, lang)}</span>
                </a>
              </li>
            ))}
          </ul>
          {data && data.flows.length > 0 && (
            <>
              <h2 className="sub">{t("recentFlows")}</h2>
              <ul className="rows">
                {data.flows.map((f) => (
                  <li key={f.id}>
                    <a href={"/flow/" + f.id} onClick={go("/flow/" + f.id)}>
                      <span className="grow">{f.title || t("untitled")}</span>
                      <span className="muted small">{fmtDate(f.updated_at, lang)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
