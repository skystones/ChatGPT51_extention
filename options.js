const SETTINGS_KEY = "chatgptModelSelectorSettings";

const DEFAULT_SETTINGS = {
  modelName: "GPT-5.1 Thinking",
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

  return mergedSettings;
};

const parseSelectors = (value) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const selectorsToText = (selectors) => selectors.join("\n");

const updateStatus = (message) => {
  const status = document.getElementById("status");
  status.textContent = message;
  if (message) {
    setTimeout(() => {
      status.textContent = "";
    }, 2000);
  }
};

const form = document.getElementById("options-form");

const fieldIds = [
  "modelName",
  "retryIntervalMs",
  "newChatStateSentinel",
  "conversationTurn",
  "leftTopButton",
  "modelDropdown",
  "legacyModel",
  "modelTarget",
];

const resetForm = async () => {
  const settings = await ensureSettings();

  document.getElementById("modelName").value = settings.modelName;
  document.getElementById("retryIntervalMs").value = settings.retryIntervalMs;
  document.getElementById("newChatStateSentinel").value = selectorsToText(
    settings.selectors.newChatStateSentinel
  );
  document.getElementById("conversationTurn").value = selectorsToText(
    settings.selectors.conversationTurn
  );
  document.getElementById("leftTopButton").value = selectorsToText(
    settings.selectors.leftTopButton
  );
  document.getElementById("modelDropdown").value = selectorsToText(
    settings.selectors.modelDropdown
  );
  document.getElementById("legacyModel").value = selectorsToText(
    settings.selectors.legacyModel
  );
  document.getElementById("modelTarget").value = selectorsToText(
    settings.selectors.modelTarget
  );
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const nextSettings = {
    modelName: document.getElementById("modelName").value.trim(),
    retryIntervalMs: Number(
      document.getElementById("retryIntervalMs").value
    ),
    selectors: {
      newChatStateSentinel: parseSelectors(
        document.getElementById("newChatStateSentinel").value
      ),
      conversationTurn: parseSelectors(
        document.getElementById("conversationTurn").value
      ),
      leftTopButton: parseSelectors(
        document.getElementById("leftTopButton").value
      ),
      modelDropdown: parseSelectors(
        document.getElementById("modelDropdown").value
      ),
      legacyModel: parseSelectors(
        document.getElementById("legacyModel").value
      ),
      modelTarget: parseSelectors(
        document.getElementById("modelTarget").value
      ),
    },
  };

  await setStoredSettings(mergeSettings(nextSettings));
  updateStatus("保存しました。");
});

form.addEventListener("reset", (event) => {
  event.preventDefault();
  resetForm();
  updateStatus("初期値に戻しました。");
});

fieldIds.forEach((id) => {
  const element = document.getElementById(id);
  element.addEventListener("input", () => updateStatus(""));
});

resetForm();
