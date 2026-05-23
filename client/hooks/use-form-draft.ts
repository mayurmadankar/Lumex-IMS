"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DRAFT_REGISTRY_STORAGE_KEY = "ims:draft-registry";
const DRAFT_REGISTRY_EVENT = "ims:draft-registry-changed";
const DRAFT_REMOVED_EVENT = "ims:draft-removed";
const ROUTE_TAB_STORAGE_KEY = "ims:route-tabs";
const ROUTE_TAB_EVENT = "ims:route-tabs-changed";
const CLIPBOARD_DRAFT_STORAGE_KEY = "ims:draft:clipboard";
const CLIPBOARD_LAST_LOADED_STORAGE_KEY = "ims:clipboard:last-loaded";

type DraftRecord<T> = {
  version: number;
  values: T;
};

export type DraftRegistryItem = {
  storageKey: string;
  title: string;
  subtitle?: string;
  href: string;
  updatedAt: number;
};

export type OpenRouteTab = {
  href: string;
  title: string;
  subtitle?: string;
  updatedAt: number;
};

type DraftMetadata = {
  title: string;
  subtitle?: string;
  href: string;
};

type UseFormDraftOptions<T> = {
  storageKey?: string | null;
  values: T;
  restore: (values: T) => void;
  getDefaultValues: () => T;
  metadata?: DraftMetadata;
  version?: number;
};

function isDraftRecord<T>(value: unknown): value is DraftRecord<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    "values" in value
  );
}

function valuesMatch<T>(left: T, right: T) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeNonDefaultValues<T>(base: T, current: T, defaults: T): T {
  if (!isRecord(base) || !isRecord(current) || !isRecord(defaults)) {
    return current;
  }

  const merged: Record<string, unknown> = { ...base };

  Object.keys(current).forEach((key) => {
    if (!valuesMatch(current[key], defaults[key])) {
      merged[key] = current[key];
    }
  });

  return merged as T;
}

function notifyDraftRegistryChanged() {
  window.dispatchEvent(new Event(DRAFT_REGISTRY_EVENT));
}

function readDraftRegistry() {
  if (typeof window === "undefined") return [];

  try {
    const rawRegistry = window.localStorage.getItem(DRAFT_REGISTRY_STORAGE_KEY);
    const registry = rawRegistry ? (JSON.parse(rawRegistry) as unknown) : [];

    if (!Array.isArray(registry)) return [];

    return registry.filter(
      (item): item is DraftRegistryItem =>
        typeof item === "object" &&
        item !== null &&
        typeof item.storageKey === "string" &&
        typeof item.title === "string" &&
        typeof item.href === "string" &&
        typeof item.updatedAt === "number" &&
        window.localStorage.getItem(item.storageKey) !== null,
    );
  } catch {
    window.localStorage.removeItem(DRAFT_REGISTRY_STORAGE_KEY);
    return [];
  }
}

function writeDraftRegistry(items: DraftRegistryItem[]) {
  window.localStorage.setItem(DRAFT_REGISTRY_STORAGE_KEY, JSON.stringify(items));
  notifyDraftRegistryChanged();
}

function upsertDraftRegistryItem(item: DraftRegistryItem) {
  const registry = readDraftRegistry();
  const nextRegistry = [
    item,
    ...registry.filter((draft) => draft.storageKey !== item.storageKey),
  ];

  writeDraftRegistry(nextRegistry);
}

function removeClipboardDraftStorage() {
  try {
    window.localStorage.removeItem(CLIPBOARD_LAST_LOADED_STORAGE_KEY);
    window.sessionStorage.removeItem(CLIPBOARD_DRAFT_STORAGE_KEY);
    window.sessionStorage.removeItem(CLIPBOARD_LAST_LOADED_STORAGE_KEY);

    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(`${CLIPBOARD_DRAFT_STORAGE_KEY}:`)) {
        window.localStorage.removeItem(key);
      }
    }

    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(`${CLIPBOARD_DRAFT_STORAGE_KEY}:`)) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Best-effort cleanup only. The main draft key is still removed below.
  }
}

function removeDraftRegistryItem(storageKey: string, notifyRemoved = true) {
  const registry = readDraftRegistry();
  const nextRegistry = registry.filter((draft) => draft.storageKey !== storageKey);

  window.localStorage.removeItem(storageKey);
  if (storageKey === CLIPBOARD_DRAFT_STORAGE_KEY) {
    removeClipboardDraftStorage();
  }
  writeDraftRegistry(nextRegistry);

  if (notifyRemoved) {
    window.dispatchEvent(
      new CustomEvent(DRAFT_REMOVED_EVENT, { detail: { storageKey } }),
    );
  }
}

