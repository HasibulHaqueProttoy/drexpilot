"use client";

import { useEffect, useState, Suspense } from "react";
import { Navbar } from "@/components/Navbar";
import { CheckCircle2, AlertCircle, ExternalLink, ShieldCheck, Unlink } from "lucide-react";
import { useSearchParams } from "next/navigation";

function ConnectionsContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/auth/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchStatus();
    if (searchParams.get("connected")) {
      setNotification(`LinkedIn connected successfully as ${searchParams.get("account") || "User"}!`);
    } else if (searchParams.get("error")) {
      setNotification(`OAuth Error: ${searchParams.get("error")}`);
    }
  }, [searchParams]);

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect LinkedIn? Scheduled posts will not be able to publish until reconnected.")) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch("/api/auth/linkedin/disconnect", { method: "POST" });
      if (res.ok) {
        setNotification("LinkedIn disconnected successfully.");
        await fetchStatus();
      }
    } catch (err: any) {
      alert(`Error disconnecting: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMockConnect = async () => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/auth/mock-connect", { method: "POST" });
      if (res.ok) {
        setNotification("Test LinkedIn Profile connected! You can now schedule and test publishing.");
        await fetchStatus();
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const linkedinAccount = status?.linkedin;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Social Connections</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage your connected publishing accounts. Personal LinkedIn profiles supported.
        </p>
      </div>

      {notification && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-xs text-blue-800 flex items-center justify-between">
          <span>{notification}</span>
          <button onClick={() => setNotification(null)} className="font-semibold underline ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* LinkedIn Connection Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#0077b5] text-white shadow-sm font-bold text-lg">
              in
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">LinkedIn</h3>
              <p className="text-xs text-slate-500">Personal Profile Publishing via Official Posts API</p>
            </div>
          </div>

          {/* Status indicator */}
          {linkedinAccount ? (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mr-1.5" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 border border-slate-200">
              Not Connected
            </span>
          )}
        </div>

        {/* Account Details */}
        {linkedinAccount ? (
          <div className="rounded-lg bg-slate-50 p-4 border border-slate-100 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Connected Profile Name:</span>
              <span className="font-semibold text-slate-800">{linkedinAccount.accountName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Platform Account ID:</span>
              <span className="font-mono text-slate-700">{linkedinAccount.accountId}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Token Status:</span>
              <span className="text-emerald-700 font-medium">Valid & Encrypted (AES-256-GCM)</span>
            </div>
            {linkedinAccount.tokenExpiresAt && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Token Expiration:</span>
                <span className="text-slate-600">
                  {new Date(linkedinAccount.tokenExpiresAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500 leading-relaxed">
            Connect your personal LinkedIn account to allow Claude and PostPilot to schedule and publish text posts. PostPilot requests only the minimal official <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded font-mono">w_member_social</code> scope.
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {linkedinAccount ? (
            <button
              onClick={handleDisconnect}
              disabled={actionLoading}
              className="inline-flex items-center space-x-1.5 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-50"
            >
              <Unlink className="h-3.5 w-3.5" />
              <span>Disconnect LinkedIn</span>
            </button>
          ) : (
            <a
              href="/api/auth/linkedin"
              className="inline-flex items-center space-x-1.5 rounded-lg bg-[#0077b5] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#006097] transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Connect via LinkedIn OAuth 2.0</span>
            </a>
          )}

          {/* Instant Demo / Test Toggle */}
          <button
            onClick={handleMockConnect}
            disabled={actionLoading}
            className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
            <span>{linkedinAccount ? "Reset to Test Profile" : "Connect Test/Demo Account"}</span>
          </button>
        </div>
      </div>

      {/* Future Platforms */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3 opacity-60">
        <h3 className="text-sm font-semibold text-slate-700">Future Platforms (Phase 2 & 3)</h3>
        <p className="text-xs text-slate-500">
          PostPilot is architected with a modular publisher interface. Facebook and X integrations will plug seamlessly into the same scheduling queue.
        </p>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 text-xs flex items-center justify-between">
            <span className="font-medium text-slate-700">X (Twitter)</span>
            <span className="text-[11px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-mono">Coming Soon</span>
          </div>
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 text-xs flex items-center justify-between">
            <span className="font-medium text-slate-700">Facebook</span>
            <span className="text-[11px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-mono">Coming Soon</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConnectionsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading connections...</div>}>
          <ConnectionsContent />
        </Suspense>
      </main>
    </div>
  );
}
