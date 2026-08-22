import { createDarkTheme } from '@fluentui/react-components';

// GitHub-blue brand ramp (dark → light) so Fluent accents match the GitHub look.
const githubBrand = {
  10: '#020c1c',
  20: '#04162f',
  30: '#052142',
  40: '#062b55',
  50: '#083668',
  60: '#0a417b',
  70: '#0c4c8e',
  80: '#1257a6',
  90: '#1f6feb',
  100: '#2f81f7',
  110: '#4993f8',
  120: '#64a5f9',
  130: '#80b7fa',
  140: '#9cc9fb',
  150: '#b9dbfc',
  160: '#d6edfe',
};

const base = createDarkTheme(githubBrand);

// Override neutral tokens with GitHub dark surface colours for a cohesive shell.
export const githubDarkTheme = {
  ...base,
  colorNeutralBackground1: '#0d1117',
  colorNeutralBackground1Hover: '#161b22',
  colorNeutralBackground1Pressed: '#0a0d12',
  colorNeutralBackground2: '#161b22',
  colorNeutralBackground3: '#21262d',
  colorNeutralBackground4: '#0d1117',
  colorNeutralBackgroundDisabled: '#161b22',
  colorNeutralStroke1: '#30363d',
  colorNeutralStroke2: '#21262d',
  colorNeutralStroke3: '#21262d',
  colorNeutralStrokeAccessible: '#8b949e',
  colorNeutralForeground1: '#e6edf3',
  colorNeutralForeground2: '#c9d1d9',
  colorNeutralForeground3: '#8b949e',
  colorNeutralForegroundDisabled: '#484f58',
  colorSubtleBackgroundHover: '#21262d',
  colorSubtleBackgroundPressed: '#161b22',
  colorBrandForegroundLink: '#2f81f7',
  colorBrandForegroundLinkHover: '#4993f8',
  fontFamilyBase:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
};
