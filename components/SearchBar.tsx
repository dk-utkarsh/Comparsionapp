"use client";

import { useState } from "react";

interface SearchBarProps {
  onSearch: (productName: string) => void;
  loading?: boolean;
}

export default function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-[580px] mx-auto">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search product name... e.g. 3M Filtek Z350"
        className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50 text-slate-text text-sm focus:outline-none focus:border-teal transition-colors placeholder:text-slate-light"
        disabled={loading}
      />
      <button
        type="submit"
        disabled={loading || !query.trim()}
        className="px-6 py-3 bg-teal text-white rounded-xl font-semibold text-sm hover:bg-teal-dark transition-colors disabled:opacity-50"
      >
        {loading ? "Comparing..." : "Compare"}
      </button>
    </form>
  );
}
