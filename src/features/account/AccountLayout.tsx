import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useView } from "./useView";

export function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-left text-sm text-primary underline underline-offset-2 hover:text-text-bright">
      {children}
    </button>
  );
}

// One centred column; fills a phone with comfortable padding.
export function AccountLayout({ title, children, links }: { title: string; children: ReactNode; links?: ReactNode }) {
  const { t } = useTranslation();
  const { close } = useView();
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-5 px-4 py-8 sm:py-12">
        <h1 className="font-mono text-lg font-semibold text-text-bright">{title}</h1>
        {children}
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
          {links}
          <LinkButton onClick={close}>{t("account.back")}</LinkButton>
        </div>
      </div>
    </div>
  );
}
