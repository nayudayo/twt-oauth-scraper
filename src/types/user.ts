import { AccessCode } from './access';

export interface User {
  id: string;
  username: string;
  twitter_username: string | null;
  profile_data?: Record<string, unknown>;
  profile_picture_url?: string;
  last_scraped?: Date;
  created_at: Date;
  access_code?: AccessCode;  // Optional access code relationship
}

export interface UserOperations {
  // ... existing operations ...

  /**
   * Gets the user's access code if they have one
   * @returns The user's access code or null if none exists
   */
  getAccessCode(): Promise<AccessCode | null>;
} 