"use client";

import { useState } from "react";

export function useHistory() {
  const [open, setOpen] = useState(false);

  return {
    open,
    setOpen,
    toggle: () => setOpen((v) => !v),
  };
}
