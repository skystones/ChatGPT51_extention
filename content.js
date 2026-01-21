const STEP_TIMEOUT_MS = 8000;
const FLOW_MAX_ATTEMPTS = 5;

const SETTINGS_KEY = "chatgptModelSelectorSettings";

const DEFAULT_SETTINGS = {
  modelName: "GPT-5.1 Thinking",
  retryIntervalMs: 800,
  selectors: {
    newChatStateSentinel: [
      "[data-composer-surface='true']",
      "textarea[name='prompt-textarea']",
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
      "button[data-testid='model-switcher-dropdown-button']",
      "button[aria-label='モデルセレクター']",
      "button[aria-label='Model picker']",
      "button[data-testid='model-picker']",
      "button[aria-haspopup='listbox']",
      "button[aria-haspopup='menu']",
    ],
    legacyModel: [
      "button[aria-label*='レガシー']",
      "button[data-testid='model-legacy']",
      "button[aria-label*='Legacy']",
    ],
    modelTarget: [
      "button[data-testid='model-chatgpt-5-1-thinking']",
      "button[aria-label*='GPT-5.1 Thinking']",
      "button[aria-label*='ChatGPT 5.1 thinking']",
    ],
  },
};

const TEXT_FALLBACKS = {
  leftTopButton: ["新しいチャット", "New chat"],
  modelDropdown: ["モデルセレクター", "モデル", "Model"],
  legacyModel: ["レガシー モデル", "レガシー", "Legacy"],
};

let currentSettings = DEFAULT_SETTINGS;

const isRootChatGPTPage = () =>
  location.hostname === "chatgpt.com" &&
  location.pathname === "/" &&
  !location.search;

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
    document.querySelectorAll(
      "button, [role='button'], [role='tab'], [role='menuitem'], a"
    )
  );

  return (
    candidates.find((element) => {
      const content = element.textContent?.trim() ?? "";
      return texts.some((text) => content.includes(text));
    }) || null
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

const hoverElement = (element) => {
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;

  [
    "pointerover",
    "pointerenter",
    "mouseover",
    "mouseenter",
    "mousemove",
  ].forEach((type) => {
    element.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
      })
    );
  });
};

const hoverLegacyIfPresent = (selectors, texts) => {
  const element = findBySelectors(selectors) || findByText(texts);

  if (!element) {
    console.debug(
      "ChatGPT Model Selector: legacy model group not present, skipping hover."
    );
    return;
  }

  hoverElement(element);
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

    hoverLegacyIfPresent(selectors.legacyModel, TEXT_FALLBACKS.legacyModel);

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
  if (!isRootChatGPTPage()) {
    return;
  }
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
