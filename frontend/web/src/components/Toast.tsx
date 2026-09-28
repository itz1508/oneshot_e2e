import React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type?: "info" | "success" | "warning" | "error";
  duration?: number;
}

interface ToastContextValue {
  toast: (msg: Omit<ToastMessage, "id">) => void;
}

const ToastContext = React.createContext<ToastContextValue>({
  toast: () => {},
});

export const useToast = () => React.useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const toast = React.useCallback((msg: Omit<ToastMessage, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { ...msg, id }]);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((t) => {
          const borderColor =
            t.type === "success"
              ? "border-[#62c48d]/40"
              : t.type === "error"
              ? "border-[#ea4335]/40"
              : t.type === "warning"
              ? "border-[#e5a84b]/40"
              : "border-white/10";

          const bgDot =
            t.type === "success"
              ? "bg-[#62c48d]"
              : t.type === "error"
              ? "bg-[#ea4335]"
              : t.type === "warning"
              ? "bg-[#e5a84b]"
              : "bg-[#79a8ea]";

          return (
            <ToastPrimitive.Root
              key={t.id}
              duration={t.duration || 4000}
              onOpenChange={(open) => {
                if (!open) removeToast(t.id);
              }}
              className={`flex items-start gap-3 p-3 rounded-xl border ${borderColor} bg-[#181b21] shadow-2xl transition-all data-[state=open]:animate-in data-[state=closed]:animate-out`}
            >
              <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${bgDot}`} />
              <div className="flex-1">
                <ToastPrimitive.Title className="text-xs font-semibold text-[#f2f2f3]">
                  {t.title}
                </ToastPrimitive.Title>
                {t.description && (
                  <ToastPrimitive.Description className="text-[11px] text-[#838d9a] mt-0.5">
                    {t.description}
                  </ToastPrimitive.Description>
                )}
              </div>
              <ToastPrimitive.Close className="text-[#838d9a] hover:text-white text-xs px-1 cursor-pointer">
                ×
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[999] flex flex-col gap-2 w-80 max-w-[calc(100vw-32px)] m-0 list-none p-0 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
};
