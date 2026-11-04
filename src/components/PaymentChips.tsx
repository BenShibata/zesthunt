import type { PaymentOptions } from "@/lib/types";
import { BagIcon, CardIcon, CashIcon, TapIcon } from "./Icons";

type Chip = { key: string; label: string; Icon: typeof CardIcon };

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

/**
 * One quiet line in a pick's details ("Pays by tap or card"), instead of a chip on the photo
 * that competes with the decision. "Cash only" stands out, since it can change your mind.
 * Unknown = nothing.
 */
export function PaymentLine({ payment }: { payment: PaymentOptions | null }) {
  if (!payment) return null;
  if (payment.acceptsCashOnly) {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-star/15 px-2.5 py-1 text-sm font-semibold text-star">
        <CashIcon size={15} />
        Cash only
      </p>
    );
  }
  const ways = [payment.acceptsNfc && "tap", (payment.acceptsCreditCards || payment.acceptsDebitCards) && "card"].filter(Boolean);
  if (ways.length === 0) return null;
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-sm text-white/60">
      {payment.acceptsNfc ? <TapIcon size={15} /> : <CardIcon size={15} />}
      Pays by {ways.join(" or ")}
    </p>
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
