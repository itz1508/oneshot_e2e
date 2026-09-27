import React, { ReactNode } from "react";
import { useOverlayFocus } from "../../lib/useOverlayFocus";

export interface DrawerShellProps {
  id: string;
  isOpen: boolean;
  onClose: () => void;
  ariaLabel: string;
  dataTestId?: string;
  closeButtonId?: string;
  closeButton?: ReactNode;
  headerContent: ReactNode;
  subHeader?: ReactNode;
  children: ReactNode;
  className?: string;
}

export const DrawerShell: React.FC<DrawerShellProps> = ({
  id,
  isOpen,
  onClose,
  ariaLabel,
  dataTestId,
  closeButtonId = "closeDrawerBtn",
  closeButton,
  headerContent,
  subHeader,
  children,
  className = "",
}) => {
  const drawerRef = useOverlayFocus<HTMLDivElement>(isOpen, onClose);

  return (
    <div
      ref={drawerRef}
      id={id}
      className={`context-review-drawer ${isOpen ? "open" : ""} ${className}`.trim()}
      aria-hidden={!isOpen}
      aria-label={ariaLabel}
      role="dialog"
      aria-modal="true"
      inert={!isOpen}
      data-testid={dataTestId}
    >
      {/* Header */}
      <div className="min-h-[52px] px-4 flex items-center justify-between border-b border-white/[0.075] bg-[#141416]">
        {headerContent}
        {closeButton || (
          <button
            id={closeButtonId}
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="w-7 h-7 shrink-0 rounded-lg bg-transparent hover:bg-white/10 text-[#8e8e93] hover:text-white grid place-items-center text-sm transition-colors"
          >
            ×
          </button>
        )}
      </div>

      {/* SubHeader / Navigation Tabs */}
      {subHeader}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {children}
      </div>
    </div>
  );
};
