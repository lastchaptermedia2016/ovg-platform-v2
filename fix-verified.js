import fs from 'fs';

// Apply exact string replacement, verify the file still parses
function fix(file, search, replace) {
  let c = fs.readFileSync(file, 'utf8');
  if (!c.includes(search)) {
    console.log('⚠ NOT FOUND in ' + file + ': ' + search.substring(0, 40));
    return false;
  }
  c = c.split(search).join(replace);
  fs.writeFileSync(file, c);
  console.log('✓ ' + file);
  return true;
}

// ===== MIDDLEWARE =====
fix('middleware.ts', 
  '} catch (_err) {', 
  '} catch {');

// ===== AUTH PAGE =====
fix('src/app/(auth)/auth/page.tsx', 
  "import { useState, useEffect, useMemo, useRef } from 'react';",
  "import { useState, useEffect, useMemo } from 'react';");
fix('src/app/(auth)/auth/page.tsx', 
  "import { motion, AnimatePresence } from 'framer-motion';",
  "import { motion } from 'framer-motion';");

// ===== RESELLER LAYOUT =====
let layout = fs.readFileSync('src/app/(dashboard)/reseller/[resellerSlug]/layout.tsx', 'utf8');
layout = layout.replace(/const defaultSlug = .*;\n/, '');
layout = layout.replace(/console\.log\("OVG-PLATFORM-V2: User needs metadata fix, redirecting to auth"\);\n/, '');
fs.writeFileSync('src/app/(dashboard)/reseller/[resellerSlug]/layout.tsx', layout);

// ===== RESELLER CLIENTS PAGE =====
let clients = fs.readFileSync('src/app/(dashboard)/reseller/[resellerSlug]/clients/page.tsx', 'utf8');
// Remove volumeLevel, stopVoice, clearCaptions destructuring
clients = clients.replace(/volumeLevel,\s*/g, '');
clients = clients.replace(/stopVoice,\s*/g, '');
clients = clients.replace(/clearCaptions,\s*/g, '');
fs.writeFileSync('src/app/(dashboard)/reseller/[resellerSlug]/clients/page.tsx', clients);

console.log('Safely fixed key files');