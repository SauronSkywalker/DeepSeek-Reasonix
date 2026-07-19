import { lazy, memo, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent, type ReactNode } from "react";
import { Bot as BotIcon, Check, CheckCircle2, ChevronDown, ChevronUp, Clipboard, ExternalLink, GripVertical, KeyRound, Loader2, MessageCircle, Play, QrCode, RefreshCw, Send } from "lucide-react";
import { asArray } from "../lib/array";
import { useDeferredClose } from "../lib/useMountTransition";
import { app, openExternal } from "../lib/bridge";
import { normalizeLangPref, useI18n, useT, type DictKey, type LangPref } from "../lib/i18n";
import { apiKeyEnvFromProviderName, inferredVisionModels, mergedFetchedProviderModels, mergeProviderModelContextWindows, providerApiKeyEnvForSave, providerDefaultModel, providerIsConfigured, providerModelCandidates, providerModelContextWindowDrafts, providerModelContextWindowIsSmall, providerRequiresKey } from "../lib/providerModels";
import { useUpdater } from "../lib/useUpdater";
import {
  applyTheme,
  getTheme,
  getThemeStyle,
  normalizeThemePreference,
  normalizeThemeStyleForTheme,
  type Theme,
  type ThemeStyle,
} from "../lib/theme";
import {
  applyConversationWidth,
  getCachedConversationWidth,
  normalizeConversationWidth,
  type ConversationWidth,
} from "../lib/conversationWidth";
import { applyTextSize, getTextSize, type TextSize } from "../lib/textSize";
import { snapZoom, zoomToPercent, saveRestartZoom, getRestartZoom, type ZoomLevel } from "../lib/dpiScale";
import {
  applyFontFamily,
  applyMonoFontFamily,
  getFontFamily,
  getMonoFontFamily,
  getCustomFontName,
  getCustomMonoFontName,
  setCustomFontName,
  setCustomMonoFontName,
  type FontFamily,
  type MonoFontFamily,
} from "../lib/fontFamily";
import { getDisplayMode, onDisplayModeChange, setDisplayMode as setLocalDisplayMode } from "../lib/displayMode";
import { getProcessFoldPreference, onProcessFoldPreferenceChange, setProcessFoldPreference, type ProcessFoldPreference } from "../lib/processFoldPreference";
import { DEFAULT_STATUS_BAR_ITEMS, normalizeStatusBarItems, type StatusBarItemId } from "../lib/statusBarItems";
import { normalizeToolApprovalMode } from "../lib/types";
import {
  comboFromKeyboardEvent,
  detectShortcutPlatform,
  formatShortcutCombo,
  onShortcutsChanged,
  resetCustomShortcuts,
  resolvedShortcutCombo,
  saveCustomShortcut,
  shortcutConflict,
  shortcutDefinitions,
  type ShortcutAction,
} from "../lib/keyboardShortcuts";
import type { BotAccessView, BotAllowlistView, BotConnectionDiagnostic, BotConnectionView, BotInstallStartResult, BotRouteView, BotSettingsView, HookConfigView, HooksSettingsView, NetworkView, ProviderPresetView, ProviderView, SettingsTab, SettingsView } from "../lib/types";
import { AppearanceOverview } from "./AppearanceOverview";
import { applyThemePack, getActiveThemePack, setBaseAppearance } from "../lib/themePack";
import { InlineConfirmButton } from "./InlineConfirmButton";
import { Tooltip } from "./Tooltip";
import { AnchoredPopover } from "./AnchoredPopover";
import { getGenerativePreset, setGenerativePreset, generativeMusic, type GenerativePreset } from "../lib/generative-music";
import { SoundSelect } from "./SoundSelect";
import { getSuccessPreference, setSuccessPreference, getAttentionPreference, setAttentionPreference, playSuccessChime, playAttentionChime, type SoundWavPref } from "../lib/sound";
import { ModalCloseButton } from "./ModalCloseButton";
import { ShortcutComboDisplay } from "./ShortcutComboDisplay";

const SETTINGS_TABS: SettingsTab[] = ["general", "models", "bots", "mcp", "skills", "subagents", "plugins", "memory", "hooks", "diagnostics", "shortcuts", "permissions", "sandbox", "network", "appearance", "updates"];
export type SettingsInitialFocus = { target: "bot-allowlist"; connectionId?: string };
type DesktopPlatform = "darwin" | "windows" | "linux";

