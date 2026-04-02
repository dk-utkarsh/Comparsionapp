import { PriceAlert as PriceAlertType } from "@/lib/types";

interface PriceAlertProps {
  alerts: PriceAlertType[];
}

export default function PriceAlertBanner({ alerts }: PriceAlertProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-5 py-3 bg-red-50 border border-red-200 rounded-xl"
        >
          <span className="text-lg">⚠️</span>
          <span className="text-sm text-danger">
            <strong>Price Alert:</strong> {alert.competitor} is ₹
            {alert.priceDiff.toLocaleString("en-IN")} cheaper than Dentalkart
          </span>
        </div>
      ))}
    </div>
  );
}
