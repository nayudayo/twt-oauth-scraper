// Helper function for formatting trait text
export function formatTraitText(text: string): string {
  return text
    .replace(/^\s*[-*]+\s*/, '') // Remove leading dashes and asterisks
    .replace(/\*\*/g, '')        // Remove markdown bold markers
    .replace(/^[0-9]+\.\s*/, '') // Remove leading numbers
    .trim();
}

// Helper function for formatting interests
export function formatInterest(interest: string, expertise?: string, evidence?: string): string {
  if (!interest) return '';
  
  // Clean up the interest text
  interest = interest
    .replace(/^[-•*\d.]+\s*/, '') // Remove bullet points and numbers
    .replace(/\*\*/g, '')         // Remove markdown
    .replace(/:\s*$/, '')         // Remove trailing colons
    .trim();
  
  // Add expertise level if available
  if (expertise) {
    // Normalize expertise level text
    expertise = expertise
      .replace(/^(?:at\s+)?(?:an?\s+)?/i, '') // Remove leading articles
      .replace(/\s*level$/i, '')              // Remove trailing "level"
      .trim();
      
    // Only add if it's not already part of the interest
    if (!interest.toLowerCase().includes(expertise.toLowerCase())) {
      interest += ` (${expertise} expertise)`;
    }
  }
  
  // Add brief evidence if available and the interest isn't too long
  if (evidence && interest.length < 50) {
    const briefEvidence = evidence.split(';')[0].trim(); // Take first evidence point
    if (briefEvidence.length < 50) { // Only add if it's reasonably short
      interest += ` - ${briefEvidence}`;
    }
  }
  
  return interest;
} 