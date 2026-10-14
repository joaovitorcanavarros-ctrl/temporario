import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL = "__all__";

export interface Option { value: string; label: string }

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  allLabel?: string;
  placeholder?: string;
  testId: string;
  className?: string;
  disabled?: boolean;
}

export default function FieldSelect({ value, onChange, options, allLabel, placeholder = "Selecione", testId, className, disabled }: Props) {
  const labels: Record<string, string> = { [ALL]: allLabel ?? placeholder };
  for (const o of options) labels[o.value] = o.label;
  const current = value || (allLabel ? ALL : "");
  return (
    <Select value={current} onValueChange={(v: string) => onChange(v === ALL ? "" : v)} disabled={disabled}>
      <SelectTrigger data-testid={testId} className={cn("w-full min-w-0 bg-[#0F1724] border-[#24344D]", className)}>
        <SelectValue placeholder={placeholder}>
          {(v) => <span className={cn("truncate", !v && "text-muted-foreground")}>{v ? labels[v as string] ?? placeholder : placeholder}</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
