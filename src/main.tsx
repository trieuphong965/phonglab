import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/vietnamese-400.css";
import "@fontsource/ibm-plex-sans/vietnamese-500.css";
import "@fontsource/ibm-plex-sans/vietnamese-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/vietnamese-400.css";
import {
  CalendarDays,
  ChartGantt,
  ClipboardCheck,
  FolderOpen,
  House,
  Languages,
  ListTodo,
  Menu,
  Moon,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Sun,
  Workflow,
  type LucideIcon,
} from "lucide-react";
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

const icons: Record<(typeof routes)[number]["key"], LucideIcon> = {
  home: House,
  notes: NotebookPen,
  gantt: ChartGantt,
  tasks: ListTodo,
  flow: Workflow,
  docs: FolderOpen,
  journal: CalendarDays,
  checklist: ClipboardCheck,
  glossary: Languages,
};

/** "PhongLab" -> Phong<b>Lab</b>; other names are shown as typed. */
function SiteName({ name }: { name: string }) {
  const m = /^(.+?)(Lab)$/.exec(name);
  return m ? <>{m[1]}<b>{m[2]}</b></> : <>{name}</>;
}

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
              <SearchIcon />
              <span className="label">{t("search")}</span>
              <kbd className="label">Ctrl K</kbd>
            </button>
            <nav>
              {routes.map((r) => (
                <a key={r.path} href={r.path} className={section === r.path ? "active" : ""} onClick={go(r.path)} title={collapsed ? t(r.key) : undefined}>
                  {(() => { const I = icons[r.key]; return <I />; })()}
                  <span className="label">{t(r.key)}</span>
                </a>
              ))}
            </nav>
            <div className="sidebar-foot">
              <a className={"icon-btn" + (section === "/settings" ? " on" : "")} href="/settings" onClick={go("/settings")} title={t("settings")} aria-label={t("settings")}>
                <SettingsIcon />
              </a>
              <div className="seg" role="group" aria-label={t("language")}>
                {(Object.keys(LANG_LABEL) as Lang[]).map((l) => (
                  <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{LANG_LABEL[l]}</button>
                ))}
              </div>
              <button className="icon-btn" title={t("theme")} aria-label={t("theme")} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                {theme === "dark" ? <Sun /> : <Moon />}
              </button>
              <button className="icon-btn collapse-btn" title={t("collapse")} aria-label={t("collapse")} aria-expanded={!collapsed} onClick={toggleCollapsed}>
                {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
              </button>
            </div>
          </aside>
          {searching && <Search onClose={() => setSearching(false)} />}
          {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
          <main className="main">
            <button className="icon-btn menu-btn" aria-label={t("menu")} onClick={() => setMenuOpen(true)}>
              <Menu />
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
