// Helper function to get emoji for each algorithm
const getAlgorithmEmoji = (algorithm) => {
  const emojiMap = {
    'SHA-256': '⚡',
    'Scrypt': '🔷',
    'Ethash': '⛏️',
    'KawPow': '⚙️',
    'RandomX': '🎲',
    'X11': '💎',
    'Equihash': '🔶',
    'Blake2s': '🌀',
    'CryptoNight': '🌙',
    'Zcash': '🛡️',
    'Ethereum': '💠',
    'Bitcoin': '₿',
    'Litecoin': 'Ł',
    'Monero': 'ɱ',
    'Dash': 'Ð',
    'Zilliqa': '⍟',
    'Handshake': '🤝',
    'Nexa': '🔺',
    'Ravencoin': '🐦',
    'Ergo': '⚗️',
    'Flux': '🌊',
    'Conflux': '🔄',
    'Kaspa': '🔹',
  };
  
  // Check for partial matches
  const key = Object.keys(emojiMap).find(k => 
    algorithm.toLowerCase().includes(k.toLowerCase())
  );
  
  return key ? emojiMap[key] : '📦';
};