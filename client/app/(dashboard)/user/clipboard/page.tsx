"use client";

import {
  ArrowUpDown,
  CheckCircle2,
  ClipboardList,
  LayoutTemplate,
  Loader2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import toast from "react-hot-toast";

import {
  getInventoryItemByLot,
  getInventoryItems,
  type InventoryItemListItem,
} from "@/api/services/inventory.service";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { permissionAllows, permissionsToMap } from "@/config/modules";
import { useAppSelector } from "@/store/hooks";
import type { CompanyOption } from "@/store/types/types";

const ALL_COMPANIES = "__ALL_COMPANIES__";
const ALL_STATUSES = "__ALL_STATUSES__";
const CLIPBOARD_DRAFT_STORAGE_KEY = "ims:draft:clipboard";
const CLIPBOARD_LAST_LOADED_STORAGE_KEY = "ims:clipboard:last-loaded";
const DRAFT_REGISTRY_STORAGE_KEY = "ims:draft-registry";
const DRAFT_REGISTRY_EVENT = "ims:draft-registry-changed";
const DRAFT_REMOVED_EVENT = "ims:draft-removed";

const lotStatusOptions = [
  { value: ALL_STATUSES, label: "All Statuses" },
  { value: "STOCK", label: "Stock" },
  { value: "MEMO", label: "Memo In" },
  { value: "MEMO_OUT", label: "Memo Out" },
  { value: "IN_PROCESS", label: "In Process" },
  { value: "PROCESSED", label: "Processed" },
  { value: "TRANSIT", label: "Transit" },
  { value: "SOLD", label: "Sold" },
  { value: "RETURNED", label: "Returned" },
] as const;

const clipboardTemplates = [
  { key: "stock-review", label: "Stock Review", lotStatus: "STOCK" },
  { key: "processing-prep", label: "Processing Prep", lotStatus: "IN_PROCESS" },
  { key: "all-lots", label: "All Lots", lotStatus: ALL_STATUSES },
] as const;

type SortKey = "lotId" | "lotName" | "weight" | "quantity";
type SortDirection = "asc" | "desc";
type ClipboardView = "summary" | "details";

type ClipboardLot = {
  id: string;
  lotId: string;
  lotName: string;
  weight: string;
  quantity: string;
  status: string;
  companyId?: string;
  certificateNo?: string;
};

type ClipboardDetailLot = {
  id: string;
  itemLabel: string;
  lotId: string;
  lotName: string;
  itemType: string;
  weight: number;
  quantity: number;
  totalCost: number;
  labAccountName: string;
  certificateNo: string;
  parcelOrStone: InventoryItemListItem["parcelOrStone"];
  locationAccountName: string;
  companyName: string;
  companyCode?: string | null;
  departmentName: string;
  vendorName: string;
  status: InventoryItemListItem["status"];
  createdAt: string;
  remark: string;
};

type ClipboardDraft = {
  companyId: string;
  lotStatus: string;
  lotId: string;
  lotIds: string[];
  lotName: string;
  certificateNo: string;
  certificateNos: string[];
  view: ClipboardView;
  lots: ClipboardLot[];
  detailLots: ClipboardDetailLot[];
};

type ClipboardFilters = Pick<
  ClipboardDraft,
  | "companyId"
  | "lotStatus"
  | "lotId"
  | "lotIds"
  | "lotName"
  | "certificateNo"
  | "certificateNos"
>;

function defaultClipboardDraft(): ClipboardDraft {
  return {
    companyId: ALL_COMPANIES,
    lotStatus: ALL_STATUSES,
    lotId: "",
    lotIds: [],
    lotName: "",
    certificateNo: "",
    certificateNos: [],
    view: "summary",
    lots: [],
    detailLots: [],
  };
}

function clipboardUserStorageKey(userId: string) {
  return `${CLIPBOARD_DRAFT_STORAGE_KEY}:${userId}`;
}

function parseStoredClipboardDraft(value: string): ClipboardDraft | null {
  try {
    const parsed = JSON.parse(value) as unknown;

    return extractClipboardDraft(parsed);
  } catch {
    return null;
  }
}

function hasClipboardDraftContent(
  draft: ClipboardDraft | null,
): draft is ClipboardDraft {
  if (!draft) return false;

  return Boolean(
    draft.lots?.length ||
      draft.detailLots?.length ||
      draft.lotIds?.length ||
      draft.certificateNos?.length ||
      draft.lotId?.trim() ||
      draft.lotName?.trim() ||
      draft.certificateNo?.trim(),
  );
}

function writeStoredClipboardDraft(storageKey: string, draft: ClipboardDraft) {
  const normalizedDraft = normalizeClipboardDraft(draft);
  const serializedDraft = JSON.stringify({
    version: 2,
    savedAt: Date.now(),
    values: normalizedDraft,
  });
  let saved = false;

  try {
    window.localStorage.setItem(storageKey, serializedDraft);
    saved = true;
  } catch {
    // Fall through to sessionStorage below. Some browsers throw on quota.
  }

  try {
    window.sessionStorage.setItem(storageKey, serializedDraft);
    saved = true;
  } catch {
    // Storage can be blocked or full; the caller shows the user-facing error.
  }

  if (!saved) {
    throw new Error("Unable to save clipboard draft");
  }

  writeClipboardDraftRegistry(normalizedDraft);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? uniqueValues(value.map(String)) : [];
}

function normalizeClipboardLot(value: unknown): ClipboardLot | null {
  if (!isRecord(value)) return null;

  const company = isRecord(value.company) ? value.company : null;
  const lotId = value.lotId ?? value.id;

  if (lotId === undefined || lotId === null || String(lotId).trim() === "") {
    return null;
  }

  return {
    id: String(value.id ?? lotId),
    lotId: String(lotId),
    lotName: String(value.lotName ?? ""),
    weight: String(value.weight ?? ""),
    quantity: String(value.quantity ?? ""),
    status: String(value.status ?? "STOCK"),
    companyId:
      typeof value.companyId === "string"
        ? value.companyId
        : typeof company?.id === "string"
          ? company.id
          : undefined,
    certificateNo:
      value.certificateNo === undefined || value.certificateNo === null
        ? undefined
        : String(value.certificateNo),
  };
}

function normalizeClipboardDraft(
  value: Partial<ClipboardDraft> | null | undefined,
): ClipboardDraft {
  const defaults = defaultClipboardDraft();

  if (!isRecord(value)) return defaults;

  return {
    companyId: normalizeString(value.companyId) || defaults.companyId,
    lotStatus: normalizeString(value.lotStatus) || defaults.lotStatus,
    lotId: normalizeString(value.lotId),
    lotIds: normalizeStringArray(value.lotIds),
    lotName: normalizeString(value.lotName),
    certificateNo: normalizeString(value.certificateNo),
    certificateNos: normalizeStringArray(value.certificateNos),
    view: value.view === "details" ? "details" : "summary",
    lots: Array.isArray(value.lots)
      ? value.lots
          .map(normalizeClipboardLot)
          .filter((lot): lot is ClipboardLot => Boolean(lot))
      : [],
    detailLots: Array.isArray(value.detailLots)
      ? value.detailLots
          .map(normalizeDetailLot)
          .filter((lot): lot is ClipboardDetailLot => Boolean(lot))
      : [],
  };
}

function extractClipboardDraft(value: unknown): ClipboardDraft | null {
  if (!isRecord(value)) return null;

  if ("values" in value) {
    return normalizeClipboardDraft(value.values as Partial<ClipboardDraft>);
  }

  if ("filters" in value) {
    const filters = isRecord(value.filters) ? value.filters : {};

    return normalizeClipboardDraft({
      ...filters,
      lots: value.lots,
      detailLots: value.detailLots,
      view: "details",
    } as Partial<ClipboardDraft>);
  }

  return normalizeClipboardDraft(value as Partial<ClipboardDraft>);
}

function readClipboardDraftFromStorage(
  storage: Storage | undefined,
  storageKey: string,
) {
  if (!storage) return null;

  try {
    const rawDraft = storage.getItem(storageKey);
    return rawDraft ? parseStoredClipboardDraft(rawDraft) : null;
  } catch {
    return null;
  }
}

function findLegacyClipboardDraft() {
  if (typeof window === "undefined") return null;

  const candidates: ClipboardDraft[] = [];

  [window.localStorage, window.sessionStorage].forEach((storage) => {
    for (let index = 0; index < storage.length; index += 1) {
      const storageKey = storage.key(index);

      if (
        !storageKey ||
        storageKey === CLIPBOARD_DRAFT_STORAGE_KEY ||
        !storageKey.startsWith(`${CLIPBOARD_DRAFT_STORAGE_KEY}:`)
      ) {
        continue;
      }

      const draft = readClipboardDraftFromStorage(storage, storageKey);
      if (draft) candidates.push(draft);
    }
  });

  return candidates.sort(clipboardDraftScore).at(-1) ?? null;
}

function clipboardDraftScore(left: ClipboardDraft, right: ClipboardDraft) {
  return clipboardDraftContentScore(left) - clipboardDraftContentScore(right);
}

function clipboardDraftContentScore(draft: ClipboardDraft) {
  return (
    draft.lots.length * 4 +
    draft.detailLots.length * 3 +
    draft.lotIds.length +
    draft.certificateNos.length +
    (draft.lotId ? 1 : 0) +
    (draft.lotName ? 1 : 0) +
    (draft.certificateNo ? 1 : 0)
  );
}

function readInitialClipboardDraft() {
  if (typeof window === "undefined") return defaultClipboardDraft();

  const candidates = [
    readClipboardDraftFromStorage(window.localStorage, CLIPBOARD_DRAFT_STORAGE_KEY),
    readClipboardDraftFromStorage(
      window.sessionStorage,
      CLIPBOARD_DRAFT_STORAGE_KEY,
    ),
    readClipboardDraftFromStorage(
      window.localStorage,
      CLIPBOARD_LAST_LOADED_STORAGE_KEY,
    ),
    readClipboardDraftFromStorage(
      window.sessionStorage,
      CLIPBOARD_LAST_LOADED_STORAGE_KEY,
    ),
    findLegacyClipboardDraft(),
  ].filter((draft): draft is ClipboardDraft => Boolean(draft));

  const contentDraft = candidates
    .filter(hasClipboardDraftContent)
    .sort(clipboardDraftScore)
    .at(-1);

  return contentDraft ?? candidates[0] ?? defaultClipboardDraft();
}

function writeClipboardLastLoadedDraft(draft: ClipboardDraft) {
  if (!hasClipboardDraftContent(draft)) {
    [window.localStorage, window.sessionStorage].forEach((storage) => {
      try {
        storage.removeItem(CLIPBOARD_LAST_LOADED_STORAGE_KEY);
      } catch {
        // Ignore fallback cleanup failure.
      }
    });
    return;
  }

  const payload = JSON.stringify({
    loadedAt: Date.now(),
    filters: draft,
    lots: draft.lots,
    detailLots: draft.detailLots,
  });

  try {
    window.localStorage.setItem(CLIPBOARD_LAST_LOADED_STORAGE_KEY, payload);
  } catch {
    // last-loaded is only a fallback; the main draft write already ran.
  }

  try {
    window.sessionStorage.setItem(CLIPBOARD_LAST_LOADED_STORAGE_KEY, payload);
  } catch {
    // Ignore fallback failure.
  }
}

function writeClipboardDraftRegistry(draft: ClipboardDraft) {
  try {
    const rawRegistry = window.localStorage.getItem(DRAFT_REGISTRY_STORAGE_KEY);
    const registry = rawRegistry ? (JSON.parse(rawRegistry) as unknown) : [];
    const safeRegistry = Array.isArray(registry) ? registry : [];
    const subtitle =
      draft.lots.length > 0
        ? `${draft.lots.length} lot${draft.lots.length === 1 ? "" : "s"}`
        : "Temporary lots";
    const nextRegistry = [
      {
        storageKey: CLIPBOARD_DRAFT_STORAGE_KEY,
        title: "Clipboard",
        subtitle,
        href: "/user/clipboard",
        updatedAt: Date.now(),
      },
      ...safeRegistry.filter(
        (item) =>
          isRecord(item) && item.storageKey !== CLIPBOARD_DRAFT_STORAGE_KEY,
      ),
    ];

    window.localStorage.setItem(
      DRAFT_REGISTRY_STORAGE_KEY,
      JSON.stringify(nextRegistry),
    );
    window.dispatchEvent(new Event(DRAFT_REGISTRY_EVENT));
  } catch {
    // Registry failure should not block table persistence.
  }
}

function removeLegacyClipboardDrafts(userId?: string) {
  if (typeof window === "undefined") return;

  const keys = new Set<string>();

  if (userId) {
    keys.add(clipboardUserStorageKey(userId));
  }

  [window.localStorage, window.sessionStorage].forEach((storage) => {
    for (let index = 0; index < storage.length; index += 1) {
      const storageKey = storage.key(index);

      if (
        storageKey &&
        storageKey !== CLIPBOARD_DRAFT_STORAGE_KEY &&
        storageKey.startsWith(`${CLIPBOARD_DRAFT_STORAGE_KEY}:`)
      ) {
        keys.add(storageKey);
      }
    }
  });

  keys.forEach((storageKey) => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore cleanup failure.
    }

    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore cleanup failure.
    }
  });
}

