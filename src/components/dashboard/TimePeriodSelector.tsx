import { Button } from "@/components/ui/button";

type TimePeriod = 12 | 24 | 36 | 48 | 0;

type TimePeriodSelectorProps = {
  selected: TimePeriod;
  onChange: (period: TimePeriod) => void;
};

export function TimePeriodSelector({ selected, onChange }: TimePeriodSelectorProps) {
  const periods: { value: TimePeriod; label: string }[] = [
    { value: 12, label: "12 months" },
    { value: 24, label: "24 months" },
    { value: 36, label: "36 months" },
    { value: 48, label: "48 months" },
    { value: 0, label: "Lifetime" },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-muted-foreground">Time period:</span>
      {periods.map((period) => (
        <Button
          key={period.value}
          variant={selected === period.value ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(period.value)}
        >
          {period.label}
        </Button>
      ))}
    </div>
  );
}
