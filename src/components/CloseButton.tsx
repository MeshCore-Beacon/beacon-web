// Shared dismiss control: a bold X with a hover background. Larger tap target on mobile, compact at md+.
export function CloseButton({ onClose, label = "Close", className }: {
  onClose: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className={`flex items-center justify-center w-9 h-9 md:w-7 md:h-7 rounded text-text-muted hover:text-text-bright hover:bg-text-normal/5 cursor-pointer transition-colors ${className ?? ""}`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
