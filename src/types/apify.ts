export interface ApifyTweet {
    id: string;
    url: string;
    text: string;
    createdAt: string;
    isReply?: boolean;
    profilePicture?: string;
    [key: string]: string | number | boolean | null | undefined;
}

export interface ApifyProfile {
    name: string | null;
    bio: string | null;
    followersCount: number | null;
    followingCount: number | null;
} 