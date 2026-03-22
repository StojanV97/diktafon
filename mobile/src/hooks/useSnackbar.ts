import { useState, useCallback } from "react";

export function useSnackbar() {
  const [snackbar, setSnackbar] = useState("");
  const dismissSnackbar = useCallback(() => setSnackbar(""), []);
  return { snackbar, setSnackbar, dismissSnackbar };
}
