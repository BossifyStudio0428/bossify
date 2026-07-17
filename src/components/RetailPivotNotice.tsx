import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { useI18n } from "@/contexts/I18nContext";
import { RETAIL_ONLY_MODE } from "@/lib/featureFlags";
import { safeLocalStorage } from "@/lib/safeStorage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DISMISS_KEY = "bossify_retail_pivot_notice_v1";

/**
 * One-time in-app notice shown to legacy users whose stored business_type
 * was NOT retail. Their old data (listings, bookings, ingredients, …)
 * stays in the database untouched — this dialog just tells them why the
 * screens they used before are no longer visible.
 *
 * Dismissal is stored in localStorage per-user so it never re-appears
 * once acknowledged. Clearing the key (or reinstall) re-shows it.
 */
export function RetailPivotNotice() {
  const { session } = useAuth();
  const { storedType, loading } = useBusinessType();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!RETAIL_ONLY_MODE) return;
    if (loading || !session?.user) return;
    if (!storedType || storedType === "retail") return;
    const key = `${DISMISS_KEY}:${session.user.id}`;
    if (safeLocalStorage.getItem(key) === "1") return;
    setOpen(true);
  }, [session?.user?.id, storedType, loading]);

  const dismiss = () => {
    if (session?.user) {
      safeLocalStorage.setItem(`${DISMISS_KEY}:${session.user.id}`, "1");
    }
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("retail_pivot_title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("retail_pivot_body")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={dismiss}>{t("retail_pivot_ok")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}