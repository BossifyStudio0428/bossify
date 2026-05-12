import { notify as localNotify } from "@/lib/notifications";
import { isPrefEnabled } from "@/lib/notifPrefs";
import { sendPushToSelf, type PushKind } from "@/lib/sendPush";
import { safeLocalStorage } from "@/lib/safeStorage";

type PrefKey =
  | "notif_new_order"
  | "notif_unpaid"
  | "notif_inventory"
  | "notif_morning"
  | "notif_evening"
  | "notif_milestone";

export async function notifySituation(params: {
  kind: PushKind;
  title: string;
  body: string;
  link?: string;
  prefKey?: PrefKey;
  dedupeKey?: string;
}) {
  if (params.prefKey && !isPrefEnabled(params.prefKey)) return { skipped: true };
  if (params.dedupeKey) {
    const key = `bossify_notified_${params.dedupeKey}`;
    if (safeLocalStorage.getItem(key) === "1") return { skipped: true };
    safeLocalStorage.setItem(key, "1");
  }

  const [local, push] = await Promise.allSettled([
    localNotify(params.title, params.body, { route: params.link ?? "/" }),
    sendPushToSelf({
      kind: params.kind,
      title: params.title,
      body: params.body,
      link: params.link,
    }),
  ]);

  return { local, push };
}