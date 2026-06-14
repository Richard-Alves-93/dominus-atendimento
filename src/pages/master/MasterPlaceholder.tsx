import { MasterLayout } from "@/components/MasterLayout";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export default function MasterPlaceholder({ title }: { title: string }) {
  return (
    <MasterLayout title={title}>
      <div className="p-6">
        <Card className="p-12 text-center">
          <Sparkles className="w-8 h-8 text-primary mx-auto mb-3" />
          <h2 className="text-xl font-semibold mb-1">{title}</h2>
          <p className="text-muted-foreground">Módulo em preparação.</p>
        </Card>
      </div>
    </MasterLayout>
  );
}
