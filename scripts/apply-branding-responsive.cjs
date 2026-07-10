const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'components', 'reseller', 'ClientBrandingStudio.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Change B: ColorPicker rows - replace 'flex items-center gap-3' with responsive stacking
// Each replacement targets a unique surrounding context

// Header solid color row
content = content.replace(
  '<div className="flex items-center gap-3">\n                <ColorPicker\n                  label="Header Color"',
  '<div className="flex flex-col sm:flex-row sm:items-center gap-3">\n                <ColorPicker\n                  label="Header Color"'
);

// Header gradient start row
content = content.replace(
  '<div className="flex items-center gap-3">\n                  <ColorPicker\n                    label="Gradient Start"\n                    value={config.headerGradientStart}',
  '<div className="flex flex-col sm:flex-row sm:items-center gap-3">\n                  <ColorPicker\n                    label="Gradient Start"\n                    value={config.headerGradientStart}'
);

// Header gradient end row
content = content.replace(
  '<div className="flex items-center gap-3">\n                  <ColorPicker\n                    label="Gradient End"\n                    value={config.headerGradientEnd}',
  '<div className="flex flex-col sm:flex-row sm:items-center gap-3">\n                  <ColorPicker\n                    label="Gradient End"\n                    value={config.headerGradientEnd}'
);

// Footer solid color row
content = content.replace(
  '<div className="flex items-center gap-3">\n                <ColorPicker\n                  label="Footer Color"',
  '<div className="flex flex-col sm:flex-row sm:items-center gap-3">\n                <ColorPicker\n                  label="Footer Color"'
);

// Footer gradient start row
content = content.replace(
  '<div className="flex items-center gap-3">\n                  <ColorPicker\n                    label="Gradient Start"\n                    value={config.footerGradientStart}',
  '<div className="flex flex-col sm:flex-row sm:items-center gap-3">\n                  <ColorPicker\n                    label="Gradient Start"\n                    value={config.footerGradientStart}'
);

// Footer gradient end row
content = content.replace(
  '<div className="flex items-center gap-3">\n                  <ColorPicker\n                    label="Gradient End"\n                    value={config.footerGradientEnd}',
  '<div className="flex flex-col sm:flex-row sm:items-center gap-3">\n                  <ColorPicker\n                    label="Gradient End"\n                    value={config.footerGradientEnd}'
);

// Widget background color row
content = content.replace(
  '<div className="flex items-center gap-3">\n              <ColorPicker\n                label="Widget Color"',
  '<div className="flex flex-col sm:flex-row sm:items-center gap-3">\n              <ColorPicker\n                label="Widget Color"'
);

// Logo URL row (input + Upload button)
content = content.replace(
  '<div className="flex items-center gap-3">\n              <input\n                type="text"\n                value={config.logoUrl}',
  '<div className="flex flex-col sm:flex-row sm:items-center gap-3">\n              <input\n                type="text"\n                value={config.logoUrl}'
);

// Change C: Segmented controls - flex to grid (Header)
content = content.replace(
  '<div className="flex gap-2 mb-3">\n              <button\n                onClick={() => updateConfig(\'headerBackgroundType\'',
  '<div className="grid grid-cols-3 gap-2 mb-3">\n              <button\n                onClick={() => updateConfig(\'headerBackgroundType\''
);

// Segmented controls - flex to grid (Footer)
content = content.replace(
  '<div className="flex gap-2 mb-3">\n              <button\n                onClick={() => updateConfig(\'footerBackgroundType\'',
  '<div className="grid grid-cols-3 gap-2 mb-3">\n              <button\n                onClick={() => updateConfig(\'footerBackgroundType\''
);

// Change D: Card glassmorphism contrast - Studio Controls header card
content = content.replace(
  '<div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4">\n          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between',
  '<div className="backdrop-blur-2xl bg-black/40 border border-white/10 rounded-xl p-4">\n          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between'
);

// Main controls card (Header/Footer/Widget/Logo)
content = content.replace(
  '<div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-6">\n\n          {/* Header Background */}',
  '<div className="backdrop-blur-2xl bg-black/40 border border-white/10 rounded-xl p-6">\n\n          {/* Header Background */}'
);

// AI Add-ons card
content = content.replace(
  '<div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-6">\n          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">\n            <span className="text-[#FFD700]">◆</span>\n            AI Add-ons',
  '<div className="backdrop-blur-2xl bg-black/40 border border-white/10 rounded-xl p-6">\n          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">\n            <span className="text-[#FFD700]">◆</span>\n            AI Add-ons'
);

// Change E: Client selector dropdown - stack on mobile
content = content.replace(
  '<div className="flex items-center gap-3">\n            <label className="text-xs text-white/60 uppercase tracking-wider">Select Client:</label>',
  '<div className="flex flex-col sm:flex-row sm:items-center gap-3">\n            <label className="text-xs text-white/60 uppercase tracking-wider">Select Client:</label>'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('All responsive changes applied successfully to ClientBrandingStudio.tsx');