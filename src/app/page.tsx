"use client";

import { useEffect, useState, useCallback } from "react";
import { Navbar } from "@/components/Navbar";
import { StatsCards } from "@/components/StatsCards";
import { PostCard, type PostItem } from "@/components/PostCard";
import { EditPostModal } from "@/components/EditPostModal";
import { ScheduleModal } from "@/components/ScheduleModal";
import { AuthGuard } from "@/components/AuthGuard";
import { Plus, Calendar, Filter, AlertCircle, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [stats, setStats] = useState({
    scheduled: 0,
    published: 0,
    failed: 0,
    cancelled: 0,
    total: 0,
  });
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [editingPost, setEditingPost] = useState<PostItem | null>(null);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState<any>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      // Fetch posts
      const res = await fetch(`/api/posts?status=${filter}&order=asc`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
        if (data.stats) setStats(data.stats);
      }

      // Fetch connection status
      const authRes = await fetch("/api/auth/status");
      if (authRes.ok) {
        const authData = await authRes.json();
        setAuthStatus(authData);
      }
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchDashboardData();
    // Auto refresh every 15 seconds
    const interval = setInterval(fetchDashboardData, 15000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const handleCancelPost = async (id: string) => {
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchDashboardData();
      }
    } catch (err) {
      console.error("Error cancelling post:", err);
    }
  };

  const handlePublishNow = async (id: string) => {
    try {
      const res = await fetch(`/api/posts/${id}/publish-now`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(`Publishing failed: ${data.error}`);
      }
      fetchDashboardData();
    } catch (err: any) {
      alert(`Error publishing post: ${err.message}`);
    }
  };

  const filterTabs = [
    { id: "all", label: "All Posts" },
    { id: "scheduled", label: "Scheduled" },
    { id: "published", label: "Published" },
    { id: "failed", label: "Failed" },
    { id: "cancelled", label: "Cancelled" },
  ];

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar onRefresh={fetchDashboardData} />

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 space-y-6">
        {/* Banner if LinkedIn is not connected */}
        {authStatus && !authStatus.connected && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <h4 className="text-sm font-semibold text-amber-900">LinkedIn Account Not Connected</h4>
                <p className="text-xs text-amber-700">
                  Connect your LinkedIn account via official OAuth 2.0 to begin automatic publishing.
                </p>
              </div>
            </div>
            <Link
              href="/connections"
              className="inline-flex items-center justify-center rounded-md bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 transition-colors shrink-0"
            >
              Connect LinkedIn
            </Link>
          </div>
        )}

        {/* Dashboard Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Publishing Dashboard</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Autonomous social media publishing engine powered by Claude via MCP
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsScheduleOpen(true)}
              className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Schedule Post</span>
            </button>
          </div>
        </div>

        {/* Key Metrics */}
        <StatsCards stats={stats} />

        {/* Posts Section */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center space-x-1 overflow-x-auto">
              {filterTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                    filter === tab.id
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  {tab.label}
                  {tab.id !== "all" && stats[tab.id as keyof typeof stats] !== undefined && (
                    <span className="ml-1.5 opacity-75">({stats[tab.id as keyof typeof stats]})</span>
                  )}
                </button>
              ))}
            </div>

            <div className="text-xs text-slate-400 self-end sm:self-auto">
              Ordered chronologically by UTC publishing time
            </div>
          </div>

          {/* Posts List */}
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading scheduled posts...</div>
          ) : posts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <img src="/logo.png" alt="DrexPilot Logo" className="mx-auto h-12 w-12 rounded-xl opacity-60 mb-3 shadow-xs" />
              <h3 className="text-sm font-semibold text-slate-800">No posts in this view</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Ask Claude to schedule a post through MCP, or click the Schedule Post button above.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onEdit={(p) => setEditingPost(p)}
                  onCancel={handleCancelPost}
                  onPublishNow={handlePublishNow}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Edit Modal */}
      {editingPost && (
        <EditPostModal
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onUpdated={fetchDashboardData}
        />
      )}

      {/* Schedule Modal */}
      <ScheduleModal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        onCreated={fetchDashboardData}
      />
    </div>
    </AuthGuard>
  );
}
