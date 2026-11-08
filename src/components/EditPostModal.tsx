"use client";

import { useState } from "react";
import { X, Calendar, Clock, AlertCircle } from "lucide-react";

interface Post {
  id: string;
  content: string;
  scheduledAt: string;
  timezone: string;
  status: string;
}

export function EditPostModal({
  post,
  onClose,
  onUpdated,
}: {
  post: Post;
  onClose: () => void;
  onUpdated: () => void;
}) {
  // Convert ISO scheduledAt to local input values
  const dateObj = new Date(post.scheduledAt);
  const initialDate = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split("T")[0] : "";
  const initialTime = !isNaN(dateObj.getTime())
    ? dateObj.toTimeString().split(" ")[0].substring(0, 5)
    : "12:00";

  const [content, setContent] = useState(post.content);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [timezone, setTimezone] = useState(post.timezone || "Asia/Dhaka");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!content.trim()) {
      setError("Content cannot be empty");
      return;
    }

    if (!date || !time) {
      setError("Please select both a date and time");
      return;
    }

    // Combine date and time
    const dateTimeStr = `${date}T${time}:00`;
    const targetDate = new Date(dateTimeStr);
    if (isNaN(targetDate.getTime())) {
      setError("Invalid date/time format");
      return;
    }

    if (targetDate.getTime() <= Date.now()) {
      setError("Publishing time must be in the future");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          scheduled_at: targetDate.toISOString(),
          timezone,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update post");
      }

      onUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update scheduled post");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Edit Scheduled Post</h2>
            <p className="text-xs text-slate-500">Update content or publishing schedule</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
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
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-medium text-slate-700">Post Content (LinkedIn)</label>
              <span className={`text-[11px] ${content.length > 3000 ? "text-red-600 font-bold" : "text-slate-400"}`}>
                {content.length}/3000
              </span>
            </div>
            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What do you want to share on LinkedIn?"
              className="w-full rounded-md border border-slate-300 p-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Time</label>
              <div className="relative">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="Asia/Dhaka">Asia/Dhaka (GMT+6)</option>
              <option value="UTC">UTC (GMT+0)</option>
              <option value="America/New_York">America/New_York (EST/EDT)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
              <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
              <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
            </select>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
