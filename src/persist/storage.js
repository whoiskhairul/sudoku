let storageWarningShown = false;

export const warnStorageUnavailable = () => {
  if (storageWarningShown) return;
  storageWarningShown = true;
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("sv-snack", {
          detail: { message: "Local storage is unavailable. Progress will not be saved." },
        }),
      );
    }
  } catch (e) {}
};

export const storage = {
  get(key) {
    try {
      return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    } catch (e) {
      return null;
    }
  },
  set(key, value) {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, value);
        return true;
      }
      return false;
    } catch (e) {
      warnStorageUnavailable();
      return false;
    }
  },
  remove(key) {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(key);
      }
    } catch (e) {}
  },
  keys() {
    try {
      return typeof localStorage !== "undefined" ? Object.keys(localStorage) : [];
    } catch (e) {
      return [];
    }
  },
};

export const readJSON = (key, fallback) => {
  try {
    const raw = storage.get(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

export const writeJSON = (key, value) => {
  try {
    return storage.set(key, JSON.stringify(value));
  } catch {
    return false;
  }
};

