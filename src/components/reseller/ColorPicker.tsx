'use client';

import { useState } from 'react';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const presetColors = [
    '#0097b2', // Electric Blue
    '#226683', // Dealership Gold
    '#d4af37', // Gold
    '#3b82f6', // Blue
    '#10b981', // Green
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#6b7280', // Gray
  ];

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-white/70">{label}</label>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors w-full"
        >
          <div
            className="w-8 h-8 rounded-full border-2 border-white/20 shadow-lg"
            style={{ backgroundColor: value }}
          />
          <span className="text-sm text-white font-mono">{value}</span>
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-2 p-3 bg-black/80 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl z-50 w-full">
            <div className="grid grid-cols-5 gap-2 mb-3">
              {presetColors.map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    onChange(color);
                    setIsOpen(false);
                  }}
                  className="w-8 h-8 rounded-full border-2 border-white/20 hover:border-white/40 transition-colors"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer bg-transparent"
              />
              <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0097b2]"
                placeholder="#000000"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
