import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useI18n } from "@/contexts/I18nContext";
import { hasAskedNotifPermission, requestNotifPermission, markNotifAsked } from "@/lib/notifications";

export function NotifPermissionPrompt({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (hasAskedNotifPermission()) return;
    const timer = window.setTimeout(() => setOpen(true), 800);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  const onAllow = async () => {
    await requestNotifPermission();
    setOpen(false);
  };
  const onLater = () => {
    markNotifAsked();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onLater(); }}>
      <DialogContent className="max-w-[340px] rounded-2xl">
        <DialogHeader className="items-center text-center space-y-3">
          <div className="text-5xl">🔔</div>
          <DialogTitle className="text-base font-bold">{t("notification_title")}</DialogTitle>
          <DialogDescription className="text-sm">{t("notification_message")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-2">
          <button
            onClick={onAllow}
            className="h-11 rounded-xl bg-primary text-primary-foreground font-semibold active:scale-[.98]"
          >
            {t("allow_notifications")}
          </button>
          <button
            onClick={onLater}
            className="h-11 rounded-xl bg-muted text-foreground font-medium active:scale-[.98]"
          >
            {t("maybe_later")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
