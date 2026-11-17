import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import {
  api,
  DEFAULT_SETTINGS,
  isLang,
  LangCtx,
  navigate,
  SettingsCtx,
  store,
  stored,
  translate,
  type Key,
  type Lang,
  type Settings,
} from "./lib";
import Home from "./pages/Home";
import Notes from "./pages/Notes";
import Tasks from "./pages/Tasks";
import Gantt from "./pages/Gantt";
import Docs from "./pages/Docs";
import Journal from "./pages/Journal";
import Checklist from "./pages/Checklist";
import Glossary from "./pages/Glossary";
import SettingsPage from "./pages/Settings";
import Search from "./Search";
import { Logo } from "./Logo";

const Flow = lazy(() => import("./pages/Flow"));

const icons: Record<string, string> = {
  home: "M3 11.5 12 4l9 7.5M5.5 10v9h13v-9",
  notes: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
  gantt: "M4 5h9v3H4zM8 10.5h9v3H8zM12 16h8v3h-8z",
  tasks: "M4 6l2 2 3-3M4 13l2 2 3-3M12 7h8M12 14h8M4 19h16",
  flow: "M4 4h6v5H4zM14 15h6v5h-6zM7 9v4a3 3 0 0 0 3 3h4",
  docs: "M3 7h6l2 2h10v10H3zM3 7V5h6l2 2",
  journal: "M5 4h14v17H5zM9 2v4M15 2v4M8 11h8M8 15h5",
  checklist: "M9 5h11M9 12h11M9 19h11M3.5 5l1.5 1.5L7.5 4M3.5 12l1.5 1.5 2.5-2.5M4 19h2",
  glossary: "M4 5h7v14H4zM13 5h7v14h-7zM6.5 9h2M15.5 9h2M6.5 13h2M15.5 13h2",
  settings:
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4z",
};

/** "PhongLab" -> Phong<b>Lab</b>; other names are shown as typed. */
function SiteName({ name }: { name: string }) {
  const m = /^(.+?)(Lab)$/.exec(name);
  return m ? <>{m[1]}<b>{m[2]}</b></> : <>{name}</>;
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const routes = [
  { path: "/", key: "home" },
  { path: "/notes", key: "notes" },
  { path: "/gantt", key: "gantt" },
  { path: "/todo", key: "tasks" },
  { path: "/flow", key: "flow" },
  { path: "/docs", key: "docs" },
  { path: "/journal", key: "journal" },
  { path: "/checklist", key: "checklist" },
  { path: "/glossary", key: "glossary" },
] as const;

const LANG_LABEL: Record<Lang, string> = { vi: "VI", ja: "日本語", en: "EN" };

function App() {
  const [path, setPath] = useState(location.pathname);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // A language picked in this browser wins; otherwise the site default applies once settings load.
  const [lang, setLangState] = useState<Lang>(() => {
    const s = stored("lang", "");
    return isLang(s) ? s : "en";
  });
  const setLang = (l: Lang) => {
    store("lang", l);
    setLangState(l);
  };
  const [theme, setTheme] = useState(() =>
    stored("theme", matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [collapsed, setCollapsed] = useState(() => stored("nav-collapsed", "0") === "1");
  const toggleCollapsed = () => {
    store("nav-collapsed", collapsed ? "0" : "1");
    setCollapsed(!collapsed);
  };

  const loadSettings = () =>
    api<Omit<Settings, "version">>("/settings").then(
      (s) => {
        setSettings({ ...s, version: __APP_VERSION__ });
        if (!isLang(stored("lang", "")) && isLang(s.default_lang)) setLangState(s.default_lang);
      },
      () => setSettings({ ...DEFAULT_SETTINGS, version: __APP_VERSION__ }),
    );
  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    store("theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const logoUrl = settings.logo_updated ? `/api/settings/logo?v=${encodeURIComponent(settings.logo_updated)}` : null;
  useEffect(() => {
    document.title = settings.site_name;
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) {
      icon.href = logoUrl ?? "/favicon.svg";
      icon.type = logoUrl ? "" : "image/svg+xml";
    }
  }, [settings.site_name, logoUrl]);

  const t = (k: Key) => translate(lang, k);
  const section = "/" + (path.split("/")[1] ?? "");
  const sub = path.split("/")[2];
  const go = (to: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(to);
    setMenuOpen(false);
  };

  return (
    <SettingsCtx.Provider value={{ settings, reload: loadSettings }}>
      <LangCtx.Provider value={{ lang, t }}>
        <div className={"app" + (collapsed ? " collapsed" : "")}>
          <aside className={"sidebar" + (menuOpen ? " open" : "")}>
            <a className="brand" href="/" onClick={go("/")}>
              <span className={"brand-mark" + (logoUrl ? " custom" : "")}>
                {logoUrl ? <img src={logoUrl} alt="" /> : <Logo />}
              </span>
              <span className="label"><SiteName name={settings.site_name} /></span>
            </a>
            <button className="search-btn" onClick={() => { setSearching(true); setMenuOpen(false); }} title={t("searchAll")}>
              <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l4.5 4.5" />
              <span className="label">{t("search")}</span>
              <kbd className="label">Ctrl K</kbd>
            </button>
            <nav>
              {routes.map((r) => (
                <a key={r.path} href={r.path} className={section === r.path ? "active" : ""} onClick={go(r.path)} title={collapsed ? t(r.key) : undefined}>
                  <Icon d={icons[r.key]} />
                  <span className="label">{t(r.key)}</span>
                </a>
              ))}
            </nav>
            <div className="sidebar-foot">
              <a className={"icon-btn" + (section === "/settings" ? " on" : "")} href="/settings" onClick={go("/settings")} title={t("settings")} aria-label={t("settings")}>
                <Icon d={icons.settings} />
              </a>
              <div className="seg" role="group" aria-label={t("language")}>
                {(Object.keys(LANG_LABEL) as Lang[]).map((l) => (
                  <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{LANG_LABEL[l]}</button>
                ))}
              </div>
              <button className="icon-btn" title={t("theme")} aria-label={t("theme")} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                <Icon d={theme === "dark" ? "M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" : "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"} />
              </button>
              <button className="icon-btn collapse-btn" title={t("collapse")} aria-label={t("collapse")} aria-expanded={!collapsed} onClick={toggleCollapsed}>
                <Icon d={collapsed ? "M9 6l6 6-6 6M4 4v16" : "M15 6l-6 6 6 6M20 4v16"} />
              </button>
            </div>
          </aside>
          {searching && <Search onClose={() => setSearching(false)} />}
          {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
          <main className="main">
            <button className="icon-btn menu-btn" aria-label={t("menu")} onClick={() => setMenuOpen(true)}>
              <Icon d="M4 7h16M4 12h16M4 17h16" />
            </button>
            <Suspense fallback={<p className="muted pad">{t("loading")}</p>}>
              {section === "/" && <Home />}
              {section === "/notes" && <Notes selected={sub} />}
              {section === "/gantt" && <Gantt selected={sub} subTab={path.split("/")[3]} />}
              {section === "/todo" && <Tasks />}
              {section === "/docs" && <Docs />}
              {section === "/journal" && <Journal selected={sub} />}
              {section === "/checklist" && <Checklist selected={sub} />}
              {section === "/glossary" && <Glossary selected={sub} />}
              {section === "/flow" && <Flow selected={sub} theme={theme} />}
              {section === "/settings" && <SettingsPage />}
            </Suspense>
          </main>
        </div>
      </LangCtx.Provider>
    </SettingsCtx.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
