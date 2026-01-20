const startModelSelection = () => {
  console.debug("ChatGPT Model Selector: initializing model selection flow.");

  // TODO: Replace with actual model selection logic.
};

const onReady = () => {
  startModelSelection();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", onReady, { once: true });
} else {
  onReady();
}
