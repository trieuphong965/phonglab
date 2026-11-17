import { useEffect, useRef, useState } from "react";
import { api, navigate, useT, type Key } from "./lib";

type Hit = {
  kind: "notes" | "gantt" | "gcomment" | "gfile" | "tasks" | "flow" | "docs" | "journal" | "glossary" | "checklist";
  id: string;
  title: string;
  snippet: string;
};
const LABEL: Record<Hit["kind"], Key> = {
  glossary: "glossary",
  checklist: "checklist",
  notes: "notes",
  gantt: "gantt",
  gcomment: "comments",
  gfile: "files",
  tasks: "tasks",
  flow: "flow",
  docs: "docs",
  journal: "journal",
};

const target = (h: Hit) =>
  h.kind === "notes" ? "/notes/" + h.id
  : h.kind === "flow" ? "/flow/" + h.id
  : h.kind === "journal" ? "/journal/" + h.id
  : h.kind === "gantt" ? "/gantt/" + h.id
  : h.kind === "gcomment" || h.kind === "gfile" ? "/gantt/" + h.id + "/history"
  : h.kind === "glossary" || h.kind === "checklist" ? `/${h.kind}/${h.id}`
  : h.kind === "tasks" ? "/todo"
  : "/" + h.kind;

export default function Search({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!q.trim()) return setHits(null);
    let live = true;
    const id = setTimeout(() => {
      api<Hit[]>("/search?q=" + encodeURIComponent(q.trim())).then((r) => {
        if (!live) return;
        setHits(r);
        setActive(0);
      });
    }, 180);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [q]);

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (h: Hit) => {
    onClose();
    navigate(target(h));
  };

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    if (!hits?.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") go(hits[active]);
  }

  return (
    <div className="modal-wrap top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t("searchAll")}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={t("searchAll")} aria-label={t("searchAll")} />
        {hits && hits.length === 0 && <p className="muted pad">{t("noResults")}</p>}
        {hits && hits.length > 0 && (
          <ul ref={list}>
            {hits.map((h, i) => (
              <li key={h.kind + h.id}>
                <button className={i === active ? "active" : ""} onMouseEnter={() => setActive(i)} onClick={() => go(h)}>
                  <span className="kind">{t(LABEL[h.kind] ?? "notes")}</span>
                  <span className="grow">
                    <strong>{h.title || t("untitled")}</strong>
                    {h.snippet && <span className="excerpt">{h.snippet}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
