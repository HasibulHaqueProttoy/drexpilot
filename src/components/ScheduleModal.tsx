"use client";

import { useState, useEffect } from "react";
import { X, AlertCircle, PlusCircle, Building2, User, Send, Calendar, Clock } from "lucide-react";

export function ScheduleModal({
  isOpen,
  onClose,
  onCreated,
  initialMode = "schedule",
  defaultTimezone = "Asia/Dhaka",
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  initialMode?: "schedule" | "now";
  defaultTimezone?: string;
}) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const initialDate = tomorrow.toISOString().split("T")[0];

  const [mode, setMode] = useState<"schedule" | "now">(initialMode);
  const [content, setContent] = useState("");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("10:00");
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [mediaType, setMediaType] = useState<"none" | "image" | "video" | "carousel">("none");
  const [mediaUrls, setMediaUrls] = useState<string>("");
  const [mediaTitle, setMediaTitle] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [actionType, setActionType] = useState<"schedule" | "now" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      fetch("/api/auth/status")
        .then((res) => res.json())
        .then((data) => {
          const list = [
            ...(data.personalProfiles || []),
            ...(data.companyPages || []),
          ];
          setAccounts(list);
          if (list.length > 0) {
            setSelectedAccountId(list[0].id);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const handlePostAction = async (publishNow: boolean) => {
    setError(null);

    if (!content.trim()) {
      setError("Please write post content");
      return;
    }

    let targetDateIso = new Date().toISOString();

    if (!publishNow) {
      const dateTimeStr = `${date}T${time}:00`;
      const targetDate = new Date(dateTimeStr);
      if (isNaN(targetDate.getTime())) {
        setError("Invalid date/time");
        return;
      }

      if (targetDate.getTime() <= Date.now()) {
        setError("Scheduled time must be in the future");
        return;
      }
      targetDateIso = targetDate.toISOString();
    }

    setLoading(true);
    setActionType(publishNow ? "now" : "schedule");

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "linkedin",
          content,
          scheduled_at: targetDateIso,
          timezone,
          publish_now: publishNow,
          social_account_id: selectedAccountId || undefined,
          media_type: mediaType,
          media_urls: mediaUrls ? mediaUrls.split(",").map((s) => s.trim()).filter(Boolean) : [],
          media_title: mediaTitle || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (publishNow ? "Failed to publish post" : "Failed to schedule post"));
      }

      setContent("");
      setMediaUrls("");
      setMediaTitle("");
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to process post request");
    } finally {
      setLoading(false);
      setActionType(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handlePostAction(mode === "now");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <img src="/logo.png" alt="DrexPilot Logo" className="h-5 w-5 rounded-md object-cover inline-block" />
              <span>{mode === "now" ? "Publish to LinkedIn" : "Schedule LinkedIn Post"}</span>
            </h2>
            <p className="text-xs text-slate-500">
              {mode === "now"
                ? "Deliver immediately to your connected profile"
                : "DrexPilot will automatically publish at this time"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="mt-4 flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("now")}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
              mode === "now"
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Send className="h-3.5 w-3.5" />
            <span>Post Now</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("schedule")}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
              mode === "schedule"
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Schedule for Later</span>
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center space-x-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Publish To</label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              {accounts.length === 0 ? (
                <option value="">Default Connected Account</option>
              ) : (
                accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountType === "organization" ? "🏢 Company Page: " : "👤 Personal Profile: "}
                    {acc.accountName}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-medium text-slate-700">Content</label>
              <span className={`text-[11px] ${content.length > 3000 ? "text-red-600 font-bold" : "text-slate-400"}`}>
                {content.length}/3000
              </span>
            </div>
            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your LinkedIn post here..."
              className="w-full rounded-md border border-slate-300 p-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          {/* Mode-specific timing section */}
          {mode === "now" ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800 flex items-center space-x-2.5">
              <Send className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>This post will be published immediately to LinkedIn upon submission.</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required={mode === "schedule"}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required={mode === "schedule"}
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                >
                  <option value="Asia/Dhaka">Asia/Dhaka (GMT+6)</option>
                  <option value="UTC">UTC (GMT+0)</option>
                  <option value="America/New_York">America/New_York (EST/EDT)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                </select>
              </div>
            </div>
          )}

          {/* Media Attachments Section */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Media Attachment</label>
              <div className="grid grid-cols-4 gap-2">
                {(["none", "image", "video", "carousel"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setMediaType(type);
                      if (type === "none") {
                        setMediaUrls("");
                        setMediaTitle("");
                      }
                    }}
                    className={`py-1.5 px-2 text-xs font-medium rounded-md capitalize border transition-colors ${
                      mediaType === type
                        ? "bg-blue-50 border-blue-500 text-blue-700 font-semibold"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {type === "carousel" ? "PDF Carousel" : type}
                  </button>
                ))}
              </div>
            </div>

            {mediaType !== "none" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {mediaType === "carousel"
                      ? "Public PDF Document URL"
                      : mediaType === "video"
                      ? "Public MP4 Video URL"
                      : "Public Image URL(s) (comma-separated for multi-image)"}
                  </label>
                  <input
                    type="url"
                    value={mediaUrls}
                    onChange={(e) => setMediaUrls(e.target.value)}
                    placeholder={
                      mediaType === "carousel"
                        ? "https://example.com/slides.pdf"
                        : mediaType === "video"
                        ? "https://example.com/video.mp4"
                        : "https://example.com/image1.jpg, https://example.com/image2.jpg"
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    required
                  />
                </div>

                {(mediaType === "carousel" || mediaType === "image" || mediaType === "video") && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {mediaType === "carousel" ? "Carousel Deck Title" : "Media Title / Alt (Optional)"}
                    </label>
                    <input
                      type="text"
                      value={mediaTitle}
                      onChange={(e) => setMediaTitle(e.target.value)}
                      placeholder={
                        mediaType === "carousel"
                          ? "e.g. 5 Growth Strategies for 2026"
                          : "Optional title or caption"
                      }
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-md border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>

            <div className="flex items-center space-x-2">
              {mode === "schedule" ? (
                <>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handlePostAction(true)}
                    className="inline-flex items-center justify-center space-x-1.5 rounded-md border border-emerald-600 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 focus:outline-none disabled:opacity-50 transition-colors"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>{loading && actionType === "now" ? "Publishing..." : "Post Now"}</span>
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center justify-center space-x-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none disabled:opacity-50 transition-colors"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    <span>{loading && actionType === "schedule" ? "Scheduling..." : "Schedule Post"}</span>
                  </button>
                </>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center justify-center space-x-1.5 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 focus:outline-none disabled:opacity-50 transition-colors"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{loading ? "Publishing Now..." : "Publish Now to LinkedIn"}</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
