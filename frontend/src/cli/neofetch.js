// DS ASCII logo for the CLI's neofetch-style banner.

const DS_LOGO = [
  '  ██████╗ ███████╗    ██████╗     █████╗     ███╗   ███╗██╗     ██╗    ███████╗███╗   ██╗ ██████╗ ██████╗ ███████╗',
  '  ██╔══██╗██╔════╝    ██╔══██╗   ██╔══██╗    ████╗ ████║██║     ██║    ██╔════╝████╗  ██║██╔════╝██╔═══██╗██╔════╝',
  '  ██║  ██║███████╗    ██████╔╝   ███████║    ██╔████╔██║██║ █╗ ██║    █████╗  ██╔██╗ ██║██║     ██║   ██║███████╗',
  '  ██║  ██║╚════██║    ██╔══██╗   ██╔══██║    ██║╚██╔╝██║██║███╗██║    ██╔══╝  ██║╚██╗██║██║     ██║   ██║╚════██║',
  '  ██████╔╝███████║    ██████╔╝   ██║  ██║    ██║ ╚═╝ ██║╚███╔███╔╝    ███████╗██║ ╚████║╚██████╗╚██████╔╝███████║',
  '  ╚═════╝ ╚══════╝    ╚═════╝    ╚═╝  ╚═╝    ╚═╝     ╚═╝ ╚══╝╚══╝     ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝',
];

// Info lines aligned with the logo width
const INFO = [
  `${' '.repeat(0)}user@amli`,
  `────────────────`,
  `OS: AMLI Enc/Dec Platform`,
  `Shell: AMLI-SH 1.0.0`,
  `Theme: indigo/cyan`,
  `Pages: 8`,
  `Editor: React 19 + Vite`,
  `Crypto: Web Crypto (AES-GCM/CBC/RSA)`,
  `Uptime: type "about" for details`,
  '',
  `Tip: type "help" to get started`,
];

// Optional color-palette swatch for flair
const SWATCH =
  '██╗   ██╗   ██╗   ██╗';
const swatchColors = ['#6366f1', '#22d3ee', '#10b981', '#f43f5e', '#f59e0b'];

export function getDSBanner() {
  const lines = [];
  const infoCount = INFO.length;
  for (let i = 0; i < infoCount; i++) {
    const logoLine = DS_LOGO[i] !== undefined ? DS_LOGO[i] : '';
    const infoLine = INFO[i] !== undefined ? INFO[i] : '';
    lines.push({ logo: logoLine, info: infoLine, isSwatch: false });
  }
  // swatch row
  lines.push({ logo: '', info: '────────────────', isSwatch: false });
  lines.push({ logo: '', info: SWATCH, isSwatch: true, swatchColors });
  return lines;
}

export function getDSLogoLines() {
  return [...DS_LOGO];
}
