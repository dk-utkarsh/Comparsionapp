interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
}

export default function ProgressBar({ current, total, label }: ProgressBarProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="mb-6">
      <div className="flex justify-between text-xs text-slate-muted mb-1">
        <span>{label || "Scraping products..."}</span>
        <span>
          {current} of {total} sites done
        </span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full">
        <div
          className="h-full bg-gradient-to-r from-teal to-accent rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
