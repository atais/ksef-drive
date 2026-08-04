// Minimal i18n: flat key -> {pl, en} dict, one runes signal for the active language.
import { pl } from './i18n/pl'
import { en } from './i18n/en'

const DICTS = { pl, en } as const
export type Lang = keyof typeof DICTS
export type TranslationKey = keyof typeof pl

const STORAGE_KEY = 'ksef-gdrive-lang'

function detectLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'pl' || stored === 'en') return stored
  return navigator.language.toLowerCase().startsWith('pl') ? 'pl' : 'en'
}

class I18n {
  lang = $state<Lang>(detectLang())

  setLang(lang: Lang) {
    this.lang = lang
    localStorage.setItem(STORAGE_KEY, lang)
  }

  t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    const template = DICTS[this.lang][key] ?? DICTS.pl[key] ?? key
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (match, name) => String(params[name] ?? match))
  }
}

export const i18n = new I18n()
