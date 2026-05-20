"use client";

import { Search } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TableSearchBarProps = {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
};

export function TableSearchBar({
  search,
  onSearch,
  placeholder,
}: TableSearchBarProps) {
  const [value, setValue] = useState(search);

  useEffect(() => {
    setValue(search);
  }, [search]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(value.trim());
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-2xl border bg-background px-3 py-2 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
        />
      </div>
      <Button type="submit" className="h-9 rounded-xl px-4">
        Search
      </Button>
    </form>
  );
}
