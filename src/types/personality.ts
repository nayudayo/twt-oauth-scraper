import { CommunicationLevel } from '@/lib/openai/openai';

export interface PersonalityTuning {
  traitModifiers: { [key: string]: number }  // trait name -> adjustment (-2 to +2)
  interestWeights: { [key: string]: number } // interest -> weight (0 to 100)
  communicationStyle: {
    formality: CommunicationLevel
    enthusiasm: CommunicationLevel
    technicalLevel: CommunicationLevel
    emojiUsage: CommunicationLevel
    verbosity: CommunicationLevel
  }
} 