export const colors = {
  primary: "#0F6B5C",
  primaryDeep: "#0B4F44",
  onPrimary: "#FFFFFF",
  primarySoft: "#E3F1EE",
  paper: "#FAFAF8",
  paperDeep: "#EFEEE9",
  ink: "#161613",
  muted: "#4A4944",
  faint: "#726F68",
  line: "#DAD8D0",
  lineStrong: "#B9B6AC",
  danger: "#8A1F1F",
  dangerSoft: "#F7E6E6",
  onDanger: "#FFFFFF",
  ok: "#1F6B3A",
  okSoft: "#E5F1E9",
  warn: "#7A5200",
  warnSoft: "#F6EDDA",
  offline: "#5C5A54",
  offlineSoft: "#EDECE7",
  sos: "#B3261E",
  sosSoft: "#FBE6E4",
} as const;

export const typography = {
  moradorNumero: {
    fontSize: 34,
    fontWeight: "700" as const,
    lineHeight: 40,
  },
  moradorTitulo: {
    fontSize: 26,
    fontWeight: "700" as const,
    lineHeight: 32,
  },
  moradorBotao: {
    fontSize: 22,
    fontWeight: "700" as const,
    lineHeight: 28,
  },
  cuidadorScreenTitle: {
    fontSize: 22,
    fontWeight: "700" as const,
    lineHeight: 28,
  },
  cuidadorHeadingCard: {
    fontSize: 17,
    fontWeight: "600" as const,
    lineHeight: 22,
  },
  bodyMd: {
    fontSize: 16,
    fontWeight: "400" as const,
    lineHeight: 23,
  },
  bodyLg: {
    fontSize: 18,
    fontWeight: "400" as const,
    lineHeight: 26,
  },
  caption: {
    fontSize: 14,
    fontWeight: "400" as const,
    lineHeight: 20,
  },
  buttonMd: {
    fontSize: 16,
    fontWeight: "600" as const,
    lineHeight: 20,
  },
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  screenGutter: 16,
} as const;

export const rounded = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;
