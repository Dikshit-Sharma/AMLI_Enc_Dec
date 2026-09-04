// Command definitions and handlers for the AMLI CLI.
// Handlers receive `ctx` with injected app capabilities.

export const COMMANDS = [
  {
    name: 'help',
    usage: 'help [command]',
    description: 'List all commands, or show details for a specific command.',
    requiresAuth: false,
    aliases: ['?'],
  },
  {
    name: 'about',
    usage: 'about',
    description: 'Show detailed information about the website, the CLI, and all commands.',
    requiresAuth: false,
  },
  {
    name: 'clear',
    usage: 'clear',
    description: 'Clear all terminal history and start fresh.',
    requiresAuth: false,
    aliases: ['cls'],
  },
  {
    name: 'neofetch',
    usage: 'neofetch',
    description: 'Display the DS (Dikshit Sharma) banner and CLV info.',
    requiresAuth: false,
    aliases: ['banner', 'logo'],
  },
  {
    name: 'ds',
    usage: 'ds <command> [args...]  |  ds login',
    description: 'Admin (sudo) mode. Prefix a protected command with "ds", e.g. "ds obsidian export", "ds library", "ds credentials". Prompts for the shared password.',
    requiresAuth: false,
  },
  {
    name: 'open',
    usage: 'open <page>',
    description: 'Navigate to a page: home, artifacts, library, credentials, bsa, clipboard, cipher, export.',
    requiresAuth: false,
    aliases: ['goto', 'cd', 'go'],
  },
  {
    name: 'list',
    usage: 'list <type> [--limit N] [--env ENV]',
    description: 'List records. Types: artifacts, credentials, bsa, clipboards, stats.',
    requiresAuth: false,
    aliases: ['ls'],
  },
  {
    name: 'search',
    usage: 'search <term> [--type lifecycle]',
    description: 'Search across Library artifacts and Credentials.',
    requiresAuth: false,
    aliases: ['find', 'grep'],
  },
  {
    name: 'stats',
    usage: 'stats',
    description: 'Show dashboard statistics (artifact counts, env distribution, recent items).',
    requiresAuth: false,
  },
  {
    name: 'cipher',
    usage: 'cipher <encrypt|decrypt|keygen> [--key KEY] [--algo GCM|CBC] [--data TEXT]',
    description: 'Encrypt/decrypt client-side using the Web Crypto API. No data leaves the browser.',
    requiresAuth: false,
  },
  {
    name: 'theme',
    usage: 'theme <light|dark|toggle>',
    description: 'Switch the application theme.',
    requiresAuth: false,
  },
  {
    name: 'history',
    usage: 'history',
    description: 'Show command history.',
    requiresAuth: false,
  },
  {
    name: 'exit',
    usage: 'exit',
    description: 'Close the CLI terminal.',
    requiresAuth: false,
    aliases: ['quit'],
  },
];

// Commands that are "protected" — require ds/sudo (password) mode
export const PROTECTED = ['library', 'credentials', 'export', 'obsidian', 'password'];

export function getCommand(name) {
  const lower = (name || '').toLowerCase().trim();
  return COMMANDS.find(
    (c) => c.name === lower || (c.aliases || []).includes(lower)
  );
}

export function isProtectedKeyword(word) {
  const w = (word || '').toLowerCase();
  return PROTECTED.includes(w);
}

// --- Rendering helpers -------------------------------------------------------

function ansi(color) {
  const map = {
    red: '\u001b[31m',
    green: '\u001b[32m',
    yellow: '\u001b[33m',
    blue: '\u001b[34m',
    magenta: '\u001b[35m',
    cyan: '\u001b[36m',
    white: '\u001b[37m',
    bold: '\u001b[1m',
    dim: '\u001b[2m',
    reset: '\u001b[0m',
  };
  return map[color] || '';
}

export function colorize(text, color) {
  return `${ansi(color)}${text}${ansi('reset')}`;
}

// --- Public command execution -------------------------------------------------

