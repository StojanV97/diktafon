import { I18n } from "i18n-js";
import * as RNLocalize from "react-native-localize";
import sr from "./locales/sr";
import en from "./locales/en";

const i18n = new I18n({ sr, en });

const locales = RNLocalize.getLocales();
i18n.locale = locales[0]?.languageCode ?? "sr";
i18n.defaultLocale = "sr";
i18n.enableFallback = true;

export function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options);
}

export default i18n;