const MCPServersSettingsPage = lazy(() => import("./CapabilitiesPanel").then((module) => ({ default: module.MCPServersSettingsPage })));
const SkillsSettingsPage = lazy(() => import("./CapabilitiesPanel").then((module) => ({ default: module.SkillsSettingsPage })));
const PluginsSettingsPage = lazy(() => import("./CapabilitiesPanel").then((module) => ({ default: module.PluginsSettingsPage })));
const MemorySettingsPage = lazy(() => import("./MemoryPanel").then((module) => ({ default: module.MemorySettingsPage })));
const SubagentsSettingsPage = lazy(() => import("./SubagentsPanel").then((module) => ({ default: module.SubagentsSettingsPage })));
const DiagnosticsSettingsPage = lazy(() => import("./DiagnosticsSettingsPage").then((module) => ({ default: module.DiagnosticsSettingsPage })));
const QRCodeSVG = lazy(() => import("qrcode.react").then((module) => ({ default: module.QRCodeSVG })));

// SettingsPanel is the desktop settings centre — a centred modal with left
// navigation and a right content area. It hosts all settings pages plus MCP,
// Skills, and Memory management, replacing the old per-feature drawers.
export function SettingsPanel({
  onClose,
  onChanged,
  initialTab,
  initialFocus,
  agentRunning = false,
  desktopPlatform,
  onUseSubagent,
}: {
  onClose: () => void;
  onChanged: (settings?: SettingsView | null) => void;
  initialTab?: SettingsTab;
  initialFocus?: SettingsInitialFocus;
  agentRunning?: boolean;
  desktopPlatform: DesktopPlatform;
  onUseSubagent: (command: string) => void;
}) {
  const t = useT();
  const [s, setS] = useState<SettingsView | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [settingsLoadFailed, setSettingsLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const [themeStyle, setThemeStyleState] = useState<ThemeStyle>(() => getThemeStyle(getTheme()));
  const [conversationWidth, setConversationWidth] = useState<ConversationWidth>(() => getCachedConversationWidth());
  const [textSize, setTextSizeState] = useState<TextSize>(getTextSize());
  const [zoomPct, setZoomPct] = useState<number>(zoomToPercent(getRestartZoom()));
  const [fontFamily, setFontFamilyState] = useState<FontFamily>(getFontFamily());
  const [monoFontFamily, setMonoFontFamilyState] = useState<MonoFontFamily>(getMonoFontFamily());
  const [customFontName, setCustomFontNameState] = useState<string>(getCustomFontName());
  const [customMonoFontName, setCustomMonoFontNameState] = useState<string>(getCustomMonoFontName());
  const [tab, setTab] = useState<SettingsTab>(initialTab === "providers" ? "models" : initialTab ?? "general");
  const pendingSubagentCommandRef = useRef<string | null>(null);
  // Play the modal exit animation, then let the parent unmount us and focus
  // the composer with the selected slash command.
  const { status, requestClose } = useDeferredClose(() => {
    const command = pendingSubagentCommandRef.current;
    pendingSubagentCommandRef.current = null;
    onClose();
    if (command) onUseSubagent(command);
  }, 240);
  const zoomSaveSeq = useRef(0);

  const reload = useCallback(async () => {
    setLoadingSettings(true);
    setSettingsLoadFailed(false);
    try {
      const next = normalizeSettingsView(await app.Settings());
      setS(next);
      return next;
    } catch {
      setS(null);
      setSettingsLoadFailed(true);
      return null;
    } finally {
      setLoadingSettings(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    if (initialTab) setTab(initialTab === "providers" ? "models" : initialTab);
  }, [initialTab, reload]);
  useEffect(() => {
    if (!s) return;
    const nextTheme = normalizeThemePreference(s.desktopTheme);
    const nextStyle = normalizeThemeStyleForTheme(s.desktopThemeStyle, nextTheme);
    setThemeState(nextTheme);
    setThemeStyleState(nextStyle);
    setConversationWidth(applyConversationWidth(s.conversationWidth));
  }, [s?.conversationWidth, s?.desktopTheme, s?.desktopThemeStyle]);
  useEffect(() => {
    if (desktopPlatform !== "windows") return;
    let cancelled = false;
    void (async () => {
      try {
        const persisted = await app.GetDesktopZoomFactor();
        if (cancelled || typeof persisted !== "number" || !Number.isFinite(persisted)) return;
        const snapped = snapZoom(persisted);
        saveRestartZoom(snapped);
        setZoomPct(zoomToPercent(snapped));
      } catch {
        // Older mocks or startup races can lack the binding; keep the local fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [desktopPlatform]);

  // apply runs a mutation, re-reads settings, and refreshes the topbar/model.
  const apply = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    setWarning(null);
    try {
      const result = await fn();
      const next = await reload();
      onChanged(next);
      if (typeof result === "string" && result.trim()) {
        setWarning(result.trim());
      }
    } catch (e) {
      setErr(formatSettingsError(e, t));
    } finally {
      setBusy(false);
    }
  }, [reload, onChanged, t]);
  const backgroundApply = useCallback(async (fn: () => Promise<void>) => {
    setErr(null);
    setWarning(null);
    try {
      await fn();
      const next = await reload();
      onChanged(next);
    } catch (e) {
      setErr(formatSettingsError(e, t));
    }
  }, [reload, onChanged, t]);
  const setRestartZoom = useCallback(async (zoom: ZoomLevel) => {
    const snapped = snapZoom(zoom);
    const seq = ++zoomSaveSeq.current;
    setErr(null);
    setWarning(null);
    setZoomPct(zoomToPercent(snapped));
    try {
      await app.SetDesktopZoomFactor(snapped);
      if (seq === zoomSaveSeq.current) saveRestartZoom(snapped);
    } catch (e) {
      if (seq !== zoomSaveSeq.current) return;
      setErr(formatSettingsError(e, t));
      setZoomPct(zoomToPercent(getRestartZoom()));
    }
  }, [t]);

  // Close on Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[data-anchored-popover='active']")) requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose]);

  // The settings-reliant pages (general, models, network, permissions,
  // sandbox, appearance, updates) need SettingsView loaded. MCP, Skills, Plugins,
  // and Memory
  // load their own data and render regardless.
  const needsSettings = tab === "general" || tab === "models" || tab === "bots" || tab === "subagents" || tab === "network" || tab === "permissions" || tab === "sandbox" || tab === "appearance" || tab === "updates";
  const lazySettingsPageFallback = <div className="empty">{t("settings.loading")}</div>;

  return (
    <div className="management-modal-backdrop settings-modal-backdrop" data-state={status} onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <div className="management-modal settings-modal" data-state={status}>
        <header className="management-modal__head settings-modal__head">
          <div className="management-modal__title settings-modal__title">{t("settings.title")}</div>
          <ModalCloseButton label={t("common.close")} onClick={requestClose} />
        </header>

        <div className="settings-center">
          <nav className="settings-center__nav" aria-label={t("settings.title")}>
            {SETTINGS_TABS.map((id) => (
              <button
                key={id}
                className={`settings-center__navitem${tab === id ? " settings-center__navitem--active" : ""}`}
                onClick={() => setTab(id)}
              >
                <span>{settingsTabLabel(id, t)}</span>
                {s && <small>{settingsTabMeta(id, s, t)}</small>}
              </button>
            ))}
          </nav>
          <main className="settings-center__content">
            {needsSettings && settingsLoadFailed && (
              <div className="banner banner--error settings-load-error" role="alert">
                <span>{t("settings.loadFailed")}</span>
                <button className="btn btn--small" type="button" onClick={() => void reload()}>{t("common.retry")}</button>
              </div>
            )}
            {needsSettings && err && <div className="banner banner--error">{err}</div>}
            {needsSettings && warning && <div className="banner banner--warning">{warning}</div>}
            {needsSettings && !s ? (
              loadingSettings ? <div className="empty">{t("settings.loading")}</div> : null
            ) : (
              <>
                {tab === "general" && s && <SettingsPageShell key={tab} s={s} tab={tab} busy={busy} apply={apply}><GeneralSection s={s} busy={busy} apply={apply} agentRunning={agentRunning} /></SettingsPageShell>}
                {tab === "models" && s && <SettingsPageShell key={tab} s={s} tab={tab} busy={busy} apply={apply}><ModelsSection s={s} busy={busy} apply={apply} backgroundApply={backgroundApply} /></SettingsPageShell>}
                {tab === "bots" && s && <SettingsPageShell key={tab} s={s} tab={tab} busy={busy} apply={apply}><BotsSection s={s} busy={busy} apply={apply} initialFocus={initialFocus} /></SettingsPageShell>}
                {tab === "mcp" && <SettingsPageShell key={tab} s={s} tab={tab} busy={false} apply={apply}><Suspense fallback={lazySettingsPageFallback}><MCPServersSettingsPage /></Suspense></SettingsPageShell>}
                {tab === "skills" && <SettingsPageShell key={tab} s={s} tab={tab} busy={false} apply={apply}><Suspense fallback={lazySettingsPageFallback}><SkillsSettingsPage /></Suspense></SettingsPageShell>}
                {tab === "subagents" && s && <SettingsPageShell key={tab} s={s} tab={tab} busy={busy} apply={apply}><Suspense fallback={lazySettingsPageFallback}><SubagentsSettingsPage s={s} onUseInChat={(command) => {
                  pendingSubagentCommandRef.current = command;
                  requestClose();
                }} /></Suspense></SettingsPageShell>}
                {tab === "plugins" && <SettingsPageShell key={tab} s={s} tab={tab} busy={false} apply={apply}><Suspense fallback={lazySettingsPageFallback}><PluginsSettingsPage /></Suspense></SettingsPageShell>}
                {tab === "memory" && <SettingsPageShell key={tab} s={s} tab={tab} busy={false} apply={apply}><Suspense fallback={lazySettingsPageFallback}><MemorySettingsPage /></Suspense></SettingsPageShell>}
                {tab === "hooks" && <SettingsPageShell key={tab} s={s} tab={tab} busy={false} apply={apply}><HooksSection onChanged={onChanged} /></SettingsPageShell>}
                {tab === "diagnostics" && <SettingsPageShell key={tab} s={s} tab={tab} busy={false} apply={apply}><Suspense fallback={lazySettingsPageFallback}><DiagnosticsSettingsPage onNavigate={setTab} /></Suspense></SettingsPageShell>}
                {tab === "shortcuts" && <SettingsPageShell key={tab} s={s} tab={tab} busy={false} apply={apply}><ShortcutsSection /></SettingsPageShell>}
                {tab === "permissions" && s && <SettingsPageShell key={tab} s={s} tab={tab} busy={busy} apply={apply}><PermissionsSection s={s} busy={busy} apply={apply} /></SettingsPageShell>}
                {tab === "sandbox" && s && <SettingsPageShell key={tab} s={s} tab={tab} busy={busy} apply={apply}><SandboxSection s={s} busy={busy} apply={apply} windows={desktopPlatform === "windows"} /></SettingsPageShell>}
                {tab === "network" && s && <SettingsPageShell key={tab} s={s} tab={tab} busy={busy} apply={apply}><NetworkSection s={s} busy={busy} apply={apply} /></SettingsPageShell>}
                {tab === "appearance" && s && (
                  <SettingsPageShell key={tab} s={s} tab={tab} busy={busy} apply={apply}>
                    <AppearanceOverview
                      theme={theme}
                      themeStyle={themeStyle}
                      conversationWidth={conversationWidth}
                      textSize={textSize}
                      showDisplayZoom={desktopPlatform === "windows"}
                      zoomPct={zoomPct}
                      fontFamily={fontFamily}
                      monoFontFamily={monoFontFamily}
                      customFontName={customFontName}
                      customMonoFontName={customMonoFontName}
                      onTheme={(nextTheme) => {
                        applyTheme(nextTheme, themeStyle, { persist: false });
                        setThemeState(nextTheme);
                        setBaseAppearance(nextTheme, themeStyle);
                        const pack = getActiveThemePack();
                        if (pack) applyThemePack(pack);
                        void apply(() => app.SetDesktopAppearance(nextTheme, themeStyle));
                      }}
                      onConversationWidth={(width) => {
                        applyConversationWidth(width);
                        setConversationWidth(width);
                        app.SetDesktopConversationWidth(width).catch(() => {});
                      }}
                      onThemeStyle={(style) => {
                        // AppearanceOverview already persists via ActivateBaseStyle /
                        // experience APIs. Parent only mirrors React + DOM state.
                        applyTheme(getTheme(), style, { persist: false });
                        setThemeStyleState(style);
                        setBaseAppearance(getTheme(), style);
                      }}
                      onTextSize={(size) => {
                        applyTextSize(size);
                        setTextSizeState(size);
                      }}
                      onRestartZoom={setRestartZoom}
                      onFontFamily={(font) => {
                        applyFontFamily(font);
                        setFontFamilyState(font);
                      }}
                      onMonoFontFamily={(font) => {
                        applyMonoFontFamily(font);
                        setMonoFontFamilyState(font);
                      }}
                      onCustomFontNameChange={(name) => {
                        setCustomFontName(name);
                        setCustomFontNameState(name);
                      }}
                      onCustomMonoFontNameChange={(name) => {
                        setCustomMonoFontName(name);
                        setCustomMonoFontNameState(name);
                      }}
                    />
                  </SettingsPageShell>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}