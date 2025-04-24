export const formatTraitName = (name: string) => {
  if (!name) return '';
  
  // First remove any special characters and extra spaces
  const cleanName = name.replace(/[*\-_]/g, ' ').trim();
  
  // Handle multiple formatting cases:
  
  // 1. Split camelCase and PascalCase
  const splitCamelCase = cleanName.replace(/([a-z])([A-Z])/g, '$1 $2');
  
  // 2. Split concatenated words (e.g., "Communityoriented" -> "Community oriented")
  const splitWords = splitCamelCase.replace(/([a-z])([A-Z][a-z])/g, '$1 $2');
  
  // 3. Handle special cases where words are just concatenated
  const commonWords = ['oriented', 'driven', 'focused', 'based', 'centric', 'minded'];
  let formattedName = splitWords;
  commonWords.forEach(word => {
    const regex = new RegExp(`(\\w+)${word}`, 'gi');
    formattedName = formattedName.replace(regex, `$1 ${word}`);
  });
  
  // 4. Capitalize first letter of each word
  return formattedName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export const formatTraitExplanation = (explanation: string) => {
  if (!explanation) return '';
  
  // Remove trailing "(e" with any surrounding whitespace
  let formatted = explanation.replace(/\s*\([eE]\s*$/, '');
  
  // Also handle cases where it might be "(e)" or just "e"
  formatted = formatted.replace(/\s*\([eE]\)\s*$/, '');
  formatted = formatted.replace(/\s+[eE]\s*$/, '');
  
  // Ensure proper sentence ending
  if (!formatted.endsWith('.') && !formatted.endsWith('!') && !formatted.endsWith('?')) {
    formatted += '.';
  }
  
  return formatted.trim();
};

export const formatInterestName = (interest: string) => {
  if (!interest) return '';
  
  // Remove section numbers and headers
  let cleaned = interest.replace(/###\s*\d+\.\s*/, '');
  cleaned = cleaned.replace(/Social Behavior Metrics$/, '');
  
  // Clean up special characters while preserving some meaningful ones
  cleaned = cleaned
    .replace(/[*_]/g, '') // Remove markdown formatting
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
    
  // Handle special cases for cryptocurrency and NFT terms
  cleaned = cleaned
    .replace(/cryptocurrency\/nfts/i, 'Cryptocurrency/NFTs')
    .replace(/nft/i, 'NFT')
    .replace(/defi/i, 'DeFi')
    .replace(/dao/i, 'DAO');
    
  // Capitalize first letter of each word except for special terms
  return cleaned.split(' ')
    .map(word => {
      // Skip capitalization for known acronyms and special terms
      if (/^(NFT|DeFi|DAO|dApp)s?$/i.test(word)) {
        return word.toUpperCase();
      }
      // Handle words with slashes
      if (word.includes('/')) {
        return word.split('/')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join('/');
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}; 