export async function runCommand(rawLine, ctx) {
  const line = (rawLine || '').trim();
  if (!line) return [];

  const tokens = tokenize(line);
  const first = (tokens[0] || '').toLowerCase();
  const args = tokens.slice(1);
  const rest = args.join(' ');

  // Clear immediately is unauthenticated
  if (first === 'clear' || first === 'cls') {
    ctx.clearHistory();
    return [];
  }

  if (first === 'history') {
    return printHistory(ctx);
  }

  if (first === 'exit' || first === 'quit') {
    ctx.close();
    return [];
  }

  // ds / sudo prefix
  if (first === 'ds') {
    return handleDs(args, ctx);
  }

  const cmd = getCommand(first);
  if (!cmd) {
    return [
      `${colorize('amli', 'cyan')}: command not found: ${colorize(first, 'red')}`,
      'Type "help" to see available commands.',
    ];
  }

  switch (cmd.name) {
    case 'help': return handleHelp(args);
    case 'about': return handleAbout();
    case 'neofetch': return ctx.showBanner();
    case 'open': return handleOpen(args, ctx);
    case 'list': return handleList(args, ctx);
    case 'search': return handleSearch(args, ctx, rest);
    case 'stats': return handleStats(ctx);
    case 'cipher': return handleCipher(args, ctx);
    case 'theme': return handleTheme(args, ctx);
    default: return [`${colorize('amli', 'cyan')}: internal error for ${first}`];
  }
}

// --- Tokenizer ----------------------------------------------------------------

function tokenize(line) {
  // Split respecting double quotes
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    out.push(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
  }
  return out;
}

// --- Handlers ------------------------------------------------------------------

function printHistory(ctx) {
  const hist = ctx.getHistory();
  if (!hist.length) return ['No command history yet.'];
  return [colorize('Command history:', 'bold'), ...hist.map((h, i) => `${String(i + 1).padStart(3)}  ${h}`)];
}

async function handleHelp(args) {
  const target = args[0];
  if (target) {
    const name = target.replace(/^ds\s+/, '');
    const cmd = getCommand(name);
    if (!cmd) return [`Unknown command: ${colorize(name, 'red')}`];
    return [
      `${colorize(cmd.name, 'bold')} ${colorize(cmd.usage, 'cyan')}`,
      '',
      `  ${cmd.description}`,
      `  Requires admin (ds): ${cmd.requiresAuth ? colorize('yes', 'yellow') : colorize('no', 'green')}`,
    ];
  }
  const rows = COMMANDS.map((c) => {
    const aliases = c.aliases && c.aliases.length ? ` (${c.aliases.join(', ')})` : '';
    return `  ${colorize(c.name.padEnd(12), 'cyan')} ${c.description}${aliases}`;
  });
  return [
    colorize('Available commands:', 'bold'),
    ...rows,
    '',
    'Protected commands need "ds" prefix (e.g. "ds library", "ds obsidian export").',
  ];
}

function handleAbout() {
  const lines = [];
  lines.push(colorize('AMLI Enc/Dec — Web Platform CLI', 'bold'));
  lines.push('');
  lines.push(colorize('Website:', 'cyan') + ' AMLI Encryption/Decryption and SOA Documentation platform.');
  lines.push(colorize('Purpose:', 'cyan') + ' Manage SOA artifacts, BSA entries, API credentials, real-time');
  lines.push('           clipboards, client-side AES/RSA crypto, and Obsidian exports.');
  lines.push('');
  lines.push(colorize('Tech stack:', 'cyan'));
  lines.push('  - React 19 + Vite, Javascript (ES Modules)');
  lines.push('  - Firestore (primary) + Convex (real-time clipboards)');
  lines.push('  - Netlify serverless functions');
  lines.push('  - Web Crypto API for AES-GCM/CBC + RSA hybrid');
  lines.push('');
  lines.push(colorize('About this CLI (AMLI-SH):', 'cyan'));
  lines.push('  - A linux-like shell over the entire platform.');
  lines.push('  - Use "ds" (sudo) prefix to access protected pages: library, credentials, export.');
  lines.push('  - Client-side only: nothing sensitive leaves the browser except through existing APIs.');
  lines.push('');
  lines.push(colorize('Commands:', 'cyan'));
  for (const c of COMMANDS) {
    lines.push(`  ${colorize(c.name.padEnd(12), 'green')} ${c.usage}`);
  }
  lines.push('');
  lines.push('Type "help <command>" for details on any command.');
  return lines;
}

function handleOpen(args, ctx) {
  const page = (args[0] || '').toLowerCase();
  const routes = {
    home: '/',
    artifacts: '/artifacts',
    library: '/library',
    credentials: '/credentials',
    bsa: '/bsa',
    clipboard: '/clipboard',
    cipher: '/cipher',
    export: '/export',
    obsidian: '/export',
    dashboard: '/',
  };
  const path = routes[page];
  if (!path) {
    return [`Unknown page: ${colorize(page || '(none)', 'red')}. Pages: ${Object.keys(routes).join(', ')}`];
  }
  ctx.navigate(path);
  return [`Navigating to ${colorize(path, 'cyan')} ...`];
}

