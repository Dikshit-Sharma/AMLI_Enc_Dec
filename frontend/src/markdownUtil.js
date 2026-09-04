/**
 * Converts an HTML string to Markdown.
 * Supports: headings, bold/italic/underline/strike, code/pre, blockquotes,
 * links, images, lists, and tables.
 */
export function htmlToMarkdown(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  function walk(node) {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes).map(walk).join('');

    switch (tag) {
      case 'h1': return `# ${children}\n\n`;
      case 'h2': return `## ${children}\n\n`;
      case 'h3': return `### ${children}\n\n`;
      case 'h4': return `#### ${children}\n\n`;
      case 'h5': return `##### ${children}\n\n`;
      case 'h6': return `###### ${children}\n\n`;
      case 'p': return `${children}\n\n`;
      case 'br': return '\n';
      case 'strong': case 'b': return `**${children}**`;
      case 'em': case 'i': return `*${children}*`;
      case 'u': return `<u>${children}</u>`;
      case 's': case 'del': return `~~${children}~~`;
      case 'code': return node.parentElement?.tagName === 'PRE' ? children : `\`${children}\``;
      case 'pre': return `\`\`\`\n${children}\n\`\`\`\n\n`;
      case 'blockquote': return `> ${children}\n\n`;
      case 'a': return `[${children}](${node.getAttribute('href') || ''})`;
      case 'img': return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`;
      case 'hr': return '---\n\n';
      case 'ul': return children;
      case 'ol': return children;
      case 'li': {
        const parent = node.parentElement?.tagName.toLowerCase();
        if (parent === 'ol') {
          const idx = Array.from(node.parentElement.children).indexOf(node) + 1;
          return `${idx}. ${children.trim()}\n`;
        }
        return `- ${children.trim()}\n`;
      }
      case 'table': {
        const rows = Array.from(node.querySelectorAll('tr'));
        if (!rows.length) return children;
        const lines = rows.map((row, ri) => {
          const cells = Array.from(row.querySelectorAll('th, td')).map(c => c.textContent.trim());
          const line = `| ${cells.join(' | ')} |`;
          if (ri === 0) return `${line}\n| ${cells.map(() => '---').join(' | ')} |`;
          return line;
        });
        return lines.join('\n') + '\n\n';
      }
      default: return children;
    }
  }

  return walk(tmp).replace(/\n{3,}/g, '\n\n').trim();
}
