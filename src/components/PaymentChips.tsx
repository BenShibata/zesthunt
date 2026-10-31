import type { PaymentOptions } from "@/lib/types";
import { BagIcon, CardIcon, CashIcon, TapIcon } from "./Icons";

type Chip = { key: string; label: string; Icon: typeof CardIcon };

/** Single most useful payment fact for the photo overlay. Unknown = nothing. */
export function primaryPayment(p: PaymentOptions | null): Chip | null {
  if (!p) return null;
  if (p.acceptsCashOnly) return { key: "cash", label: "Cash only", Icon: CashIcon };
  if (p.acceptsNfc) return { key: "nfc", label: "Tap to pay", Icon: TapIcon };
  if (p.acceptsCreditCards || p.acceptsDebitCards) return { key: "cards", label: "Cards", Icon: CardIcon };
  return null;
}

/** All known payment facts for the locked-in sheet. Never guesses. */
export function paymentChips(p: PaymentOptions | null, hasOnlineOrdering: boolean): Chip[] {
  const chips: Chip[] = [];
  if (p?.acceptsCashOnly) {
    chips.push({ key: "cash", label: "Cash only", Icon: CashIcon });
  } else if (p) {
    if (p.acceptsNfc) chips.push({ key: "nfc", label: "Tap to pay", Icon: TapIcon });
    if (p.acceptsCreditCards || p.acceptsDebitCards) chips.push({ key: "cards", label: "Cards", Icon: CardIcon });
  }
  if (hasOnlineOrdering) chips.push({ key: "online", label: "Online ordering", Icon: BagIcon });
  return chips;
}

export function OverlayPaymentChip({ payment }: { payment: PaymentOptions | null }) {
  const chip = primaryPayment(payment);
  if (!chip) return null;
  const { Icon, label } = chip;
  return (
    <span className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/55 px-3 text-sm font-medium text-white backdrop-blur-md">
      <Icon size={16} />
      {label}
    </span>
  );
}

export function SheetPaymentChips({ payment, hasOnlineOrdering }: { payment: PaymentOptions | null; hasOnlineOrdering: boolean }) {
  const chips = paymentChips(payment, hasOnlineOrdering);
  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="How to pay">
      {chips.map(({ key, label, Icon }) => (
        <li
          key={key}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-sheet-ink/15 bg-white/70 px-3 text-sm font-medium text-sheet-ink dark:border-white/15 dark:bg-white/5 dark:text-white"
        >
          <Icon size={16} />
          {label}
        </li>
      ))}
    </ul>
  );
}
