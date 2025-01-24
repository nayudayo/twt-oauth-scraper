import { cn } from "@/lib/utils"

interface SpinnerProps {
  size?: "sm" | "default" | "lg"
  className?: string
  label?: string
}

export function Spinner({ size = "default", className, label }: SpinnerProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "animate-spin rounded-full border-t-2 border-red-500/50",
          {
            "w-4 h-4 border-2": size === "sm",
            "w-6 h-6 border-2": size === "default",
            "w-8 h-8 border-3": size === "lg",
          },
          "shadow-lg shadow-red-500/20",
          className
        )}
      />
      {label && (
        <span className="text-red-500/70 text-sm animate-pulse">{label}</span>
      )}
    </div>
  )
} 