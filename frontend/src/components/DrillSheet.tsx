import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import MilitaresTable, { type Params } from "@/components/MilitaresTable";

export interface Drill { title: string; params: Params; variant?: "geral" | "desligados" }

export default function DrillSheet({ drill, onClose }: { drill: Drill | null; onClose: () => void }) {
  return (
    <Sheet open={!!drill} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto border-[#1E2C42] bg-[#0B111A] p-0 sm:max-w-[min(1100px,95vw)]" data-testid="drill-sheet">
        <SheetHeader className="border-b border-[#1E2C42] p-5">
          <SheetTitle className="text-white" data-testid="drill-sheet-title">{drill?.title}</SheetTitle>
          <SheetDescription>Registros correspondentes ao item selecionado no gráfico.</SheetDescription>
        </SheetHeader>
        <div className="p-4">{drill && <MilitaresTable params={drill.params} variant={drill.variant} compact testId="drill-table" />}</div>
      </SheetContent>
    </Sheet>
  );
}
