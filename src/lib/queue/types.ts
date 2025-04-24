import { Tweet, TwitterProfile, PersonalityTuning } from '@/types/scraper';

export interface AnalyzeRequest {
  tweets: Tweet[];
  profile: TwitterProfile;
  prompt?: string;
  context?: string;
  currentTuning?: PersonalityTuning;
  userId: string;
} 