async function handleList(args, ctx) {
  const type = (args[0] || '').toLowerCase();
  if (!type) return [colorize('list: missing type. Use: artifacts, credentials, bsa, clipboards, stats', 'yellow')];

  if (type === 'stats' || type === 'stat') return handleStats(ctx);

  if (type === 'credentials' || type === 'creds' || type === 'cred') {
    return ctx.listCredentials(args);
  }
  if (type === 'artifacts' || type === 'artifact' || type === 'lib' || type === 'library') {
    return ctx.listArtifacts(args);
  }
  if (type === 'bsa') return ctx.listBSA(args);
  if (type === 'clipboards' || type === 'clipboard') return ctx.listClipboards();

  return [`Unknown type: ${colorize(type, 'red')}. Types: artifacts, credentials, bsa, clipboards, stats`];
}

async function handleSearch(args, ctx, rest) {
  if (!args.length) return [colorize('search: missing term', 'yellow')];
  return ctx.search(rest);
}

async function handleStats(ctx) {
  return ctx.stats();
}

async function handleCipher(args, ctx) {
  const action = (args[0] || '').toLowerCase();
  if (!['encrypt', 'decrypt', 'keygen'].includes(action)) {
    return [
      colorize('cipher: action required', 'yellow'),
      'Usage: cipher encrypt --key <b64> --data <text>',
      'Usage: cipher decrypt --key <b64> --data <payload>',
      'Usage: cipher keygen',
    ];
  }
  return ctx.cipher(action, args);
}

async function handleTheme(args, ctx) {
  const mode = (args[0] || 'toggle').toLowerCase();
  return ctx.theme(mode);
}

async function handleDs(args, ctx) {
  // ds login / ds unlock
  const first = (args[0] || '').toLowerCase();
  if (first === 'login' || first === 'unlock' || first === 'auth') {
    return ['Type "password <secret>" to unlock admin mode.'];
  }
  if (first === 'logout' || first === 'lock') {
    ctx.setLoggedIn(false);
    return ['Admin mode disabled.'];
  }
  if (first === 'status' || first === 'whoami') {
    return ctx.isLoggedIn()
      ? [colorize('You are logged in as admin (ds).', 'green')]
      : [colorize('You are NOT in admin mode.', 'yellow')];
  }

  // ds <protected command>
  if (args.length === 0) {
    return [
      colorize('ds: invalid usage', 'yellow'),
      'Usage: ds <protected command>, e.g.',
      '  ds library',
      '  ds credentials',
      '  ds obsidian export',
      '  ds password <secret>   (unlock)',
      '  ds logout',
    ];
  }

  // If first arg looks like "password <secret>" unlock directly
  if (first === 'password') {
    const secret = args.slice(1).join(' ');
    const ok = await ctx.authenticate(secret);
    if (ok) {
      ctx.setLoggedIn(true);
      return [colorize('✓ Admin mode unlocked.', 'green')];
    }
    return [colorize('✗ Incorrect password.', 'red')];
  }

  // Otherwise it's a protected command; ensure authenticated
  if (!ctx.isLoggedIn()) {
    return [
      colorize('Access denied: this command requires admin (ds) permission.', 'red'),
      'Run: ds password <secret>  (the shared Library/Credentials password)',
      '...then re-run your "ds ..." command.',
    ];
  }

  // Execute the protected subcommand
  const subcmd = first;
  const subArgs = args.slice(1);
  const protectedRoutes = {
    library: '/library',
    credentials: '/credentials',
    export: '/export',
    obsidian: '/export',
  };

  // Map subcommand to page navigation or per-command actions
  if (protectedRoutes[subcmd]) {
    ctx.navigate(protectedRoutes[subcmd]);
    return [`Navigating to ${colorize(protectedRoutes[subcmd], 'cyan')} (admin).`];
  }

  // Try running `list` inside admin context for library/credentials data
  if (subcmd === 'open') {
    return handleOpen(subArgs, ctx);
  }
  if (subcmd === 'list') {
    return handleList(subArgs, ctx);
  }
  if (subcmd === 'search') {
    return handleSearch(subArgs, ctx, subArgs.join(' '));
  }
  if (subcmd === 'stats') {
    return handleStats(ctx);
  }
  if (subcmd === 'export') {
    // Trigger the actual Obsidian export if possible
    return ctx.triggerObsidianExport();
  }
  if (subcmd === 'cipher') {
    return handleCipher(subArgs, ctx);
  }

  return [
    `${colorize('ds', 'yellow')}: unknown admin command: ${colorize(subcmd, 'red')}`,
    'Admin commands: library, credentials, export, obsidian, open, list, search, stats, cipher, password, logout',
  ];
}
