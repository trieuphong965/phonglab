import { useEffect, useRef, useState } from "react";
import { api, LANGS, useSettings, useT, type Lang } from "../lib";
import { Logo } from "../Logo";

const LANG_NAME: Record<Lang, string> = { vi: "Tiếng Việt", ja: "日本語", en: "English" };

export default function SettingsPage() {
  const { t } = useT();
  const { settings, reload } = useSettings();
  const [form, setForm] = useState({ site_name: "", owner_name: "", default_lang: "en" as Lang });
  const [state, setState] = useState("");
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm({ site_name: settings.site_name, owner_name: settings.owner_name, default_lang: settings.default_lang });
  }, [settings.site_name, settings.owner_name, settings.default_lang]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState(t("saving"));
    try {
      await api("/settings", "PUT", form);
      setState(t("saved"));
      reload();
    } catch {
      setState(t("saveError"));
    }
  }

  async function uploadLogo(file: File) {
    if (file.size > 512 * 1024) return alert(t("logoTooBig"));
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/settings/logo", { method: "PUT", body });
    if (!res.ok) return alert(t("saveError"));
    reload();
  }

  async function resetLogo() {
    await api("/settings/logo", "DELETE");
    reload();
  }

  const logoUrl = settings.logo_updated ? `/api/settings/logo?v=${encodeURIComponent(settings.logo_updated)}` : null;

  return (
    <div className="page settings-page">
      <header className="page-head"><h1>{t("settings")}</h1></header>

      <form className="panel settings-form" onSubmit={save}>
        <label className="field">{t("siteName")}
          <input value={form.site_name} maxLength={60} onChange={(e) => setForm({ ...form, site_name: e.target.value })} />
        </label>
        <label className="field">{t("ownerName")}
          <input value={form.owner_name} maxLength={60} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
          <span className="muted small">{t("ownerNameHint")}</span>
        </label>
        <label className="field">{t("defaultLanguage")}
          <select value={form.default_lang} onChange={(e) => setForm({ ...form, default_lang: e.target.value as Lang })}>
            {LANGS.map((l) => <option key={l} value={l}>{LANG_NAME[l]}</option>)}
          </select>
          <span className="muted small">{t("defaultLanguageHint")}</span>
        </label>
        <div className="modal-foot">
          <span className="muted small">{state}</span>
          <span className="grow" />
          <button type="submit" className="btn primary">{t("save")}</button>
        </div>
      </form>

      <section className="panel settings-form">
        <h2>{t("logo")}</h2>
        <div className="logo-row">
          <span className={"brand-mark big" + (logoUrl ? " custom" : "")}>{logoUrl ? <img src={logoUrl} alt="" /> : <Logo />}</span>
          <div className="logo-actions">
            <div className="chips">
              <button className="btn" onClick={() => picker.current?.click()}>⬆ {t("uploadLogo")}</button>
              {logoUrl && <button className="btn" onClick={resetLogo}>{t("resetLogo")}</button>}
            </div>
            <span className="muted small">{t("logoHint")}</span>
          </div>
          <input
            ref={picker}
            type="file"
            accept="image/svg+xml,image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }}
          />
        </div>
      </section>

      <p className="muted small">PhongLab · {t("version")} {settings.version}</p>
    </div>
  );
}
