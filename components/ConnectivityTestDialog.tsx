"use client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { translatePhraseToEnglish } from "@/lib/i18n/phrases";

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
  const { user, publicLanguage } = useAuth();
  const language = user?.language ?? publicLanguage;
  const baseHeading = title ?? "连通性测试";
  const heading = language === "en" ? translatePhraseToEnglish(baseHeading) : baseHeading;
  const testingText = language === "en" ? `${heading} in progress...` : `${heading}中...`;
  const successText = language === "en" ? `${heading} passed` : `${heading}通过`;
  const failText = language === "en" ? `${heading} failed` : `${heading}失败`;
  const helpText = language === "en" ? "Checking whether the chatbot can respond correctly" : "正在检测是否可以正常响应";
  const closeText = language === "en" ? "Close" : "关闭";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && status === "fail") onClose(); }}>
      <DialogContent className="max-w-sm text-center">
        {status === "testing" && (
          <div className="py-6 space-y-3">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm font-medium">{testingText}</p>
            <p className="text-xs text-muted-foreground">{helpText}</p>
          </div>
        )}
        {status === "success" && (
          <div className="py-6 space-y-3">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600 text-lg">✓</div>
            <p className="text-sm font-medium">{successText}</p>
            {preview && <p className="text-xs text-muted-foreground break-all">{preview}</p>}
          </div>
        )}
        {status === "fail" && (
          <div className="py-6 space-y-3">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600 text-lg">✗</div>
            <p className="text-sm font-medium">{failText}</p>
            <p className="text-xs text-muted-foreground break-all">{message}</p>
            <Button size="sm" variant="outline" onClick={onClose}>{closeText}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
