import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SearchState, SearchStep } from '@/types/facevault';

interface SearchProgressProps {
  state: SearchState;
}

const STEPS: Array<{ step: SearchStep; label: string }> = [
  { step: 'detecting', label: 'Detecting face' },
  { step: 'computing', label: 'Computing embedding' },
  { step: 'routing', label: 'Routing to identity' },
  { step: 'searching', label: 'Searching identity pool' },
  { step: 'filtering', label: 'Filtering results' },
  { step: 'preparing', label: 'Preparing results' },
];

export function SearchProgress({ state }: SearchProgressProps) {
  const currentStepIndex = STEPS.findIndex(s => s.step === state.step);

  return (
    <div className="w-full max-w-md mx-auto py-12 animate-fade-in">
      <div className="space-y-4">
        {STEPS.map((step, index) => {
          const isComplete = currentStepIndex > index || state.step === 'complete';
          const isCurrent = currentStepIndex === index;
          const isPending = currentStepIndex < index && state.step !== 'complete';

          return (
            <div
              key={step.step}
              className={cn(
                "flex items-center gap-4 transition-all duration-300",
                isCurrent && "scale-[1.02]"
              )}
            >
              {/* Step indicator */}
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300",
                  isComplete && "bg-status-success text-status-success-foreground",
                  isCurrent && "bg-primary text-primary-foreground",
                  isPending && "bg-muted text-muted-foreground"
                )}
              >
                {isComplete ? (
                  <Check className="h-4 w-4" />
                ) : isCurrent ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="text-sm font-medium">{index + 1}</span>
                )}
              </div>

              {/* Step label */}
              <span
                className={cn(
                  "text-sm font-medium transition-colors duration-300",
                  isComplete && "text-status-success-foreground",
                  isCurrent && "text-foreground",
                  isPending && "text-muted-foreground"
                )}
              >
                {step.label}
                {isCurrent && (
                  <span className="ml-2 text-muted-foreground animate-pulse-soft">...</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="mt-8">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
            style={{ width: `${state.progress}%` }}
          />
        </div>
        <p className="text-sm text-muted-foreground text-center mt-3">
          {state.message}
        </p>
      </div>
    </div>
  );
}
