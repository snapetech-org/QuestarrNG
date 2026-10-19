import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InterfaceText } from "@/components/InterfaceText";

interface WantedContent {
  id: string;
  gameTitle: string;
  mode: "edition" | "missing-selected";
  pending: { id: number; title: string }[];
  acquiredCount: number;
}

/** Editions and add-ons a SeerrNG request asked for that are still outstanding. */
export default function WantedContentCard() {
  const { data: items = [] } = useQuery<WantedContent[]>({
    queryKey: ["/api/wanted-content"],
    refetchInterval: 60000,
  });

  if (items.length === 0) return null;

  return (
    <Card data-testid="wanted-content-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Layers className="h-5 w-5 shrink-0" aria-hidden="true" />
          <InterfaceText source="Requested editions and add-ons" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} data-testid={`wanted-content-${item.id}`}>
              <p className="font-medium">{item.gameTitle}</p>
              <p className="text-sm text-muted-foreground">
                {item.pending.map((entry) => entry.title).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
