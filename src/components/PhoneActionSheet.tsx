import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Phone, MessageCircle } from "lucide-react";

export function PhoneActionSheet({
  phone, name, open, onOpenChange,
}: { phone: string | null; name?: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  if (!phone) return null;
  const cleaned = phone.replace(/[^0-9]/g, "");
  const close = () => onOpenChange(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-center">{name || phone}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-2 mt-4">
          <a href={`tel:${phone}`} onClick={close}
             className="flex items-center gap-3 h-12 px-4 rounded-xl bg-muted active:scale-[.98]">
            <Phone className="h-5 w-5 text-primary" />
            <span className="font-medium">📞 Call {phone}</span>
          </a>
          <a href={`https://wa.me/${cleaned}`} target="_blank" rel="noreferrer" onClick={close}
             className="flex items-center gap-3 h-12 px-4 rounded-xl bg-emerald-50 text-emerald-800 active:scale-[.98]">
            <MessageCircle className="h-5 w-5" />
            <span className="font-medium">📲 WhatsApp</span>
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}
