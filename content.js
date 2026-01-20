const STEP_TIMEOUT_MS = 8000;
const FLOW_MAX_ATTEMPTS = 5;

const SETTINGS_KEY = "chatgptModelSelectorSettings";

const DEFAULT_SETTINGS = {
  modelName: "ChatGPT 5.1 thinking",
  retryIntervalMs: 800,
  selectors: {
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
    modelTarget: [
      "button[data-testid='model-chatgpt-5-1-thinking']",
      "button[aria-label*='ChatGPT 5.1 thinking']",
    ],
  },
};

const TEXT_FALLBACKS = {
  leftTopButton: ["新しいチャット", "New chat"],
  modelDropdown: ["モデル", "Model"],
  legacyModel: ["レガシー", "Legacy"],
};

let currentSettings = DEFAULT_SETTINGS;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getStoredSettings = () =>
  new Promise((resolve) => {
    chrome.storage.sync.get(SETTINGS_KEY, (result) => {
      resolve(result[SETTINGS_KEY]);
    });
  });

const setStoredSettings = (settings) =>
  new Promise((resolve) => {
    chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, () => resolve());
  });

const mergeSettings = (storedSettings) => {
  const mergedSelectors = {
    ...DEFAULT_SETTINGS.selectors,
    ...(storedSettings?.selectors ?? {}),
  };

  return {
    ...DEFAULT_SETTINGS,
    ...(storedSettings ?? {}),
    selectors: mergedSelectors,
  };
};

const ensureSettings = async () => {
  const storedSettings = await getStoredSettings();
  const mergedSettings = mergeSettings(storedSettings);
  const needsUpdate =
    !storedSettings ||
    JSON.stringify(storedSettings) !== JSON.stringify(mergedSettings);

  if (needsUpdate) {
    await setStoredSettings(mergedSettings);
  }

  currentSettings = mergedSettings;
  return mergedSettings;
};

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

const waitForElement = async ({ selectors, texts, timeoutMs, retryIntervalMs }) => {
  const endTime = Date.now() + timeoutMs;
  while (Date.now() < endTime) {
    const bySelector = findBySelectors(selectors);
    if (bySelector) return bySelector;
    const byText = findByText(texts);
    if (byText) return byText;
    await sleep(retryIntervalMs);
  }
  return null;
};

const clickStep = async ({
  label,
  selectors,
  texts,
  retryIntervalMs,
}) => {
  const element = await waitForElement({
    selectors,
    texts,
    timeoutMs: STEP_TIMEOUT_MS,
    retryIntervalMs,
  });
  if (!element) {
    console.warn(`ChatGPT Model Selector: ${label} not found.`);
    return false;
  }
  element.click();
  return true;
};

const isNewChatState = () => {
  const hasComposer = Boolean(
    findBySelectors(currentSettings.selectors.newChatStateSentinel)
  );
  const hasConversation = Boolean(
    findBySelectors(currentSettings.selectors.conversationTurn)
  );
  return hasComposer && !hasConversation;
};

const runSelectionFlow = async () => {
  const { selectors, retryIntervalMs, modelName } = currentSettings;

  for (let attempt = 1; attempt <= FLOW_MAX_ATTEMPTS; attempt += 1) {
    console.debug(
      `ChatGPT Model Selector: attempt ${attempt}/${FLOW_MAX_ATTEMPTS}`
    );
    const leftButtonClicked = await clickStep({
      label: "left top button",
      selectors: selectors.leftTopButton,
      texts: TEXT_FALLBACKS.leftTopButton,
      retryIntervalMs,
    });
    if (!leftButtonClicked) continue;

    const dropdownClicked = await clickStep({
      label: "model dropdown",
      selectors: selectors.modelDropdown,
      texts: TEXT_FALLBACKS.modelDropdown,
      retryIntervalMs,
    });
    if (!dropdownClicked) continue;

    const legacyClicked = await clickStep({
      label: "legacy model",
      selectors: selectors.legacyModel,
      texts: TEXT_FALLBACKS.legacyModel,
      retryIntervalMs,
    });
    if (!legacyClicked) continue;

    const modelClicked = await clickStep({
      label: modelName,
      selectors: selectors.modelTarget,
      texts: [modelName],
      retryIntervalMs,
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

const onReady = async () => {
  await ensureSettings();
  observeNewChat();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", onReady, { once: true });
} else {
  onReady();
}
