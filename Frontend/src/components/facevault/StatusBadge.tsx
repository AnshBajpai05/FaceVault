import { cn } from '@/lib/utils';
import { CheckCircle2, AlertCircle, AlertTriangle, XCircle } from 'lucide-react';
import { RoutingInfo } from '@/types/facevault';

interface StatusBadgeProps {
  status: RoutingInfo['status'];
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig = {
  accepted: {
    label: 'High Confidence',
    icon: CheckCircle2,
    className: 'bg-status-success-bg text-status-success-foreground border-status-success/30',
  },
  ambiguous: {
    label: 'Review Suggested',
    icon: AlertTriangle,
    className: 'bg-status-warning-bg text-status-warning-foreground border-status-warning/30',
  },
  low_confidence: {
    label: 'Use Caution',
    icon: AlertCircle,
    className: 'bg-status-caution-bg text-status-caution-foreground border-status-caution/30',
  },
  no_match: {
    label: 'No Match',
    icon: XCircle,
    className: 'bg-status-error-bg text-status-error-foreground border-status-error/30',
  },
};

const sizeStyles = {
  sm: 'text-xs px-2 py-0.5 gap-1',
  md: 'text-sm px-3 py-1 gap-1.5',
  lg: 'text-base px-4 py-1.5 gap-2',
};

const iconSizes = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full border",
        config.className,
        sizeStyles[size]
      )}
    >
      <Icon className={iconSizes[size]} />
      {config.label}
    </span>
  );
}