function notifyRouteTabsChanged() {
  window.dispatchEvent(new Event(ROUTE_TAB_EVENT));
}

function readRouteTabs() {
  if (typeof window === "undefined") return [];

  try {
    const rawTabs = window.localStorage.getItem(ROUTE_TAB_STORAGE_KEY);
    const tabs = rawTabs ? (JSON.parse(rawTabs) as unknown) : [];

    if (!Array.isArray(tabs)) return [];

    return tabs.filter(
      (tab): tab is OpenRouteTab =>
        typeof tab === "object" &&
        tab !== null &&
        typeof tab.href === "string" &&
        typeof tab.title === "string" &&
        typeof tab.updatedAt === "number",
    );
  } catch {
    window.localStorage.removeItem(ROUTE_TAB_STORAGE_KEY);
    return [];
  }
}

function writeRouteTabs(tabs: OpenRouteTab[]) {
  window.localStorage.setItem(ROUTE_TAB_STORAGE_KEY, JSON.stringify(tabs));
  notifyRouteTabsChanged();
}

function upsertRouteTab(tab: OpenRouteTab) {
  const tabs = readRouteTabs();
  writeRouteTabs([tab, ...tabs.filter((item) => item.href !== tab.href)]);
}

function removeRouteTab(href: string) {
  writeRouteTabs(readRouteTabs().filter((tab) => tab.href !== href));
}

export function clearWorkspaceQuickAccessStorage() {
  if (typeof window === "undefined") return;

  try {
    const registry = readDraftRegistry();

    registry.forEach((draft) => {
      window.localStorage.removeItem(draft.storageKey);
    });

    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("ims:draft:")) {
        window.localStorage.removeItem(key);
      }
    }

    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith("ims:draft:")) {
        window.sessionStorage.removeItem(key);
      }
    }

    window.localStorage.removeItem(DRAFT_REGISTRY_STORAGE_KEY);
    window.localStorage.removeItem(ROUTE_TAB_STORAGE_KEY);
    removeClipboardDraftStorage();
    notifyDraftRegistryChanged();
    notifyRouteTabsChanged();
  } catch {
    // Best-effort logout cleanup.
  }
}

