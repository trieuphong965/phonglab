import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { api, locale, navigate, todayStr, useAutosave, useT } from "../lib";
import { fromDay, toDay } from "../gantt";

type Entry = { date: string; content: string };
type Day = Entry & {
  todos: { id: string; title: string }[];
  gantt: { id: string; title: string }[];
  activity: { id: string; kind: "comment" | "file"; title: string; body: string; name: string | null; rev: number | null }[];
};

export default function Journal({ selected }: { selected?: string }) {
  const { t, lang } = useT();
  const date = selected && /^\d{4}-\d{2}-\d{2}$/.test(selected) ? selected : todayStr();
  const month = date.slice(0, 7);
  const [day, setDay] = useState<Day | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);

  const loadMonth = () => api<Entry[]>("/journal?month=" + month).then(setEntries);
  const { state, save, flush } = useAutosave<Entry>(async (e) => {
    await api("/journal/" + e.date, "PUT", { content: e.content });
    loadMonth();
  });

  useEffect(() => {
    loadMonth();
  }, [month]);

  useEffect(() => {
    flush();
    setDay(null);
    let live = true;
    api<Day>(`/journal/${date}?tz=${-new Date().getTimezoneOffset()}`).then((d) => live && setDay(d));
    return () => {
      live = false;
    };
  }, [date]);

  const change = (content: string) => {
    if (!day) return;
    setDay({ ...day, content });
    save({ date, content });
  };

  const shift = (n: number) => navigate("/journal/" + fromDay(toDay(date) + n));
  const label = (d: string, long = false) =>
    new Date(d + "T00:00:00").toLocaleDateString(locale(lang),
      long ? { weekday: "long", year: "numeric", month: "long", day: "numeric" } : { weekday: "short", day: "numeric", month: "numeric" });

  const doneItems = day ? [...day.todos.map((x) => `[Todo] ${x.title}`), ...day.gantt.map((x) => `[${t("gantt")}] ${x.title}`)] : [];
  const firstLine = (s: string) => {
    const l = s.split("\n")[0].trim();
    return l.length > 100 ? l.slice(0, 100) + "…" : l;
  };
  const activityItems = (day?.activity ?? []).map((a) =>
    a.kind === "comment"
      ? `[${a.title}] ${firstLine(a.body)}`
      : `[${a.title}] ${a.name ?? "?"} rev${a.rev ?? "?"}${a.body ? " · " + firstLine(a.body) : ""}`,
  );
  const insert = () => {
    if (!day) return;
    const lines = [...doneItems, ...activityItems].filter((l) => !day.content.includes(l)).map((l) => "- " + l);
    if (lines.length) change((day.content.trimEnd() ? day.content.trimEnd() + "\n" : "") + lines.join("\n") + "\n");
  };

  async function exportMonth() {
    setBusy(true);
    try {
      flush();
      const rows = await api<Entry[]>("/journal?month=" + month);
      const { exportJournalExcel } = await import("../journalExcel");
      await exportJournalExcel(month, rows, lang);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="split journal has-detail">
      <div className="list-pane narrow">
        <div className="list-head">
          <input type="month" value={month} onChange={(e) => e.target.value && navigate(`/journal/${e.target.value}-01`)} aria-label={t("month")} />
          <button className="btn wide" onClick={exportMonth} disabled={busy || entries.length === 0}><Download />{t("exportMonth")}</button>
        </div>
        <ul className="note-list">
          {entries.map((e) => (
            <li key={e.date}>
              <a href={"/journal/" + e.date} className={e.date === date ? "active" : ""} onClick={(ev) => { ev.preventDefault(); navigate("/journal/" + e.date); }}>
                <strong>{label(e.date)}</strong>
                <span className="excerpt">{e.content.split("\n")[0]}</span>
              </a>
            </li>
          ))}
          {entries.length === 0 && <li className="muted pad">{t("empty")}</li>}
        </ul>
      </div>

      <div className="detail-pane">
        <div className="toolbar">
          <button className="btn" onClick={() => shift(-1)} aria-label="prev"><ArrowLeft /></button>
          <input type="date" className="date-pick" value={date} onChange={(e) => e.target.value && navigate("/journal/" + e.target.value)} aria-label={t("day")} />
          <button className="btn" onClick={() => shift(1)} aria-label="next"><ArrowRight /></button>
          {date !== todayStr() && <button className="btn" onClick={() => navigate("/journal")}>{t("today")}</button>}
          <span className={"save-state " + state}>
            {state === "saving" ? t("saving") : state === "saved" ? t("saved") : state === "error" ? t("saveError") : ""}
          </span>
        </div>
        <h1 className="journal-date">{label(date, true)}</h1>
        {day ? (
          <>
            {doneItems.length + activityItems.length > 0 && (
              <div className="done-box">
                <div className="done-head">
                  <strong>{doneItems.length ? t("doneThatDay") : t("activityThatDay")}</strong>
                  <button className="btn" onClick={insert}>{t("insert")}</button>
                </div>
                {doneItems.length > 0 && <ul>{doneItems.map((l) => <li key={l}>{l}</li>)}</ul>}
                {doneItems.length > 0 && activityItems.length > 0 && <strong className="done-sub">{t("activityThatDay")}</strong>}
                {activityItems.length > 0 && <ul>{activityItems.map((l, i) => <li key={i}>{l}</li>)}</ul>}
              </div>
            )}
            <textarea className="editor" value={day.content} onChange={(e) => change(e.target.value)} placeholder={t("journalPlaceholder")} aria-label={t("journal")} />
          </>
        ) : (
          <p className="muted">{t("loading")}</p>
        )}
      </div>
    </div>
  );
}
