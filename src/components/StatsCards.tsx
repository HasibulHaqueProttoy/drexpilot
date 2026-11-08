import { Calendar, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";

interface StatsProps {
  scheduled: number;
  published: number;
  failed: number;
  cancelled: number;
  total: number;
}

export function StatsCards({ stats }: { stats: StatsProps }) {
  const cards = [
    {
      label: "Upcoming Scheduled",
      value: stats.scheduled,
      icon: Clock,
      color: "text-blue-600",
      bg: "bg-blue-50 border-blue-100",
      description: "Waiting to be published",
    },
    {
      label: "Successfully Published",
      value: stats.published,
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-50 border-emerald-100",
      description: "Live on LinkedIn",
    },
    {
      label: "Failed Posts",
      value: stats.failed,
      icon: AlertTriangle,
      color: "text-rose-600",
      bg: "bg-rose-50 border-rose-100",
      description: "Requires attention or retry",
    },
    {
      label: "Cancelled Posts",
      value: stats.cancelled,
      icon: XCircle,
      color: "text-slate-500",
      bg: "bg-slate-50 border-slate-200",
      description: "Removed from schedule",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">{c.label}</span>
              <div className={`rounded-md p-1.5 ${c.bg}`}>
                <Icon className={`h-4 w-4 ${c.color}`} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">{c.value}</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">{c.description}</p>
          </div>
        );
      })}
    </div>
  );
}
