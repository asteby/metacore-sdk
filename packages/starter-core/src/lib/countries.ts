// ISO 3166-1 alpha-2 country codes
// Names are resolved at runtime via Intl.DisplayNames for proper localization
const countryCodes = [
  "AR","AT","AU","AE","AL","AO","AZ","BA","BB","BD","BE","BG","BH","BO","BR","BS","BY","BZ",
  "CA","CD","CH","CI","CL","CM","CN","CO","CR","CU","CY","CZ",
  "DE","DK","DO","DZ",
  "EC","EE","EG","ES","ET","SV",
  "FI","FJ","FR",
  "GB","GE","GH","GR","GT","GY",
  "HK","HN","HR","HT","HU",
  "ID","IE","IL","IN","IQ","IR","IS","IT",
  "JM","JO","JP",
  "KE","KH","KR","KW","KZ",
  "LA","LB","LK","LT","LU","LV","LY",
  "MA","MD","ME","MK","MM","MN","MT","MU","MX","MY","MZ",
  "NG","NI","NL","NO","NP","NZ",
  "OM",
  "PA","PE","PG","PH","PK","PL","PR","PT","PY",
  "QA",
  "RO","RS","RU","RW",
  "SA","SE","SG","SI","SK","SN","SR",
  "TH","TN","TR","TT","TW","TZ",
  "UA","UG","US","UY","UZ",
  "VE","VN",
  "ZA",
] as const

// Convert country code to flag emoji
function codeToFlag(code: string): string {
  return String.fromCodePoint(
    ...code.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
  )
}

export interface Country {
  code: string
  name: string
  flag: string
}

export function getCountries(locale?: string): Country[] {
  const lang = locale || navigator.language || 'es'
  const displayNames = new Intl.DisplayNames([lang], { type: 'region' })

  return countryCodes.map(code => ({
    code,
    name: displayNames.of(code) || code,
    flag: codeToFlag(code),
  })).sort((a, b) => a.name.localeCompare(b.name, lang))
}
