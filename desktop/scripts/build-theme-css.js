#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const tokensPath = path.resolve(__dirname, '../src/renderer/theme/tokens.json');
const outPath = path.resolve(__dirname, '../src/renderer/theme.generated.css');

const hexToRgb = (hex) => {
  if (!hex) return null;
  const clean = hex.replace('#', '');
  const [r, g, b] = clean.length === 3
    ? clean.split('').map((v) => parseInt(v.repeat(2), 16))
    : [clean.slice(0, 2), clean.slice(2, 4), clean.slice(4, 6)].map((v) => parseInt(v, 16));
  return `${r}, ${g}, ${b}`;
};

const readTokens = () => {
  const raw = fs.readFileSync(tokensPath, 'utf8');
  return JSON.parse(raw);
};

const serializeVars = (vars) => Object.entries(vars)
  .map(([key, value]) => `  ${key}: ${value};`)
  .join('\n');

const ensureComputed = (vars) => {
  const next = { ...vars };
  const accentRgb = next['--accent-rgb'] || hexToRgb(next['--accent']);
  const accentStrongRgb = next['--accent-strong-rgb'] || hexToRgb(next['--accent-strong']);
  const warnRgb = next['--warn-rgb'] || hexToRgb(next['--warn']);
  if (accentRgb) next['--accent-rgb'] = accentRgb;
  if (accentStrongRgb) next['--accent-strong-rgb'] = accentStrongRgb;
  if (warnRgb) next['--warn-rgb'] = warnRgb;
  return next;
};

const build = () => {
  const data = readTokens();
  const lines = [
    '/* Auto-generated from src/renderer/theme/tokens.json. Do not edit directly. */',
  ];

  if (data.global?.vars) {
    lines.push(':root {');
    lines.push(serializeVars(ensureComputed(data.global.vars)));
    lines.push('}');
    lines.push('');
  }

  (data.themes || []).forEach((theme) => {
    const vars = ensureComputed(theme.vars || {});
    lines.push(`:root[data-theme="${theme.id}"] {`);
    lines.push(serializeVars(vars));
    lines.push('}');
    lines.push('');
  });

  fs.writeFileSync(outPath, `${lines.join('\n')}`);
  console.log(`Wrote theme CSS → ${path.relative(process.cwd(), outPath)}`);
};

build();
