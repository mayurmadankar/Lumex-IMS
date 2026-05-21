"use client";

import { Check, Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Modal, { ModalBody, ModalFooter } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export type AccountSearchOption = {
  id: string;
  accountName: string;
  accountLongName?: string | null;
  accountIndex?: string | null;
  phone1?: string | null;
  email?: string | null;
  trnNo?: string | null;
  accountType?: {
    name: string;
  } | null;
};

type AccountSearchPickerProps<T extends AccountSearchOption> = {
  value: string;
  onChange: (value: string) => void;
  options: T[];
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  modalTitle?: string;
  buttonLabel?: string;
};

function accountLabel(account: AccountSearchOption) {
  return `${account.accountName}${
    account.accountIndex ? ` (${account.accountIndex})` : ""
  }`;
}

function accountSubtitle(account: AccountSearchOption) {
  return [
    account.accountType?.name,
    account.accountLongName,
    account.phone1,
    account.email,
    account.trnNo,
  ]
    .filter(Boolean)
    .join(" / ");
}

function accountSearchText(account: AccountSearchOption) {
  return [
    account.accountName,
    account.accountLongName,
    account.accountIndex,
    account.accountType?.name,
    account.phone1,
    account.email,
    account.trnNo,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function AccountSearchPicker<T extends AccountSearchOption>({
  value,
  onChange,
  options,
  loading = false,
  disabled = false,
  placeholder = "Select account",
  searchPlaceholder = "Search by account name, doc ID, phone, email, or tax ID",
  emptyMessage = "No accounts found.",
  modalTitle = "Search Account",
  buttonLabel = "Search",
}: AccountSearchPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedAccount = options.find((account) => account.id === value);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;

    return options.filter((account) =>
      accountSearchText(account).includes(normalizedQuery),
    );
  }, [options, query]);
  const selectedLabel = selectedAccount
    ? accountLabel(selectedAccount)
    : value
      ? loading
        ? "Loading saved account..."
        : "Selected account unavailable"
      : placeholder;

  const openPicker = () => {
    if (disabled) return;
    setOpen(true);
  };

  const selectAccount = (accountId: string) => {
    onChange(accountId);
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <div className="flex min-w-0 gap-2">
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled}
          className={cn(
            "flex h-10 min-w-0 flex-1 items-center rounded-xl border border-input bg-background px-3 text-left text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
            !selectedAccount && !value ? "text-muted-foreground" : "text-foreground",
          )}
        >
          <span className="truncate">{selectedLabel}</span>
        </button>
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-xl px-3"
          onClick={openPicker}
          disabled={disabled}
        >
          <Search className="h-4 w-4" />
          {buttonLabel}
        </Button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={modalTitle}
        subtitle={selectedAccount ? accountLabel(selectedAccount) : undefined}
        icon={<Search className="h-4 w-4" />}
        maxWidth="xl"
      >
        <ModalBody className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 rounded-xl pl-9"
              placeholder={searchPlaceholder}
              autoFocus
            />
          </div>

          <div className="max-h-[360px] overflow-y-auto rounded-xl border">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading accounts
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              <div className="divide-y">
                {filteredOptions.map((account) => {
                  const selected = account.id === value;
                  const subtitle = accountSubtitle(account);

                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => selectAccount(account.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/60",
                        selected && "bg-primary/10 text-primary",
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border bg-background">
                        {selected ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Search className="h-4 w-4 text-muted-foreground" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {accountLabel(account)}
                        </span>
                        {subtitle && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {subtitle}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl"
            onClick={() => setOpen(false)}
          >
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
