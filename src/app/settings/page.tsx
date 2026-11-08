"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Check, Copy, Globe, Terminal, Shield, Save } from "lucide-react";

export default function SettingsPage() {
  const [timezone, setTimezone] = useState("Asia/Dhaka");
  const [availableTz, setAvailableTz] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedMcp, setCopiedMcp] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings?.default_timezone) {
          setTimezone(data.settings.default_timezone);
        }
        if (data.available_timezones) {
          setAvailableTz(data.available_timezones);
        }
      })
      .catch((err) => console.error(err));
  }, []);

  const handleSaveTimezone = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch("/api/settings/timezone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err: any) {
      alert("Failed to save timezone");
    } finally {
      setSaving(false);
    }
  };

  const mcpServerConfig = {
    mcpServers: {
      postpilot: {
        command: "npx",
        args: [
          "-y",
          "mcp-remote",
          "http://localhost:3002/mcp/sse?apiKey=postpilot-mcp-secret-key-12345"
        ],
      },
    },
  };

  const copyMcpConfig = () => {
    navigator.clipboard.writeText(JSON.stringify(mcpServerConfig, null, 2));
    setCopiedMcp(true);
    setTimeout(() => setCopiedMcp(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />

      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure system defaults, timezones, and MCP connectivity for Claude.
          </p>
        </div>

        {/* Timezone Configuration */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center space-x-3 border-b border-slate-100 pb-3">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Default Timezone</h3>
              <p className="text-xs text-slate-500">
                Primary timezone applied when scheduling posts without an explicit timezone
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveTimezone} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Select Timezone (Default: Asia/Dhaka)
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {availableTz.length > 0 ? (
                  availableTz.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="Asia/Dhaka">Asia/Dhaka (GMT+6)</option>
                    <option value="UTC">UTC (GMT+0)</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                  </>
                )}
              </select>
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center space-x-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saving ? "Saving..." : "Save Timezone"}</span>
              </button>
              {saveSuccess && (
                <span className="text-xs font-medium text-emerald-600 flex items-center">
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Timezone saved!
                </span>
              )}
            </div>
          </form>
        </div>

        {/* MCP Remote Server Configuration for Claude */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-3">
              <div className="rounded-lg bg-purple-50 p-2 text-purple-600">
                <Terminal className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Claude Model Context Protocol (MCP)</h3>
                <p className="text-xs text-slate-500">
                  Connect PostPilot to Claude via Streamable HTTP (SSE)
                </p>
              </div>
            </div>
            <button
              onClick={copyMcpConfig}
              className="inline-flex items-center space-x-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {copiedMcp ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedMcp ? "Copied" : "Copy Config"}</span>
            </button>
          </div>

          <div className="space-y-3 text-xs text-slate-600">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                <span className="font-semibold text-slate-700 block mb-1">Streamable HTTP SSE Endpoint:</span>
                <code className="text-slate-800 font-mono text-[11px] select-all break-all">
                  http://localhost:3002/mcp/sse
                </code>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                <span className="font-semibold text-slate-700 block mb-1">MCP API Key:</span>
                <code className="text-slate-800 font-mono text-[11px] select-all break-all">
                  postpilot-mcp-secret-key-12345
                </code>
              </div>
            </div>

            <p>
              Add this to your Claude Desktop configuration file (<code className="font-mono bg-slate-100 px-1 py-0.5 rounded">claude_desktop_config.json</code>):
            </p>

            <pre className="rounded-lg bg-slate-900 p-4 text-[11px] text-slate-100 font-mono overflow-x-auto">
{JSON.stringify(mcpServerConfig, null, 2)}
            </pre>
          </div>
        </div>

        {/* Publishing Queue & Engine Information */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
          <div className="flex items-center space-x-3 border-b border-slate-100 pb-3">
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Publishing Engine Health</h3>
              <p className="text-xs text-slate-500">Autonomous pg-boss scheduler configuration</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="border border-slate-100 rounded-lg p-3 bg-slate-50">
              <span className="text-slate-500 block mb-0.5">Job Queue</span>
              <span className="font-semibold text-slate-800">pg-boss (PostgreSQL)</span>
            </div>
            <div className="border border-slate-100 rounded-lg p-3 bg-slate-50">
              <span className="text-slate-500 block mb-0.5">Worker Execution</span>
              <span className="font-semibold text-emerald-600">Active (Independent of Claude)</span>
            </div>
            <div className="border border-slate-100 rounded-lg p-3 bg-slate-50">
              <span className="text-slate-500 block mb-0.5">Token Storage</span>
              <span className="font-semibold text-slate-800">AES-256-GCM Encrypted</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