function removeClipboardBackupDrafts(userId?: string) {
  if (typeof window === "undefined") return;

  [window.localStorage, window.sessionStorage].forEach((storage) => {
    try {
      storage.removeItem(CLIPBOARD_LAST_LOADED_STORAGE_KEY);
      storage.removeItem(CLIPBOARD_DRAFT_STORAGE_KEY);
    } catch {
      // Ignore cleanup failure.
    }
  });

  removeLegacyClipboardDrafts(userId);
}

function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function companyLabel(company: CompanyOption) {
  return company.code ? `${company.name} (${company.code})` : company.name;
}

function normalizeStatusLabel(value: string) {
  return (
    lotStatusOptions.find((option) => option.value === value)?.label ??
    value.replaceAll("_", " ")
  );
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function uniqueValues(values: string[]) {
  return [
    ...new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  ];
}

function splitEntryValue(value: string) {
  return uniqueValues(value.split(/[,\n]/));
}

function inventoryItemToClipboardLot(item: InventoryItemListItem): ClipboardLot {
  return {
    id: item.id,
    lotId: String(item.lotId),
    lotName: item.lotName,
    weight: String(item.weight),
    quantity: String(item.quantity),
    status: item.status,
    companyId: item.company.id,
    certificateNo: item.certificateNo,
  };
}

function inventoryItemToDetailLot(item: InventoryItemListItem): ClipboardDetailLot {
  return {
    id: item.id,
    itemLabel: itemLabel(item),
    lotId: String(item.lotId),
    lotName: item.lotName,
    itemType: item.itemType ?? "-",
    weight: item.weight,
    quantity: item.quantity,
    totalCost: item.totalCost,
    labAccountName: item.labAccountName || "-",
    certificateNo: item.certificateNo || "-",
    parcelOrStone: item.parcelOrStone,
    locationAccountName: item.locationAccountName ?? "-",
    companyName: item.company.name,
    companyCode: item.company.code,
    departmentName: item.department.name,
    vendorName: item.vendorAccount?.accountName ?? "-",
    status: item.status,
    createdAt: item.createdAt,
    remark: item.remark ?? "-",
  };
}

function normalizeDetailLot(value: unknown): ClipboardDetailLot | null {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Partial<ClipboardDetailLot> &
    Partial<InventoryItemListItem>;

  if (typeof record.itemLabel === "string" && record.lotId !== undefined) {
    return {
      id: String(record.id ?? record.lotId),
      itemLabel: record.itemLabel,
      lotId: String(record.lotId),
      lotName: String(record.lotName ?? ""),
      itemType: String(record.itemType ?? "-"),
      weight: Number(record.weight) || 0,
      quantity: Number(record.quantity) || 0,
      totalCost: Number(record.totalCost) || 0,
      labAccountName: String(record.labAccountName ?? "-"),
      certificateNo: String(record.certificateNo ?? "-"),
      parcelOrStone: record.parcelOrStone === "PARCEL" ? "PARCEL" : "STONE",
      locationAccountName: String(record.locationAccountName ?? "-"),
      companyName: String(record.companyName ?? "-"),
      companyCode: record.companyCode ?? null,
      departmentName: String(record.departmentName ?? "-"),
      vendorName: String(record.vendorName ?? "-"),
      status: (record.status as InventoryItemListItem["status"]) ?? "STOCK",
      createdAt: String(record.createdAt ?? ""),
      remark: String(record.remark ?? "-"),
    };
  }

  if ("company" in record && "department" in record) {
    return inventoryItemToDetailLot(record as InventoryItemListItem);
  }

  return null;
}

function dedupeInventoryItems(items: InventoryItemListItem[]) {
  return [
    ...new Map(items.map((item) => [String(item.lotId), item])).values(),
  ];
}

function lotMatchesFilters(
  lot: ClipboardLot,
  filters: ClipboardFilters,
) {
  if (filters.companyId !== ALL_COMPANIES && lot.companyId !== filters.companyId) {
    return false;
  }

  if (filters.lotStatus !== ALL_STATUSES && lot.status !== filters.lotStatus) {
    return false;
  }

  const requestedLotIds = uniqueValues([...filters.lotIds, filters.lotId]);
  const requestedCertificateNos = uniqueValues([
    ...filters.certificateNos,
    filters.certificateNo,
  ]);
  const hasIdentifierFilters =
    requestedLotIds.length > 0 || requestedCertificateNos.length > 0;

  if (
    hasIdentifierFilters &&
    !requestedLotIds.some(
      (value) => normalizeText(lot.lotId) === normalizeText(value),
    ) &&
    !requestedCertificateNos.some((value) =>
      normalizeText(lot.certificateNo).includes(normalizeText(value)),
    )
  ) {
    return false;
  }

  if (
    filters.lotName &&
    !normalizeText(lot.lotName).includes(normalizeText(filters.lotName))
  ) {
    return false;
  }

  return true;
}

function sortValue(lot: ClipboardLot, key: SortKey) {
  if (key === "weight" || key === "quantity" || key === "lotId") {
    return Number(lot[key]) || 0;
  }

  return normalizeText(lot[key]);
}

function itemLabel(item: InventoryItemListItem) {
  if (item.itemMaster) {
    return `${item.itemMaster.itemId} - ${item.itemMaster.itemName}`;
  }

  return item.itemType ?? "-";
}

export default function ClipboardPage() {
  const user = useAppSelector((state) => state.auth.user);
  const accessibleCompanies = useAppSelector(
    (state) => state.company.accessibleCompanies,
  );
  const selectedCompanyId = useAppSelector(
    (state) =>
      state.company.selectedCompanyId ?? state.auth.user?.selectedCompanyId,
  );
  const persistedPermissions = useAppSelector(
    (state) => state.permission.permissions,
  );
  const departmentAccesses = useMemo(
    () => user?.departmentAccesses ?? [],
    [user?.departmentAccesses],
  );
  const selectedDepartmentId =
    user?.selectedDepartmentId ?? departmentAccesses[0]?.departmentId ?? null;
  const selectedAccess =
    departmentAccesses.find(
      (access) => access.departmentId === selectedDepartmentId,
    ) ?? departmentAccesses[0];
  const permissionMap = selectedAccess
    ? permissionsToMap(selectedAccess.permissions)
    : persistedPermissions;
  const canReadInventory =
    user?.role === "ORG_ADMIN" ||
    permissionAllows(permissionMap.INVENTORY_LIST, "READ_ONLY");

  const companyOptions = useMemo<CompanyOption[]>(() => {
    const options = new Map<string, CompanyOption>();

    accessibleCompanies.forEach((company) => {
      options.set(company.id, company);
    });

    departmentAccesses.forEach((access) => {
      options.set(access.companyId, {
        id: access.companyId,
        name: access.companyName,
        code: access.companyCode,
        status: access.companyStatus,
      });
    });

    return [...options.values()];
  }, [accessibleCompanies, departmentAccesses]);
  const fallbackCompanyId =
    selectedCompanyId ?? selectedAccess?.companyId ?? companyOptions[0]?.id ?? null;

  const [companyId, setCompanyId] = useState(fallbackCompanyId ?? ALL_COMPANIES);
  const [lotStatus, setLotStatus] = useState(ALL_STATUSES);
  const [lotId, setLotId] = useState("");
  const [lotIds, setLotIds] = useState<string[]>([]);
  const [lotName, setLotName] = useState("");
  const [certificateNo, setCertificateNo] = useState("");
  const [certificateNos, setCertificateNos] = useState<string[]>([]);
  const [view, setView] = useState<ClipboardView>("summary");
  const [lots, setLots] = useState<ClipboardLot[]>([]);
  const [detailLots, setDetailLots] = useState<ClipboardDetailLot[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("lotId");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isOpeningDetails, setIsOpeningDetails] = useState(false);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const storageLoadedRef = useRef(false);
  const draftDismissedRef = useRef(false);

  const draftValues = useMemo<ClipboardDraft>(
    () => ({
      companyId,
      lotStatus,
      lotId,
      lotIds,
      lotName,
      certificateNo,
      certificateNos,
      view,
      lots,
      detailLots,
    }),
    [
      certificateNo,
      certificateNos,
      companyId,
      detailLots,
      lotId,
      lotIds,
      lotName,
      lotStatus,
      lots,
      view,
    ],
  );

  const restoreClipboardDraft = useCallback(
    (draft: ClipboardDraft) => {
      setCompanyId(draft.companyId ?? fallbackCompanyId ?? ALL_COMPANIES);
      setLotStatus(draft.lotStatus ?? ALL_STATUSES);
      setLotId(draft.lotId ?? "");
      setLotIds(Array.isArray(draft.lotIds) ? draft.lotIds : []);
      setLotName(draft.lotName ?? "");
      setCertificateNo(draft.certificateNo ?? "");
      setCertificateNos(
        Array.isArray(draft.certificateNos) ? draft.certificateNos : [],
      );
      setView(draft.view === "details" ? "details" : "summary");
      setLots(Array.isArray(draft.lots) ? draft.lots : []);
      setDetailLots(
        Array.isArray(draft.detailLots)
          ? draft.detailLots
              .map(normalizeDetailLot)
              .filter((lot): lot is ClipboardDetailLot => Boolean(lot))
          : [],
      );
    },
    [fallbackCompanyId],
  );

  useEffect(() => {
    if (storageLoadedRef.current || typeof window === "undefined") return;
    storageLoadedRef.current = true;

    const restoredDraft = readInitialClipboardDraft();

    draftDismissedRef.current = false;
    restoreClipboardDraft(restoredDraft);
    setIsStorageReady(true);
  }, [restoreClipboardDraft]);

  useEffect(() => {
    if (
      !isStorageReady ||
      draftDismissedRef.current ||
      typeof window === "undefined"
    ) {
      return;
    }

    try {
      writeStoredClipboardDraft(CLIPBOARD_DRAFT_STORAGE_KEY, draftValues);
      writeClipboardLastLoadedDraft(draftValues);
      removeLegacyClipboardDrafts(user?.id);
    } catch {
      toast.error("Clipboard data is too large to save locally.");
    }
  }, [draftValues, isStorageReady, user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleDraftRemoved = (event: Event) => {
      const detail = (event as CustomEvent<{ storageKey?: string }>).detail;
      if (detail?.storageKey !== CLIPBOARD_DRAFT_STORAGE_KEY) return;

      draftDismissedRef.current = true;
      setIsStorageReady(false);
      removeClipboardBackupDrafts(user?.id);
      restoreClipboardDraft(defaultClipboardDraft());
    };

    window.addEventListener(DRAFT_REMOVED_EVENT, handleDraftRemoved);
    return () => {
      window.removeEventListener(DRAFT_REMOVED_EVENT, handleDraftRemoved);
    };
  }, [restoreClipboardDraft, user?.id]);

  const persistClipboardDraft = (overrides: Partial<ClipboardDraft>) => {
    const nextDraft = { ...draftValues, ...overrides };

    draftDismissedRef.current = false;
    if (!isStorageReady) {
      setIsStorageReady(true);
    }

    if (typeof window !== "undefined") {
      try {
        writeStoredClipboardDraft(CLIPBOARD_DRAFT_STORAGE_KEY, nextDraft);
        writeClipboardLastLoadedDraft(nextDraft);
      } catch {
        toast.error("Clipboard data is too large to save locally.");
      }
    }
  };

  const handleCompanyChange = (nextCompanyId: string) => {
    setCompanyId(nextCompanyId);
    persistClipboardDraft({ companyId: nextCompanyId });
  };

  const handleLotStatusChange = (nextLotStatus: string) => {
    setLotStatus(nextLotStatus);
    persistClipboardDraft({ lotStatus: nextLotStatus });
  };

  const handleLotIdChange = (nextLotId: string) => {
    setLotId(nextLotId);
    persistClipboardDraft({ lotId: nextLotId });
  };

  const handleLotNameChange = (nextLotName: string) => {
    setLotName(nextLotName);
    persistClipboardDraft({ lotName: nextLotName });
  };

  const handleCertificateNoChange = (nextCertificateNo: string) => {
    setCertificateNo(nextCertificateNo);
    persistClipboardDraft({ certificateNo: nextCertificateNo });
  };

  const handleSummaryView = () => {
    setView("summary");
    persistClipboardDraft({ view: "summary" });
  };

  const displayedLots = useMemo(() => {
    const sortedLots = [...lots].sort((left, right) => {
      const leftValue = sortValue(left, sortKey);
      const rightValue = sortValue(right, sortKey);

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return sortDirection === "asc"
          ? leftValue - rightValue
          : rightValue - leftValue;
      }

      return sortDirection === "asc"
        ? String(leftValue).localeCompare(String(rightValue))
        : String(rightValue).localeCompare(String(leftValue));
    });

    return sortedLots;
  }, [lots, sortDirection, sortKey]);
  const activeDetailLots = useMemo(() => {
    const loadedLotIds = new Set(lots.map((lot) => lot.lotId));
    return detailLots.filter((lot) => loadedLotIds.has(lot.lotId));
  }, [detailLots, lots]);
  const summaryTotals = useMemo(
    () =>
      lots.reduce(
        (sum, lot) => ({
          weight: sum.weight + (Number(lot.weight) || 0),
          quantity: sum.quantity + (Number(lot.quantity) || 0),
        }),
        { weight: 0, quantity: 0 },
      ),
    [lots],
  );
  const detailTotals = useMemo(
    () =>
      activeDetailLots.reduce(
        (sum, lot) => ({
          weight: sum.weight + lot.weight,
          quantity: sum.quantity + lot.quantity,
        }),
        { weight: 0, quantity: 0 },
      ),
    [activeDetailLots],
  );

  const updateLot = (id: string, field: keyof ClipboardLot, value: string) => {
    const nextLots = lots.map((item) =>
      item.id === id ? { ...item, [field]: value } : item,
    );

    setLots(nextLots);
    persistClipboardDraft({ lots: nextLots });
  };

  const removeLot = (id: string) => {
    const nextLots = lots.filter((item) => item.id !== id);
    const removedLot = lots.find((item) => item.id === id);
    const nextDetailLots = removedLot
      ? detailLots.filter((item) => item.lotId !== removedLot.lotId)
      : detailLots;

    setLots(nextLots);
    setDetailLots(nextDetailLots);
    persistClipboardDraft({ lots: nextLots, detailLots: nextDetailLots });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  };

  const commitLotId = () => {
    const nextEntries = splitEntryValue(lotId);
    if (nextEntries.length === 0) return;

    const nextLotIds = uniqueValues([...lotIds, ...nextEntries]);

    setLotIds(nextLotIds);
    setLotId("");
    persistClipboardDraft({ lotIds: nextLotIds, lotId: "" });
  };

  const commitCertificateNo = () => {
    const nextEntries = splitEntryValue(certificateNo);
    if (nextEntries.length === 0) return;

    const nextCertificateNos = uniqueValues([...certificateNos, ...nextEntries]);

    setCertificateNos(nextCertificateNos);
    setCertificateNo("");
    persistClipboardDraft({
      certificateNos: nextCertificateNos,
      certificateNo: "",
    });
  };

  const removeLotIdEntry = (value: string) => {
    const nextLotIds = lotIds.filter((item) => item !== value);

    setLotIds(nextLotIds);
    persistClipboardDraft({ lotIds: nextLotIds });
  };

  const removeCertificateNoEntry = (value: string) => {
    const nextCertificateNos = certificateNos.filter((item) => item !== value);

    setCertificateNos(nextCertificateNos);
    persistClipboardDraft({ certificateNos: nextCertificateNos });
  };

  const handleLotIdKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitLotId();
  };

  const handleCertificateNoKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitCertificateNo();
  };

  const buildSearchFilters = (): ClipboardFilters => ({
    companyId,
    lotStatus,
    lotId: "",
    lotIds: uniqueValues([...lotIds, ...splitEntryValue(lotId)]),
    lotName,
    certificateNo: "",
    certificateNos: uniqueValues([
      ...certificateNos,
      ...splitEntryValue(certificateNo),
    ]),
  });

  const commitSearchFilters = () => {
    const searchFilters = buildSearchFilters();

    setLotIds(searchFilters.lotIds);
    setLotId("");
    setCertificateNos(searchFilters.certificateNos);
    setCertificateNo("");
    persistClipboardDraft(searchFilters);

    return searchFilters;
  };

  const activeCompanyForFilters = (searchFilters: ClipboardFilters) =>
    searchFilters.companyId === ALL_COMPANIES
      ? fallbackCompanyId
      : searchFilters.companyId;

  const hasSpecificSearchFilters = (searchFilters: ClipboardFilters) =>
    Boolean(
      searchFilters.lotIds.length ||
        searchFilters.certificateNos.length ||
        searchFilters.lotId.trim() ||
        searchFilters.lotName.trim() ||
        searchFilters.certificateNo.trim(),
    );

  const applySearchResult = ({
    searchFilters,
    loadedItems,
    nextView,
    emptyMessage,
    successMessage,
  }: {
    searchFilters: ClipboardFilters;
    loadedItems: InventoryItemListItem[];
    nextView: ClipboardView;
    emptyMessage: string;
    successMessage: string;
  }) => {
    const nextLots = loadedItems.map(inventoryItemToClipboardLot);
    const nextDetailLots = loadedItems.map(inventoryItemToDetailLot);

    setLots(nextLots);
    setDetailLots(nextDetailLots);
    setView(nextView);
    persistClipboardDraft({
      ...searchFilters,
      view: nextView,
      lots: nextLots,
      detailLots: nextDetailLots,
    });

    if (loadedItems.length === 0) {
      toast.error(emptyMessage);
      return;
    }

    toast.success(successMessage);
  };

  const loadInventoryRecords = async (searchFilters: ClipboardFilters) => {
    if (!canReadInventory) {
      toast.error("Inventory access denied.");
      return [];
    }

    const searchCompanyId = activeCompanyForFilters(searchFilters);

    if (!searchCompanyId) {
      toast.error("Select a company before loading lots.");
      return [];
    }

    const lotIdEntries = uniqueValues([
      ...searchFilters.lotIds,
      searchFilters.lotId,
    ]);
    const certificateNoEntries = uniqueValues([
      ...searchFilters.certificateNos,
      searchFilters.certificateNo,
    ]);
    const searchValue = searchFilters.lotName.trim();
    let loadedItems: InventoryItemListItem[] = [];

    if (lotIdEntries.length > 0) {
      const lotResults = await Promise.allSettled(
        lotIdEntries
          .filter((value) => /^\d+$/.test(value))
          .map(async (value) => {
            const response = await getInventoryItemByLot("user", value, {
              companyId: searchCompanyId,
            });
            return response.data.inventoryItem as InventoryItemListItem;
          }),
      );

      loadedItems.push(
        ...lotResults.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        ),
      );
    }

    if (certificateNoEntries.length > 0) {
      const certificateResults = await Promise.allSettled(
        certificateNoEntries.map(async (value) => {
          const response = await getInventoryItems("user", {
            companyId: searchCompanyId,
            search: value,
          });
          return (response.data.inventoryItems ?? []) as InventoryItemListItem[];
        }),
      );

      loadedItems.push(
        ...certificateResults.flatMap((result) =>
          result.status === "fulfilled" ? result.value : [],
        ),
      );
    }

    if (lotIdEntries.length === 0 && certificateNoEntries.length === 0) {
      const response = await getInventoryItems("user", {
        companyId: searchCompanyId,
        search: searchValue,
      });
      loadedItems = response.data.inventoryItems ?? [];
    }

    if (loadedItems.length > 0) {
      loadedItems = dedupeInventoryItems(loadedItems);
    } else {
      const invalidLotIds = lotIdEntries.filter((value) => !/^\d+$/.test(value));
      if (invalidLotIds.length > 0) {
        toast.error("LotID must be numeric.");
      }
    }

    return loadedItems.filter((item) =>
      lotMatchesFilters(inventoryItemToClipboardLot(item), searchFilters),
    );
  };

  const handleLoadExt = async () => {
    try {
      setIsLoadingSummary(true);
      const searchFilters = commitSearchFilters();

      if (!hasSpecificSearchFilters(searchFilters)) {
        applySearchResult({
          searchFilters,
          loadedItems: [],
          nextView: "summary",
          emptyMessage: "Enter LotID, LOT NAME, or Certificate No before loading.",
          successMessage: "",
        });
        return;
      }

      const loadedItems = await loadInventoryRecords(searchFilters);

      applySearchResult({
        searchFilters,
        loadedItems,
        nextView: "summary",
        emptyMessage: "No lots matched the current filters.",
        successMessage: `${loadedItems.length} lot${loadedItems.length === 1 ? "" : "s"} loaded in summary.`,
      });
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError.response?.data?.message ?? "Failed to load lots.");
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const openDetailTable = async () => {
    try {
      setIsOpeningDetails(true);
      const searchFilters = commitSearchFilters();

      if (!hasSpecificSearchFilters(searchFilters)) {
        applySearchResult({
          searchFilters,
          loadedItems: [],
          nextView: "details",
          emptyMessage: "Enter LotID, LOT NAME, or Certificate No before showing lots.",
          successMessage: "",
        });
        return;
      }

      const loadedItems = await loadInventoryRecords(searchFilters);

      applySearchResult({
        searchFilters,
        loadedItems,
        nextView: "details",
        emptyMessage: "No lots matched the current filters.",
        successMessage: `${loadedItems.length} lot${loadedItems.length === 1 ? "" : "s"} opened in detail table.`,
      });
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError.response?.data?.message ?? "Failed to open lot details.");
    } finally {
      setIsOpeningDetails(false);
    }
  };

  const handleTemplate = (templateKey: string) => {
    const template = clipboardTemplates.find((item) => item.key === templateKey);
    if (!template) return;

    setLotStatus(template.lotStatus);
    setView("summary");
    persistClipboardDraft({ lotStatus: template.lotStatus, view: "summary" });
    toast.success(`${template.label} template opened.`);
  };

  const handleRemoveAll = () => {
    setLots([]);
    setDetailLots([]);
    setView("summary");
    persistClipboardDraft({ lots: [], detailLots: [], view: "summary" });
  };

  if (!canReadInventory) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to use the inventory clipboard.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto w-full max-w-none space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Inventory
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Clipboard</h1>
            <p className="text-sm text-muted-foreground">
              Temporary lot workspace for transfer, tagging, and processing.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
            <ClipboardList className="h-4 w-4 text-primary" />
            <span className="font-semibold">{lots.length}</span>
            <span className="text-muted-foreground">loaded lots</span>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          {view === "summary" ? (
            <SummaryGrid
              lots={displayedLots}
              totals={summaryTotals}
              sort={handleSort}
              removeLot={removeLot}
              removeAll={handleRemoveAll}
              updateLot={updateLot}
            />
          ) : (
            <DetailGrid
              lots={activeDetailLots}
              totals={detailTotals}
              onBack={handleSummaryView}
              onRemoveAll={handleRemoveAll}
            />
          )}

          <aside className="space-y-4">
            <section className="rounded-lg border bg-background">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Filters & Actions</h2>
              </div>

              <div className="space-y-4 p-4">
                <Field label="Company">
                  <Select value={companyId} onValueChange={handleCompanyChange}>
                    <SelectTrigger className="h-10 w-full rounded-lg">
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_COMPANIES}>Current Company</SelectItem>
                      {companyOptions.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {companyLabel(company)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Lot Status">
                  <Select value={lotStatus} onValueChange={handleLotStatusChange}>
                    <SelectTrigger className="h-10 w-full rounded-lg">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {lotStatusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="LotID">
                  <Input
                    value={lotId}
                    onChange={(event) => handleLotIdChange(event.target.value)}
                    onBlur={commitLotId}
                    onKeyDown={handleLotIdKeyDown}
                    className="h-10 rounded-lg"
                    placeholder="Enter lot ID and press Enter"
                  />
                  <EntryChips
                    values={lotIds}
                    emptyLabel="No LotID added"
                    onRemove={removeLotIdEntry}
                  />
                </Field>

                <Field label="LOT NAME">
                  <Input
                    value={lotName}
                    onChange={(event) => handleLotNameChange(event.target.value)}
                    className="h-10 rounded-lg"
                    placeholder="Enter lot name"
                  />
                </Field>

                <Field label="Certificate No">
                  <Input
                    value={certificateNo}
                    onChange={(event) =>
                      handleCertificateNoChange(event.target.value)
                    }
                    onBlur={commitCertificateNo}
                    onKeyDown={handleCertificateNoKeyDown}
                    className="h-10 rounded-lg"
                    placeholder="Enter certificate no and press Enter"
                  />
                  <EntryChips
                    values={certificateNos}
                    emptyLabel="No certificate no added"
                    onRemove={removeCertificateNoEntry}
                  />
                </Field>

                <div className="grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 justify-start rounded-lg"
                    onClick={handleLoadExt}
                    disabled={isLoadingSummary}
                  >
                    {isLoadingSummary ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ClipboardList className="h-4 w-4" />
                    )}
                    Load Ext
                  </Button>

                  <Select onValueChange={handleTemplate}>
                    <SelectTrigger className="h-10 w-full rounded-lg">
                      <LayoutTemplate className="h-4 w-4" />
                      <SelectValue placeholder="Open With Template" />
                    </SelectTrigger>
                    <SelectContent>
                      {clipboardTemplates.map((template) => (
                        <SelectItem key={template.key} value={template.key}>
                          {template.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    className="h-10 justify-start rounded-lg"
                    onClick={openDetailTable}
                    disabled={isOpeningDetails}
                  >
                    {isOpeningDetails ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    Show Lots
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 justify-start rounded-lg"
                    onClick={openDetailTable}
                    disabled={lots.length === 0 || isOpeningDetails}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Close & Load
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 justify-start rounded-lg"
                    onClick={handleRemoveAll}
                    disabled={lots.length === 0}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove All
                  </Button>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function SummaryGrid({
  lots,
  totals,
  sort,
  removeLot,
  removeAll,
  updateLot,
}: {
  lots: ClipboardLot[];
  totals: { weight: number; quantity: number };
  sort: (key: SortKey) => void;
  removeLot: (id: string) => void;
  removeAll: () => void;
  updateLot: (id: string, field: keyof ClipboardLot, value: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Summary Table</h2>
          <p className="text-xs text-muted-foreground">
            Load Ext keeps this table compact with only key lot data.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-lg"
          onClick={removeAll}
          disabled={lots.length === 0}
        >
          <Trash2 className="h-4 w-4" />
          Remove All
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <SortableHeader label="LotID" sortKey="lotId" onSort={sort} />
              <SortableHeader label="LOT NAME" sortKey="lotName" onSort={sort} />
              <SortableHeader label="Weight" sortKey="weight" onSort={sort} align="right" />
              <SortableHeader label="Qty" sortKey="quantity" onSort={sort} align="right" />
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="w-12 px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {lots.length === 0 ? (
              <tr>
                <td colSpan={6} className="h-56 px-4 text-center">
                  <div className="mx-auto max-w-sm">
                    <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground/60" />
                    <p className="mt-3 text-sm font-semibold">No data</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Use Load Ext to load the summary lot data.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              lots.map((lot) => (
                <tr key={lot.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium text-blue-600">
                    {lot.lotId || "-"}
                  </td>
                  <EditableCell
                    value={lot.lotName}
                    onChange={(value) => updateLot(lot.id, "lotName", value)}
                  />
                  <EditableCell
                    value={lot.weight}
                    onChange={(value) => updateLot(lot.id, "weight", value)}
                    align="right"
                  />
                  <EditableCell
                    value={lot.quantity}
                    onChange={(value) => updateLot(lot.id, "quantity", value)}
                    align="right"
                  />
                  <td className="px-3 py-2">
                    <span className="font-semibold text-muted-foreground">
                      {normalizeStatusLabel(lot.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      title="Remove lot"
                      onClick={() => removeLot(lot.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <FooterTotals totals={totals} />
    </section>
  );
}

function DetailGrid({
  lots,
  totals,
  onBack,
  onRemoveAll,
}: {
  lots: ClipboardDetailLot[];
  totals: { weight: number; quantity: number };
  onBack: () => void;
  onRemoveAll: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-background">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Full Details Table</h2>
          <p className="text-xs text-muted-foreground">
            Show Lots and Close & Load open this table with complete lot data.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-lg"
            onClick={onBack}
          >
            Summary
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-lg"
            onClick={onRemoveAll}
          >
            <Trash2 className="h-4 w-4" />
            Remove All
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1900px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-3 font-medium">Item ID</th>
              <th className="px-3 py-3 font-medium">LotID</th>
              <th className="px-3 py-3 font-medium">LOT NAME</th>
              <th className="px-3 py-3 font-medium">Item Type</th>
              <th className="px-3 py-3 text-right font-medium">Weight</th>
              <th className="px-3 py-3 text-right font-medium">Qty</th>
              <th className="px-3 py-3 text-right font-medium">Total Cost</th>
              <th className="px-3 py-3 font-medium">Lab</th>
              <th className="px-3 py-3 font-medium">Certificate No</th>
              <th className="px-3 py-3 font-medium">Parcel / Stone</th>
              <th className="px-3 py-3 font-medium">Location</th>
              <th className="px-3 py-3 font-medium">Company</th>
              <th className="px-3 py-3 font-medium">Department</th>
              <th className="px-3 py-3 font-medium">Vendor</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Created</th>
              <th className="px-3 py-3 font-medium">Remark</th>
            </tr>
          </thead>
          <tbody>
            {lots.length === 0 ? (
              <tr>
                <td colSpan={17} className="h-56 px-4 text-center">
                  <p className="text-sm font-semibold">No detail data</p>
                </td>
              </tr>
            ) : (
              lots.map((lot) => (
                <tr key={lot.id} className="border-b last:border-0">
                  <td className="px-3 py-3">{lot.itemLabel}</td>
                  <td className="px-3 py-3 font-medium text-blue-600">
                    {lot.lotId}
                  </td>
                  <td className="px-3 py-3">{lot.lotName}</td>
                  <td className="px-3 py-3">{lot.itemType}</td>
                  <td className="px-3 py-3 text-right font-semibold">
                    {formatNumber(lot.weight, 4)}
                  </td>
                  <td className="px-3 py-3 text-right">{lot.quantity}</td>
                  <td className="px-3 py-3 text-right font-semibold">
                    {formatNumber(lot.totalCost)}
                  </td>
                  <td className="px-3 py-3">{lot.labAccountName || "-"}</td>
                  <td className="px-3 py-3 font-medium text-blue-600">
                    {lot.certificateNo || "-"}
                  </td>
                  <td className="px-3 py-3">
                    {lot.parcelOrStone === "PARCEL" ? "Parcel" : "Stone"}
                  </td>
                  <td className="px-3 py-3">{lot.locationAccountName}</td>
                  <td className="px-3 py-3">
                    {lot.companyCode
                      ? `${lot.companyName} (${lot.companyCode})`
                      : lot.companyName}
                  </td>
                  <td className="px-3 py-3">{lot.departmentName}</td>
                  <td className="px-3 py-3">{lot.vendorName}</td>
                  <td className="px-3 py-3 font-semibold">
                    {normalizeStatusLabel(lot.status)}
                  </td>
                  <td className="px-3 py-3">{formatDate(lot.createdAt)}</td>
                  <td className="px-3 py-3">{lot.remark}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <FooterTotals totals={totals} />
    </section>
  );
}

function FooterTotals({ totals }: { totals: { weight: number; quantity: number } }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        Totals
      </div>
      <div className="flex flex-wrap gap-3">
        <span className="rounded-lg border bg-background px-3 py-1.5">
          Weight: <strong>{formatNumber(totals.weight, 4)}</strong>
        </span>
        <span className="rounded-lg border bg-background px-3 py-1.5">
          Qty: <strong>{formatNumber(totals.quantity, 0)}</strong>
        </span>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  align,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  align?: "left" | "right";
  onSort: (key: SortKey) => void;
}) {
  return (
    <th className={`px-3 py-3 font-medium ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1.5 rounded-md hover:text-foreground ${
          align === "right" ? "justify-end" : ""
        }`}
      >
        {label}
        <ArrowUpDown className="h-3.5 w-3.5" />
      </button>
    </th>
  );
}

function EditableCell({
  value,
  align,
  onChange,
}: {
  value: string;
  align?: "left" | "right";
  onChange: (value: string) => void;
}) {
  return (
    <td className="px-3 py-2">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`h-8 rounded-md border-transparent bg-transparent px-2 focus-visible:border-input focus-visible:bg-background ${
          align === "right" ? "text-right" : ""
        }`}
      />
    </td>
  );
}

function EntryChips({
  values,
  emptyLabel,
  onRemove,
}: {
  values: string[];
  emptyLabel: string;
  onRemove: (value: string) => void;
}) {
  if (values.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <span
          key={value}
          className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs font-medium"
        >
          <span className="truncate">{value}</span>
          <button
            type="button"
            title={`Remove ${value}`}
            onClick={() => onRemove(value)}
            className="rounded-sm text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
