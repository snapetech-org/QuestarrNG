import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RssFeed, InsertRssFeed } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash, Settings, CheckCircle, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { InterfaceText } from "@/components/InterfaceText";
import { formatInterfaceMessage } from "@/lib/interface-locale";

export default function RssSettings() {
  const [isOpen, setIsOpen] = useState(false);
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [newFeedName, setNewFeedName] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: feeds } = useQuery<RssFeed[]>({
    queryKey: ["/api/rss/feeds"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/rss/feeds");
      return res.json();
    },
  });

  const addFeedMutation = useMutation({
    mutationFn: async (feed: InsertRssFeed) => {
      await apiRequest("POST", "/api/rss/feeds", feed);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rss/feeds"] });
      setNewFeedName("");
      setNewFeedUrl("");
      toast({ description: "Feed added" });
    },
    onError: () => {
      toast({ description: "Failed to add feed", variant: "destructive" });
    },
  });

  const toggleFeedMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await apiRequest("PUT", `/api/rss/feeds/${id}`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rss/feeds"] });
    },
  });

  const deleteFeedMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/rss/feeds/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rss/feeds"] });
      toast({ description: "Feed removed" });
    },
  });

  const handleAddFeed = () => {
    if (!newFeedUrl || !newFeedName) return;
    addFeedMutation.mutate({
      name: newFeedName,
      url: newFeedUrl,
      type: "custom",
      enabled: true,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          <InterfaceText source={"Manage Feeds"} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <InterfaceText source={"RSS Feed Management"} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-12 gap-4 items-end border-b pb-4">
            <div className="col-span-4 space-y-2">
              <Label>
                <InterfaceText source={"Feed Name"} />
              </Label>
              <Input
                value={newFeedName}
                onChange={(e) => setNewFeedName(e.target.value)}
                placeholder="e.g. My Custom Feed"
                data-i18n-placeholder={"e.g. My Custom Feed"}
              />
            </div>
            <div className="col-span-6 space-y-2">
              <Label>
                <InterfaceText source={"Feed URL"} />
              </Label>
              <Input
                value={newFeedUrl}
                onChange={(e) => setNewFeedUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="col-span-2">
              <Button
                onClick={handleAddFeed}
                className="w-full"
                disabled={!newFeedName || !newFeedUrl}
              >
                <Plus className="h-4 w-4 mr-2" />
                <InterfaceText source={"Add"} />
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <InterfaceText source={"Status"} />
                </TableHead>
                <TableHead>
                  <InterfaceText source={"Name"} />
                </TableHead>
                <TableHead>
                  <InterfaceText source={"Type"} />
                </TableHead>
                <TableHead>
                  <InterfaceText source={"Enabled"} />
                </TableHead>
                <TableHead className="text-right">
                  <InterfaceText source={"Actions"} />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feeds?.map((feed) => (
                <TableRow key={feed.id}>
                  <TableCell>
                    {feed.status === "ok" ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <span title={feed.errorMessage || "Error"}>
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {feed.name}
                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {feed.url}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {feed.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={feed.enabled}
                      onCheckedChange={(c) =>
                        toggleFeedMutation.mutate({ id: feed.id, enabled: c })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteFeedMutation.mutate(feed.id)}
                      className="text-destructive"
                      aria-label={formatInterfaceMessage("Delete feed {name}", {
                        name: String(feed.name ?? ""),
                      })}
                      disabled={deleteFeedMutation.isPending}
                    >
                      <Trash className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {feeds?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    <InterfaceText source={"No RSS feeds configured. Add one above!"} />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
