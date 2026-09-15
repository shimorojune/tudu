function isBlockingDialogElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return true;
  }

  if (element.classList.contains("tiptap-search-replace")) {
    return element.getAttribute("data-open") === "true";
  }

  const state = element.getAttribute("data-state");
  if (state === "closed") {
    return false;
  }

  if (element.getAttribute("data-slot") === "dialog-content") {
    return state === "open";
  }

  if (element.getAttribute("role") === "alertdialog") {
    return state === "open" || state === null;
  }

  if (state === "open") {
    return true;
  }

  return state === null;
}

export function isCommandPaletteBlocked(): boolean {
  const candidates = document.querySelectorAll(
    "[role='dialog'],[role='alertdialog']",
  );
  for (const element of candidates) {
    if (isBlockingDialogElement(element)) {
      return true;
    }
  }
  return false;
}
