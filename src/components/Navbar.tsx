"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Link2, Settings, Send, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";

interface SocialStatus {
  connected: boolean;
  linkedin: {
    accountName: string;
    status: string;
  } | null;
}

export function Navbar({ onRefresh }: { onRefresh?: () => void }) {
  const pathname = usePathname();
  const [authStatus, setAuthStatus] = useState<SocialStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/auth/status");
      if (res.ok) {
        const data = await res.json();
        setAuthStatus(data);
      }
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchStatus();
    if (onRefresh) onRefresh();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const navItems = [
    { href: "/", label: "Dashboard", icon: Calendar },
    { href: "/connections", label: "Connections", icon: Link2 },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center space-x-6">
          <Link href="/" className="flex items-center space-x-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 text-lg leading-tight block">DrexPilot</span>
            </div>
          </Link>

          <nav className="hidden sm:flex space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center space-x-3">
          {/* Status Indicator */}
          {authStatus && (
            <Link
              href="/connections"
              className={`hidden md:flex items-center space-x-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                authStatus.connected
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                  : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
              }`}
            >
              {authStatus.connected ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>LinkedIn: {authStatus.linkedin?.accountName || "Connected"}</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                  <span>LinkedIn Disconnected</span>
                </>
              )}
            </Link>
          )}

          {/* Simple Refresh Button */}
          <button
            onClick={handleRefresh}
            title="Refresh dashboard data"
            className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-blue-600" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="flex sm:hidden border-t border-slate-100 px-4 py-2 space-x-1 bg-slate-50">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex items-center justify-center space-x-1 py-1 text-xs font-medium rounded ${
                isActive ? "bg-white shadow-sm text-slate-900" : "text-slate-600"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </header>
  );
}
