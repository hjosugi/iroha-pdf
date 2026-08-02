/** Native design tokens. React Native has no CSS custom properties. */
export const SPACE = {
  hairline: 1,
  xxs: 3,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const CONTROL = {
  swatch: 36,
  minimum: 44,
  comfortable: 48,
  card: 72,
} as const;

export const TYPE = {
  caption: 11,
  label: 12,
  body: 14,
  heading: 16,
  title: 28,
} as const;

export const LINE_HEIGHT = {
  body: 20,
} as const;

export const TRACKING = {
  tight: -1.1,
  normal: 1,
  wide: 1.4,
} as const;

export const LAYOUT = {
  readable: 760,
  editor: 840,
  dialog: 520,
} as const;

export const COLOR = {
  brand: '#2B5CFF',
  background: '#F6F7F9',
  canvas: '#E2E4E8',
  surface: '#FFFFFF',
  control: '#ECEEF2',
  border: '#E3E5E9',
  text: '#171B24',
  muted: '#6D7480',
  success: '#16835F',
} as const;
