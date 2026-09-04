// DS ASCII logo for the CLI's neofetch-style banner.

const DS_LOGO = [
  '  ██████╗ ███████╗    ██████╗     █████╗     ███╗   ███╗██╗     ██╗    ███████╗███╗   ██╗ ██████╗ ██████╗ ███████╗',
  '  ██╔══██╗██╔════╝    ██╔══██╗   ██╔══██╗    ████╗ ████║██║     ██║    ██╔════╝████╗  ██║██╔════╝██╔═══██╗██╔════╝',
  '  ██║  ██║███████╗    ██████╔╝   ███████║    ██╔████╔██║██║ █╗ ██║    █████╗  ██╔██╗ ██║██║     ██║   ██║███████╗',
  '  ██║  ██║╚════██║    ██╔══██╗   ██╔══██║    ██║╚██╔╝██║██║███╗██║    ██╔══╝  ██║╚██╗██║██║     ██║   ██║╚════██║',
  '  ██████╔╝███████║    ██████╔╝   ██║  ██║    ██║ ╚══╝ ██║╚███╔███╔╝    ███████╗██║ ╚████║╚██████╗╚██████╔╝███████║',
  '  ╚═════╝ ╚══════╝    ╚═════╝    ╚═╝  ╚═╝    ╚═╝     ╚═╝ ╚══╝╚══╝     ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝',
];

// The right-side info block (aligned next to the logo)
const INFO = [
  'DS - AMLI TOOLS CLI',
  '────────────────────────',
  'Platform: AMLI Enc/Dec',
  'Shell: AMLI-SH 1.0.0',
  'Editor: React 19 + Vite',
  'Crypto: Web Crypto (AES-GCM/CBC/RSA)',
  'Database: Firestore + Convex',
  'Deploy: Netlify Functions',
  '',
  'Type "help" to get started',
];

export function getDSBanner() {
  // Returns array of {logo: string, info: string} for side-by-side rendering
  const lines = [];
  const maxRows = Math.max(DS_LOGO.length, INFO.length);
  for (let i = 0; i < maxRows; i++) {
    lines.push({
      logo: DS_LOGO[i] || '',
      info: INFO[i] || '',
    });
  }
  // Add a swatch row
  lines.push({
    logo: '',
    info: '██╗   ██╗   ██╗   ██╗',
    isSwatch: true,
  });
  return lines;
}

export function getDSLogoLines() {
  return [...DS_LOGO];
}