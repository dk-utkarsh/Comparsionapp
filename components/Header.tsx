"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

interface HeaderProps {
  onSearch?: (productName: string) => void;
  onUploadClick?: () => void;
  loading?: boolean;
}

export default function Header({ onSearch, onUploadClick, loading }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const isHome = pathname === "/";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    if (onSearch) {
      onSearch(query.trim());
    } else {
      sessionStorage.setItem(
        "compareQuery",
        JSON.stringify({ type: "single", products: [query.trim()] })
      );
      router.push("/compare/results");
    }
    setQuery("");
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200/80">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
        {/* Logo */}
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal to-accent flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 9h6v6H9z" />
              <path d="M3 3h6v6H3z" />
              <path d="M15 15h6v6h-6z" />
            </svg>
          </div>
          <span className="text-lg font-extrabold text-slate-text hidden sm:inline">
            Quick<span className="text-teal">Compare</span>
          </span>
        </button>

        {/* Search bar — shown on non-home pages or always on larger screens */}
        {!isHome && (
          <form onSubmit={handleSubmit} className="flex-1 max-w-xl flex gap-2">
            <div className="flex-1 relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-light"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search another product..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-slate-text text-sm focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal/20 transition-all placeholder:text-slate-light"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-4 py-2 bg-teal text-white rounded-lg font-semibold text-sm hover:bg-teal-dark transition-colors disabled:opacity-50 shrink-0"
            >
              Compare
            </button>
          </form>
        )}

        {/* Spacer */}
        {isHome && <div className="flex-1" />}

        {/* Primary nav */}
        <nav className="flex items-center gap-1 shrink-0">
          {[
            { href: "/dashboard", label: "Dashboard" },
            { href: "/monitor", label: "Monitor" },
          ].map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  active
                    ? "bg-teal/10 text-teal"
                    : "text-slate-muted hover:bg-gray-50 hover:text-slate-text"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Upload button on non-home pages */}
        {!isHome && onUploadClick && (
          <button
            onClick={onUploadClick}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-slate-muted hover:bg-gray-50 transition-colors shrink-0 hidden sm:flex items-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
            Upload Excel
          </button>
        )}

        {/* Brand badge */}
        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-light shrink-0">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          by Dentalkart
        </div>
      </div>
    </header>
  );
}
