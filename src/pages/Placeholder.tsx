import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

interface Props { title: string; description?: string }

export default function Placeholder({ title, description }: Props) {
  return (
    <AppLayout title={title}>
      <div className="p-6">
        <Card className="p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">{title}</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            {description ?? "Esta seção está sendo preparada e estará disponível em breve."}
          </p>
        </Card>
      </div>
    </AppLayout>
  );
}
