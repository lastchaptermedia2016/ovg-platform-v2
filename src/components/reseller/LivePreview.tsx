'use client';

import { useState } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';
import { useBrandKit } from '@/contexts/BrandKitContext';

export function LivePreview() {
  const { template, botPersonality, headerUrl, footerUrl, primaryColor, secondaryColor } = useBrandKit();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([
    { role: 'bot', text: template === 'automotive' ? 'Welcome! I can help you browse our inventory, schedule test drives, and discuss trade-in options. What vehicle are you interested in today?' : 'Hello! How can I assist you today?' }
  ]);

  const getGreeting = () => {
    if (template === 'automotive') {
      return 'Welcome! I can help you browse our inventory, schedule test drives, and discuss trade-in options.';
    }
    switch (botPersonality) {
      case 'aggressive':
        return "Let's get you the best deal today! What are you looking for?";
      case 'informational':
        return 'I\'m here to help you learn more about our products and services.';
      default:
        return 'Hello! How can I assist you today?';
    }
  };

  const handleSend = () => {
    if (!message.trim()) return;
    setMessages([...messages, { role: 'user', text: message }]);
    setMessage('');
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'bot', text: 'Thanks for your message! This is a preview of the chat experience.' }]);
    }, 500);
  };

  return (
    <>
      {/* Preview Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 px-4 py-2 bg-white/20 border border-white/20 rounded-full text-white font-medium hover:bg-white/30 transition-all shadow-[0_0_15px_rgba(0,0,0,0.3)] backdrop-blur-xl"
        style={{ borderColor: primaryColor + '40', backgroundColor: primaryColor + '20' }}
      >
        <MessageSquare className="w-4 h-4 inline mr-2" style={{ color: primaryColor }} />
        Preview
      </button>

      {/* Preview Widget */}
      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50 w-80 max-w-[calc(100vw-3rem)]">
          <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-white/5 border-b border-white/10 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: primaryColor + '20' }}>
                  <MessageSquare className="w-4 h-4" style={{ color: primaryColor }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Chat Preview</p>
                  <p className="text-[10px] text-white/50 capitalize">{botPersonality}</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 text-white/50" />
              </button>
            </div>

            {/* Messages */}
            <div className="h-64 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-3 py-2 rounded-lg ${
                      msg.role === 'user'
                        ? 'text-white'
                        : 'bg-white/10 text-white'
                    }`}
                    style={msg.role === 'user' ? { backgroundColor: primaryColor + '40' } : {}}
                  >
                    <p className="text-xs">{msg.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="px-4 py-3 bg-white/5 border-t border-white/10">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 transition-all"
                  style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                />
                <button
                  onClick={handleSend}
                  className="p-2 rounded-lg transition-colors"
                  style={{ backgroundColor: primaryColor + '20' }}
                >
                  <Send className="w-4 h-4" style={{ color: primaryColor }} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
