"use client";

import { useState } from "react";
import {
  Calendar,
  Clock,
  Globe,
  Edit2,
  Trash2,
  Send,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  History,
} from "lucide-react";

export interface PostItem {
  id: string;
  content: string;
  scheduledAt: string;
  timezone: string;
  status: "scheduled" | "publishing" | "published" | "failed" | "cancelled";
  externalPostId?: string | null;
  publishedAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  account?: {
    accountName: string;
    platform: string;
    accountType?: "personal" | "organization" | null;
  };
  mediaType?: "none" | "image" | "video" | "carousel" | null;
  mediaUrls?: string[] | null;
  mediaTitle?: string | null;
}

export function PostCard({
  post,
  onEdit,
  onCancel,
  onPublishNow,
}: {
  post: PostItem;
  onEdit: (post: PostItem) => void;
  onCancel: (id: string) => void;
  onPublishNow: (id: string) => void;
}) {
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Format scheduled date and time nicely
  const dateObj = new Date(post.scheduledAt);
  const dateFormatted = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: post.timezone || undefined,
      })
    : "Invalid Date";

  const timeFormatted = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: post.timezone || undefined,
      })
    : "";

  const fetchLogs = async () => {
    if (showLogs) {
      setShowLogs(false);
      return;
    }
    setShowLogs(true);
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingLogs(false);
    }
  };

  const getStatusBadge = (status: PostItem["status"]) => {
    switch (status) {
      case "scheduled":
        return (
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600 mr-1.5 animate-pulse" />
            Scheduled
          </span>
        );
      case "publishing":
        return (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-600 mr-1.5 animate-spin" />
            Publishing...
          </span>
        );
      case "published":
        return (
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 mr-1.5" />
            Published
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 border border-rose-200">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-600 mr-1.5" />
            Failed
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 border border-slate-200">
            Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        {/* Content & Metadata */}
        <div className="space-y-2 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {getStatusBadge(post.status)}
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              LinkedIn
            </span>
            {post.account?.accountName && (
              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                {post.account.accountType === "organization" ? "🏢 Page: " : "👤 Profile: "}
                {post.account.accountName}
              </span>
            )}
            {post.mediaType && post.mediaType !== "none" && (
              <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700 border border-purple-200">
                {post.mediaType === "carousel" && "📑 Carousel"}
                {post.mediaType === "image" && `🖼️ Image (${post.mediaUrls?.length || 1})`}
                {post.mediaType === "video" && "🎬 Video"}
                {post.mediaTitle && ` • ${post.mediaTitle}`}
              </span>
            )}
          </div>

          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
            {post.content}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-1">
            <div className="flex items-center space-x-1">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>{dateFormatted}</span>
            </div>
            <div className="flex items-center space-x-1">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span>{timeFormatted}</span>
            </div>
            <div className="flex items-center space-x-1">
              <Globe className="h-3.5 w-3.5 text-slate-400" />
              <span>{post.timezone}</span>
            </div>
            {post.publishedAt && (
              <span className="text-emerald-600 font-medium">
                Published at {new Date(post.publishedAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          {post.errorMessage && (
            <div className="rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200 flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <span className="font-semibold">Publishing Error:</span> {post.errorMessage}
              </div>
            </div>
          )}

          {post.externalPostId && (
            <div className="text-xs text-slate-500 flex items-center space-x-1 pt-0.5">
              <span>External ID:</span>
              <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] text-slate-700 font-mono">
                {post.externalPostId}
              </code>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
          <div className="flex items-center space-x-1">
            {post.status === "scheduled" && (
              <>
                <button
                  onClick={() => onEdit(post)}
                  title="Edit post and schedule time"
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Cancel this scheduled post?")) {
                      onCancel(post.id);
                    }
                  }}
                  title="Cancel scheduled post"
                  className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}

            {(post.status === "scheduled" || post.status === "failed") && (
              <button
                onClick={async () => {
                  setActionLoading(true);
                  try {
                    await onPublishNow(post.id);
                  } finally {
                    setActionLoading(false);
                  }
                }}
                disabled={actionLoading}
                title="Publish now immediately"
                className="flex items-center space-x-1 rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors disabled:opacity-50"
              >
                <Send className="h-3 w-3" />
                <span>{actionLoading ? "Publishing..." : "Publish Now"}</span>
              </button>
            )}
          </div>

          <button
            onClick={fetchLogs}
            className="flex items-center space-x-1 text-[11px] text-slate-400 hover:text-slate-700 transition-colors"
          >
            <History className="h-3 w-3" />
            <span>Logs</span>
            {showLogs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Publishing Logs Dropdown */}
      {showLogs && (
        <div className="mt-3 rounded border border-slate-100 bg-slate-50/70 p-3 text-xs">
          <div className="font-semibold text-slate-700 mb-2">Publishing Audit Logs</div>
          {loadingLogs ? (
            <p className="text-slate-400">Loading logs...</p>
          ) : logs.length === 0 ? (
            <p className="text-slate-400">No logs recorded yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {logs.map((l) => (
                <div key={l.id} className="flex items-start justify-between text-[11px] border-b border-slate-100 pb-1">
                  <div>
                    <span className="font-medium text-slate-800 capitalize">{l.event.replace("_", " ")}</span>
                    {l.response && (
                      <pre className="text-[10px] text-slate-500 font-mono mt-0.5 overflow-x-auto max-w-sm">
                        {l.response}
                      </pre>
                    )}
                  </div>
                  <span className="text-slate-400 shrink-0 ml-2">
                    {new Date(l.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
