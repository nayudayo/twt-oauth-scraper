/**
 * Represents an access code in the system
 */
export interface AccessCode {
  /** Unique identifier for the access code */
  id: number;
  
  /** The actual access code in NEURAL-[HEX]-[HASH] format */
  code: string;
  
  /** ID of the user who has claimed this code, null if unclaimed */
  userId: string | null;
  
  /** When the code was generated */
  createdAt: Date;
  
  /** When the code was used/claimed, null if unclaimed */
  usedAt: Date | null;
  
  /** Whether the code is still valid for use */
  isActive: boolean;
  
  /** Additional metadata about the code */
  metadata: {
    /** When the code was generated */
    generated_at: string;
    /** The HEX part of the code */
    hex_part: string;
    /** The HASH part of the code */
    hash_part: string;
    [key: string]: unknown;
  };
}

/**
 * Operations available for managing access codes
 */
export interface AccessCodeOperations {
  /**
   * Validates if a code exists and is available for use
   * @param code - The access code to validate
   * @returns True if the code is valid and available
   */
  validateCode(code: string): Promise<boolean>;

  /**
   * Links an access code to a user
   * @param code - The access code to link
   * @param userId - The user ID to link the code to
   * @throws Error if code is invalid or already used
   */
  linkCodeToUser(code: string, userId: string): Promise<void>;

  /**
   * Checks if a code is available for use
   * @param code - The access code to check
   * @returns True if the code exists and is unclaimed
   */
  isCodeAvailable(code: string): Promise<boolean>;

  /**
   * Gets the access code linked to a user
   * @param userId - The user ID to look up
   * @returns The access code or null if none found
   */
  getUserAccessCode(userId: string): Promise<AccessCode | null>;
}

/**
 * Error thrown when there are issues with access codes
 */
export class AccessCodeError extends Error {
  constructor(
    message: string,
    public code: 'INVALID_CODE' | 'CODE_USED' | 'CODE_INACTIVE' | 'USER_HAS_CODE',
    public status: number = 400
  ) {
    super(message);
    this.name = 'AccessCodeError';
  }
} 