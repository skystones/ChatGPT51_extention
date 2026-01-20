const RETRY_INTERVAL_MS = 800;
const STEP_TIMEOUT_MS = 8000;
const FLOW_MAX_ATTEMPTS = 5;

const SELECTORS = {
  newChatStateSentinel: [
    "textarea[aria-label='Message']",
    "textarea[data-testid='prompt-textarea']",
    "textarea[placeholder*='Message']",
  ],
  conversationTurn: ["[data-testid='conversation-turn']"],
  leftTopButton: [
    "button[aria-label='New chat']",
    "a[aria-label='New chat']",
    "button[data-testid='new-chat-button']",
  ],
  modelDropdown: [
    "button[aria-label='Model picker']",
    "button[data-testid='model-picker']",
    "button[aria-haspopup='listbox']",
  ],
  legacyModel: [
    "button[data-testid='model-legacy']",
    "button[aria-label*='Legacy']",
  ],
  chatgpt51Thinking: [
    "button[data-testid='model-chatgpt-5-1-thinking']",
    "button[aria-label*='ChatGPT 5.1 thinking']",
  ],
};

const TEXT_FALLBACKS = {
  leftTopButton: ["新しいチャット", "New chat"],
  modelDropdown: ["モデル", "Model"],
  legacyModel: ["レガシー", "Legacy"],
  chatgpt51Thinking: ["ChatGPT 5.1 thinking"],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const findBySelectors = (selectors) => {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
};

const findByText = (texts) => {
  if (!texts?.length) return null;
  const candidates = Array.from(
    document.querySelectorAll("button, [role='button'], a")
  );
  return (
    candidates.find((element) =>
      texts.some((text) => element.textContent?.trim() === text)
    ) || null
  );
};

const waitForElement = async ({ selectors, texts, timeoutMs }) => {
  const endTime = Date.now() + timeoutMs;
  while (Date.now() < endTime) {
    const bySelector = findBySelectors(selectors);
    if (bySelector) return bySelector;
    const byText = findByText(texts);
    if (byText) return byText;
    await sleep(RETRY_INTERVAL_MS);
  }
  return null;
};

const clickStep = async ({ label, selectors, texts }) => {
  const element = await waitForElement({
    selectors,
    texts,
    timeoutMs: STEP_TIMEOUT_MS,
  });
  if (!element) {
    console.warn(`ChatGPT Model Selector: ${label} not found.`);
    return false;
  }
  element.click();
  return true;
};

const isNewChatState = () => {
  const hasComposer = Boolean(findBySelectors(SELECTORS.newChatStateSentinel));
  const hasConversation = Boolean(
    findBySelectors(SELECTORS.conversationTurn)
  );
  return hasComposer && !hasConversation;
};

const runSelectionFlow = async () => {
  for (let attempt = 1; attempt <= FLOW_MAX_ATTEMPTS; attempt += 1) {
    console.debug(
      `ChatGPT Model Selector: attempt ${attempt}/${FLOW_MAX_ATTEMPTS}`
    );
    const leftButtonClicked = await clickStep({
      label: "left top button",
      selectors: SELECTORS.leftTopButton,
      texts: TEXT_FALLBACKS.leftTopButton,
    });
    if (!leftButtonClicked) continue;

    const dropdownClicked = await clickStep({
      label: "model dropdown",
      selectors: SELECTORS.modelDropdown,
      texts: TEXT_FALLBACKS.modelDropdown,
    });
    if (!dropdownClicked) continue;

    const legacyClicked = await clickStep({
      label: "legacy model",
      selectors: SELECTORS.legacyModel,
      texts: TEXT_FALLBACKS.legacyModel,
    });
    if (!legacyClicked) continue;

    const modelClicked = await clickStep({
      label: "ChatGPT 5.1 thinking",
      selectors: SELECTORS.chatgpt51Thinking,
      texts: TEXT_FALLBACKS.chatgpt51Thinking,
    });
    if (modelClicked) return true;
  }

  console.warn("ChatGPT Model Selector: flow failed after retries.");
  return false;
};

let flowInProgress = false;

const startModelSelection = async () => {
  if (flowInProgress) return;
  if (!isNewChatState()) return;

  flowInProgress = true;
  console.debug("ChatGPT Model Selector: initializing model selection flow.");
  await runSelectionFlow();
  flowInProgress = false;
};

const observeNewChat = () => {
  const observer = new MutationObserver(() => {
    startModelSelection();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  startModelSelection();
};

const onReady = () => {
  observeNewChat();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", onReady, { once: true });
} else {
  onReady();
}
