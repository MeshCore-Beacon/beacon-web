import { useContext, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { InfoTip } from "../../components/InfoTip";
import { SectionInfoSlot } from "./section-info-slot";

// Sits beside the section chooser in the analytics bar; a tab rendered outside it keeps the tip in place.
export function SectionInfo({ text }: ComponentProps<typeof InfoTip>) {
  const slot = useContext(SectionInfoSlot);
  return slot ? createPortal(<InfoTip text={text} />, slot) : <InfoTip text={text} />;
}