export function useFormDraft<T>({
  storageKey,
  values,
  restore,
  getDefaultValues,
  metadata,
  version = 1,
}: UseFormDraftOptions<T>) {
  const restoreRef = useRef(restore);
  const defaultsRef = useRef(getDefaultValues);
  const latestValuesRef = useRef(values);
  const dismissedKeyRef = useRef<string | null>(null);
  const lastSavedDraftRef = useRef<string | null>(null);
  const lastSavedRegistryRef = useRef<string | null>(null);
  const readyKeyRef = useRef<string | null>(null);
  const skipSaveKeyRef = useRef<string | null>(null);
  const previousStorageKeyRef = useRef<string | null>(null);

  useEffect(() => {
    restoreRef.current = restore;
    defaultsRef.current = getDefaultValues;
  }, [getDefaultValues, restore]);

  useEffect(() => {
    latestValuesRef.current = values;
  }, [values]);

  const saveDraft = useCallback(
    (nextValues: T) => {
      if (
        !storageKey ||
        readyKeyRef.current !== storageKey ||
        typeof window === "undefined"
      ) {
        return;
      }

      try {
        const valuesAreDefaults = valuesMatch(nextValues, defaultsRef.current());

        if (dismissedKeyRef.current === storageKey && valuesAreDefaults) {
          return;
        }

        if (dismissedKeyRef.current === storageKey && !valuesAreDefaults) {
          dismissedKeyRef.current = null;
        }

        const serializedDraft = JSON.stringify({ version, values: nextValues });
        const draftChanged = lastSavedDraftRef.current !== serializedDraft;

        if (draftChanged) {
          window.localStorage.setItem(storageKey, serializedDraft);
          lastSavedDraftRef.current = serializedDraft;
        }

        if (metadata) {
          const registryItem = {
            storageKey,
            title: metadata.title,
            subtitle: metadata.subtitle,
            href: metadata.href,
            updatedAt: Date.now(),
          };
          const registryFingerprint = JSON.stringify({
            storageKey,
            title: metadata.title,
            subtitle: metadata.subtitle,
            href: metadata.href,
          });

          if (
            draftChanged ||
            lastSavedRegistryRef.current !== registryFingerprint
          ) {
            upsertDraftRegistryItem(registryItem);
            lastSavedRegistryRef.current = registryFingerprint;
          }
        }
      } catch {
        // Storage can be unavailable in private browsing or when quota is full.
      }
    },
    [metadata, storageKey, version],
  );

  useEffect(() => {
    const previousStorageKey = previousStorageKeyRef.current;
    previousStorageKeyRef.current = storageKey ?? null;

    if (!storageKey || typeof window === "undefined") {
      readyKeyRef.current = null;
      skipSaveKeyRef.current = null;
      lastSavedDraftRef.current = null;
      lastSavedRegistryRef.current = null;
      return;
    }

    const defaultValues = defaultsRef.current();
    const currentValues = latestValuesRef.current;
    let nextValues = defaultValues;
    let shouldSkipNextSave = true;
    lastSavedDraftRef.current = null;
    lastSavedRegistryRef.current = null;

    try {
      const rawDraft = window.localStorage.getItem(storageKey);

      if (rawDraft) {
        dismissedKeyRef.current = null;
        const parsed = JSON.parse(rawDraft) as unknown;

        if (isDraftRecord<T>(parsed)) {
          if (parsed.version === version) {
            nextValues = parsed.values;
          } else {
            window.localStorage.removeItem(storageKey);
          }
        } else {
          nextValues = parsed as T;
        }
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }

    if (
      previousStorageKey === null &&
      !valuesMatch(currentValues, defaultValues)
    ) {
      nextValues = mergeNonDefaultValues(nextValues, currentValues, defaultValues);
      shouldSkipNextSave = false;
    }

    restoreRef.current(nextValues);
    readyKeyRef.current = storageKey;
    skipSaveKeyRef.current = shouldSkipNextSave ? storageKey : null;
  }, [storageKey, version]);

  useEffect(() => {
    if (
      !storageKey ||
      readyKeyRef.current !== storageKey ||
      typeof window === "undefined"
    ) {
      return;
    }

    try {
      if (skipSaveKeyRef.current === storageKey) {
        skipSaveKeyRef.current = null;
        return;
      }

      saveDraft(values);
    } catch {
      // Storage can be unavailable in private browsing or when quota is full.
    }
  }, [saveDraft, storageKey, values]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;

    const handleDraftRemoved = (event: Event) => {
      const detail = (event as CustomEvent<{ storageKey?: string }>).detail;
      if (detail?.storageKey !== storageKey) return;

      dismissedKeyRef.current = storageKey;
      skipSaveKeyRef.current = null;
      lastSavedDraftRef.current = null;
      lastSavedRegistryRef.current = null;
      restoreRef.current(defaultsRef.current());
    };

    window.addEventListener(DRAFT_REMOVED_EVENT, handleDraftRemoved);
    return () => {
      window.removeEventListener(DRAFT_REMOVED_EVENT, handleDraftRemoved);
    };
  }, [storageKey]);

  const clearDraft = useCallback(() => {
    if (!storageKey || typeof window === "undefined") return;
    removeDraftRegistryItem(storageKey);
  }, [storageKey]);

  return {
    clearDraft,
    saveDraft,
  };
}

export function useDraftRegistry() {
  const [drafts, setDrafts] = useState<DraftRegistryItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshDrafts = () => {
      setDrafts(readDraftRegistry());
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === DRAFT_REGISTRY_STORAGE_KEY ||
        event.key?.startsWith("ims:draft:")
      ) {
        refreshDrafts();
      }
    };

    refreshDrafts();
    window.addEventListener(DRAFT_REGISTRY_EVENT, refreshDrafts);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(DRAFT_REGISTRY_EVENT, refreshDrafts);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const closeDraft = useCallback((storageKey: string) => {
    if (typeof window === "undefined") return;
    removeDraftRegistryItem(storageKey);
    setDrafts(readDraftRegistry());
  }, []);

  return {
    drafts,
    closeDraft,
  };
}

export function useOpenRouteTabs(currentTab?: {
  href: string;
  title: string;
  subtitle?: string;
  enabled?: boolean;
}) {
  const [tabs, setTabs] = useState<OpenRouteTab[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshTabs = () => {
      setTabs(readRouteTabs());
    };

    const handleStorage = () => {
      refreshTabs();
    };

    refreshTabs();
    window.addEventListener(ROUTE_TAB_EVENT, refreshTabs);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(ROUTE_TAB_EVENT, refreshTabs);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!currentTab?.enabled || typeof window === "undefined") return;

    upsertRouteTab({
      href: currentTab.href,
      title: currentTab.title,
      subtitle: currentTab.subtitle,
      updatedAt: Date.now(),
    });
  }, [
    currentTab?.enabled,
    currentTab?.href,
    currentTab?.subtitle,
    currentTab?.title,
  ]);

  const closeTab = useCallback((href: string) => {
    if (typeof window === "undefined") return;
    removeRouteTab(href);
    setTabs(readRouteTabs());
  }, []);

  return {
    tabs,
    closeTab,
  };
}
