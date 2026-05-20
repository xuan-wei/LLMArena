"use client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ConnectivityTestDialogProps = {
  open: boolean;
  status: "testing" | "success" | "fail";
  message?: string;
  preview?: string;
  title?: string;
  onClose: () => void;
};

export function ConnectivityTestDialog({
  open, status, message, preview, title, onClose,
}: ConnectivityTestDialogProps) {
  const heading = title ?? "连通性测试";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && status === "fail") onClose(); }}>
      <DialogContent className="max-w-sm text-center">
        {status === "testing" && (
          <div className="py-6 space-y-3">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm font-medium">{heading}中...</p>
            <p className="text-xs text-muted-foreground">正在检测是否可以正常响应</p>
          </div>
        )}
        {status === "success" && (
          <div className="py-6 space-y-3">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600 text-lg">✓</div>
            <p className="text-sm font-medium">{heading}通过</p>
            {preview && <p className="text-xs text-muted-foreground break-all">{preview}</p>}
          </div>
        )}
        {status === "fail" && (
          <div className="py-6 space-y-3">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600 text-lg">✗</div>
            <p className="text-sm font-medium">{heading}失败</p>
            <p className="text-xs text-muted-foreground break-all">{message}</p>
            <Button size="sm" variant="outline" onClick={onClose}>关闭</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
